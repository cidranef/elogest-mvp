import { randomUUID } from "crypto";
import { unlink } from "fs/promises";
import path from "path";
import { AssemblyStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminModuleApiAccess } from "@/lib/admin-api-guard";
import {
  buildDocumentStorageKey,
  deletePrivateDocument,
  readPrivateDocument,
  writePrivateDocument,
} from "@/lib/storage/document-storage";

/* =========================================================
   API ADMIN - DOCUMENTO COMPROBATÓRIO DA PROCURAÇÃO

   Arquivo:
   src/app/api/admin/assembleias/[id]/procuracoes/upload/route.ts

   ELOGEST — ETAPA 52.9.2

   GET:
   - Entrega documento privado pela API administrativa.

   POST:
   - Grava documento temporário no storage privado LOCAL ou R2.
   - Retorna URL protegida para o formulário administrativo.

   DELETE:
   - Remove documento temporário privado antes da conclusão do cadastro.
   - Mantém compatibilidade com URLs locais legadas.
   ========================================================= */

export const runtime = "nodejs";

const ASSEMBLIES_MODULE_SLUG = "assembleias";
const ASSEMBLIES_MODULE_LABEL = "Assembleias";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const MIME_TO_EXTENSION: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 });
}

function notFound(message: string) {
  return NextResponse.json({ error: message }, { status: 404 });
}

function sanitizeOriginalName(value: string) {
  const normalized = String(value || "documento")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || "documento";
}

