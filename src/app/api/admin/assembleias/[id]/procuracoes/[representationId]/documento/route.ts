import { readFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminModuleApiAccess } from "@/lib/admin-api-guard";
import { readPrivateDocument } from "@/lib/storage/document-storage";

/* =========================================================
   API ADMIN - DOWNLOAD PROTEGIDO DO DOCUMENTO DA PROCURAÇÃO

   Arquivo:
   src/app/api/admin/assembleias/[id]/procuracoes/[representationId]/documento/route.ts

   ELOGEST — ETAPA 52.9.2

   Observação:
   - A interface atual continua compatível com a URL retornada pelo upload.
   - Esta rota cria um endereço canônico para evolução futura.
   ========================================================= */

export const runtime = "nodejs";

const ASSEMBLIES_MODULE_SLUG = "assembleias";
const ASSEMBLIES_MODULE_LABEL = "Assembleias";

type RouteContext = {
  params: Promise<{
    id: string;
    representationId: string;
  }>;
};

function notFound(message: string) {
  return NextResponse.json({ error: message }, { status: 404 });
}

function sanitizeOriginalName(value: string) {
  return String(value || "documento")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "documento";
}

function buildContentDisposition(fileName: string) {
  return `inline; filename="${sanitizeOriginalName(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function getLegacyAbsolutePath(params: {
  assemblyId: string;
  documentUrl: string;
}) {
  const expectedPrefix = `/uploads/assembleias/procuracoes/${params.assemblyId}/`;

  if (!params.documentUrl.startsWith(expectedPrefix)) return null;

  const relativeFileName = params.documentUrl.slice(expectedPrefix.length);

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
    "procuracoes",
    params.assemblyId,
  );

  const absolutePath = path.resolve(folder, relativeFileName);
  const safeFolder = `${path.resolve(folder)}${path.sep}`;

  return absolutePath.startsWith(safeFolder) ? absolutePath : null;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminModuleApiAccess(
    ASSEMBLIES_MODULE_SLUG,
    ASSEMBLIES_MODULE_LABEL,
  );

  if ("error" in auth) return auth.error;

  try {
    const { id, representationId } = await context.params;

    const representation = await db.assemblyRepresentation.findFirst({
      where: {
        id: representationId,
        assemblyId: id,
        assembly: {
          administratorId: auth.administratorId,
        },
      },
      select: {
        assemblyId: true,
        documentUrl: true,
        documentName: true,
        documentMimeType: true,
      },
    });

    if (!representation?.documentUrl) {
      return notFound("Documento comprobatório não encontrado.");
    }

    const documentName = representation.documentName || "documento";
    const mimeType =
      representation.documentMimeType || "application/octet-stream";

    if (representation.documentUrl.startsWith("/api/admin/assembleias/")) {
      const parsed = new URL(representation.documentUrl, "http://elogest.local");
      const storageKey = String(parsed.searchParams.get("documentKey") || "").trim();

      if (!storageKey) {
        return notFound("Documento comprobatório não encontrado.");
      }

      const bytes = await readPrivateDocument({
        key: storageKey,
      });

      return new NextResponse(new Uint8Array(bytes), {
        headers: {
          "Content-Type": mimeType,
          "Content-Disposition": buildContentDisposition(documentName),
          "Content-Length": String(bytes.length),
          "Cache-Control": "private, no-store",
        },
      });
    }

    const legacyPath = getLegacyAbsolutePath({
      assemblyId: representation.assemblyId,
      documentUrl: representation.documentUrl,
    });

    if (!legacyPath) {
      return notFound("Documento comprobatório não encontrado.");
    }

    const bytes = await readFile(legacyPath);

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": buildContentDisposition(documentName),
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Erro ao baixar documento definitivo da procuração:", error);
    return NextResponse.json(
      { error: "Não foi possível baixar o documento comprobatório." },
      { status: 500 },
    );
  }
}
