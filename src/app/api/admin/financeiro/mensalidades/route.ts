import { NextRequest, NextResponse } from "next/server";
import {
  FinancialEntryOrigin,
  FinancialEntryStatus,
  FinancialEntryType,
  FinancialLogAction,
  Status,
  type Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireFinancialAdminApiAccess } from "@/lib/admin-api-guard";
import {
  notifyFinancialAdministradoraUsers,
  notifyFinancialUnitUsers,
} from "@/lib/notifications";

/* =========================================================
   ELOGEST — ETAPA 53.4
   API ADMIN — MENSALIDADES POR UNIDADE E GERAÇÃO EM LOTE

   Arquivo:
   src/app/api/admin/financeiro/mensalidades/route.ts

   Métodos:
   - GET: lista lotes de mensalidades da administradora ativa.
   - POST: cria lote e gera um lançamento de receita por unidade.

   Segurança:
   - Exige perfil ativo ADMINISTRADORA.
   - Bloqueia administradora inativa.
   - Exige módulo Financeiro liberado por plano ou override.
   - Isola tudo por administratorId do perfil ativo.
   - Valida condomínio, categoria e unidades dentro da carteira.

   Decisão de produto:
   - Mensalidade gerada em lote cria lançamentos financeiros internos.
   - Não gera boleto, Pix cobrança ou integração bancária nesta etapa.
   - Por padrão bloqueia duplicidade por unidade/competência.
   ========================================================= */

type RequestBody = Record<string, unknown>;

type BatchDateFilter = Exclude<
  NonNullable<Prisma.FinancialChargeBatchWhereInput["competence"]>,
  Date | string
>;

type ChargeBatchWithRelations = Prisma.FinancialChargeBatchGetPayload<{
  include: {
    condominium: {
      select: {
        id: true;
        name: true;
      };
    };
    category: {
      select: {
        id: true;
        name: true;
        type: true;
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
    entries: {
      select: {
        id: true;
        unitId: true;
        status: true;
        valueCents: true;
        unit: {
          select: {
            id: true;
            block: true;
            unitNumber: true;
          };
        };
      };
    };
    _count: {
      select: {
        entries: true;
        logs: true;
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


function moneyTextFromCents(value: number) {
  return (Number(value || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function parsePositiveCents(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = Math.floor(value);
    return parsed > 0 ? parsed : null;
  }

  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return null;

    const normalized = text
      .replace(/\s/g, "")
      .replace(/R\$/gi, "")
      .replace(/\./g, "")
      .replace(",", ".");

    const amount = Number(normalized);
    if (!Number.isFinite(amount) || amount <= 0) return null;

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
      message: `Informe ${label} válida.`,
    };
  }

  return {
    ok: true as const,
    value: date,
  };
}

function parseUnitIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => cleanText(item))
        .filter((item) => item.length > 0),
    ),
  );
}

function parseBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : fallback;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "sim", "s", "yes"].includes(normalized)) return true;
    if (["false", "0", "nao", "não", "n", "no"].includes(normalized)) return false;
  }

  return fallback;
}

function parsePageParams(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = Math.max(Number(searchParams.get("page") || 1), 1);
  const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize") || 20), 1), 100);

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    condominiumId: cleanOptionalText(searchParams.get("condominiumId")),
    categoryId: cleanOptionalText(searchParams.get("categoryId")),
    competenceFrom: cleanOptionalText(searchParams.get("competenceFrom")),
    competenceTo: cleanOptionalText(searchParams.get("competenceTo")),
    q: cleanOptionalText(searchParams.get("q")),
  };
}

function buildWhere(params: ReturnType<typeof parsePageParams> & { administratorId: string }) {
  const where: Prisma.FinancialChargeBatchWhereInput = {
    administratorId: params.administratorId,
  };

  if (params.condominiumId) where.condominiumId = params.condominiumId;
  if (params.categoryId) where.categoryId = params.categoryId;

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
    ];
  }

  if (params.competenceFrom || params.competenceTo) {
    const competence: BatchDateFilter = {};
    if (params.competenceFrom) competence.gte = new Date(params.competenceFrom);
    if (params.competenceTo) competence.lte = new Date(params.competenceTo);
    where.competence = competence;
  }

  return where;
}