function buildContentDisposition(fileName: string) {
  return `inline; filename="${sanitizeOriginalName(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function buildProtectedDocumentUrl(params: {
  assemblyId: string;
  storageKey: string;
  documentName: string;
  mimeType: string;
}) {
  const search = new URLSearchParams({
    documentKey: params.storageKey,
    documentName: params.documentName,
    mimeType: params.mimeType,
  });

  return `/api/admin/assembleias/${params.assemblyId}/procuracoes/upload?${search.toString()}`;
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

async function findEditableAssembly(params: {
  assemblyId: string;
  administratorId: string;
}) {
  return db.assembly.findFirst({
    where: {
      id: params.assemblyId,
      administratorId: params.administratorId,
    },
    select: {
      id: true,
      administratorId: true,
      condominiumId: true,
      status: true,
      votingEndsAt: true,
    },
  });
}

function canManageRepresentationDocument(assembly: {
  status: AssemblyStatus;
  votingEndsAt: Date | null;
}) {
  const statusAllowsDocument =
    assembly.status === AssemblyStatus.DRAFT ||
    assembly.status === AssemblyStatus.SCHEDULED ||
    assembly.status === AssemblyStatus.OPEN;

  if (!statusAllowsDocument) return false;

  return !assembly.votingEndsAt || assembly.votingEndsAt > new Date();
}

function isAllowedRepresentationStorageKey(params: {
  storageKey: string;
  assemblyId: string;
  administratorId: string;
  condominiumId: string;
}) {
  const prefix = buildDocumentStorageKey(
    "assembleias",
    "procuracoes",
    params.administratorId,
    params.condominiumId,
    params.assemblyId,
  );

  return params.storageKey.startsWith(`${prefix}/`);
}

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminModuleApiAccess(
    ASSEMBLIES_MODULE_SLUG,
    ASSEMBLIES_MODULE_LABEL,
  );

  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const assembly = await findEditableAssembly({
      assemblyId: id,
      administratorId: auth.administratorId,
    });

    if (!assembly) {
      return notFound("Assembleia não encontrada na carteira ativa da administradora.");
    }

    const { searchParams } = new URL(request.url);
    const documentKey = String(searchParams.get("documentKey") || "").trim();
    const documentName = String(searchParams.get("documentName") || "documento").trim();
    const mimeType = String(
      searchParams.get("mimeType") || "application/octet-stream",
    ).trim();

    if (
      !documentKey ||
      !isAllowedRepresentationStorageKey({
        storageKey: documentKey,
        assemblyId: assembly.id,
        administratorId: assembly.administratorId,
        condominiumId: assembly.condominiumId,
      })
    ) {
      return badRequest("O caminho do documento informado é inválido.");
    }

    const bytes = await readPrivateDocument({
      key: documentKey,
    });

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": buildContentDisposition(documentName),
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Erro ao baixar documento comprobatório da procuração:", error);
    return NextResponse.json(
      { error: "Não foi possível baixar o documento comprobatório." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminModuleApiAccess(
    ASSEMBLIES_MODULE_SLUG,
    ASSEMBLIES_MODULE_LABEL,
  );

  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const assembly = await findEditableAssembly({
      assemblyId: id,
      administratorId: auth.administratorId,
    });

    if (!assembly) {
      return notFound("Assembleia não encontrada na carteira ativa da administradora.");
    }

    if (!canManageRepresentationDocument(assembly)) {
      return forbidden(
        "Não é possível enviar documentos após o encerramento da votação.",
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return badRequest("Selecione um documento para enviar.");
    }

    if (file.size <= 0) {
      return badRequest("O arquivo enviado está vazio.");
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return badRequest("O documento deve ter no máximo 10 MB.");
    }

    const extension = MIME_TO_EXTENSION[file.type];

    if (!extension) {
      return badRequest("Envie um arquivo PDF, PNG, JPG ou WEBP.");
    }

    const documentName = sanitizeOriginalName(file.name);
    const storedName = `${randomUUID()}${extension}`;
    const storageKey = buildDocumentStorageKey(
      "assembleias",
      "procuracoes",
      assembly.administratorId,
      assembly.condominiumId,
      assembly.id,
      "temporarios",
      storedName,
    );

    const storage = await writePrivateDocument({
      key: storageKey,
      bytes: Buffer.from(await file.arrayBuffer()),
      contentType: file.type,
      metadata: {
        assemblyid: assembly.id,
        administratorid: assembly.administratorId,
        condominiumid: assembly.condominiumId,
        temporary: "true",
      },
    });

    return NextResponse.json({
      documentUrl: buildProtectedDocumentUrl({
        assemblyId: assembly.id,
        storageKey: storage.key,
        documentName,
        mimeType: file.type,
      }),
      documentName,
      message: "Documento enviado com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao enviar documento comprobatório da procuração:", error);
    return NextResponse.json(
      { error: "Não foi possível enviar o documento comprobatório." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminModuleApiAccess(
    ASSEMBLIES_MODULE_SLUG,
    ASSEMBLIES_MODULE_LABEL,
  );

  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;
    const assembly = await findEditableAssembly({
      assemblyId: id,
      administratorId: auth.administratorId,
    });

    if (!assembly) {
      return notFound("Assembleia não encontrada na carteira ativa da administradora.");
    }

    if (!canManageRepresentationDocument(assembly)) {
      return forbidden(
        "Não é possível remover documentos após o encerramento da votação.",
      );
    }

    const body = (await request.json()) as {
      documentUrl?: unknown;
    };

    const documentUrl =
      typeof body.documentUrl === "string" ? body.documentUrl.trim() : "";

    if (!documentUrl) {
      return badRequest("Informe o documento que deve ser removido.");
    }

    if (documentUrl.startsWith("/api/admin/assembleias/")) {
      const parsed = new URL(documentUrl, "http://elogest.local");
      const documentKey = String(parsed.searchParams.get("documentKey") || "").trim();

      if (
        !documentKey ||
        !isAllowedRepresentationStorageKey({
          storageKey: documentKey,
          assemblyId: assembly.id,
          administratorId: assembly.administratorId,
          condominiumId: assembly.condominiumId,
        })
      ) {
        return badRequest("O caminho do documento informado é inválido.");
      }

      await deletePrivateDocument({
        key: documentKey,
        ignoreMissing: true,
      });

      return NextResponse.json({
        message: "Documento removido com sucesso.",
      });
    }

    const legacyPath = getLegacyAbsolutePath({
      assemblyId: assembly.id,
      documentUrl,
    });

    if (!legacyPath) {
      return badRequest("O caminho do documento informado é inválido.");
    }

    try {
      await unlink(legacyPath);
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code || "")
          : "";

      if (code !== "ENOENT") throw error;
    }

    return NextResponse.json({
      message: "Documento removido com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao remover documento comprobatório da procuração:", error);
    return NextResponse.json(
      { error: "Não foi possível remover o documento comprobatório." },
      { status: 500 },
    );
  }
}
