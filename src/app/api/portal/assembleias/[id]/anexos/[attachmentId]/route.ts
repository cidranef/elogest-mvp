import { readFile } from "fs/promises";
import path from "path";
import { AssemblyStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePortalAssemblyAccess } from "@/lib/portal-assembly-access";
import { readPrivateDocument } from "@/lib/storage/document-storage";

/* =========================================================
   API PORTAL - DOWNLOAD PROTEGIDO DE ANEXO DA ASSEMBLEIA

   Arquivo:
   src/app/api/portal/assembleias/[id]/anexos/[attachmentId]/route.ts

   ELOGEST — ETAPA 52.9.2

   Regra:
   - Exige usuário autenticado com perfil ativo no portal.
   - Exige vínculo com o mesmo condomínio da assembleia.
   - Exige convocação publicada.
   - Não expõe URL pública do bucket R2.
   ========================================================= */

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
    attachmentId: string;
  }>;
};

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
  const access = await requirePortalAssemblyAccess();

  if ("error" in access) return access.error;

  try {
    const { id, attachmentId } = await context.params;

    const attachment = await db.assemblyAttachment.findFirst({
      where: {
        id: attachmentId,
        assemblyId: id,
        assembly: {
          condominiumId: access.activeAccess.condominiumId!,
          convocationPublishedAt: {
            not: null,
          },
          status: {
            in: [
              AssemblyStatus.SCHEDULED,
              AssemblyStatus.OPEN,
              AssemblyStatus.CLOSED,
              AssemblyStatus.RESULTS_PUBLISHED,
            ],
          },
        },
      },
      select: {
        id: true,
        assemblyId: true,
        originalName: true,
        mimeType: true,
        url: true,
        metadata: true,
      },
    });

    if (!attachment) {
      return notFound("Documento não encontrado para o perfil ativo.");
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
    console.error("Erro ao baixar anexo da assembleia no portal:", error);
    return NextResponse.json(
      { error: "Não foi possível baixar o documento da assembleia." },
      { status: 500 },
    );
  }
}
