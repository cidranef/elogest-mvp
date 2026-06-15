import { NextRequest, NextResponse } from "next/server";
import {
  FinancialEntryStatus,
  FinancialEntryType,
  FinancialLogAction,
  FinancialPaymentMethod,
  FinancialSettlementType,
  type Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireFinancialAdminApiAccess } from "@/lib/admin-api-guard";
import {
  notifyFinancialAdministradoraUsers,
  notifyFinancialUnitUsers,
} from "@/lib/notifications";

/* =========================================================
   ELOGEST — ETAPA 53.3
   API ADMIN — BAIXAS FINANCEIRAS

   Arquivo:
   src/app/api/admin/financeiro/baixas/route.ts

   Métodos:
   - GET: lista baixas de um lançamento financeiro.
   - POST: registra pagamento/recebimento total ou parcial.
   - PATCH: estorna uma baixa financeira.

   Segurança:
   - Exige perfil ativo ADMINISTRADORA.
   - Exige módulo Financeiro liberado.
   - Isola por administratorId do perfil ativo.
   - Baixas só podem ser feitas em lançamentos da carteira ativa.
   ========================================================= */

type RequestBody = Record<string, unknown>;

type PatchAction = "REVERSE";

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

function normalizeNullableId(value: unknown) {
  const text = cleanText(value);
  return text || null;
}

