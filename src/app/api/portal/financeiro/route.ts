import { NextRequest, NextResponse } from "next/server";
import {
  AccessRole,
  FinancialEntryStatus,
  FinancialEntryType,
  FinancialSettlementType,
  Status,
  type Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import { hasModuleAccess } from "@/lib/plan-limits";
import {
  getActiveUserAccessFromCookies,
  isPortalAccess,
  type ActiveUserAccess,
} from "@/lib/user-access";

/* =========================================================
   ELOGEST — ETAPA 53.6
   API PORTAL — FINANCEIRO POR UNIDADE

   Arquivo:
   src/app/api/portal/financeiro/route.ts

   Método:
   - GET: lista mensalidades e lançamentos financeiros vinculados
     à unidade do perfil ativo no portal.

   Segurança:
   - Exige usuário autenticado.
   - Exige perfil ativo de portal.
   - Exige condomínio e administradora ativos.
   - Exige módulo Financeiro liberado para a administradora.
   - Isola por administratorId, condominiumId e unitId do perfil ativo.
   - Não expõe despesas gerais do condomínio.
   - Não permite consultar dados de outra unidade.
   ========================================================= */

type PortalFinancialAccess = {
  authUser: {
    id: string;
    name?: string | null;
    email?: string | null;
  };
  activeAccess: ActiveUserAccess;
  administratorId: string;
  condominiumId: string;
  unitId: string | null;
  role: AccessRole | string;
  accessLabel?: string | null;
  unit: {
    id: string;
    block?: string | null;
    unitNumber?: string | null;
  } | null;
  condominium: {
    id: string;
    name: string;
  };
};

type PortalEntryDateFilter = Exclude<
  NonNullable<Prisma.FinancialEntryWhereInput["dueDate"]>,
  Date | string
>;

type PortalFinancialEntry = Prisma.FinancialEntryGetPayload<{
  include: {
    condominium: {
      select: {
        id: true;
        name: true;
      };
    };
    unit: {
      select: {
        id: true;
        block: true;
        unitNumber: true;
      };
    };
    category: {
      select: {
        id: true;
        name: true;
        type: true;
      };
    };
    chargeBatch: {
      select: {
        id: true;
        description: true;
        competence: true;
        dueDate: true;
      };
    };
    settlements: {
      include: {
        attachments: {
          select: {
            id: true;
            originalName: true;
            mimeType: true;
            sizeBytes: true;
            createdAt: true;
          };
        };
      };
    };
    attachments: {
      select: {
        id: true;
        originalName: true;
        mimeType: true;
        sizeBytes: true;
        createdAt: true;
      };
    };
  };
}>;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function cleanOptionalText(value: unknown) {
  const text = cleanText(value);
  return text || null;
}

function parsePageParams(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = Math.max(Number(searchParams.get("page") || 1), 1);
  const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize") || 20), 1), 100);

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    q: cleanOptionalText(searchParams.get("q")),
    status: cleanOptionalText(searchParams.get("status")),
    competenceFrom: cleanOptionalText(searchParams.get("competenceFrom")),
    competenceTo: cleanOptionalText(searchParams.get("competenceTo")),
    dueFrom: cleanOptionalText(searchParams.get("dueFrom")),
    dueTo: cleanOptionalText(searchParams.get("dueTo")),
  };
}

function isAllowedPortalRole(role?: string | null) {
  return (
    role === AccessRole.SINDICO ||
    role === AccessRole.CONSELHEIRO ||
    role === AccessRole.MORADOR ||
    role === AccessRole.PROPRIETARIO
  );
}

function getEffectiveStatus(entry: {
  status: FinancialEntryStatus;
  dueDate: Date;
}) {
  if (
    entry.status === FinancialEntryStatus.OPEN ||
    entry.status === FinancialEntryStatus.PARTIALLY_PAID
  ) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dueDate = new Date(entry.dueDate);
    dueDate.setHours(0, 0, 0, 0);

    if (dueDate < today) {
      return FinancialEntryStatus.OVERDUE;
    }
  }

  return entry.status;
}

