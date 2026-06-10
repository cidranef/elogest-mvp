import { NextRequest, NextResponse } from "next/server";
import {
  AccessRole,
  CouncilAgendaItemStatus,
  CouncilMeetingStatus,
  Status,
  type Prisma,
} from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasModuleAccess, MODULE_SLUGS } from "@/lib/plan-limits";
import { getActiveUserAccessFromCookies } from "@/lib/user-access";

/* =========================================================
   API PORTAL - PENDÊNCIAS ABERTAS DE REUNIÕES DE CONSELHO

   Arquivo:
   src/app/api/portal/reunioes-conselho/pendencias/route.ts

   ETAPA 49.8 — PENDÊNCIAS DE REUNIÕES ANTERIORES

   Método:
   - GET: lista pautas ainda não finalizadas do condomínio do
     perfil ativo ou do vínculo complementar de governança.

   Segurança:
   - Exige usuário autenticado.
   - Exige perfil vinculado ao condomínio.
   - Exige perfil de governança: SÍNDICO ou CONSELHEIRO.
   - Exige módulo Reuniões De Conselho liberado no plano.
   ========================================================= */

type SessionUserShape = {
  id?: string;
  activeAccessId?: string | null;
  accessId?: string | null;
  userAccessId?: string | null;
};

type CookieActiveAccessShape = {
  id?: string | null;
  accessId?: string | null;
  role?: string | null;
  administratorId?: string | null;
  condominiumId?: string | null;
  unitId?: string | null;
  residentId?: string | null;
};

type PortalPendingAccess = {
  userId: string;
  administratorId: string;
  condominiumId: string;
  accessId: string;
  role: AccessRole;
  isGovernanceProfile: boolean;
};

const OPEN_PENDING_STATUSES: CouncilAgendaItemStatus[] = [
  CouncilAgendaItemStatus.OPEN,
  CouncilAgendaItemStatus.DISCUSSED,
  CouncilAgendaItemStatus.POSTPONED,
];

const MEETING_VISIBLE_STATUSES: CouncilMeetingStatus[] = [
  CouncilMeetingStatus.SCHEDULED,
  CouncilMeetingStatus.IN_PROGRESS,
  CouncilMeetingStatus.COMPLETED,
];

function normalizeQueryParam(value: string | null) {
  const normalized = String(value || "").trim();
  return normalized.length > 0 ? normalized : null;
}

function parseTake(value: string | null) {
  const parsed = Number(value || "");

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }

  return Math.min(Math.floor(parsed), 100);
}

function getSessionUserId(sessionUser: SessionUserShape | undefined) {
  if (!sessionUser?.id) {
    return null;
  }

  return sessionUser.id;
}

function getSessionAccessId(sessionUser: SessionUserShape | undefined) {
  return (
    sessionUser?.activeAccessId ||
    sessionUser?.accessId ||
    sessionUser?.userAccessId ||
    null
  );
}

function buildSearchWhere(search: string | null): Prisma.CouncilMeetingAgendaItemWhereInput {
  if (!search) {
    return {};
  }

  return {
    OR: [
      {
        title: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        description: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        discussionNotes: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        decision: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        responsibleName: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        councilMeeting: {
          title: {
            contains: search,
            mode: "insensitive",
          },
        },
      },
    ],
  };
}

async function requirePortalPendingAccess(): Promise<
  PortalPendingAccess | { error: NextResponse }