function buildBatchResponse(batch: ChargeBatchWithRelations) {
  const totalValueCents = batch.entries.reduce((sum, entry) => sum + Number(entry.valueCents || 0), 0);
  const canceledEntries = batch.entries.filter((entry) => entry.status === FinancialEntryStatus.CANCELED).length;
  const paidEntries = batch.entries.filter((entry) => entry.status === FinancialEntryStatus.PAID).length;
  const openEntries = batch.entries.filter((entry) => entry.status === FinancialEntryStatus.OPEN).length;
  const partiallyPaidEntries = batch.entries.filter((entry) => entry.status === FinancialEntryStatus.PARTIALLY_PAID).length;

  return {
    id: batch.id,
    administratorId: batch.administratorId,
    condominiumId: batch.condominiumId,
    categoryId: batch.categoryId,
    competence: batch.competence,
    dueDate: batch.dueDate,
    description: batch.description,
    defaultValueCents: batch.defaultValueCents,
    notes: batch.notes,
    metadata: batch.metadata,
    createdByUserId: batch.createdByUserId,
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
    condominium: batch.condominium,
    category: batch.category,
    createdByUser: batch.createdByUser,
    entries: batch.entries,
    counts: {
      entries: batch._count.entries,
      logs: batch._count.logs,
      canceledEntries,
      paidEntries,
      openEntries,
      partiallyPaidEntries,
    },
    totalValueCents,
  };
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

async function validateCategory(params: {
  administratorId: string;
  categoryId: string;
}) {
  const category = await db.financialCategory.findFirst({
    where: {
      id: params.categoryId,
      administratorId: params.administratorId,
      type: FinancialEntryType.REVENUE,
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
      message: "Categoria de receita não encontrada ou inativa.",
    };
  }

  return {
    ok: true as const,
    value: category,
  };
}

async function validateUnits(params: {
  condominiumId: string;
  unitIds: string[];
}) {
  const units = await db.unit.findMany({
    where: {
      id: {
        in: params.unitIds,
      },
      condominiumId: params.condominiumId,
      status: Status.ACTIVE,
    },
    select: {
      id: true,
      block: true,
      unitNumber: true,
    },
    orderBy: [
      {
        block: "asc",
      },
      {
        unitNumber: "asc",
      },
    ],
  });

  const foundIds = new Set(units.map((unit) => unit.id));
  const missing = params.unitIds.filter((unitId) => !foundIds.has(unitId));

  if (missing.length > 0) {
    return {
      ok: false as const,
      message: "Uma ou mais unidades não foram encontradas no condomínio informado.",
    };
  }

  return {
    ok: true as const,
    value: units,
  };
}

async function findDuplicateCharges(params: {
  administratorId: string;
  condominiumId: string;
  unitIds: string[];
  competence: Date;
}) {
  return db.financialEntry.findMany({
    where: {
      administratorId: params.administratorId,
      condominiumId: params.condominiumId,
      unitId: {
        in: params.unitIds,
      },
      type: FinancialEntryType.REVENUE,
      origin: FinancialEntryOrigin.UNIT_CHARGE_BATCH,
      status: {
        not: FinancialEntryStatus.CANCELED,
      },
      competence: params.competence,
    },
    select: {
      id: true,
      unitId: true,
      description: true,
      unit: {
        select: {
          block: true,
          unitNumber: true,
        },
      },
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

    const [batches, total, aggregate] = await Promise.all([
      db.financialChargeBatch.findMany({
        where,
        include: {
          condominium: {
            select: {
              id: true,
              name: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              type: true,
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
          entries: {
            select: {
              id: true,
              unitId: true,
              status: true,
              valueCents: true,
              unit: {
                select: {
                  id: true,
                  block: true,
                  unitNumber: true,
                },
              },
            },
            orderBy: [
              {
                unit: {
                  block: "asc",
                },
              },
              {
                unit: {
                  unitNumber: "asc",
                },
              },
            ],
          },
          _count: {
            select: {
              entries: true,
              logs: true,
            },
          },
        },
        orderBy: [
          {
            competence: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
        skip: params.skip,
        take: params.pageSize,
      }),
      db.financialChargeBatch.count({ where }),
      db.financialChargeBatch.aggregate({
        where,
        _sum: {
          defaultValueCents: true,
        },
      }),
    ]);

    const responseBatches = batches.map(buildBatchResponse);
    const totalEntries = responseBatches.reduce((sum, batch) => sum + Number(batch.counts.entries || 0), 0);
    const totalValueCents = responseBatches.reduce((sum, batch) => sum + Number(batch.totalValueCents || 0), 0);

    return NextResponse.json({
      batches: responseBatches,
      pagination: {
        page: params.page,
        pageSize: params.pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / params.pageSize), 1),
      },
      kpis: {
        total,
        totalEntries,
        totalValueCents,
        defaultValueCents: aggregate._sum.defaultValueCents ?? 0,
      },
    });
  } catch (error) {
    console.error("Erro ao listar lotes de mensalidades:", error);

    return NextResponse.json(
      {
        error: "Erro ao listar lotes de mensalidades.",
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

    const condominiumId = cleanOptionalText(body.condominiumId);
    const categoryId = cleanOptionalText(body.categoryId);
    const description = cleanText(body.description);
    const notes = cleanOptionalText(body.notes);
    const unitIds = parseUnitIds(body.unitIds);
    const defaultValueCents = parsePositiveCents(body.defaultValueCents ?? body.value);
    const competenceValidation = parseDate(body.competence, "a competência");
    const dueDateValidation = parseDate(body.dueDate, "a data de vencimento");
    const allowDuplicates = parseBoolean(body.allowDuplicates, false);

    if (!condominiumId) return jsonError("Selecione o condomínio da mensalidade em lote.");
    if (!categoryId) return jsonError("Selecione a categoria de receita da mensalidade.");
    if (!description || description.length < 3) return jsonError("Informe uma descrição com pelo menos 3 caracteres.");
    if (!defaultValueCents) return jsonError("Informe um valor maior que zero.");
    if (unitIds.length === 0) return jsonError("Selecione pelo menos uma unidade.");
    if (unitIds.length > 500) return jsonError("O lote pode gerar no máximo 500 mensalidades por vez.");
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
    });
    if (!categoryValidation.ok) return jsonError(categoryValidation.message, 404);

    const unitsValidation = await validateUnits({
      condominiumId,
      unitIds,
    });
    if (!unitsValidation.ok) return jsonError(unitsValidation.message, 404);

    const competence = competenceValidation.value;
    const dueDate = dueDateValidation.value;

    if (!allowDuplicates) {
      const duplicates = await findDuplicateCharges({
        administratorId: auth.administratorId,
        condominiumId,
        unitIds,
        competence,
      });

      if (duplicates.length > 0) {
        const labels = duplicates
          .slice(0, 5)
          .map((item) => {
            const block = item.unit?.block ? `Bloco ${item.unit.block}` : "";
            const number = item.unit?.unitNumber ? `Unidade ${item.unit.unitNumber}` : "Unidade";
            return [block, number].filter(Boolean).join(" • ");
          })
          .filter(Boolean)
          .join(", ");

        return NextResponse.json(
          {
            error:
              duplicates.length === 1
                ? `Já existe mensalidade gerada para esta competência na unidade: ${labels}.`
                : `Já existem mensalidades geradas para esta competência em ${duplicates.length} unidade(s): ${labels}${duplicates.length > 5 ? "..." : ""}.`,
            code: "DUPLICATE_UNIT_CHARGES",
            duplicates,
          },
          {
            status: 409,
          },
        );
      }
    }

    const batch = await db.$transaction(async (tx) => {
      const createdBatch = await tx.financialChargeBatch.create({
        data: {
          administratorId: auth.administratorId,
          condominiumId,
          categoryId,
          competence,
          dueDate,
          description,
          defaultValueCents,
          notes,
          createdByUserId: auth.authUser.id,
          metadata: {
            source: "ETAPA_53_4",
            selectedUnits: unitsValidation.value.length,
            allowDuplicates,
          },
        },
      });

      await tx.financialLog.create({
        data: {
          financialChargeBatchId: createdBatch.id,
          userId: auth.authUser.id,
          action: FinancialLogAction.BATCH_CREATED,
          message: `Lote de mensalidades criado com ${unitsValidation.value.length} unidade(s).`,
          metadata: {
            condominiumId,
            categoryId,
            competence: competence.toISOString(),
            dueDate: dueDate.toISOString(),
            defaultValueCents,
            totalUnits: unitsValidation.value.length,
          },
        },
      });

      await tx.financialEntry.createMany({
        data: unitsValidation.value.map((unit) => ({
          administratorId: auth.administratorId,
          condominiumId,
          unitId: unit.id,
          providerId: null,
          categoryId,
          chargeBatchId: createdBatch.id,
          type: FinancialEntryType.REVENUE,
          origin: FinancialEntryOrigin.UNIT_CHARGE_BATCH,
          status: FinancialEntryStatus.OPEN,
          description,
          competence,
          dueDate,
          valueCents: defaultValueCents,
          notes,
          createdByUserId: auth.authUser.id,
          metadata: {
            source: "ETAPA_53_4",
            generatedFromBatchId: createdBatch.id,
            unitLabel: [unit.block ? `Bloco ${unit.block}` : null, unit.unitNumber ? `Unidade ${unit.unitNumber}` : null]
              .filter(Boolean)
              .join(" • "),
          },
        })),
      });

      const createdEntries = await tx.financialEntry.findMany({
        where: {
          chargeBatchId: createdBatch.id,
        },
        select: {
          id: true,
          unitId: true,
        },
      });

      await tx.financialLog.createMany({
        data: createdEntries.map((entry) => ({
          financialChargeBatchId: createdBatch.id,
          financialEntryId: entry.id,
          userId: auth.authUser.id,
          action: FinancialLogAction.BATCH_ENTRY_CREATED,
          message: "Mensalidade criada a partir de lote.",
          metadata: {
            batchId: createdBatch.id,
            unitId: entry.unitId,
            valueCents: defaultValueCents,
          },
        })),
      });

      return tx.financialChargeBatch.findUniqueOrThrow({
        where: {
          id: createdBatch.id,
        },
        include: {
          condominium: {
            select: {
              id: true,
              name: true,
            },
          },
          category: {
            select: {
              id: true,
              name: true,
              type: true,
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
          entries: {
            select: {
              id: true,
              unitId: true,
              status: true,
              valueCents: true,
              unit: {
                select: {
                  id: true,
                  block: true,
                  unitNumber: true,
                },
              },
            },
            orderBy: [
              {
                unit: {
                  block: "asc",
                },
              },
              {
                unit: {
                  unitNumber: "asc",
                },
              },
            ],
          },
          _count: {
            select: {
              entries: true,
              logs: true,
            },
          },
        },
      });
    });

    const batchResponse = buildBatchResponse(batch);
    const notifiedUserIds = new Set<string>();
    const totalBatchValueCents = unitsValidation.value.length * defaultValueCents;

    await Promise.allSettled([
      notifyFinancialAdministradoraUsers({
        administratorId: auth.administratorId,
        actorUser: auth.authUser,
        notifiedUserIds,
        type: "FINANCIAL_CHARGE_BATCH_GENERATED_ADMIN",
        title: "Mensalidades geradas",
        message: `${unitsValidation.value.length} mensalidade(s) foram geradas para ${condominiumValidation.value.name}.`,
        href: "/admin/financeiro",
        metadata: {
          financialChargeBatchId: batch.id,
          condominiumId,
          categoryId,
          competence: competence.toISOString(),
          dueDate: dueDate.toISOString(),
          defaultValueCents,
          totalBatchValueCents,
          totalUnits: unitsValidation.value.length,
        },
      }),
      ...batch.entries
        .filter((entry) => Boolean(entry.unitId))
        .map((entry) =>
          notifyFinancialUnitUsers({
            administratorId: auth.administratorId,
            condominiumId,
            unitId: entry.unitId,
            actorUser: auth.authUser,
            notifiedUserIds,
            type: "FINANCIAL_CHARGE_AVAILABLE_PORTAL",
            title: "Nova cobrança disponível",
            message: `Uma nova cobrança de ${moneyTextFromCents(entry.valueCents)} está disponível no portal financeiro.`,
            href: "/portal/financeiro",
            metadata: {
              financialChargeBatchId: batch.id,
              financialEntryId: entry.id,
              condominiumId,
              unitId: entry.unitId,
              description,
              competence: competence.toISOString(),
              dueDate: dueDate.toISOString(),
              valueCents: entry.valueCents,
            },
          }),
        ),
    ]);

    return NextResponse.json({
      message: "Mensalidades geradas com sucesso.",
      batch: batchResponse,
    });
  } catch (error) {
    console.error("Erro ao gerar mensalidades em lote:", error);

    return NextResponse.json(
      {
        error: "Erro ao gerar mensalidades em lote.",
      },
      {
        status: 500,
      },
    );
  }
}
