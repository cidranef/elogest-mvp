import path from "path";
import { randomUUID } from "crypto";
import {
  FinancialAttachmentScope,
  FinancialLogAction,
  type Prisma,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireFinancialAdminApiAccess } from "@/lib/admin-api-guard";
import {
  buildDocumentStorageKey,
  writePrivateDocument,
} from "@/lib/storage/document-storage";

/* =========================================================
   ELOGEST — ETAPA 53.3
   API ADMIN — COMPROVANTES FINANCEIROS

   Arquivo:
   src/app/api/admin/financeiro/comprovantes/route.ts

   Métodos:
   - GET: lista comprovantes de lançamento ou baixa.
   - POST: envia comprovante privado para lançamento ou baixa.

   Segurança:
   - Exige perfil ativo ADMINISTRADORA.
   - Exige módulo Financeiro liberado.
   - Isola por administratorId.
   - Usa armazenamento privado local/R2, sem URL pública permanente.
   ========================================================= */

export const runtime = "nodejs";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function getSafeExtension(filename: string) {
  const ext = path.extname(filename || "").toLowerCase();

  if (!ext) return "";

  const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];

  if (!allowedExtensions.includes(ext)) {
    return "";
  }

  return ext;
}

function buildAttachmentResponse(attachment: Prisma.FinancialAttachmentGetPayload<{
  include: {
    uploadedByUser: {
      select: {
        id: true;
        name: true;
        email: true;
      };
    };
  };
}>) {
  return {
    id: attachment.id,
    administratorId: attachment.administratorId,
    financialEntryId: attachment.financialEntryId,
    financialSettlementId: attachment.financialSettlementId,
    uploadedByUserId: attachment.uploadedByUserId,
    uploadedByUser: attachment.uploadedByUser,
    scope: attachment.scope,
    originalName: attachment.originalName,
    storedName: attachment.storedName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    createdAt: attachment.createdAt,
    url: `/api/admin/financeiro/comprovantes/${attachment.id}`,
  };
}

async function getEntryScope(params: {
  administratorId: string;
  financialEntryId: string;
}) {
  return db.financialEntry.findFirst({
    where: {
      id: params.financialEntryId,
      administratorId: params.administratorId,
    },
    select: {
      id: true,
      condominiumId: true,
    },
  });
}

async function getSettlementScope(params: {
  administratorId: string;
  financialSettlementId: string;
}) {
  return db.financialSettlement.findFirst({
    where: {
      id: params.financialSettlementId,
      financialEntry: {
        administratorId: params.administratorId,
      },
    },
    select: {
      id: true,
      financialEntryId: true,
      financialEntry: {
        select: {
          id: true,
          condominiumId: true,
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
    const { searchParams } = new URL(request.url);
    const financialEntryId = cleanText(searchParams.get("financialEntryId"));
    const financialSettlementId = cleanText(searchParams.get("financialSettlementId"));

    const where: Prisma.FinancialAttachmentWhereInput = {
      administratorId: auth.administratorId,
    };

    if (financialEntryId) {
      where.financialEntryId = financialEntryId;
    }

    if (financialSettlementId) {
      where.financialSettlementId = financialSettlementId;
    }

    if (!financialEntryId && !financialSettlementId) {
      return jsonError("Informe o lançamento ou a baixa financeira.");
    }

    const attachments = await db.financialAttachment.findMany({
      where,
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
    });

    return NextResponse.json({
      attachments: attachments.map(buildAttachmentResponse),
    });
  } catch (error) {
    console.error("Erro ao listar comprovantes financeiros:", error);

    return NextResponse.json(
      { error: "Erro ao listar comprovantes financeiros." },
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
    const formData = await request.formData();
    const file = formData.get("file");
    const financialEntryId = cleanText(formData.get("financialEntryId"));
    const financialSettlementId = cleanText(formData.get("financialSettlementId"));

    if (!file || !(file instanceof File)) {
      return jsonError("Nenhum arquivo enviado.");
    }

    if (!financialEntryId && !financialSettlementId) {
      return jsonError("Informe o lançamento ou a baixa financeira.");
    }

    if (financialEntryId && financialSettlementId) {
      return jsonError("Envie o comprovante para o lançamento ou para a baixa, não para ambos.");
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

    const entryScope = financialEntryId
      ? await getEntryScope({
          administratorId: auth.administratorId,
          financialEntryId,
        })
      : null;

    const settlementScope = financialSettlementId
      ? await getSettlementScope({
          administratorId: auth.administratorId,
          financialSettlementId,
        })
      : null;

    if (financialEntryId && !entryScope) {
      return jsonError("Lançamento financeiro não encontrado na carteira da administradora.", 404);
    }

    if (financialSettlementId && !settlementScope) {
      return jsonError("Baixa financeira não encontrada na carteira da administradora.", 404);
    }

    const targetEntryId = entryScope?.id || settlementScope?.financialEntry.id || "";
    const targetCondominiumId =
      entryScope?.condominiumId || settlementScope?.financialEntry.condominiumId || "";

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const attachmentId = randomUUID();
    const storedName = `${randomUUID()}${extension}`;
    const scope = financialSettlementId
      ? FinancialAttachmentScope.SETTLEMENT
      : FinancialAttachmentScope.ENTRY;

    const storageKey = buildDocumentStorageKey(
      "financeiro",
      "comprovantes",
      auth.administratorId,
      targetCondominiumId,
      targetEntryId,
      financialSettlementId || "lancamento",
      attachmentId,
      storedName,
    );

    const storage = await writePrivateDocument({
      key: storageKey,
      bytes: buffer,
      contentType: file.type,
      metadata: {
        financialentryid: targetEntryId,
        financialsettlementid: financialSettlementId || "",
        administratorid: auth.administratorId,
        attachmentid: attachmentId,
      },
    });

    const attachment = await db.$transaction(async (tx) => {
      const createdAttachment = await tx.financialAttachment.create({
        data: {
          id: attachmentId,
          administratorId: auth.administratorId,
          financialEntryId: financialEntryId || null,
          financialSettlementId: financialSettlementId || null,
          uploadedByUserId: auth.authUser.id,
          scope,
          originalName: file.name,
          storedName,
          storageKey: storage.key,
          mimeType: file.type,
          sizeBytes: file.size,
        },
        include: {
          uploadedByUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      await tx.financialLog.create({
        data: {
          financialEntryId: targetEntryId,
          financialSettlementId: financialSettlementId || null,
          userId: auth.authUser.id,
          action: FinancialLogAction.ATTACHMENT_ADDED,
          message: `Comprovante financeiro enviado: ${file.name}.`,
          metadata: {
            attachmentId,
            scope,
            mimeType: file.type,
            sizeBytes: file.size,
          },
        },
      });

      return createdAttachment;
    });

    return NextResponse.json({
      message: "Comprovante financeiro enviado com sucesso.",
      attachment: buildAttachmentResponse(attachment),
    });
  } catch (error) {
    console.error("Erro ao enviar comprovante financeiro:", error);

    return NextResponse.json(
      { error: "Erro ao enviar comprovante financeiro." },
      { status: 500 },
    );
  }
}