function buildSettlementSummary(entry: {
  valueCents: number;
  settlements?: {
    amountCents: number;
    interestCents: number;
    fineCents: number;
    discountCents: number;
    reversedAt: Date | null;
  }[];
}) {
  const activeSettlements = (entry.settlements || []).filter(
    (settlement) => !settlement.reversedAt,
  );

  const paidPrincipalCents = activeSettlements.reduce(
    (sum, settlement) => sum + settlement.amountCents,
    0,
  );
  const interestCents = activeSettlements.reduce(
    (sum, settlement) => sum + settlement.interestCents,
    0,
  );
  const fineCents = activeSettlements.reduce(
    (sum, settlement) => sum + settlement.fineCents,
    0,
  );
  const discountCents = activeSettlements.reduce(
    (sum, settlement) => sum + settlement.discountCents,
    0,
  );

  return {
    paidPrincipalCents,
    interestCents,
    fineCents,
    discountCents,
    netPaidCents: paidPrincipalCents + interestCents + fineCents - discountCents,
    remainingPrincipalCents: Math.max(entry.valueCents - paidPrincipalCents, 0),
    activeSettlementsCount: activeSettlements.length,
  };
}

function buildWhere(params: ReturnType<typeof parsePageParams> & PortalFinancialAccess) {
  const where: Prisma.FinancialEntryWhereInput = {
    administratorId: params.administratorId,
    condominiumId: params.condominiumId,
    unitId: params.unitId || "__NO_UNIT__",
    type: FinancialEntryType.REVENUE,
  };

  if (params.q) {
    where.OR = [
      {
        description: {
          contains: params.q,
          mode: "insensitive",
        },
      },
      {
        notes: {
          contains: params.q,
          mode: "insensitive",
        },
      },
      {
        category: {
          name: {
            contains: params.q,
            mode: "insensitive",
          },
        },
      },
    ];
  }

  if (params.status) {
    const status = params.status.toUpperCase();

    if (status === FinancialEntryStatus.OVERDUE) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      where.status = {
        in: [FinancialEntryStatus.OPEN, FinancialEntryStatus.PARTIALLY_PAID],
      };
      where.dueDate = {
        lt: today,
      };
    } else if (Object.values(FinancialEntryStatus).includes(status as FinancialEntryStatus)) {
      where.status = status as FinancialEntryStatus;
    }
  }

  if (params.competenceFrom || params.competenceTo) {
    const competence: PortalEntryDateFilter = {};
    if (params.competenceFrom) competence.gte = new Date(params.competenceFrom);
    if (params.competenceTo) competence.lte = new Date(params.competenceTo);
    where.competence = competence;
  }

  if (params.dueFrom || params.dueTo) {
    const existingDueDate =
      typeof where.dueDate === "object" &&
      where.dueDate !== null &&
      !(where.dueDate instanceof Date)
        ? (where.dueDate as PortalEntryDateFilter)
        : {};

    const dueDate: PortalEntryDateFilter = {
      ...existingDueDate,
    };
    if (params.dueFrom) dueDate.gte = new Date(params.dueFrom);
    if (params.dueTo) dueDate.lte = new Date(params.dueTo);
    where.dueDate = dueDate;
  }

  return where;
}

function buildEntryResponse(entry: PortalFinancialEntry) {
  const effectiveStatus = getEffectiveStatus(entry);
  const settlementSummary = buildSettlementSummary(entry);

  return {
    id: entry.id,
    condominiumId: entry.condominiumId,
    unitId: entry.unitId,
    categoryId: entry.categoryId,
    chargeBatchId: entry.chargeBatchId,
    type: entry.type,
    origin: entry.origin,
    status: entry.status,
    effectiveStatus,
    description: entry.description,
    competence: entry.competence,
    dueDate: entry.dueDate,
    valueCents: entry.valueCents,
    notes: entry.notes,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    condominium: entry.condominium,
    unit: entry.unit,
    category: entry.category,
    chargeBatch: entry.chargeBatch,
    settlementSummary,
    settlements: entry.settlements.map((settlement) => ({
      id: settlement.id,
      paidAt: settlement.paidAt,
      amountCents: settlement.amountCents,
      interestCents: settlement.interestCents,
      fineCents: settlement.fineCents,
      discountCents: settlement.discountCents,
      paymentMethod: settlement.paymentMethod,
      notes: settlement.notes,
      reversedAt: settlement.reversedAt,
      reversalReason: settlement.reversalReason,
      createdAt: settlement.createdAt,
      attachments: settlement.attachments.map((attachment) => ({
        ...attachment,
        url: `/api/portal/financeiro/comprovantes/${attachment.id}`,
      })),
    })),
    attachments: entry.attachments.map((attachment) => ({
      ...attachment,
      url: `/api/portal/financeiro/comprovantes/${attachment.id}`,
    })),
  };
}

