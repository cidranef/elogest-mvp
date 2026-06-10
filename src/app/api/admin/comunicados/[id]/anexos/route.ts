import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { AnnouncementLogAction } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAnnouncementsAdminApiAccess } from "@/lib/admin-api-guard";

/* =========================================================
   API ADMIN - ANEXOS DO COMUNICADO

   Arquivo:
   src/app/api/admin/comunicados/[id]/anexos/route.ts

   ETAPA 48.9.2 — ANEXOS OPCIONAIS EM COMUNICADOS

   Métodos:
   - GET: lista anexos do comunicado da administradora ativa.
   - POST: adiciona anexo opcional ao comunicado.

   Regras:
   - Anexo não é obrigatório.
   - Administradora pode anexar documentos quando necessário.
   - Comunicado precisa pertencer à administradora ativa.
   - Arquivos ficam em /public/uploads/comunicados/[announcementId]/.
   ========================================================= */

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);

function sanitizeFilename(value: string) {
  const fallback = "anexo";
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);

  return normalized || fallback;
}

async function findAnnouncementForAdmin({
  announcementId,
  administratorId,
}: {
  announcementId: string;
  administratorId: string;
}) {
  return db.announcement.findFirst({
    where: {
      id: announcementId,
      administratorId,
    },
    select: {
      id: true,
      title: true,
      administratorId: true,
      status: true,
      _count: {
        select: {
          readings: true,
        },
      },
    },
  });
}

function canManageAnnouncementAttachments(announcement: Awaited<ReturnType<typeof findAnnouncementForAdmin>>) {
  if (!announcement) {
    return false;
  }

  if (announcement.status === "DRAFT" || announcement.status === "SCHEDULED") {
    return true;
  }

  if (announcement.status === "PUBLISHED" && announcement._count.readings === 0) {
    return true;
  }

  return false;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireAnnouncementsAdminApiAccess();

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const { id } = await context.params;

    const announcement = await findAnnouncementForAdmin({
      announcementId: id,
      administratorId: auth.administratorId,
    });

    if (!announcement) {
      return NextResponse.json(
        {
          error: "Comunicado não encontrado.",
        },
        {
          status: 404,
        },
      );
    }

    const attachments = await db.announcementAttachment.findMany({
      where: {
        announcementId: id,
      },
      select: {
        id: true,
        originalName: true,
        storedName: true,
        mimeType: true,
        sizeBytes: true,
        url: true,
        createdAt: true,
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
      announcement,
      attachments,
    });
  } catch (error) {
    console.error("Erro ao listar anexos do comunicado:", error);

    return NextResponse.json(
      {
        error: "Não foi possível listar os anexos do comunicado.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireAnnouncementsAdminApiAccess();

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const { id } = await context.params;

    const announcement = await findAnnouncementForAdmin({
      announcementId: id,
      administratorId: auth.administratorId,
    });

    if (!announcement) {
      return NextResponse.json(
        {
          error: "Comunicado não encontrado.",
        },
        {
          status: 404,
        },
      );
    }

    if (!canManageAnnouncementAttachments(announcement)) {
      return NextResponse.json(
        {
          error:
            "Este comunicado já possui confirmação de leitura ou foi arquivado. Para preservar a rastreabilidade, não é mais possível adicionar documentos.",
        },
        {
          status: 409,
        },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          error: "Selecione um arquivo para anexar.",
        },
        {
          status: 400,
        },
      );
    }

    if (file.size <= 0) {
      return NextResponse.json(
        {
          error: "O arquivo enviado está vazio.",
        },
        {
          status: 400,
        },
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: "O arquivo deve ter no máximo 10 MB.",
        },
        {
          status: 400,
        },
      );
    }

    if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        {
          error: "Tipo de arquivo não permitido. Use PDF, imagem, Word, Excel ou texto.",
        },
        {
          status: 400,
        },
      );
    }

    const originalName = sanitizeFilename(file.name || "anexo");
    const extension = path.extname(originalName);
    const baseName = path.basename(originalName, extension);
    const storedName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${baseName}${extension}`;
    const relativeDir = `/uploads/comunicados/${id}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "comunicados", id);
    const filePath = path.join(uploadDir, storedName);

    await mkdir(uploadDir, {
      recursive: true,
    });

    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, bytes);

    const attachment = await db.$transaction(async (tx) => {
      const createdAttachment = await tx.announcementAttachment.create({
        data: {
          announcementId: id,
          uploadedByUserId: auth.authUser.id,
          originalName: file.name || originalName,
          storedName,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          url: `${relativeDir}/${storedName}`,
        },
        select: {
          id: true,
          originalName: true,
          storedName: true,
          mimeType: true,
          sizeBytes: true,
          url: true,
          createdAt: true,
          uploadedByUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      await tx.announcementLog.create({
        data: {
          announcementId: id,
          userId: auth.authUser.id,
          action: AnnouncementLogAction.ATTACHMENT_ADDED,
          message: "Documento anexado ao comunicado.",
          metadata: {
            attachmentId: createdAttachment.id,
            originalName: createdAttachment.originalName,
            mimeType: createdAttachment.mimeType,
            sizeBytes: createdAttachment.sizeBytes,
          },
        },
      });

      return createdAttachment;
    });

    return NextResponse.json(
      {
        attachment,
        message: "Anexo adicionado ao comunicado.",
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error("Erro ao anexar arquivo ao comunicado:", error);

    return NextResponse.json(
      {
        error: "Não foi possível anexar o arquivo ao comunicado.",
      },
      {
        status: 500,
      },
    );
  }
}
