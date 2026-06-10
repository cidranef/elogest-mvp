import { NextRequest, NextResponse } from "next/server";
import {
  AccessRole,
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
   API PORTAL - LISTAGEM DE REUNIÕES DE CONSELHO

   Arquivo:
   src/app/api/portal/reunioes-conselho/route.ts

   ETAPA 49 — REUNIÕES DE CONSELHO

   Método:
   - GET: lista reuniões de conselho disponíveis para o perfil ativo.

   Segurança:
   - Usa o perfil ativo do usuário via UserAccess.
   - Permite acesso para SÍNDICO e CONSELHEIRO do condomínio.
   - Permite acesso para participante convidado da reunião.
   - Bloqueia morador/proprietário sem vínculo de governança ou convite.
   - Filtra por administradora, condomínio e módulo comercial liberado.
   - Não expõe observações internas da administradora.

   Observação:
   - A Sala De Reunião EloGest é central e reaproveitável.
   - Nesta etapa, o primeiro uso real da sala é Reunião De Conselho.
   - A mesma base fica preparada para Assembleias futuras.
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

type PortalCouncilAccess = {
  authUser: {
    id: string;
    name: string | null;
    email: string;
  };
  accessId: string;
  accessLabel: string | null;
  role: AccessRole;
  administratorId: string;
  condominiumId: string;
  unitId: string | null;
  linkType: string | null;
  isGovernanceProfile: boolean;
  governanceAccessIds: string[];
  governanceAccessLabel: string | null;
  governanceRole: AccessRole | null;
  relatedAccessIds: string[];
};

function parsePositiveInteger(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(String(value || ""), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function normalizeSearchParam(value: string | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseStatusFilter(value: string | null) {
  if (!value || value === "ALL") {
    return null;
  }

  const values = Object.values(CouncilMeetingStatus) as string[];
  return values.includes(value) ? (value as CouncilMeetingStatus) : null;
}

type ParticipantForPresence = {
  id: string;
  role: AccessRole | string;
  status: string;
  invitedAt: Date | null;
  respondedAt: Date | null;
  confirmedAt: Date | null;
  joinedAt: Date | null;
};

function getPresencePriority(status?: string | null) {
  if (status === "ATTENDED") return 1;
  if (status === "CONFIRMED") return 2;
  if (status === "INVITED") return 3;
  if (status === "DECLINED") return 4;
  if (status === "ABSENT") return 5;

  return 99;
}

function getConsolidatedParticipantStatus(participants: ParticipantForPresence[]) {
  if (participants.length === 0) {
    return null;
  }

  return [...participants].sort((a, b) => {
    const statusCompare = getPresencePriority(a.status) - getPresencePriority(b.status);

    if (statusCompare !== 0) {
      return statusCompare;
    }

    return (a.invitedAt?.getTime() ?? 0) - (b.invitedAt?.getTime() ?? 0);
  })[0];
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

async function requirePortalCouncilMeetingAccess(): Promise<
  PortalCouncilAccess | { error: NextResponse }
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

    if (cookieActiveAccess.administratorId) {
      activeAccessWhere.administratorId = cookieActiveAccess.administratorId;
    }

    if (cookieActiveAccess.condominiumId) {
      activeAccessWhere.condominiumId = cookieActiveAccess.condominiumId;
    }

    if (cookieActiveAccess.unitId) {
      activeAccessWhere.unitId = cookieActiveAccess.unitId;
    }

    if (cookieActiveAccess.residentId) {
      activeAccessWhere.residentId = cookieActiveAccess.residentId;
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
          name: true,
          email: true,
          isActive: true,
        },
      },
      unitPersonLink: {
        select: {
          linkType: true,
        },
      },
      condominium: {
        select: {
          id: true,
          name: true,
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
          error: "Selecione um perfil vinculado a um condomínio para acessar reuniões de conselho.",
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
          error: "Este condomínio está inativo. O acesso às reuniões está bloqueado.",
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
          error: "A administradora deste condomínio está inativa. O acesso às reuniões está bloqueado.",
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

  const governanceAccesses = await db.userAccess.findMany({
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
      label: true,
      role: true,
      isDefault: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: [
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
  });

  const governanceAccessIds = governanceAccesses.map((item) => item.id);
  const relatedAccessIds = Array.from(
    new Set([
      access.id,
      ...governanceAccessIds,
    ]),
  );
  const primaryGovernanceAccess = governanceAccesses[0] ?? null;
  const activeAccessIsGovernance = governanceRoles.includes(access.role);
  const isGovernanceProfile =
    activeAccessIsGovernance || governanceAccesses.length > 0;

  return {
    authUser: {
      id: access.user.id,
      name: access.user.name,
      email: access.user.email,
    },
    accessId: access.id,
    accessLabel: access.label,
    role: access.role,
    administratorId: access.condominium.administratorId,
    condominiumId: access.condominiumId,
    unitId: access.unitId,
    linkType: access.unitPersonLink?.linkType ?? null,
    isGovernanceProfile,
    governanceAccessIds,
    governanceAccessLabel: primaryGovernanceAccess?.label ?? null,
    governanceRole: primaryGovernanceAccess?.role ?? null,
    relatedAccessIds,
  };
}

function buildParticipantWhere(
  access: PortalCouncilAccess,
): Prisma.CouncilMeetingWhereInput {
  return {
    participants: {
      some: {
        OR: [
          {
            userId: access.authUser.id,
          },
          {
            userAccessId: {
              in: access.relatedAccessIds,
            },
          },
        ],
      },
    },
  };
}

function buildPortalCouncilMeetingWhere(
  access: PortalCouncilAccess,
): Prisma.CouncilMeetingWhereInput {
  const visibleStatuses: CouncilMeetingStatus[] = [
    CouncilMeetingStatus.SCHEDULED,
    CouncilMeetingStatus.IN_PROGRESS,
    CouncilMeetingStatus.COMPLETED,
    CouncilMeetingStatus.CANCELED,
  ];

  const where: Prisma.CouncilMeetingWhereInput = {
    administratorId: access.administratorId,
    condominiumId: access.condominiumId,
    status: {
      in: visibleStatuses,
    },
  };

  /*
    Perfis de governança do condomínio — Síndico e Conselheiro,
    inclusive quando forem perfis complementares do usuário — devem
    enxergar as reuniões do condomínio mesmo quando a reunião ainda
    não possui participantes vinculados.

    Participantes continuam sendo exigidos apenas para usuários sem
    vínculo de governança naquele condomínio.
  */
  if (!access.isGovernanceProfile) {
    where.OR = [buildParticipantWhere(access)];
  }

  return where;
}

function applySearchFilter(
  where: Prisma.CouncilMeetingWhereInput,
  search: string | null,
) {
  if (!search) {
    return where;
  }

  const searchWhere: Prisma.CouncilMeetingWhereInput = {
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
    ],
  };

  return {
    AND: [where, searchWhere],
  } satisfies Prisma.CouncilMeetingWhereInput;
}

export async function GET(request: NextRequest) {
  const access = await requirePortalCouncilMeetingAccess();

  if ("error" in access) {
    return access.error;
  }

  try {
    const { searchParams } = new URL(request.url);

    const page = parsePositiveInteger(searchParams.get("page"), 1, 500);
    const limit = parsePositiveInteger(searchParams.get("limit"), 20, 100);
    const skip = (page - 1) * limit;

    const search = normalizeSearchParam(searchParams.get("search"));
    const statusFilter = parseStatusFilter(searchParams.get("status"));

    const baseWhere = buildPortalCouncilMeetingWhere(access);

    const where = applySearchFilter(
      statusFilter
        ? {
            AND: [
              baseWhere,
              {
                status: statusFilter,
              },
            ],
          }
        : baseWhere,
      search,
    );

    const [total, meetings, statusTotals] = await Promise.all([
      db.councilMeeting.count({
        where,
      }),
      db.councilMeeting.findMany({
        where,
        orderBy: [
          {
            scheduledStartAt: "asc",
          },
          {
            createdAt: "desc",
          },
        ],
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          mode: true,
          scheduledStartAt: true,
          scheduledEndAt: true,
          completedAt: true,
          canceledAt: true,
          location: true,
          createdAt: true,
          updatedAt: true,
          condominium: {
            select: {
              id: true,
              name: true,
            },
          },
          meetingRoom: {
            select: {
              id: true,
              type: true,
              mode: true,
              status: true,
              scheduledStartAt: true,
              scheduledEndAt: true,
              openedAt: true,
              closedAt: true,
              accessInstructions: true,
            },
          },
          participants: {
            where: {
              OR: [
                {
                  userId: access.authUser.id,
                },
                {
                  userAccessId: {
                    in: access.relatedAccessIds,
                  },
                },
              ],
            },
            select: {
              id: true,
              role: true,
              status: true,
              invitedAt: true,
              respondedAt: true,
              confirmedAt: true,
              joinedAt: true,
            },
          },
          _count: {
            select: {
              participants: true,
              agendaItems: true,
              attachments: true,
            },
          },
        },
      }),
      db.councilMeeting.groupBy({
        by: ["status"],
        where: baseWhere,
        _count: {
          _all: true,
        },
      }),
    ]);

    const statusMap = statusTotals.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = item._count._all;
      return acc;
    }, {});

    return NextResponse.json({
      meetings: meetings.map((meeting) => {
        const participant = getConsolidatedParticipantStatus(meeting.participants) ?? null;

        return {
          ...meeting,
          participants: undefined,
          myParticipant: participant,
          canAccessRoom:
            meeting.status === CouncilMeetingStatus.SCHEDULED ||
            meeting.status === CouncilMeetingStatus.IN_PROGRESS ||
            meeting.status === CouncilMeetingStatus.COMPLETED,
        };
      }),
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
      kpis: {
        total,
        scheduled: statusMap.SCHEDULED ?? 0,
        inProgress: statusMap.IN_PROGRESS ?? 0,
        completed: statusMap.COMPLETED ?? 0,
        canceled: statusMap.CANCELED ?? 0,
      },
      activeAccess: {
        id: access.accessId,
        role: access.role,
        label: access.accessLabel,
        condominiumId: access.condominiumId,
        unitId: access.unitId,
        linkType: access.linkType,
        isGovernanceProfile: access.isGovernanceProfile,
        governanceAccessIds: access.governanceAccessIds,
        governanceAccessLabel: access.governanceAccessLabel,
        governanceRole: access.governanceRole,
      },
    });
  } catch (error) {
    console.error("Erro ao listar reuniões de conselho do portal:", error);

    return NextResponse.json(
      {
        error: "Não foi possível listar as reuniões de conselho.",
      },
      {
        status: 500,
      },
    );
  }
}