async function requirePortalFinancialAccess(): Promise<
  PortalFinancialAccess | { error: NextResponse }
> {
  const authUser = (await getAuthUser()) as {
    id?: string;
    name?: string | null;
    email?: string | null;
  } | null;

  if (!authUser?.id) {
    return {
      error: jsonError("Sessão expirada. Faça login novamente.", 401),
    };
  }

  const activeAccess = await getActiveUserAccessFromCookies({
    userId: authUser.id,
  });

  if (!activeAccess || !isPortalAccess(activeAccess)) {
    return {
      error: jsonError("Selecione um perfil do portal para acessar o financeiro.", 403),
    };
  }

  if (!isAllowedPortalRole(activeAccess.role)) {
    return {
      error: jsonError("Este perfil não possui acesso ao financeiro do portal.", 403),
    };
  }

  if (!activeAccess.condominiumId) {
    return {
      error: jsonError("Perfil ativo sem condomínio vinculado.", 403),
    };
  }

  const [user, condominium, unit] = await Promise.all([
    db.user.findUnique({
      where: {
        id: authUser.id,
      },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
      },
    }),
    db.condominium.findFirst({
      where: {
        id: activeAccess.condominiumId,
      },
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
    }),
    activeAccess.unitId
      ? db.unit.findFirst({
          where: {
            id: activeAccess.unitId,
            condominiumId: activeAccess.condominiumId,
          },
          select: {
            id: true,
            block: true,
            unitNumber: true,
            status: true,
          },
        })
      : null,
  ]);

  if (!user?.isActive) {
    return {
      error: jsonError("Usuário inativo. Não é possível acessar o portal.", 403),
    };
  }

  if (!condominium || condominium.status !== Status.ACTIVE) {
    return {
      error: jsonError("Condomínio não encontrado ou inativo.", 403),
    };
  }

  if (condominium.administrator.status !== Status.ACTIVE) {
    return {
      error: jsonError("A administradora deste condomínio está inativa.", 403),
    };
  }

  if (activeAccess.unitId && (!unit || unit.status !== Status.ACTIVE)) {
    return {
      error: jsonError("A unidade do perfil ativo está inativa ou não foi encontrada.", 403),
    };
  }

  const moduleAccess = await hasModuleAccess({
    administratorId: condominium.administratorId,
    moduleSlug: "financeiro",
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
      id: user.id,
      name: user.name,
      email: user.email,
    },
    activeAccess,
    administratorId: condominium.administratorId,
    condominiumId: condominium.id,
    unitId: activeAccess.unitId || null,
    role: activeAccess.role,
    accessLabel: activeAccess.label,
    unit: unit
      ? {
          id: unit.id,
          block: unit.block,
          unitNumber: unit.unitNumber,
        }
      : null,
    condominium: {
      id: condominium.id,
      name: condominium.name,
    },
  };
}

