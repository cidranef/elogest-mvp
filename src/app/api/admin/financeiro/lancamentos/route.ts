import { NextRequest, NextResponse } from "next/server";
import {
  AdministratorProviderStatus,
  FinancialEntryOrigin,
  FinancialEntryStatus,
  FinancialEntryType,
  FinancialLogAction,
  Status,
  type Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireFinancialAdminApiAccess } from "@/lib/admin-api-guard";

/* =========================================================
   ELOGEST — ETAPA 53.3
   API ADMIN — LANÇAMENTOS FINANCEIROS

   Arquivo:
   src/app/api/admin/financeiro/lancamentos/route.ts

   Métodos:
   - GET: lista lançamentos financeiros da administradora ativa.
   - POST: cria lançamento manual de receita ou despesa.
   - PATCH: edita, cancela ou reativa lançamento manual.

   Segurança:
   - Exige perfil ativo ADMINISTRADORA.
   - Bloqueia administradora inativa.
   - Exige módulo Financeiro liberado por plano ou override.
   - Isola tudo por administratorId do perfil ativo.
   - Valida condomínio, categoria, unidade e fornecedor dentro da carteira.

   Observação:
   - Baixas financeiras, estornos e comprovantes entram no bloco 53.3.
   - Mensalidades em lote entram no bloco 53.4.
   ========================================================= */

type RequestBody = Record<string, unknown>;

type PatchAction = "UPDATE" | "CANCEL" | "REACTIVATE";

type FinancialEntryDateFilter = Exclude<
  NonNullable<Prisma.FinancialEntryWhereInput["dueDate"]>,
  Date | string
>;

