import { NextRequest, NextResponse } from "next/server";
import {
  AccessRole,
  PollResultVisibility,
  PollStatus,
  PollTargetScope,
  PollType,
  Status,
  type Prisma,
} from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasModuleAccess } from "@/lib/plan-limits";

/* =========================================================
   API PORTAL - LISTAGEM DE ENQUETES

   Arquivo:
   src/app/api/portal/enquetes/route.ts

   ETAPA 50 — ENQUETES

   Método:
   - GET: lista enquetes disponíveis para o perfil ativo.

   Segurança:
   - Usa o perfil ativo do usuário via UserAccess.
   - Bloqueia usuário, condomínio ou administradora inativos.
   - Exige módulo comercial Enquetes liberado para a administradora.
   - Isola enquetes por administratorId e condominiumId.
   - Filtra público-alvo por condomínio, bloco, unidade, perfil,
     tipo de vínculo, governança ou regra personalizada.
   - Informa se o usuário já respondeu sem expor respostas indevidas.
   ========================================================= */

type SessionUserShape = {
  id?: string;
  activeAccessId?: string | null;
  accessId?: string | null;
  userAccessId?: string | null;
};

type PortalPollAccess = {
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
  residentId: string | null;
  block: string | null;
  linkType: string | null;
  canVote: boolean;
  isGovernanceProfile: boolean;
};

type PollListItem = Prisma.PollGetPayload<{
  include: {
    condominium: {
      select: {
        id: true;
        name: true;
      };
    };
    targets: true;
    options: {
      where: {
        isActive: true;
      };
      orderBy: {
        order: "asc";
      };
      select: {
        id: true;
        label: true;
        description: true;
        order: true;
        isActive: true;
      };
    };
    responses: {
      where: {
        userId: string;
        accessId: string;
      };
      select: {
        id: true;
        submittedAt: true;
        updatedAt: true;
      };
      take: 1;
    };
    _count: {
      select: {
        responses: true;
        options: true;
        targets: true;
      };
    };
  };
}>;

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

function isGovernanceRole(role: AccessRole) {
  const governanceRoles: AccessRole[] = [
    AccessRole.SINDICO,
    AccessRole.CONSELHEIRO,
  ];

  return governanceRoles.includes(role);
}

function parseStatusFilter(value: string | null) {
  if (!value || value === "ALL") {
    return null;
  }

  const values = Object.values(PollStatus) as string[];
  return values.includes(value) ? (value as PollStatus) : null;
}

function parseTypeFilter(value: string | null) {
  if (!value || value === "ALL") {
    return null;
  }

  const values = Object.values(PollType) as string[];
  return values.includes(value) ? (value as PollType) : null;
}

function isPollCurrentlyOpen(poll: {
  status: PollStatus;
  startsAt: Date | null;
  endsAt: Date | null;
}) {
  const now = new Date();

  if (poll.status !== PollStatus.PUBLISHED) {
    return false;
  }

  if (poll.startsAt && poll.startsAt > now) {
    return false;
  }

  if (poll.endsAt && poll.endsAt < now) {
    return false;
  }

  return true;
}

function canTargetMatchAccess(
  target: {
    condominiumId: string | null;
    unitId: string | null;
    block: string | null;
    role: AccessRole | null;
    linkType: string | null;
  },
  access: PortalPollAccess,
) {
  if (target.condominiumId && target.condominiumId !== access.condominiumId) {
    return false;
  }

  if (target.unitId && target.unitId !== access.unitId) {
    return false;
  }

  if (target.block && target.block !== access.block) {
    return false;
  }

  if (target.role && target.role !== access.role) {
    return false;
  }

  if (target.linkType && target.linkType !== access.linkType) {
    return false;
  }

  return true;
}

