import { randomUUID } from "crypto";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import {
  AccessRole,
  FinancialAttachmentScope,
  FinancialEntryStatus,
  FinancialEntryType,
  FinancialPaymentMethod,
  FinancialPaymentSubmissionStatus,
  FinancialSettlementType,
  Status,
} from "@prisma/client";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import { hasModuleAccess } from "@/lib/plan-limits";
import {
  buildDocumentStorageKey,
  writePrivateDocument,
} from "@/lib/storage/document-storage";
import {
  getActiveUserAccessFromCookies,
  isPortalAccess,
  type ActiveUserAccess,
} from "@/lib/user-access";
import { notifyFinancialAdministradoraUsers } from "@/lib/notifications";

/* =========================================================
   ELOGEST — ETAPA 53.10
   API PORTAL — PAGAMENTO INFORMADO

   Arquivo:
   src/app/api/portal/financeiro/pagamentos/route.ts

   Fluxo:
   - GET: lista comprovantes/pagamentos informados pelo perfil ativo.
   - POST: usuário informa pagamento e envia comprovante para análise.

   Importante:
   - O portal NÃO dá baixa automaticamente.
   - O comprovante fica pendente de conferência da administradora.
   - A baixa oficial só é criada quando a administradora aprova.
   ========================================================= */

export const runtime = "nodejs";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

type PortalFinancialAccess = {
  authUser: {
    id: string;
    name?: string | null;
    email?: string | null;
  };
  activeAccess: ActiveUserAccess;
  administratorId: string;
  condominiumId: string;
  unitId: string;
  role: AccessRole | string;
  accessLabel?: string | null;
};

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

function parseCents(value: unknown, { allowZero = false } = {}) {
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
    const normalized = value
      .trim()
      .replace(/\s/g, "")
      .replace(/R\$/gi, "")
      .replace(/\./g, "")
      .replace(",", ".");

    const amount = Number(normalized);
    if (!Number.isFinite(amount)) return null;

    const cents = Math.round(amount * 100);
    if (cents > 0) return cents;
    if (cents === 0 && allowZero) return 0;
  }

  return null;
}

function parseDate(value: unknown) {
  const text = cleanText(value);

  if (!text) {
    return {
      ok: false as const,
      message: "Informe a data do pagamento.",
    };
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return {
      ok: false as const,
      message: "Informe uma data de pagamento válida.",
    };
  }

  return {
    ok: true as const,
    value: date,
  };
}

function parsePaymentMethod(value: unknown) {
  const method = cleanText(value).toUpperCase();

  if (!method) return null;

  if (Object.values(FinancialPaymentMethod).includes(method as FinancialPaymentMethod)) {
    return method as FinancialPaymentMethod;
  }

  return null;
}

function getSafeExtension(filename: string) {
  const ext = path.extname(filename || "").toLowerCase();

  if (!ext) return "";

  const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];

  return allowedExtensions.includes(ext) ? ext : "";
}

function isAllowedPortalRole(role?: string | null) {
  return (
    role === AccessRole.SINDICO ||
    role === AccessRole.CONSELHEIRO ||
    role === AccessRole.MORADOR ||
    role === AccessRole.PROPRIETARIO
  );
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

  if (!activeAccess.condominiumId || !activeAccess.unitId) {
    return {
      error: jsonError(
        "Selecione um perfil vinculado a uma unidade para informar pagamento.",
        403,
      ),
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
    db.unit.findFirst({
      where: {
        id: activeAccess.unitId,
        condominiumId: activeAccess.condominiumId,
      },
      select: {
        id: true,
        status: true,
      },
    }),
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

  if (!unit || unit.status !== Status.ACTIVE) {
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
    unitId: unit.id,
    role: activeAccess.role,
    accessLabel: activeAccess.label,
  };
}

function getPaidPrincipalCents(entry: {
  settlements: {
    amountCents: number;
  }[];
}) {
  return entry.settlements.reduce((sum, settlement) => sum + settlement.amountCents, 0);
}

async function buildSubmissionResponse(submission: {
  id: string;
  financialEntryId: string;
  financialAttachmentId: string | null;
  status: FinancialPaymentSubmissionStatus;
  paidAt: Date;
  amountCents: number;
  paymentMethod: FinancialPaymentMethod | null;
  notes: string | null;
  reviewNotes: string | null;
  rejectionReason: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const [entry, attachment] = await Promise.all([
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
      },
    }),
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
  ]);

  return {
    ...submission,
    entry,
    attachment: attachment
      ? {
          ...attachment,
          url: `/api/portal/financeiro/comprovantes/${attachment.id}`,
        }
      : null,
  };
}