type FinancialEntryWithRelations = Prisma.FinancialEntryGetPayload<{
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
    provider: {
      select: {
        id: true;
        tradeName: true;
        legalName: true;
        document: true;
      };
    };
    category: {
      select: {
        id: true;
        type: true;
        name: true;
        status: true;
      };
    };
    createdByUser: {
      select: {
        id: true;
        name: true;
        email: true;
      };
    };
    canceledByUser: {
      select: {
        id: true;
        name: true;
        email: true;
      };
    };
    settlements: {
      include: {
        registeredByUser: {
          select: {
            id: true;
            name: true;
            email: true;
          };
        };
        reversedByUser: {
          select: {
            id: true;
            name: true;
            email: true;
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
    };
    attachments: {
      include: {
        uploadedByUser: {
          select: {
            id: true;
            name: true;
            email: true;
          };
        };
      };
    };
    _count: {
      select: {
        settlements: true;
        attachments: true;
        logs: true;
      };
    };
  };
}>;

function jsonError(message: string, status = 400) {
  return NextResponse.json(
    {
      error: message,
    },
    {
      status,
    },
  );
}

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function cleanOptionalText(value: unknown) {
  const text = cleanText(value);
  return text || null;
}

function normalizeNullableId(value: unknown) {
  const text = cleanText(value);
  return text || null;
}

function parsePositiveCents(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = Math.floor(value);
    return parsed > 0 ? parsed : null;
  }

  if (typeof value === "string") {
    const text = value.trim();

    if (!text) {
      return null;
    }

    const normalized = text
      .replace(/\s/g, "")
      .replace(/R\$/gi, "")
      .replace(/\./g, "")
      .replace(",", ".");

    const amount = Number(normalized);

    if (!Number.isFinite(amount) || amount <= 0) {
      return null;
    }

    return Math.round(amount * 100);
  }

  return null;
}

function parseDate(value: unknown, label: string) {
  const text = cleanText(value);

  if (!text) {
    return {
      ok: false as const,
      message: `Informe ${label}.`,
    };
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return {
      ok: false as const,
      message: `Informe ${label} válido.`,
    };
  }

  return {
    ok: true as const,
    value: date,
  };
}

function parseFinancialType(value: unknown) {
  const type = cleanText(value).toUpperCase();

  if (type === FinancialEntryType.REVENUE || type === FinancialEntryType.EXPENSE) {
    return {
      ok: true as const,
      value: type as FinancialEntryType,
    };
  }

  return {
    ok: false as const,
    message: "Informe se o lançamento é receita ou despesa.",
  };
}

function parsePatchAction(value: unknown): PatchAction {
  const action = cleanText(value || "UPDATE").toUpperCase();

  if (action === "CANCEL" || action === "REACTIVATE") {
    return action;
  }

  return "UPDATE";
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

function buildEntryResponse(entry: FinancialEntryWithRelations) {
  const effectiveStatus = getEffectiveStatus(entry);

  return {
    id: entry.id,
    administratorId: entry.administratorId,
    condominiumId: entry.condominiumId,
    unitId: entry.unitId,
    providerId: entry.providerId,
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
    metadata: entry.metadata,
    createdByUserId: entry.createdByUserId,
    canceledAt: entry.canceledAt,
    canceledByUserId: entry.canceledByUserId,
    cancellationReason: entry.cancellationReason,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    condominium: entry.condominium,
    unit: entry.unit,
    provider: entry.provider,
    category: entry.category,
    createdByUser: entry.createdByUser,
    canceledByUser: entry.canceledByUser,
    settlementSummary: buildSettlementSummary(entry),
    settlements: entry.settlements.map((settlement) => ({
      id: settlement.id,
      financialEntryId: settlement.financialEntryId,
      type: settlement.type,
      paidAt: settlement.paidAt,
      amountCents: settlement.amountCents,
      interestCents: settlement.interestCents,
      fineCents: settlement.fineCents,
      discountCents: settlement.discountCents,
      paymentMethod: settlement.paymentMethod,
      notes: settlement.notes,
      registeredByUserId: settlement.registeredByUserId,
      registeredByUser: settlement.registeredByUser,
      reversedAt: settlement.reversedAt,
      reversedByUserId: settlement.reversedByUserId,
      reversedByUser: settlement.reversedByUser,
      reversalReason: settlement.reversalReason,
      attachments: settlement.attachments.map((attachment) => ({
        ...attachment,
        url: `/api/admin/financeiro/comprovantes/${attachment.id}`,
      })),
      createdAt: settlement.createdAt,
      updatedAt: settlement.updatedAt,
    })),
    attachments: entry.attachments.map((attachment) => ({
      ...attachment,
      url: `/api/admin/financeiro/comprovantes/${attachment.id}`,
    })),
    counts: {
      settlements: entry._count.settlements,
      attachments: entry._count.attachments,
      logs: entry._count.logs,
    },
  };
}

function parsePageParams(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = Math.max(Number(searchParams.get("page") || 1), 1);
  const pageSize = Math.min(
    Math.max(Number(searchParams.get("pageSize") || 20), 1),
    100,
  );

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    q: cleanOptionalText(searchParams.get("q")),
    condominiumId: cleanOptionalText(searchParams.get("condominiumId")),
    unitId: cleanOptionalText(searchParams.get("unitId")),
    providerId: cleanOptionalText(searchParams.get("providerId")),
    categoryId: cleanOptionalText(searchParams.get("categoryId")),
    type: cleanOptionalText(searchParams.get("type")),
    status: cleanOptionalText(searchParams.get("status")),
    competenceFrom: cleanOptionalText(searchParams.get("competenceFrom")),
    competenceTo: cleanOptionalText(searchParams.get("competenceTo")),
    dueFrom: cleanOptionalText(searchParams.get("dueFrom")),
    dueTo: cleanOptionalText(searchParams.get("dueTo")),
  };
}

function buildWhere(params: ReturnType<typeof parsePageParams> & { administratorId: string }) {
  const where: Prisma.FinancialEntryWhereInput = {
    administratorId: params.administratorId,
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
        condominium: {
          name: {
            contains: params.q,
            mode: "insensitive",
          },
        },
      },
      {
        provider: {
          tradeName: {
            contains: params.q,
            mode: "insensitive",
          },
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

  if (params.condominiumId) where.condominiumId = params.condominiumId;
  if (params.unitId) where.unitId = params.unitId;
  if (params.providerId) where.providerId = params.providerId;
  if (params.categoryId) where.categoryId = params.categoryId;

  if (params.type === FinancialEntryType.REVENUE || params.type === FinancialEntryType.EXPENSE) {
    where.type = params.type as FinancialEntryType;
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
        ...(typeof where.dueDate === "object" && where.dueDate !== null
          ? where.dueDate
          : {}),
        lt: today,
      };
    } else if (Object.values(FinancialEntryStatus).includes(status as FinancialEntryStatus)) {
      where.status = status as FinancialEntryStatus;
    }
  }

  if (params.competenceFrom || params.competenceTo) {
    const competence: FinancialEntryDateFilter = {};
    if (params.competenceFrom) competence.gte = new Date(params.competenceFrom);
    if (params.competenceTo) competence.lte = new Date(params.competenceTo);
    where.competence = competence;
  }

  if (params.dueFrom || params.dueTo) {
    const existingDueDate =
      typeof where.dueDate === "object" &&
      where.dueDate !== null &&
      !(where.dueDate instanceof Date)
        ? (where.dueDate as FinancialEntryDateFilter)
        : {};

    const dueDate: FinancialEntryDateFilter = {
      ...existingDueDate,
    };
    if (params.dueFrom) dueDate.gte = new Date(params.dueFrom);
    if (params.dueTo) dueDate.lte = new Date(params.dueTo);
    where.dueDate = dueDate;
  }

  return where;
}

async function validateCondominium(params: {
  administratorId: string;
  condominiumId: string;
}) {
  const condominium = await db.condominium.findFirst({
    where: {
      id: params.condominiumId,
      administratorId: params.administratorId,
      status: Status.ACTIVE,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!condominium) {
    return {
      ok: false as const,
      message: "Condomínio não encontrado na carteira ativa da administradora.",
    };
  }

  return {
    ok: true as const,
    value: condominium,
  };
}

async function validateUnit(params: {
  condominiumId: string;
  unitId: string | null;
}) {
  if (!params.unitId) {
    return {
      ok: true as const,
      value: null,
    };
  }

  const unit = await db.unit.findFirst({
    where: {
      id: params.unitId,
      condominiumId: params.condominiumId,
      status: Status.ACTIVE,
    },
    select: {
      id: true,
      block: true,
      unitNumber: true,
    },
  });

  if (!unit) {
    return {
      ok: false as const,
      message: "Unidade não encontrada no condomínio informado.",
    };
  }

  return {
    ok: true as const,
    value: unit,
  };
}

async function validateCategory(params: {
  administratorId: string;
  categoryId: string;
  type: FinancialEntryType;
}) {
  const category = await db.financialCategory.findFirst({
    where: {
      id: params.categoryId,
      administratorId: params.administratorId,
      type: params.type,
      status: Status.ACTIVE,
    },
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
    },
  });

  if (!category) {
    return {
      ok: false as const,
      message:
        "Categoria financeira não encontrada, inativa ou incompatível com o tipo do lançamento.",
    };
  }

  return {
    ok: true as const,
    value: category,
  };
}

async function validateProvider(params: {
  administratorId: string;
  providerId: string | null;
}) {
  if (!params.providerId) {
    return {
      ok: true as const,
      value: null,
    };
  }

  const provider = await db.provider.findFirst({
    where: {
      id: params.providerId,
      administratorProviders: {
        some: {
          administratorId: params.administratorId,
          status: {
            in: [
              AdministratorProviderStatus.IN_REVIEW,
              AdministratorProviderStatus.HOMOLOGATED,
              AdministratorProviderStatus.ACTIVE,
            ],
          },
        },
      },
    },
    select: {
      id: true,
      tradeName: true,
      legalName: true,
    },
  });

  if (!provider) {
    return {
      ok: false as const,
      message: "Fornecedor não encontrado na carteira da administradora.",
    };
  }

  return {
    ok: true as const,
    value: provider,
  };
}

async function writeEntryLog(params: {
  financialEntryId: string;
  userId: string;
  action: FinancialLogAction;
  message: string;
  metadata?: Prisma.InputJsonValue;
}) {
  await db.financialLog.create({
    data: {
      financialEntryId: params.financialEntryId,
      userId: params.userId,
      action: params.action,
      message: params.message,
      metadata: params.metadata ?? undefined,
    },
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireFinancialAdminApiAccess();

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const params = parsePageParams(request);
    const where = buildWhere({
      ...params,
      administratorId: auth.administratorId,
    });

    const [entries, total, revenueAggregate, expenseAggregate, overdueCount, openCount] =
      await Promise.all([
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
            provider: {
              select: {
                id: true,
                tradeName: true,
                legalName: true,
                document: true,
              },
            },
            category: {
              select: {
                id: true,
                type: true,
                name: true,
                status: true,
              },
            },
            createdByUser: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            canceledByUser: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            settlements: {
              include: {
                registeredByUser: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
                reversedByUser: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
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
                },
              },
              orderBy: {
                createdAt: "desc",
              },
            },
            attachments: {
              include: {
                uploadedByUser: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
              orderBy: {
                createdAt: "desc",
              },
            },
            _count: {
              select: {
                settlements: true,
                attachments: true,
                logs: true,
              },
            },
          },
          orderBy: [
            {
              dueDate: "asc",
            },
            {
              createdAt: "desc",
            },
          ],
          skip: params.skip,
          take: params.pageSize,
        }),
        db.financialEntry.count({ where }),
        db.financialEntry.aggregate({
          where: {
            ...where,
            type: FinancialEntryType.REVENUE,
            status: {
              not: FinancialEntryStatus.CANCELED,
            },
          },
          _sum: {
            valueCents: true,
          },
        }),
        db.financialEntry.aggregate({
          where: {
            ...where,
            type: FinancialEntryType.EXPENSE,
            status: {
              not: FinancialEntryStatus.CANCELED,
            },
          },
          _sum: {
            valueCents: true,
          },
        }),
        db.financialEntry.count({
          where: {
            ...where,
            status: {
              in: [FinancialEntryStatus.OPEN, FinancialEntryStatus.PARTIALLY_PAID],
            },
            dueDate: {
              lt: new Date(new Date().setHours(0, 0, 0, 0)),
            },
          },
        }),
        db.financialEntry.count({
          where: {
            ...where,
            status: FinancialEntryStatus.OPEN,
          },
        }),
      ]);

    return NextResponse.json({
      entries: entries.map(buildEntryResponse),
      pagination: {
        page: params.page,
        pageSize: params.pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / params.pageSize), 1),
      },
      kpis: {
        total,
        open: openCount,
        overdue: overdueCount,
        revenueValueCents: revenueAggregate._sum.valueCents ?? 0,
        expenseValueCents: expenseAggregate._sum.valueCents ?? 0,
        balanceValueCents:
          (revenueAggregate._sum.valueCents ?? 0) -
          (expenseAggregate._sum.valueCents ?? 0),
      },
    });
  } catch (error) {
    console.error("Erro ao listar lançamentos financeiros:", error);

    return NextResponse.json(
      {
        error: "Erro ao listar lançamentos financeiros.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireFinancialAdminApiAccess();

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const body = (await request.json()) as RequestBody;

    const typeValidation = parseFinancialType(body.type);
    if (!typeValidation.ok) return jsonError(typeValidation.message);

    const type = typeValidation.value;
    const description = cleanText(body.description);
    const condominiumId = normalizeNullableId(body.condominiumId);
    const categoryId = normalizeNullableId(body.categoryId);
    const unitId = normalizeNullableId(body.unitId);
    const providerId = normalizeNullableId(body.providerId);
    const valueCents = parsePositiveCents(body.valueCents ?? body.value);
    const competenceValidation = parseDate(body.competence, "a competência");
    const dueDateValidation = parseDate(body.dueDate, "a data de vencimento");

    if (!description || description.length < 3) {
      return jsonError("Informe uma descrição com pelo menos 3 caracteres.");
    }

    if (!condominiumId) {
      return jsonError("Selecione o condomínio do lançamento.");
    }

    if (!categoryId) {
      return jsonError("Selecione a categoria do lançamento.");
    }

    if (!valueCents) {
      return jsonError("Informe um valor maior que zero.");
    }

    if (!competenceValidation.ok) return jsonError(competenceValidation.message);
    if (!dueDateValidation.ok) return jsonError(dueDateValidation.message);

    const condominiumValidation = await validateCondominium({
      administratorId: auth.administratorId,
      condominiumId,
    });
    if (!condominiumValidation.ok) return jsonError(condominiumValidation.message, 404);

    const categoryValidation = await validateCategory({
      administratorId: auth.administratorId,
      categoryId,
      type,
    });
    if (!categoryValidation.ok) return jsonError(categoryValidation.message, 404);

    const unitValidation = await validateUnit({
      condominiumId,
      unitId,
    });
    if (!unitValidation.ok) return jsonError(unitValidation.message, 404);

    const providerValidation = await validateProvider({
      administratorId: auth.administratorId,
      providerId,
    });
    if (!providerValidation.ok) return jsonError(providerValidation.message, 404);

    const entry = await db.$transaction(async (tx) => {
      const savedEntry = await tx.financialEntry.create({
        data: {
          administratorId: auth.administratorId,
          condominiumId,
          unitId,
          providerId,
          categoryId,
          type,
          origin: FinancialEntryOrigin.MANUAL,
          status: FinancialEntryStatus.OPEN,
          description,
          competence: competenceValidation.value,
          dueDate: dueDateValidation.value,
          valueCents,
          notes: cleanOptionalText(body.notes),
          createdByUserId: auth.authUser.id,
        },
      });

      await tx.financialLog.create({
        data: {
          financialEntryId: savedEntry.id,
          userId: auth.authUser.id,
          action: FinancialLogAction.CREATED,
          message: `Lançamento financeiro criado: ${description}.`,
          metadata: {
            type,
            valueCents,
            condominiumId,
            categoryId,
            unitId,
            providerId,
          },
        },
      });

      return savedEntry;
    });

    return NextResponse.json(
      {
        message: "Lançamento financeiro criado com sucesso.",
        entry,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error("Erro ao criar lançamento financeiro:", error);

    return NextResponse.json(
      {
        error: "Erro ao criar lançamento financeiro.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireFinancialAdminApiAccess();

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const body = (await request.json()) as RequestBody;
    const entryId = normalizeNullableId(body.id || body.entryId);
    const action = parsePatchAction(body.action);

    if (!entryId) {
      return jsonError("Informe o lançamento financeiro.");
    }

    const currentEntry = await db.financialEntry.findFirst({
      where: {
        id: entryId,
        administratorId: auth.administratorId,
      },
      include: {
        _count: {
          select: {
            settlements: true,
          },
        },
      },
    });

    if (!currentEntry) {
      return jsonError("Lançamento financeiro não encontrado.", 404);
    }

    if (action === "CANCEL") {
      if (currentEntry.status === FinancialEntryStatus.CANCELED) {
        return jsonError("Este lançamento já está cancelado.");
      }

      const cancellationReason = cleanText(body.cancellationReason || body.reason);

      if (cancellationReason.length < 3) {
        return jsonError("Informe o motivo do cancelamento.");
      }

      const entry = await db.financialEntry.update({
        where: {
          id: currentEntry.id,
        },
        data: {
          status: FinancialEntryStatus.CANCELED,
          canceledAt: new Date(),
          canceledByUserId: auth.authUser.id,
          cancellationReason,
        },
      });

      await writeEntryLog({
        financialEntryId: entry.id,
        userId: auth.authUser.id,
        action: FinancialLogAction.CANCELED,
        message: `Lançamento financeiro cancelado: ${cancellationReason}.`,
        metadata: {
          previousStatus: currentEntry.status,
          nextStatus: FinancialEntryStatus.CANCELED,
          cancellationReason,
        },
      });

      return NextResponse.json({
        message: "Lançamento financeiro cancelado com sucesso.",
        entry,
      });
    }

    if (action === "REACTIVATE") {
      if (currentEntry.status !== FinancialEntryStatus.CANCELED) {
        return jsonError("Somente lançamentos cancelados podem ser reativados.");
      }

      const entry = await db.financialEntry.update({
        where: {
          id: currentEntry.id,
        },
        data: {
          status: FinancialEntryStatus.OPEN,
          canceledAt: null,
          canceledByUserId: null,
          cancellationReason: null,
        },
      });

      await writeEntryLog({
        financialEntryId: entry.id,
        userId: auth.authUser.id,
        action: FinancialLogAction.REACTIVATED,
        message: "Lançamento financeiro reativado.",
        metadata: {
          previousStatus: currentEntry.status,
          nextStatus: FinancialEntryStatus.OPEN,
        },
      });

      return NextResponse.json({
        message: "Lançamento financeiro reativado com sucesso.",
        entry,
      });
    }

    if (currentEntry.status === FinancialEntryStatus.CANCELED) {
      return jsonError("Reative o lançamento antes de editar os dados.");
    }

    if (currentEntry.origin !== FinancialEntryOrigin.MANUAL) {
      return jsonError(
        "Nesta etapa, apenas lançamentos manuais podem ser editados diretamente.",
      );
    }

    const typeValidation = parseFinancialType(body.type ?? currentEntry.type);
    if (!typeValidation.ok) return jsonError(typeValidation.message);

    const type = typeValidation.value;
    const description = cleanText(body.description ?? currentEntry.description);
    const condominiumId = normalizeNullableId(body.condominiumId ?? currentEntry.condominiumId);
    const categoryId = normalizeNullableId(body.categoryId ?? currentEntry.categoryId);
    const unitId = normalizeNullableId(body.unitId ?? currentEntry.unitId);
    const providerId = normalizeNullableId(body.providerId ?? currentEntry.providerId);
    const valueCents = parsePositiveCents(body.valueCents ?? currentEntry.valueCents);
    const competenceValidation = parseDate(body.competence ?? currentEntry.competence, "a competência");
    const dueDateValidation = parseDate(body.dueDate ?? currentEntry.dueDate, "a data de vencimento");

    if (!description || description.length < 3) {
      return jsonError("Informe uma descrição com pelo menos 3 caracteres.");
    }

    if (!condominiumId) return jsonError("Selecione o condomínio do lançamento.");
    if (!categoryId) return jsonError("Selecione a categoria do lançamento.");
    if (!valueCents) return jsonError("Informe um valor maior que zero.");
    if (!competenceValidation.ok) return jsonError(competenceValidation.message);
    if (!dueDateValidation.ok) return jsonError(dueDateValidation.message);

    const condominiumValidation = await validateCondominium({
      administratorId: auth.administratorId,
      condominiumId,
    });
    if (!condominiumValidation.ok) return jsonError(condominiumValidation.message, 404);

    const categoryValidation = await validateCategory({
      administratorId: auth.administratorId,
      categoryId,
      type,
    });
    if (!categoryValidation.ok) return jsonError(categoryValidation.message, 404);

    const unitValidation = await validateUnit({
      condominiumId,
      unitId,
    });
    if (!unitValidation.ok) return jsonError(unitValidation.message, 404);

    const providerValidation = await validateProvider({
      administratorId: auth.administratorId,
      providerId,
    });
    if (!providerValidation.ok) return jsonError(providerValidation.message, 404);

    const entry = await db.financialEntry.update({
      where: {
        id: currentEntry.id,
      },
      data: {
        condominiumId,
        unitId,
        providerId,
        categoryId,
        type,
        description,
        competence: competenceValidation.value,
        dueDate: dueDateValidation.value,
        valueCents,
        notes: cleanOptionalText(body.notes),
      },
    });

    await writeEntryLog({
      financialEntryId: entry.id,
      userId: auth.authUser.id,
      action: FinancialLogAction.UPDATED,
      message: `Lançamento financeiro atualizado: ${description}.`,
      metadata: {
        previous: {
          condominiumId: currentEntry.condominiumId,
          categoryId: currentEntry.categoryId,
          unitId: currentEntry.unitId,
          providerId: currentEntry.providerId,
          type: currentEntry.type,
          valueCents: currentEntry.valueCents,
        },
        next: {
          condominiumId,
          categoryId,
          unitId,
          providerId,
          type,
          valueCents,
        },
      },
    });

    return NextResponse.json({
      message: "Lançamento financeiro atualizado com sucesso.",
      entry,
    });
  } catch (error) {
    console.error("Erro ao atualizar lançamento financeiro:", error);

    return NextResponse.json(
      {
        error: "Erro ao atualizar lançamento financeiro.",
      },
      {
        status: 500,
      },
    );
  }
}
