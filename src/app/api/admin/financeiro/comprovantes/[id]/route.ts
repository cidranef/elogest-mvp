import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireFinancialAdminApiAccess } from "@/lib/admin-api-guard";
import {
  deletePrivateDocument,
  readPrivateDocument,
} from "@/lib/storage/document-storage";
import { FinancialLogAction } from "@prisma/client";

/* =========================================================
   ELOGEST — ETAPA 53.3
   API ADMIN — DOWNLOAD/REMOÇÃO DE COMPROVANTE FINANCEIRO

   Arquivo:
   src/app/api/admin/financeiro/comprovantes/[id]/route.ts

   Métodos:
   - GET: download protegido do comprovante privado.
   - DELETE: remoção controlada e auditável do comprovante.
   ========================================================= */

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function contentDispositionFilename(filename: string) {
  const safeName = filename.replace(/["\r\n]/g, "_");
  return `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`;
}

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireFinancialAdminApiAccess();

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const { id } = await context.params;
    const attachmentId = cleanText(id);

    if (!attachmentId) {
      return jsonError("Comprovante não informado.");
    }

    const attachment = await db.financialAttachment.findFirst({
      where: {
        id: attachmentId,
        administratorId: auth.administratorId,
      },
    });

    if (!attachment) {
      return jsonError("Comprovante financeiro não encontrado.", 404);
    }

    const bytes = await readPrivateDocument({
      key: attachment.storageKey,
    });

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": attachment.mimeType || "application/octet-stream",
        "Content-Length": String(attachment.sizeBytes),
        "Content-Disposition": contentDispositionFilename(attachment.originalName),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Erro ao baixar comprovante financeiro:", error);

    return NextResponse.json(
      { error: "Erro ao baixar comprovante financeiro." },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireFinancialAdminApiAccess();

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const { id } = await context.params;
    const attachmentId = cleanText(id);

    if (!attachmentId) {
      return jsonError("Comprovante não informado.");
    }

    const attachment = await db.financialAttachment.findFirst({
      where: {
        id: attachmentId,
        administratorId: auth.administratorId,
      },
    });

    if (!attachment) {
      return jsonError("Comprovante financeiro não encontrado.", 404);
    }

    await db.$transaction(async (tx) => {
      await tx.financialAttachment.delete({
        where: {
          id: attachment.id,
        },
      });

      await tx.financialLog.create({
        data: {
          financialEntryId: attachment.financialEntryId,
          financialSettlementId: attachment.financialSettlementId,
          userId: auth.authUser.id,
          action: FinancialLogAction.ATTACHMENT_REMOVED,
          message: `Comprovante financeiro removido: ${attachment.originalName}.`,
          metadata: {
            attachmentId: attachment.id,
            originalName: attachment.originalName,
            storageKey: attachment.storageKey,
          },
        },
      });
    });

    await deletePrivateDocument({
      key: attachment.storageKey,
      ignoreMissing: true,
    });

    return NextResponse.json({
      message: "Comprovante financeiro removido com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao remover comprovante financeiro:", error);

    return NextResponse.json(
      { error: "Erro ao remover comprovante financeiro." },
      { status: 500 },
    );
  }
}