export async function GET(request: NextRequest) {
  const access = await requirePortalFinancialAccess();

  if ("error" in access) {
    return access.error;
  }

  try {
    const params = parsePageParams(request);

    if (!access.unitId) {
      return NextResponse.json({
        context: {
          condominium: access.condominium,
          unit: null,
          role: access.role,
          accessLabel: access.accessLabel,
        },
        entries: [],
        pagination: {
          page: params.page,
          pageSize: params.pageSize,
          total: 0,
          totalPages: 1,
        },
        kpis: {
          total: 0,
          open: 0,
          paid: 0,
          partiallyPaid: 0,
          overdue: 0,
          canceled: 0,
          totalValueCents: 0,
          paidValueCents: 0,
          openValueCents: 0,
          overdueValueCents: 0,
        },
        message:
          "O perfil ativo não está vinculado a uma unidade. Selecione um perfil de unidade para consultar mensalidades.",
      });
    }

    const where = buildWhere({
      ...params,
      ...access,
    });

    const [entries, total, allEntriesForKpis] = await Promise.all([
      db.financialEntry.findMany({
        where,
        include: {
          condominium: {
            select: {
              id: true,
              name: true,
            },
          },
          unit: {
            select: {
              id: true,
              block: true,
              unitNumber: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
          chargeBatch: {
            select: {
              id: true,
              description: true,
              competence: true,
              dueDate: true,
            },
          },
          settlements: {
            where: {
              type: FinancialSettlementType.PAYMENT,
            },
            include: {
              attachments: {
                select: {
                  id: true,
                  originalName: true,
                  mimeType: true,
                  sizeBytes: true,
                  createdAt: true,
                },
              },
            },
            orderBy: {
              paidAt: "desc",
            },
          },
          attachments: {
            select: {
              id: true,
              originalName: true,
              mimeType: true,
              sizeBytes: true,
              createdAt: true,
            },
            orderBy: {
              createdAt: "desc",
            },
          },
        },
        orderBy: [
          {
            dueDate: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
        skip: params.skip,
        take: params.pageSize,
      }),
      db.financialEntry.count({ where }),
      db.financialEntry.findMany({
        where,
        select: {
          id: true,
          status: true,
          dueDate: true,
          valueCents: true,
          settlements: {
            where: {
              type: FinancialSettlementType.PAYMENT,
            },
            select: {
              amountCents: true,
              interestCents: true,
              fineCents: true,
              discountCents: true,
              reversedAt: true,
            },
          },
        },
      }),
    ]);

    const kpis = allEntriesForKpis.reduce(
      (acc, entry) => {
        const effectiveStatus = getEffectiveStatus(entry);
        const summary = buildSettlementSummary(entry);

        acc.total += 1;
        acc.totalValueCents += entry.status === FinancialEntryStatus.CANCELED ? 0 : entry.valueCents;
        acc.paidValueCents += summary.netPaidCents;
        acc.openValueCents +=
          entry.status === FinancialEntryStatus.CANCELED ? 0 : summary.remainingPrincipalCents;

        if (effectiveStatus === FinancialEntryStatus.OPEN) acc.open += 1;
        if (effectiveStatus === FinancialEntryStatus.PAID) acc.paid += 1;
        if (effectiveStatus === FinancialEntryStatus.PARTIALLY_PAID) acc.partiallyPaid += 1;
        if (effectiveStatus === FinancialEntryStatus.OVERDUE) {
          acc.overdue += 1;
          acc.overdueValueCents += summary.remainingPrincipalCents;
        }
        if (effectiveStatus === FinancialEntryStatus.CANCELED) acc.canceled += 1;

        return acc;
      },
      {
        total: 0,
        open: 0,
        paid: 0,
        partiallyPaid: 0,
        overdue: 0,
        canceled: 0,
        totalValueCents: 0,
        paidValueCents: 0,
        openValueCents: 0,
        overdueValueCents: 0,
      },
    );

    return NextResponse.json({
      context: {
        condominium: access.condominium,
        unit: access.unit,
        role: access.role,
        accessLabel: access.accessLabel,
      },
      entries: entries.map(buildEntryResponse),
      pagination: {
        page: params.page,
        pageSize: params.pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / params.pageSize), 1),
      },
      kpis,
    });
  } catch (error) {
    console.error("Erro ao carregar financeiro do portal:", error);

    return NextResponse.json(
      {
        error: "Erro ao carregar financeiro do portal.",
      },
      {
        status: 500,
      },
    );
  }
}