> {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as SessionUserShape | undefined;
  const userId = getSessionUserId(sessionUser);

  if (!userId) {
    return {
      error: NextResponse.json(
        {
          error: "Sessão expirada. Faça login novamente.",
        },
        {
          status: 401,
        },
      ),
    };
  }

  const cookieActiveAccess = (await getActiveUserAccessFromCookies({
    userId,
  })) as CookieActiveAccessShape | null;

  const cookieAccessId = cookieActiveAccess?.accessId || cookieActiveAccess?.id || null;
  const sessionAccessId = getSessionAccessId(sessionUser);
  const activeAccessId = cookieAccessId || sessionAccessId;

  const activeAccessWhere: Prisma.UserAccessWhereInput = {
    userId,
    isActive: true,
  };

  if (activeAccessId) {
    activeAccessWhere.id = activeAccessId;
  } else if (cookieActiveAccess?.role) {
    activeAccessWhere.role = cookieActiveAccess.role as AccessRole;

    if (cookieActiveAccess.condominiumId) {
      activeAccessWhere.condominiumId = cookieActiveAccess.condominiumId;
    }
  }

  const access = await db.userAccess.findFirst({
    where: activeAccessWhere,
    orderBy: activeAccessId || cookieActiveAccess?.role
      ? undefined
      : [
          {
            isDefault: "desc",
          },
          {
            lastUsedAt: "desc",
          },
          {
            createdAt: "asc",
          },
        ],
    include: {
      user: {
        select: {
          id: true,
          isActive: true,
        },
      },
      condominium: {
        select: {
          id: true,
          status: true,
          administratorId: true,
          administrator: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!access || !access.user.isActive) {
    return {
      error: NextResponse.json(
        {
          error: "Perfil ativo não encontrado ou usuário inativo.",
        },
        {
          status: 403,
        },
      ),
    };
  }

  if (!access.condominiumId || !access.condominium) {
    return {
      error: NextResponse.json(
        {
          error: "Selecione um perfil vinculado a um condomínio para consultar pendências de conselho.",
        },
        {
          status: 403,
        },
      ),
    };
  }

  if (access.condominium.status !== Status.ACTIVE) {
    return {
      error: NextResponse.json(
        {
          error: "Este condomínio está inativo. A consulta de pendências está bloqueada.",
        },
        {
          status: 403,
        },
      ),
    };
  }

  if (access.condominium.administrator.status !== Status.ACTIVE) {
    return {
      error: NextResponse.json(
        {
          error: "A administradora deste condomínio está inativa. A consulta de pendências está bloqueada.",
        },
        {
          status: 403,
        },
      ),
    };
  }

  const moduleAccess = await hasModuleAccess({
    administratorId: access.condominium.administratorId,
    moduleSlug: MODULE_SLUGS.REUNIOES_CONSELHO,
  });

  if (!moduleAccess.allowed) {
    return {
      error: NextResponse.json(
        {
          error: moduleAccess.message,
          code: "MODULE_ACCESS_DENIED",
          details: moduleAccess,
        },
        {
          status: 403,
        },
      ),
    };
  }

  const governanceRoles: AccessRole[] = [
    AccessRole.SINDICO,
    AccessRole.CONSELHEIRO,
  ];

  const hasComplementaryGovernanceAccess = await db.userAccess.findFirst({
    where: {
      userId,
      isActive: true,
      condominiumId: access.condominiumId,
      role: {
        in: governanceRoles,
      },
    },
    select: {
      id: true,
    },
  });

  const isGovernanceProfile =
    governanceRoles.includes(access.role) || Boolean(hasComplementaryGovernanceAccess);

  if (!isGovernanceProfile) {
    return {
      error: NextResponse.json(
        {
          error: "A consulta de pendências de conselho é restrita a síndicos e conselheiros do condomínio.",
        },
        {
          status: 403,
        },
      ),
    };
  }

  return {
    userId,
    accessId: access.id,
    role: access.role,
    administratorId: access.condominium.administratorId,
    condominiumId: access.condominiumId,
    isGovernanceProfile,
  };
}

export async function GET(request: NextRequest) {
  const access = await requirePortalPendingAccess();

  if ("error" in access) {
    return access.error;
  }

  try {
    const url = new URL(request.url);
    const search = normalizeQueryParam(url.searchParams.get("q"));
    const take = parseTake(url.searchParams.get("take"));

    const where: Prisma.CouncilMeetingAgendaItemWhereInput = {
      status: {
        in: OPEN_PENDING_STATUSES,
      },
      councilMeeting: {
        administratorId: access.administratorId,
        condominiumId: access.condominiumId,
        status: {
          in: MEETING_VISIBLE_STATUSES,
        },
        condominium: {
          status: Status.ACTIVE,
        },
      },
      ...buildSearchWhere(search),
    };

    const pendingItems = await db.councilMeetingAgendaItem.findMany({
      where,
      take,
      orderBy: [
        {
          dueDate: "asc",
        },
        {
          updatedAt: "desc",
        },
        {
          order: "asc",
        },
      ],
      select: {
        id: true,
        order: true,
        title: true,
        description: true,
        status: true,
        discussionNotes: true,
        decision: true,
        responsibleName: true,
        dueDate: true,
        createdAt: true,
        updatedAt: true,
        councilMeeting: {
          select: {
            id: true,
            title: true,
            status: true,
            scheduledStartAt: true,
            condominium: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      pendingItems,
      total: pendingItems.length,
      filters: {
        condominiumId: access.condominiumId,
        search,
        statuses: OPEN_PENDING_STATUSES,
      },
    });
  } catch (error) {
    console.error("Erro ao listar pendências de reuniões de conselho no portal:", error);

    return NextResponse.json(
      {
        error: "Não foi possível listar as pendências de reuniões de conselho.",
      },
      {
        status: 500,
      },
    );
  }
}
