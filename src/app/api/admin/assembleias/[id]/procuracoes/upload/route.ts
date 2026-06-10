import { randomUUID } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { AssemblyStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminModuleApiAccess } from "@/lib/admin-api-guard";

/* =========================================================
   API ADMIN - UPLOAD DE DOCUMENTO COMPROBATÓRIO DA PROCURAÇÃO

   Arquivo:
   src/app/api/admin/assembleias/[id]/procuracoes/upload/route.ts

   ELOGEST — ETAPA 51.6

   Objetivo:
   - Receber documento comprobatório da procuração.
   - Aceitar PDF ou imagem legível.
   - Armazenar o arquivo em diretório público organizado por assembleia.
   - Permitir remoção segura antes da conclusão do cadastro.
   - Manter upload disponível enquanto a votação estiver vigente,
     inclusive após a publicação da convocação.

   Observação:
   - O registro definitivo do documento continua sendo salvo em
     AssemblyRepresentation.documentUrl e documentName quando a
     procuração é cadastrada ou atualizada.
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

function getUploadRoot() {
  return path.join(process.cwd(), "public", "uploads", "assembleias", "procuracoes");
}

function getAssemblyUploadFolder(assemblyId: string) {
  return path.join(getUploadRoot(), assemblyId);
}

function getPublicUrl(assemblyId: string, fileName: string) {
  return `/uploads/assembleias/procuracoes/${assemblyId}/${fileName}`;
}

function getAbsolutePathFromDocumentUrl(params: {
  assemblyId: string;
  documentUrl: string;
}) {
  const expectedPrefix = `/uploads/assembleias/procuracoes/${params.assemblyId}/`;

  if (!params.documentUrl.startsWith(expectedPrefix)) {
    return null;
  }

  const relativeFileName = params.documentUrl.slice(expectedPrefix.length);

  if (
    !relativeFileName ||
    relativeFileName.includes("/") ||
    relativeFileName.includes("\\") ||
    relativeFileName.includes("..")
  ) {
    return null;
  }

  const folder = getAssemblyUploadFolder(params.assemblyId);
  const absolutePath = path.resolve(folder, relativeFileName);
  const safeFolder = `${path.resolve(folder)}${path.sep}`;

  if (!absolutePath.startsWith(safeFolder)) {
    return null;
  }

  return absolutePath;
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
      status: true,
      convocationPublishedAt: true,
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

    const originalName = sanitizeOriginalName(file.name);
    const storedName = `${randomUUID()}${extension}`;
    const uploadFolder = getAssemblyUploadFolder(assembly.id);
    const absolutePath = path.join(uploadFolder, storedName);

    await mkdir(uploadFolder, { recursive: true });
    await writeFile(absolutePath, Buffer.from(await file.arrayBuffer()));

    return NextResponse.json({
      documentUrl: getPublicUrl(assembly.id, storedName),
      documentName: originalName,
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

    const absolutePath = getAbsolutePathFromDocumentUrl({
      assemblyId: assembly.id,
      documentUrl,
    });

    if (!absolutePath) {
      return badRequest("O caminho do documento informado é inválido.");
    }

    try {
      await unlink(absolutePath);
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code || "")
          : "";

      if (code !== "ENOENT") {
        throw error;
      }
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
