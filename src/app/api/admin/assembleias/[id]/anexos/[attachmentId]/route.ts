import { unlink } from "fs/promises";
import path from "path";
import {
  AssemblyLogAction,
  AssemblyStatus,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminModuleApiAccess } from "@/lib/admin-api-guard";

/* =========================================================
   API ADMIN - REMOÇÃO DE ANEXO DA ASSEMBLEIA

   Arquivo:
   src/app/api/admin/assembleias/[id]/anexos/[attachmentId]/route.ts

   ELOGEST — ETAPA 51.6
   ========================================================= */

export const runtime = "nodejs";

const ASSEMBLIES_MODULE_SLUG = "assembleias";
const ASSEMBLIES_MODULE_LABEL = "Assembleias";

type RouteContext = {
  params: Promise<{
    id: string;
    attachmentId: string;
  }>;
};

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 });
}

function notFound(message: string) {
  return NextResponse.json({ error: message }, { status: 404 });
}

function canEditDraft(assembly: {
  status: AssemblyStatus;
  convocationPublishedAt: Date | null;
}) {
  return (
    !assembly.convocationPublishedAt &&
    (assembly.status === AssemblyStatus.DRAFT ||
      assembly.status === AssemblyStatus.SCHEDULED)
  );
}

function getAbsolutePathFromUrl(params: {
  assemblyId: string;
  url: string;
}) {
  const expectedPrefix = `/uploads/assembleias/anexos/${params.assemblyId}/`;

  if (!params.url.startsWith(expectedPrefix)) return null;

  const relativeFileName = params.url.slice(expectedPrefix.length);

  if (
    !relativeFileName ||
    relativeFileName.includes("/") ||
    relativeFileName.includes("\\") ||
    relativeFileName.includes("..")
  ) {
    return null;
  }

  const folder = path.join(
    process.cwd(),
    "public",
    "uploads",
    "assembleias",
    "anexos",
    params.assemblyId,
  );

  const absolutePath = path.resolve(folder, relativeFileName);
  const safeFolder = `${path.resolve(folder)}${path.sep}`;

  return absolutePath.startsWith(safeFolder) ? absolutePath : null;
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminModuleApiAccess(
    ASSEMBLIES_MODULE_SLUG,
    ASSEMBLIES_MODULE_LABEL,
  );

  if ("error" in auth) return auth.error;

  try {
    const { id, attachmentId } = await context.params;

    const attachment = await db.assemblyAttachment.findFirst({
      where: {
        id: attachmentId,
        assemblyId: id,
        assembly: {
          administratorId: auth.administratorId,
        },
      },
      include: {
        assembly: {
          select: {
            id: true,
            status: true,
            convocationPublishedAt: true,
          },
        },
      },
    });

    if (!attachment) {
      return notFound("Documento não encontrado nesta assembleia.");
    }

    if (!canEditDraft(attachment.assembly)) {
      return forbidden(
        "Os documentos oficiais não podem ser removidos após a publicação da convocação.",
      );
    }

    await db.$transaction(async (tx) => {
      await tx.assemblyAttachment.delete({
        where: { id: attachment.id },
      });

      await tx.assemblyLog.create({
        data: {
          assemblyId: attachment.assemblyId,
          userId: auth.authUser.id,
          action: AssemblyLogAction.ATTACHMENT_REMOVED,
          message: `Documento removido da assembleia: ${attachment.originalName}.`,
          metadata: {
            attachmentId: attachment.id,
            scope: attachment.scope,
          },
        },
      });
    });

    const absolutePath = getAbsolutePathFromUrl({
      assemblyId: attachment.assemblyId,
      url: attachment.url,
    });

    if (absolutePath) {
      try {
        await unlink(absolutePath);
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error
            ? String((error as { code?: unknown }).code || "")
            : "";

        if (code !== "ENOENT") {
          console.error("Erro ao remover arquivo físico do anexo:", error);
        }
      }
    }

    return NextResponse.json({
      message: "Documento removido com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao remover anexo da assembleia:", error);
    return NextResponse.json(
      { error: "Não foi possível remover o documento da assembleia." },
      { status: 500 },
    );
  }
}
