import { readFile, unlink } from "fs/promises";
import path from "path";
import {
  AssemblyLogAction,
  AssemblyStatus,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminModuleApiAccess } from "@/lib/admin-api-guard";
import {
  deletePrivateDocument,
  readPrivateDocument,
} from "@/lib/storage/document-storage";

/* =========================================================
   API ADMIN - DOWNLOAD E REMOÇÃO DE ANEXO DA ASSEMBLEIA

   Arquivo:
   src/app/api/admin/assembleias/[id]/anexos/[attachmentId]/route.ts

   ELOGEST — ETAPA 52.9.2
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

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getMetadataString(metadata: unknown, key: string) {
  if (!isRecord(metadata)) return null;
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getPrivateStorageKey(params: {
  metadata: unknown;
  url?: string | null;
}) {
  const metadataKey = getMetadataString(params.metadata, "storageKey");
  if (metadataKey) return metadataKey;

  const url = String(params.url || "");
  return url.startsWith("private://") ? url.slice("private://".length) : null;
}

function buildContentDisposition(fileName: string) {
  const fallback = fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "documento";

  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
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

function getLegacyAbsolutePath(params: {
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

async function findAttachment(params: {
  assemblyId: string;
  attachmentId: string;
  administratorId: string;
}) {
  return db.assemblyAttachment.findFirst({
    where: {
      id: params.attachmentId,
      assemblyId: params.assemblyId,
      assembly: {
        administratorId: params.administratorId,
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
}

async function readAttachmentBytes(attachment: {
  assemblyId: string;
  url: string;
  metadata: unknown;
}) {
  const storageKey = getPrivateStorageKey({
    metadata: attachment.metadata,
    url: attachment.url,
  });

  if (storageKey) {
    return readPrivateDocument({ key: storageKey });
  }

  const legacyPath = getLegacyAbsolutePath({
    assemblyId: attachment.assemblyId,
    url: attachment.url,
  });

  if (!legacyPath) {
    throw new Error("Documento privado não localizado.");
  }

  return readFile(legacyPath);
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminModuleApiAccess(
    ASSEMBLIES_MODULE_SLUG,
    ASSEMBLIES_MODULE_LABEL,
  );

  if ("error" in auth) return auth.error;

  try {
    const { id, attachmentId } = await context.params;
    const attachment = await findAttachment({
      assemblyId: id,
      attachmentId,
      administratorId: auth.administratorId,
    });

    if (!attachment) {
      return notFound("Documento não encontrado nesta assembleia.");
    }

    const bytes = await readAttachmentBytes(attachment);

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": attachment.mimeType || "application/octet-stream",
        "Content-Disposition": buildContentDisposition(attachment.originalName),
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Erro ao baixar anexo da assembleia:", error);
    return NextResponse.json(
      { error: "Não foi possível baixar o documento da assembleia." },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminModuleApiAccess(
    ASSEMBLIES_MODULE_SLUG,
    ASSEMBLIES_MODULE_LABEL,
  );

  if ("error" in auth) return auth.error;

  try {
    const { id, attachmentId } = await context.params;
    const attachment = await findAttachment({
      assemblyId: id,
      attachmentId,
      administratorId: auth.administratorId,
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

    const storageKey = getPrivateStorageKey({
      metadata: attachment.metadata,
      url: attachment.url,
    });

    if (storageKey) {
      await deletePrivateDocument({
        key: storageKey,
        ignoreMissing: true,
      });
    } else {
      const legacyPath = getLegacyAbsolutePath({
        assemblyId: attachment.assemblyId,
        url: attachment.url,
      });

      if (legacyPath) {
        try {
          await unlink(legacyPath);
        } catch (error) {
          const code =
            error && typeof error === "object" && "code" in error
              ? String((error as { code?: unknown }).code || "")
              : "";

          if (code !== "ENOENT") {
            console.error("Erro ao remover arquivo legado do anexo:", error);
          }
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
