import { randomUUID } from "crypto";
import {
  AssemblyAttachmentScope,
  AssemblyLogAction,
  AssemblyStatus,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminModuleApiAccess } from "@/lib/admin-api-guard";
import {
  buildDocumentStorageKey,
  writePrivateDocument,
} from "@/lib/storage/document-storage";

/* =========================================================
   API ADMIN - ANEXOS DA ASSEMBLEIA

   Arquivo:
   src/app/api/admin/assembleias/[id]/anexos/route.ts

   ELOGEST — ETAPA 52.9.2

   GET:
   - Lista documentos oficiais da assembleia.
   - Entrega URLs administrativas protegidas.

   POST:
   - Recebe arquivo multipart/form-data.
   - Grava o documento em armazenamento privado LOCAL ou R2.
   - Cria registro AssemblyAttachment com storageKey auditável.
   - Não expõe URL pública do bucket.
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
  params: Promise<{ id: string }>;
};

type DocumentType = "NOTICE" | "SUPPORT" | "OTHER";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 });
}

function notFound(message: string) {
  return NextResponse.json({ error: message }, { status: 404 });
}

function normalizeNullableString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseScope(value: FormDataEntryValue | null) {
  const normalized = normalizeNullableString(value)?.toUpperCase();

  if (normalized === AssemblyAttachmentScope.AGENDA_ITEM) {
    return AssemblyAttachmentScope.AGENDA_ITEM;
  }

  if (normalized === AssemblyAttachmentScope.OTHER) {
    return AssemblyAttachmentScope.OTHER;
  }

  return AssemblyAttachmentScope.CONVOCATION;
}

function parseDocumentType(value: FormDataEntryValue | null): DocumentType {
  const normalized = normalizeNullableString(value)?.toUpperCase();

  if (normalized === "SUPPORT" || normalized === "OTHER") {
    return normalized;
  }

  return "NOTICE";
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

function buildAdminDownloadUrl(params: {
  assemblyId: string;
  attachmentId: string;
}) {
  return `/api/admin/assembleias/${params.assemblyId}/anexos/${params.attachmentId}`;
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

async function findAssembly(params: {
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
      convocationPublishedAt: true,
    },
  });
}

async function loadAttachments(assemblyId: string) {
  const attachments = await db.assemblyAttachment.findMany({
    where: { assemblyId },
    include: {
      agendaItem: {
        select: {
          id: true,
          title: true,
          order: true,
        },
      },
      uploadedByUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  return attachments.map((attachment) => ({
    ...attachment,
    url: buildAdminDownloadUrl({
      assemblyId: attachment.assemblyId,
      attachmentId: attachment.id,
    }),
  }));
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminModuleApiAccess(
    ASSEMBLIES_MODULE_SLUG,
    ASSEMBLIES_MODULE_LABEL,
  );

  if ("error" in auth) return auth.error;

  try {
    const { id } = await context.params;

    const assembly = await findAssembly({
      assemblyId: id,
      administratorId: auth.administratorId,
    });

    if (!assembly) {
      return notFound("Assembleia não encontrada na carteira ativa da administradora.");
    }

    const attachments = await loadAttachments(assembly.id);

    return NextResponse.json({
      attachments,
      canEdit: canEditDraft(assembly),
    });
  } catch (error) {
    console.error("Erro ao consultar anexos da assembleia:", error);
    return NextResponse.json(
      { error: "Não foi possível consultar os anexos da assembleia." },
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

    const assembly = await findAssembly({
      assemblyId: id,
      administratorId: auth.administratorId,
    });

    if (!assembly) {
      return notFound("Assembleia não encontrada na carteira ativa da administradora.");
    }

    if (!canEditDraft(assembly)) {
      return forbidden(
        "Os documentos oficiais não podem ser alterados após a publicação da convocação.",
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

    const scope = parseScope(formData.get("scope"));
    const documentType = parseDocumentType(formData.get("documentType"));
    const agendaItemId = normalizeNullableString(formData.get("agendaItemId"));
    const description = normalizeNullableString(formData.get("description"));

    if (scope === AssemblyAttachmentScope.AGENDA_ITEM && !agendaItemId) {
      return badRequest("Selecione a pauta relacionada ao documento.");
    }

    if (scope !== AssemblyAttachmentScope.AGENDA_ITEM && agendaItemId) {
      return badRequest("Documentos gerais não devem receber pauta vinculada.");
    }

    if (agendaItemId) {
      const agendaItem = await db.assemblyAgendaItem.findFirst({
        where: {
          id: agendaItemId,
          assemblyId: assembly.id,
        },
        select: { id: true },
      });

      if (!agendaItem) {
        return badRequest("A pauta selecionada não pertence a esta assembleia.");
      }
    }

    const attachmentId = randomUUID();
    const originalName = sanitizeOriginalName(file.name);
    const storedName = `${randomUUID()}${extension}`;
    const storageKey = buildDocumentStorageKey(
      "assembleias",
      "anexos",
      assembly.administratorId,
      assembly.condominiumId,
      assembly.id,
      attachmentId,
      storedName,
    );

    const bytes = Buffer.from(await file.arrayBuffer());

    const storage = await writePrivateDocument({
      key: storageKey,
      bytes,
      contentType: file.type,
      metadata: {
        assemblyid: assembly.id,
        attachmentid: attachmentId,
        administratorid: assembly.administratorId,
        condominiumid: assembly.condominiumId,
        scope,
        documenttype: documentType,
      },
    });

    const attachment = await db.$transaction(async (tx) => {
      const created = await tx.assemblyAttachment.create({
        data: {
          id: attachmentId,
          assemblyId: assembly.id,
          agendaItemId,
          uploadedByUserId: auth.authUser.id,
          scope,
          originalName,
          storedName,
          mimeType: file.type,
          sizeBytes: file.size,
          url: `private://${storage.key}`,
          description,
          metadata: {
            documentType,
            storageDriver: storage.driver,
            storageKey: storage.key,
            storageBucketName: storage.bucketName,
          },
        },
        include: {
          agendaItem: {
            select: {
              id: true,
              title: true,
              order: true,
            },
          },
          uploadedByUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      await tx.assemblyLog.create({
        data: {
          assemblyId: assembly.id,
          userId: auth.authUser.id,
          action: AssemblyLogAction.ATTACHMENT_ADDED,
          message: `Documento adicionado à assembleia: ${originalName}.`,
          metadata: {
            attachmentId: created.id,
            scope,
            documentType,
            agendaItemId,
            storageDriver: storage.driver,
            storageKey: storage.key,
          },
        },
      });

      return created;
    });

    return NextResponse.json({
      attachment: {
        ...attachment,
        url: buildAdminDownloadUrl({
          assemblyId: assembly.id,
          attachmentId: attachment.id,
        }),
      },
      message: "Documento adicionado com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao adicionar anexo da assembleia:", error);
    return NextResponse.json(
      { error: "Não foi possível adicionar o documento da assembleia." },
      { status: 500 },
    );
  }
}