function moneyTextFromCents(value: number) {
  return (Number(value || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function parsePatchAction(value: unknown): PatchAction {
  return cleanText(value || "REVERSE").toUpperCase() === "REVERSE"
    ? "REVERSE"
    : "REVERSE";
}

function parseCents(value: unknown, { allowZero = true } = {}) {
  if (value === null || value === undefined || value === "") {
    return allowZero ? 0 : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = Math.floor(value);
    if (parsed > 0) return parsed;
    if (parsed === 0 && allowZero) return 0;
    return null;
  }

  if (typeof value === "string") {
    const text = value.trim();

    if (!text) {
      return allowZero ? 0 : null;
    }

    const normalized = text
      .replace(/\s/g, "")
      .replace(/R\$/gi, "")
      .replace(/\./g, "")
      .replace(",", ".");

    const amount = Number(normalized);

    if (!Number.isFinite(amount)) {
      return null;
    }

    const cents = Math.round(amount * 100);

    if (cents > 0) return cents;
    if (cents === 0 && allowZero) return 0;
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

function parsePaymentMethod(value: unknown) {
  const method = cleanText(value).toUpperCase();

  if (!method) {
    return null;
  }

  if (Object.values(FinancialPaymentMethod).includes(method as FinancialPaymentMethod)) {
    return method as FinancialPaymentMethod;
  }

  return null;
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

async function getEntryForSettlement(params: {
  administratorId: string;
  financialEntryId: string;
}) {
  return db.financialEntry.findFirst({
    where: {
      id: params.financialEntryId,
      administratorId: params.administratorId,
    },
    include: {
      settlements: {
        where: {
          reversedAt: null,
          type: FinancialSettlementType.PAYMENT,
        },
        select: {
          id: true,
          amountCents: true,
        },
      },
    },
  });
}

function getPaidPrincipalCents(entry: {
  settlements: {
    amountCents: number;
  }[];
}) {
  return entry.settlements.reduce(
    (sum, settlement) => sum + settlement.amountCents,
    0,
  );
}

function getNextEntryStatus(params: {
  valueCents: number;
  paidPrincipalCents: number;
  dueDate: Date;
}) {
  if (params.paidPrincipalCents >= params.valueCents) {
    return FinancialEntryStatus.PAID;
  }

  if (params.paidPrincipalCents > 0) {
    return FinancialEntryStatus.PARTIALLY_PAID;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDate = new Date(params.dueDate);
  dueDate.setHours(0, 0, 0, 0);

  if (dueDate < today) {
    return FinancialEntryStatus.OVERDUE;
  }

  return FinancialEntryStatus.OPEN;
}

async function refreshEntryStatus(financialEntryId: string) {
  const entry = await db.financialEntry.findUnique({
    where: {
      id: financialEntryId,
    },
    include: {
      settlements: {
        where: {
          reversedAt: null,
          type: FinancialSettlementType.PAYMENT,
        },
        select: {
          amountCents: true,
        },
      },
    },
  });

  if (!entry || entry.status === FinancialEntryStatus.CANCELED) {
    return entry;
  }

  const paidPrincipalCents = getPaidPrincipalCents(entry);
  const nextStatus = getNextEntryStatus({
    valueCents: entry.valueCents,
    paidPrincipalCents,
    dueDate: entry.dueDate,
  });

  return db.financialEntry.update({
    where: {
      id: entry.id,
    },
    data: {
      status: nextStatus,
    },
  });
}

function buildSettlementResponse(settlement: Prisma.FinancialSettlementGetPayload<{
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
    attachments: true;
  };
}>) {
  return {
    ...settlement,
    attachments: settlement.attachments.map((attachment) => ({
      ...attachment,
      url: `/api/admin/financeiro/comprovantes/${attachment.id}`,
    })),
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireFinancialAdminApiAccess();

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const { searchParams } = new URL(request.url);
    const financialEntryId = normalizeNullableId(searchParams.get("financialEntryId"));

    if (!financialEntryId) {
      return jsonError("Informe o lançamento financeiro.");
    }

    const entry = await db.financialEntry.findFirst({
      where: {
        id: financialEntryId,
        administratorId: auth.administratorId,
      },
      select: {
        id: true,
      },
    });

    if (!entry) {
      return jsonError("Lançamento financeiro não encontrado na carteira da administradora.", 404);
    }

    const settlements = await db.financialSettlement.findMany({
      where: {
        financialEntryId,
      },
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
        attachments: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({
      settlements: settlements.map(buildSettlementResponse),
    });
  } catch (error) {
    console.error("Erro ao listar baixas financeiras:", error);

    return NextResponse.json(
      { error: "Erro ao listar baixas financeiras." },
      { status: 500 },
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
    const financialEntryId = normalizeNullableId(body.financialEntryId);
    const paidAtValidation = parseDate(body.paidAt, "a data do pagamento");
    const amountCents = parseCents(body.amountCents ?? body.amount, {
      allowZero: false,
    });
    const interestCents = parseCents(body.interestCents ?? body.interest) ?? 0;
    const fineCents = parseCents(body.fineCents ?? body.fine) ?? 0;
    const discountCents = parseCents(body.discountCents ?? body.discount) ?? 0;
    const paymentMethod = parsePaymentMethod(body.paymentMethod);

    if (!financialEntryId) {
      return jsonError("Informe o lançamento financeiro.");
    }

    if (!paidAtValidation.ok) {
      return jsonError(paidAtValidation.message);
    }

    if (!amountCents || amountCents <= 0) {
      return jsonError("Informe o valor pago maior que zero.");
    }

    if (interestCents < 0 || fineCents < 0 || discountCents < 0) {
      return jsonError("Juros, multa e desconto não podem ser negativos.");
    }

    const entry = await getEntryForSettlement({
      administratorId: auth.administratorId,
      financialEntryId,
    });

    if (!entry) {
      return jsonError("Lançamento financeiro não encontrado na carteira da administradora.", 404);
    }

    if (entry.status === FinancialEntryStatus.CANCELED) {
      return jsonError("Não é possível registrar baixa em lançamento cancelado.");
    }

    if (entry.status === FinancialEntryStatus.PAID) {
      return jsonError("Este lançamento já está quitado.");
    }

    const paidPrincipalCents = getPaidPrincipalCents(entry);
    const remainingPrincipalCents = Math.max(entry.valueCents - paidPrincipalCents, 0);

    if (amountCents > remainingPrincipalCents) {
      return jsonError(
        `O valor principal informado excede o saldo em aberto de ${(remainingPrincipalCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`,
      );
    }

    const settlement = await db.$transaction(async (tx) => {
      const createdSettlement = await tx.financialSettlement.create({
        data: {
          financialEntryId: entry.id,
          type: FinancialSettlementType.PAYMENT,
          paidAt: paidAtValidation.value,
          amountCents,
          interestCents,
          fineCents,
          discountCents,
          paymentMethod,
          notes: cleanOptionalText(body.notes),
          registeredByUserId: auth.authUser.id,
        },
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
          attachments: true,
        },
      });

      const nextPaidPrincipalCents = paidPrincipalCents + amountCents;
      const nextStatus = getNextEntryStatus({
        valueCents: entry.valueCents,
        paidPrincipalCents: nextPaidPrincipalCents,
        dueDate: entry.dueDate,
      });

      await tx.financialEntry.update({
        where: {
          id: entry.id,
        },
        data: {
          status: nextStatus,
        },
      });

      await tx.financialLog.create({
        data: {
          financialEntryId: entry.id,
          financialSettlementId: createdSettlement.id,
          userId: auth.authUser.id,
          action: FinancialLogAction.SETTLEMENT_ADDED,
          message:
            nextStatus === FinancialEntryStatus.PAID
              ? "Baixa financeira registrada e lançamento quitado."
              : "Baixa financeira parcial registrada.",
          metadata: {
            previousStatus: entry.status,
            nextStatus,
            amountCents,
            interestCents,
            fineCents,
            discountCents,
            paymentMethod,
          },
        },
      });

      return createdSettlement;
    });

    const netPaidCents = amountCents + interestCents + fineCents - discountCents;
    const notifiedUserIds = new Set<string>();

    await Promise.allSettled([
      notifyFinancialAdministradoraUsers({
        administratorId: auth.administratorId,
        actorUser: auth.authUser,
        notifiedUserIds,
        type: "FINANCIAL_SETTLEMENT_REGISTERED_ADMIN",
        title: "Baixa financeira registrada",
        message: `Baixa de ${moneyTextFromCents(netPaidCents)} registrada no Financeiro.`,
        href: "/admin/financeiro",
        metadata: {
          financialEntryId: entry.id,
          financialSettlementId: settlement.id,
          condominiumId: entry.condominiumId,
          unitId: entry.unitId,
          type: entry.type,
          amountCents,
          interestCents,
          fineCents,
          discountCents,
          netPaidCents,
          paymentMethod,
        },
      }),
      entry.type === FinancialEntryType.REVENUE && entry.unitId
        ? notifyFinancialUnitUsers({
            administratorId: auth.administratorId,
            condominiumId: entry.condominiumId,
            unitId: entry.unitId,
            actorUser: auth.authUser,
            notifiedUserIds,
            type: "FINANCIAL_PAYMENT_REGISTERED_PORTAL",
            title: "Pagamento registrado",
            message: `Um pagamento de ${moneyTextFromCents(netPaidCents)} foi registrado na sua unidade.`,
            href: "/portal/financeiro",
            metadata: {
              financialEntryId: entry.id,
              financialSettlementId: settlement.id,
              condominiumId: entry.condominiumId,
              unitId: entry.unitId,
              amountCents,
              interestCents,
              fineCents,
              discountCents,
              netPaidCents,
              paymentMethod,
            },
          })
        : Promise.resolve([]),
    ]);

    return NextResponse.json({
      message: "Baixa financeira registrada com sucesso.",
      settlement: buildSettlementResponse(settlement),
    });
  } catch (error) {
    console.error("Erro ao registrar baixa financeira:", error);

    return NextResponse.json(
      { error: "Erro ao registrar baixa financeira." },
      { status: 500 },
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
    const action = parsePatchAction(body.action);
    const settlementId = normalizeNullableId(body.id ?? body.settlementId);
    const reversalReason = cleanText(body.reversalReason);

    if (action !== "REVERSE") {
      return jsonError("Ação inválida para baixa financeira.");
    }

    if (!settlementId) {
      return jsonError("Informe a baixa financeira.");
    }

    if (reversalReason.length < 3) {
      return jsonError("Informe o motivo do estorno.");
    }

    const settlement = await db.financialSettlement.findFirst({
      where: {
        id: settlementId,
        financialEntry: {
          administratorId: auth.administratorId,
        },
      },
      include: {
        financialEntry: true,
      },
    });

    if (!settlement) {
      return jsonError("Baixa financeira não encontrada na carteira da administradora.", 404);
    }

    if (settlement.reversedAt) {
      return jsonError("Esta baixa já foi estornada.");
    }

    if (settlement.financialEntry.status === FinancialEntryStatus.CANCELED) {
      return jsonError("Não é possível estornar baixa de lançamento cancelado.");
    }

    await db.$transaction(async (tx) => {
      await tx.financialSettlement.update({
        where: {
          id: settlement.id,
        },
        data: {
          reversedAt: new Date(),
          reversedByUserId: auth.authUser.id,
          reversalReason,
        },
      });

      await tx.financialLog.create({
        data: {
          financialEntryId: settlement.financialEntryId,
          financialSettlementId: settlement.id,
          userId: auth.authUser.id,
          action: FinancialLogAction.SETTLEMENT_REVERSED,
          message: `Baixa financeira estornada: ${reversalReason}.`,
          metadata: {
            amountCents: settlement.amountCents,
            reversalReason,
          },
        },
      });
    });

    const entry = await refreshEntryStatus(settlement.financialEntryId);

    await Promise.allSettled([
      notifyFinancialAdministradoraUsers({
        administratorId: auth.administratorId,
        actorUser: auth.authUser,
        type: "FINANCIAL_SETTLEMENT_REVERSED_ADMIN",
        title: "Baixa financeira estornada",
        message: `Uma baixa de ${moneyTextFromCents(settlement.amountCents)} foi estornada no Financeiro.`,
        href: "/admin/financeiro",
        metadata: {
          financialEntryId: settlement.financialEntryId,
          financialSettlementId: settlement.id,
          condominiumId: settlement.financialEntry.condominiumId,
          unitId: settlement.financialEntry.unitId,
          amountCents: settlement.amountCents,
          reversalReason,
        },
      }),
    ]);

    return NextResponse.json({
      message: "Baixa financeira estornada com sucesso.",
      entry: entry
        ? {
            id: entry.id,
            status: entry.status,
            effectiveStatus: getEffectiveStatus(entry),
          }
        : null,
    });
  } catch (error) {
    console.error("Erro ao estornar baixa financeira:", error);

    return NextResponse.json(
      { error: "Erro ao estornar baixa financeira." },
      { status: 500 },
    );
  }
}