function isPollEligibleForAccess(poll: PollListItem, access: PortalPollAccess) {
  if (poll.administratorId !== access.administratorId) {
    return false;
  }

  if (poll.condominiumId && poll.condominiumId !== access.condominiumId) {
    return false;
  }

  if (poll.requireEligibleVoter && !access.canVote) {
    return false;
  }

  if (poll.targetScope === PollTargetScope.CONDOMINIUM) {
    return poll.condominiumId === access.condominiumId;
  }

  if (poll.targetScope === PollTargetScope.GOVERNANCE) {
    return access.isGovernanceProfile;
  }

  if (poll.targetScope === PollTargetScope.BLOCK) {
    return poll.targets.some((target) => {
      return Boolean(access.block) && canTargetMatchAccess(target, access);
    });
  }

  if (poll.targetScope === PollTargetScope.UNIT) {
    return poll.targets.some((target) => {
      return Boolean(access.unitId) && canTargetMatchAccess(target, access);
    });
  }

  if (poll.targetScope === PollTargetScope.ROLE) {
    return poll.targets.some((target) => {
      return target.role === access.role && canTargetMatchAccess(target, access);
    });
  }

  if (poll.targetScope === PollTargetScope.LINK_TYPE) {
    return poll.targets.some((target) => {
      return Boolean(access.linkType) && canTargetMatchAccess(target, access);
    });
  }

  if (poll.targetScope === PollTargetScope.CUSTOM) {
    return poll.targets.some((target) => canTargetMatchAccess(target, access));
  }

  return false;
}

function canParticipantSeeResults(params: {
  poll: PollListItem;
  hasResponded: boolean;
}) {
  const { poll, hasResponded } = params;

  // ETAPA 50 — USABILIDADE:
  // o resultado somente fica disponível no portal depois da
  // publicação oficial realizada pela administradora.
  if (!poll.resultsPublishedAt) {
    return false;
  }

  if (poll.resultVisibility === PollResultVisibility.PUBLIC_TO_TARGET) {
    return true;
  }

  if (
    poll.resultVisibility === PollResultVisibility.PARTICIPANTS_AFTER_RESPONSE &&
    hasResponded
  ) {
    return true;
  }

  if (
    poll.resultVisibility === PollResultVisibility.PARTICIPANTS_AFTER_CLOSED &&
    poll.status === PollStatus.CLOSED
  ) {
    return true;
  }

  return false;
}

async function requirePortalPollAccess(): Promise<
  PortalPollAccess | { error: NextResponse }
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

  const activeAccessId = getSessionAccessId(sessionUser);

  const access = await db.userAccess.findFirst({
    where: {
      userId,
      isActive: true,
      ...(activeAccessId
        ? {
            id: activeAccessId,
          }
        : {}),
    },
    orderBy: activeAccessId
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
      unit: {
        select: {
          id: true,
          block: true,
          status: true,
        },
      },
      unitPersonLink: {
        select: {
          linkType: true,
          canVote: true,
          status: true,
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
          error: "Selecione um perfil vinculado a um condomínio para acessar enquetes.",
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
          error: "Este condomínio está inativo. O acesso às enquetes está bloqueado.",
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
          error: "A administradora deste condomínio está inativa. O acesso às enquetes está bloqueado.",
        },
        {
          status: 403,
        },
      ),
    };
  }

  if (access.unit && access.unit.status !== Status.ACTIVE) {
    return {
      error: NextResponse.json(
        {
          error: "A unidade vinculada ao perfil ativo está inativa. O acesso às enquetes está bloqueado.",
        },
        {
          status: 403,
        },
      ),
    };
  }

  if (
    access.unitPersonLink &&
    access.unitPersonLink.status !== Status.ACTIVE
  ) {
    return {
      error: NextResponse.json(
        {
          error: "O vínculo do perfil ativo está inativo. O acesso às enquetes está bloqueado.",
        },
        {
          status: 403,
        },
      ),
    };
  }

  const moduleAccess = await hasModuleAccess({
    administratorId: access.condominium.administratorId,
    moduleSlug: "enquetes",
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
    residentId: access.residentId,
    block: access.unit?.block ?? null,
    linkType: access.unitPersonLink?.linkType ?? null,
    canVote: Boolean(access.unitPersonLink?.canVote),
    isGovernanceProfile: isGovernanceRole(access.role),
  };
}

