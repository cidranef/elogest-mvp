import { unlink } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { AnnouncementLogAction } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAnnouncementsAdminApiAccess } from "@/lib/admin-api-guard";

/* =========================================================
   API ADMIN - REMOVER ANEXO DO COMUNICADO

   Arquivo:
   src/app/api/admin/comunicados/[id]/anexos/[attachmentId]/route.ts

   ETAPA 48.9.2 — ANEXOS OPCIONAIS EM COMUNICADOS

   Método:
   - DELETE: remove um anexo do comunicado da administradora ativa.
   ========================================================= */

type RouteContext = {
  params: Promise<{
    id: string;
    attachmentId: string;
  }>;
};

function canManageAnnouncementAttachments({
  status,
  readings,
}: {
  status: string;
  readings: number;
}) {
  if (status === "DRAFT" || status === "SCHEDULED") {
    return true;
  }

  if (status === "PUBLISHED" && readings === 0) {
    return true;
  }

  return false;
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireAnnouncementsAdminApiAccess();

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const { id, attachmentId } = await context.params;

    const attachment = await db.announcementAttachment.findFirst({
      where: {
        id: attachmentId,
        announcementId: id,
        announcement: {
          administratorId: auth.administratorId,
        },
      },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        url: true,
        announcement: {
          select: {
            id: true,
            status: true,
            _count: {
              select: {
                readings: true,
              },
            },
          },
        },
      },
    });

    if (!attachment) {
      return NextResponse.json(
        {
          error: "Anexo não encontrado.",
        },
        {
          status: 404,
        },
      );
    }

    if (
      !canManageAnnouncementAttachments({
        status: attachment.announcement.status,
        readings: attachment.announcement._count.readings,
      })
    ) {
      return NextResponse.json(
        {
          error:
            "Este comunicado já possui confirmação de leitura ou foi arquivado. Para preservar a rastreabilidade, não é mais possível remover documentos.",
        },
        {
          status: 409,
        },
      );
    }

    await db.$transaction(async (tx) => {
      await tx.announcementAttachment.delete({
        where: {
          id: attachment.id,
        },
      });

      await tx.announcementLog.create({
        data: {
          announcementId: id,
          userId: auth.authUser.id,
          action: AnnouncementLogAction.ATTACHMENT_REMOVED,
          message: "Documento removido do comunicado.",
          metadata: {
            attachmentId: attachment.id,
            originalName: attachment.originalName,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
          },
        },
      });
    });

    if (attachment.url.startsWith("/uploads/comunicados/")) {
      const filePath = path.join(process.cwd(), "public", attachment.url);
      await unlink(filePath).catch(() => undefined);
    }

    return NextResponse.json({
      message: "Anexo removido do comunicado.",
    });
  } catch (error) {
    console.error("Erro ao remover anexo do comunicado:", error);

    return NextResponse.json(
      {
        error: "Não foi possível remover o anexo do comunicado.",
      },
      {
        status: 500,
      },
    );
  }
}