export async function GET(request: NextRequest) {
  const access = await requirePortalFinancialAccess();

  if ("error" in access) {
    return access.error;
  }

  try {
    const { searchParams } = new URL(request.url);
    const financialEntryId = cleanOptionalText(searchParams.get("financialEntryId"));

    const submissions = await db.financialPaymentSubmission.findMany({
      where: {
        administratorId: access.administratorId,
        condominiumId: access.condominiumId,
        unitId: access.unitId,
        submittedByUserId: access.authUser.id,
        ...(financialEntryId ? { financialEntryId } : {}),
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
    });

    return NextResponse.json({
      submissions: await Promise.all(submissions.map(buildSubmissionResponse)),
    });
  } catch (error) {
    console.error("Erro ao listar pagamentos informados no portal:", error);

    return jsonError("Erro ao listar pagamentos informados.", 500);
  }
}

export async function POST(request: NextRequest) {
  const access = await requirePortalFinancialAccess();

  if ("error" in access) {
    return access.error;
  }

  try {
    const formData = await request.formData();

    const financialEntryId = cleanOptionalText(formData.get("financialEntryId"));
    const paidAtValidation = parseDate(formData.get("paidAt"));
    const amountCents = parseCents(formData.get("amountCents") || formData.get("amount"));
    const paymentMethod = parsePaymentMethod(formData.get("paymentMethod"));
    const notes = cleanOptionalText(formData.get("notes"));
    const file = formData.get("file");

    if (!financialEntryId) {
      return jsonError("Informe a cobrança.");
    }

    if (!paidAtValidation.ok) {
      return jsonError(paidAtValidation.message);
    }

    if (!amountCents || amountCents <= 0) {
      return jsonError("Informe o valor pago maior que zero.");
    }

    if (!file || !(file instanceof File)) {
      return jsonError("Envie o comprovante do pagamento.");
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return jsonError("Tipo de arquivo não permitido. Envie JPG, PNG, WEBP ou PDF.");
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return jsonError("Arquivo muito grande. Limite máximo: 10 MB.");
    }

    const extension = getSafeExtension(file.name);

    if (!extension) {
      return jsonError("Extensão de arquivo inválida.");
    }

    const entry = await db.financialEntry.findFirst({
      where: {
        id: financialEntryId,
        administratorId: access.administratorId,
        condominiumId: access.condominiumId,
        unitId: access.unitId,
        type: FinancialEntryType.REVENUE,
      },
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
      return jsonError("Cobrança não encontrada para a unidade ativa.", 404);
    }

    if (entry.status === FinancialEntryStatus.CANCELED) {
      return jsonError("Não é possível informar pagamento para cobrança cancelada.");
    }

    if (entry.status === FinancialEntryStatus.PAID) {
      return jsonError("Esta cobrança já está quitada.");
    }

    const existingPending = await db.financialPaymentSubmission.findFirst({
      where: {
        financialEntryId: entry.id,
        unitId: access.unitId,
        status: FinancialPaymentSubmissionStatus.PENDING_REVIEW,
      },
      select: {
        id: true,
      },
    });

    if (existingPending) {
      return jsonError(
        "Já existe um pagamento informado aguardando conferência para esta cobrança.",
      );
    }

    const paidPrincipalCents = getPaidPrincipalCents(entry);
    const remainingPrincipalCents = Math.max(entry.valueCents - paidPrincipalCents, 0);

    if (amountCents > remainingPrincipalCents) {
      return jsonError(
        `O valor informado excede o saldo em aberto de ${(remainingPrincipalCents / 100).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        })}.`,
      );
    }

    const submission = await db.financialPaymentSubmission.create({
      data: {
        administratorId: access.administratorId,
        condominiumId: access.condominiumId,
        unitId: access.unitId,
        financialEntryId: entry.id,
        submittedByUserId: access.authUser.id,
        submittedByAccessId:
          access.activeAccess.source === "USER_ACCESS"
            ? access.activeAccess.accessId
            : null,
        paidAt: paidAtValidation.value,
        amountCents,
        paymentMethod,
        notes,
        status: FinancialPaymentSubmissionStatus.PENDING_REVIEW,
        metadata: {
          source: "PORTAL",
          accessRole: access.role,
          accessLabel: access.accessLabel || null,
          originalFileName: file.name,
        },
      },
    });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const storedName = `${randomUUID()}${extension}`;

    const storageKey = buildDocumentStorageKey(
      "financeiro",
      "comprovantes",
      "portal",
      access.administratorId,
      access.condominiumId,
      access.unitId,
      entry.id,
      submission.id,
      storedName,
    );

    const storage = await writePrivateDocument({
      key: storageKey,
      bytes: buffer,
      contentType: file.type,
      metadata: {
        administratorid: access.administratorId,
        condominiumid: access.condominiumId,
        unitid: access.unitId,
        financialentryid: entry.id,
        paymentSubmissionId: submission.id,
      },
    });

    const attachment = await db.financialAttachment.create({
      data: {
        administratorId: access.administratorId,
        financialEntryId: entry.id,
        uploadedByUserId: access.authUser.id,
        scope: FinancialAttachmentScope.ENTRY,
        originalName: file.name,
        storedName,
        storageKey: storage.key,
        mimeType: file.type,
        sizeBytes: file.size,
        metadata: {
          source: "PORTAL_PAYMENT_SUBMISSION",
          paymentSubmissionId: submission.id,
          pendingReview: true,
        },
      },
    });

    const updatedSubmission = await db.financialPaymentSubmission.update({
      where: {
        id: submission.id,
      },
      data: {
        financialAttachmentId: attachment.id,
      },
    });

    await notifyFinancialAdministradoraUsers({
      administratorId: access.administratorId,
      actorUser: {
        id: access.authUser.id,
        name: access.authUser.name,
        email: access.authUser.email,
        role: String(access.role),
      },
      type: "FINANCIAL_PAYMENT_SUBMITTED_ADMIN",
      title: "Pagamento informado pelo portal",
      message: `${access.authUser.name || "Usuário do portal"} enviou um comprovante para conferência.`,
      href: "/admin/financeiro/pagamentos-informados",
      metadata: {
        financialEntryId: entry.id,
        paymentSubmissionId: updatedSubmission.id,
        financialAttachmentId: attachment.id,
        condominiumId: access.condominiumId,
        unitId: access.unitId,
        amountCents,
      },
    });

    return NextResponse.json({
      submission: await buildSubmissionResponse(updatedSubmission),
    });
  } catch (error) {
    console.error("Erro ao informar pagamento no portal:", error);

    return jsonError("Erro ao informar pagamento.", 500);
  }
}