export async function GET(request: NextRequest) {
  const access = await requirePortalPollAccess();

  if ("error" in access) {
    return access.error;
  }

  try {
    const { searchParams } = new URL(request.url);

    const page = parsePositiveInteger(searchParams.get("page"), 1, 500);
    const limit = parsePositiveInteger(searchParams.get("limit"), 20, 100);
    const skip = (page - 1) * limit;

    const search = normalizeSearchParam(
      searchParams.get("search") ?? searchParams.get("q"),
    );
    const statusFilter = parseStatusFilter(searchParams.get("status"));
    const typeFilter = parseTypeFilter(searchParams.get("type"));
    const onlyOpen = searchParams.get("open") === "1";

    const visibleStatuses: PollStatus[] = [
      PollStatus.PUBLISHED,
      PollStatus.CLOSED,
    ];

    const now = new Date();

    const where: Prisma.PollWhereInput = {
      administratorId: access.administratorId,
      condominiumId: access.condominiumId,
      status: statusFilter || {
        in: visibleStatuses,
      },
      ...(typeFilter
        ? {
            type: typeFilter,
          }
        : {}),
      ...(search
        ? {
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
          }
        : {}),
      ...(onlyOpen
        ? {
            status: PollStatus.PUBLISHED,
            OR: [
              {
                startsAt: null,
              },
              {
                startsAt: {
                  lte: now,
                },
              },
            ],
            AND: [
              {
                OR: [
                  {
                    endsAt: null,
                  },
                  {
                    endsAt: {
                      gte: now,
                    },
                  },
                ],
              },
            ],
          }
        : {}),
    };

    const [rawPolls, statusTotals] = await Promise.all([
      db.poll.findMany({
        where,
        orderBy: [
          {
            publishedAt: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
        include: {
          condominium: {
            select: {
              id: true,
              name: true,
            },
          },
          targets: true,
          options: {
            where: {
              isActive: true,
            },
            orderBy: {
              order: "asc",
            },
            select: {
              id: true,
              label: true,
              description: true,
              order: true,
              isActive: true,
            },
          },
          responses: {
            where: {
              userId: access.authUser.id,
              accessId: access.accessId,
            },
            select: {
              id: true,
              submittedAt: true,
              updatedAt: true,
            },
            take: 1,
          },
          _count: {
            select: {
              responses: true,
              options: true,
              targets: true,
            },
          },
        },
      }),
      db.poll.groupBy({
        by: ["status"],
        where: {
          administratorId: access.administratorId,
          condominiumId: access.condominiumId,
          status: {
            in: visibleStatuses,
          },
        },
        _count: {
          _all: true,
        },
      }),
    ]);

    const eligiblePolls = rawPolls.filter((poll) =>
      isPollEligibleForAccess(poll, access),
    );

    const paginatedPolls = eligiblePolls.slice(skip, skip + limit);
    const statusMap = statusTotals.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = item._count._all;
      return acc;
    }, {});

    const totalOpen = eligiblePolls.filter((poll) =>
      isPollCurrentlyOpen(poll),
    ).length;
    const totalAnswered = eligiblePolls.filter(
      (poll) => poll.responses.length > 0,
    ).length;
    const totalPending = eligiblePolls.filter(
      (poll) => isPollCurrentlyOpen(poll) && poll.responses.length === 0,
    ).length;

    return NextResponse.json({
      polls: paginatedPolls.map((poll) => {
        const myResponse = poll.responses[0] ?? null;
        const hasResponded = Boolean(myResponse);
        const canRespond = isPollCurrentlyOpen(poll) && (!hasResponded || poll.allowResponseUpdate);

        const canViewResults = canParticipantSeeResults({
          poll,
          hasResponded,
        });

        return {
          ...poll,
          responses: undefined,
          myResponse,
          userResponse: myResponse
            ? {
                ...myResponse,
                createdAt: myResponse.submittedAt,
              }
            : null,
          hasResponded,
          responseStatus: hasResponded ? "RESPONDED" : "PENDING",
          canRespond,
          isOpen: isPollCurrentlyOpen(poll),
          canSeeResults: canViewResults,
          canViewResults,
        };
      }),
      pagination: {
        page,
        limit,
        total: eligiblePolls.length,
        pages: Math.max(1, Math.ceil(eligiblePolls.length / limit)),
      },
      kpis: {
        total: eligiblePolls.length,
        open: totalOpen,
        answered: totalAnswered,
        pending: totalPending,
        closed: statusMap.CLOSED ?? 0,
        published: statusMap.PUBLISHED ?? 0,

        // Aliases amigáveis para páginas e componentes do portal.
        totalAvailable: eligiblePolls.length,
        totalOpen,
        totalResponded: totalAnswered,
        totalPending,
        totalClosed: statusMap.CLOSED ?? 0,
      },
      activeAccess: {
        id: access.accessId,
        role: access.role,
        label: access.accessLabel,
        condominiumId: access.condominiumId,
        unitId: access.unitId,
        residentId: access.residentId,
        block: access.block,
        linkType: access.linkType,
        canVote: access.canVote,
        isGovernanceProfile: access.isGovernanceProfile,
      },
    });
  } catch (error) {
    console.error("Erro ao listar enquetes do portal:", error);

    return NextResponse.json(
      {
        error: "Não foi possível listar as enquetes.",
      },
      {
        status: 500,
      },
    );
  }
}
