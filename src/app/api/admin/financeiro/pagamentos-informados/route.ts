import { NextRequest, NextResponse } from "next/server";
import {
  FinancialEntryStatus,
  FinancialPaymentSubmissionStatus,
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
   ELOGEST — ETAPA 53.10
   API ADMIN — PAGAMENTOS INFORMADOS PELO PORTAL

   Arquivo:
   src/app/api/admin/financeiro/pagamentos-informados/route.ts

   Métodos:
   - GET: lista pagamentos enviados pelo portal para conferência.
   - PATCH: aprova e registra baixa oficial, ou recusa com motivo.
   ========================================================= */

type RequestBody = Record<string, unknown>;
type PatchAction = "APPROVE" | "REJECT";

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

function parsePatchAction(value: unknown): PatchAction {
  const action = cleanText(value).toUpperCase();

  if (action === "REJECT") return "REJECT";

  return "APPROVE";
}

function parseStatus(value: string | null) {
  if (!value || value === "ALL") return null;

  if (Object.values(FinancialPaymentSubmissionStatus).includes(value as FinancialPaymentSubmissionStatus)) {
    return value as FinancialPaymentSubmissionStatus;
  }

  return null;
}

function getPaidPrincipalCents(entry: {
  settlements: {
    amountCents: number;
  }[];
}) {
  return entry.settlements.reduce((sum, settlement) => sum + settlement.amountCents, 0);
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

async function buildSubmissionResponse(submission: Prisma.FinancialPaymentSubmissionGetPayload<{}>) {
  const [entry, submittedByUser, reviewedByUser, attachment, settlement] = await Promise.all([
    db.financialEntry.findUnique({
      where: {
        id: submission.financialEntryId,
      },
      select: {
        id: true,
        description: true,
        competence: true,
        dueDate: true,
        valueCents: true,
        status: true,
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
          },
        },
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
    }),
    db.user.findUnique({
      where: {
        id: submission.submittedByUserId,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    }),
    submission.reviewedByUserId
      ? db.user.findUnique({
          where: {
            id: submission.reviewedByUserId,
          },
          select: {
            id: true,
            name: true,
            email: true,
          },
        })
      : null,
    submission.financialAttachmentId
      ? db.financialAttachment.findUnique({
          where: {
            id: submission.financialAttachmentId,
          },
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
          },
        })
      : null,
    submission.approvedFinancialSettlementId
      ? db.financialSettlement.findUnique({
          where: {
            id: submission.approvedFinancialSettlementId,
          },
          select: {
            id: true,
            paidAt: true,
            amountCents: true,
            paymentMethod: true,
            createdAt: true,
          },
        })
      : null,
  ]);

  const paidPrincipalCents = entry?.settlements.reduce(
    (sum, item) => sum + item.amountCents,
    0,
  ) || 0;

  return {
    ...submission,
    entry: entry
      ? {
          ...entry,
          paidPrincipalCents,
          remainingPrincipalCents: Math.max(entry.valueCents - paidPrincipalCents, 0),
        }
      : null,
    submittedByUser,
    reviewedByUser,
    attachment: attachment
      ? {
          ...attachment,
          url: `/api/admin/financeiro/comprovantes/${attachment.id}`,
        }
      : null,
    settlement,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireFinancialAdminApiAccess();

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = parseStatus(searchParams.get("status"));
    const q = cleanOptionalText(searchParams.get("q"));

    const where: Prisma.FinancialPaymentSubmissionWhereInput = {
      administratorId: auth.administratorId,
      ...(status ? { status } : {}),
    };

    if (q) {
      const matchingEntries = await db.financialEntry.findMany({
        where: {
          administratorId: auth.administratorId,
          OR: [
            {
              description: {
                contains: q,
                mode: "insensitive",
              },
            },
            {
              condominium: {
                name: {
                  contains: q,
                  mode: "insensitive",
                },
              },
            },
            {
              category: {
                name: {
                  contains: q,
                  mode: "insensitive",
                },
              },
            },
          ],
        },
        select: {
          id: true,
        },
        take: 200,
      });

      const matchingUsers = await db.user.findMany({
        where: {
          OR: [
            {
              name: {
                contains: q,
                mode: "insensitive",
              },
            },
            {
              email: {
                contains: q,
                mode: "insensitive",
              },
            },
          ],
        },
        select: {
          id: true,
        },
        take: 200,
      });

      where.OR = [
        {
          financialEntryId: {
            in: matchingEntries.map((entry) => entry.id),
          },
        },
        {
          submittedByUserId: {
            in: matchingUsers.map((user) => user.id),
          },
        },
        {
          notes: {
            contains: q,
            mode: "insensitive",
          },
        },
      ];
    }

    const submissions = await db.financialPaymentSubmission.findMany({
      where,
      orderBy: [
        {
          status: "asc",
        },
        {
          createdAt: "desc",
        },
      ],
      take: 200,
    });

    const kpis = await db.financialPaymentSubmission.groupBy({
      by: ["status"],
      where: {
        administratorId: auth.administratorId,
      },
      _count: {
        _all: true,
      },
    });

    return NextResponse.json({
      submissions: await Promise.all(submissions.map(buildSubmissionResponse)),
      kpis: kpis.reduce<Record<string, number>>((acc, item) => {
        acc[item.status] = item._count._all;
        return acc;
      }, {}),
    });
  } catch (error) {
    console.error("Erro ao listar pagamentos informados:", error);

    return jsonError("Erro ao listar pagamentos informados.", 500);
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireFinancialAdminApiAccess();

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const body = (await request.json()) as RequestBody;
    const id = cleanOptionalText(body.id);
    const action = parsePatchAction(body.action);
    const reviewNotes = cleanOptionalText(body.reviewNotes);
    const rejectionReason = cleanOptionalText(body.rejectionReason || body.reviewNotes);

    if (!id) {
      return jsonError("Informe o pagamento enviado.");
    }

    const submission = await db.financialPaymentSubmission.findFirst({
      where: {
        id,
        administratorId: auth.administratorId,
      },
    });

    if (!submission) {
      return jsonError("Pagamento informado não encontrado.", 404);
    }

    if (submission.status !== FinancialPaymentSubmissionStatus.PENDING_REVIEW) {
      return jsonError("Este pagamento já foi analisado.");
    }

    const entry = await db.financialEntry.findFirst({
      where: {
        id: submission.financialEntryId,
        administratorId: auth.administratorId,
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

    if (!entry) {
      return jsonError("Lançamento financeiro não encontrado.", 404);
    }

    if (action === "REJECT") {
      if (!rejectionReason || rejectionReason.length < 3) {
        return jsonError("Informe o motivo da recusa.");
      }

      const rejected = await db.financialPaymentSubmission.update({
        where: {
          id: submission.id,
        },
        data: {
          status: FinancialPaymentSubmissionStatus.REJECTED,
          reviewedAt: new Date(),
          reviewedByUserId: auth.authUser.id,
          reviewNotes,
          rejectionReason,
        },
      });

      await notifyFinancialUnitUsers({
        administratorId: submission.administratorId,
        condominiumId: submission.condominiumId,
        unitId: submission.unitId,
        actorUser: auth.authUser,
        type: "FINANCIAL_PAYMENT_REJECTED_PORTAL",
        title: "Pagamento não confirmado",
        message: "A administradora analisou o comprovante enviado e não confirmou o pagamento.",
        href: "/portal/financeiro",
        metadata: {
          financialEntryId: submission.financialEntryId,
          paymentSubmissionId: submission.id,
          rejectionReason,
        },
      });

      return NextResponse.json({
        submission: await buildSubmissionResponse(rejected),
      });
    }

    if (entry.status === FinancialEntryStatus.CANCELED) {
      return jsonError("Não é possível aprovar pagamento de lançamento cancelado.");
    }

    if (entry.status === FinancialEntryStatus.PAID) {
      return jsonError("Este lançamento já está quitado.");
    }

    const paidPrincipalCents = getPaidPrincipalCents(entry);
    const remainingPrincipalCents = Math.max(entry.valueCents - paidPrincipalCents, 0);

    if (submission.amountCents > remainingPrincipalCents) {
      return jsonError(
        `O valor enviado excede o saldo em aberto de ${(remainingPrincipalCents / 100).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        })}.`,
      );
    }

    const settlement = await db.financialSettlement.create({
      data: {
        financialEntryId: entry.id,
        type: FinancialSettlementType.PAYMENT,
        paidAt: submission.paidAt,
        amountCents: submission.amountCents,
        interestCents: 0,
        fineCents: 0,
        discountCents: 0,
        paymentMethod: submission.paymentMethod,
        notes: reviewNotes || "Baixa aprovada a partir de comprovante enviado pelo portal.",
        registeredByUserId: auth.authUser.id,
        metadata: {
          source: "PORTAL_PAYMENT_SUBMISSION_APPROVED",
          paymentSubmissionId: submission.id,
          financialAttachmentId: submission.financialAttachmentId || null,
        },
      },
    });

    await refreshEntryStatus(entry.id);

    await db.financialLog.create({
      data: {
        financialEntryId: entry.id,
        financialSettlementId: settlement.id,
        userId: auth.authUser.id,
        action: "SETTLEMENT_ADDED",
        message: "Baixa aprovada a partir de pagamento informado pelo portal.",
        metadata: {
          paymentSubmissionId: submission.id,
          amountCents: submission.amountCents,
        },
      },
    });

    const approved = await db.financialPaymentSubmission.update({
      where: {
        id: submission.id,
      },
      data: {
        status: FinancialPaymentSubmissionStatus.APPROVED,
        reviewedAt: new Date(),
        reviewedByUserId: auth.authUser.id,
        reviewNotes,
        approvedFinancialSettlementId: settlement.id,
      },
    });

    await notifyFinancialUnitUsers({
      administratorId: submission.administratorId,
      condominiumId: submission.condominiumId,
      unitId: submission.unitId,
      actorUser: auth.authUser,
      type: "FINANCIAL_PAYMENT_APPROVED_PORTAL",
      title: "Pagamento confirmado",
      message: "A administradora conferiu o comprovante e confirmou o pagamento.",
      href: "/portal/financeiro",
      metadata: {
        financialEntryId: submission.financialEntryId,
        paymentSubmissionId: submission.id,
        settlementId: settlement.id,
      },
    });

    await notifyFinancialAdministradoraUsers({
      administratorId: submission.administratorId,
      actorUser: auth.authUser,
      type: "FINANCIAL_PAYMENT_APPROVED_ADMIN",
      title: "Pagamento aprovado",
      message: "Um pagamento informado pelo portal foi aprovado e a baixa foi registrada.",
      href: "/admin/financeiro/pagamentos-informados",
      metadata: {
        financialEntryId: submission.financialEntryId,
        paymentSubmissionId: submission.id,
        settlementId: settlement.id,
      },
    });

    return NextResponse.json({
      submission: await buildSubmissionResponse(approved),
    });
  } catch (error) {
    console.error("Erro ao analisar pagamento informado:", error);

    return jsonError("Erro ao analisar pagamento informado.", 500);
  }
}
