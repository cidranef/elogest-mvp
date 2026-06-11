import path from "path";
import { randomUUID } from "crypto";
import { Prisma, Status } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveAdminApiAccess } from "@/lib/admin-api-guard";
import { getAuthUser } from "@/lib/auth-guard";
import { canUploadAttachment } from "@/lib/access-control";
import {
  buildDocumentStorageKey,
  writePrivateDocument,
} from "@/lib/storage/document-storage";
import {
  buildActorLabel,
  buildActorRole,
  getActiveUserAccessFromCookies,
  isAdministradoraAccess,
  type ActiveUserAccess,
} from "@/lib/user-access";



/* =========================================================
   RUNTIME NODE

   Necessário porque esta rota usa fs/promises para salvar
   arquivos localmente dentro de /public/uploads.
   ========================================================= */

export const runtime = "nodejs";



/* =========================================================
   TIPAGEM DA ROTA DINÂMICA
   ========================================================= */

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};



/* =========================================================
   TYPES
   ========================================================= */

type AuthSessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  administratorId?: string | null;
  condominiumId?: string | null;
  unitId?: string | null;
  residentId?: string | null;
};



type AdminAttachmentContextUser = AuthSessionUser & {
  activeAccess: ActiveUserAccess | null;
};



type ContextValidationResult =
  | {
      ok: true;
      status: 200;
      message: "";
    }
  | {
      ok: false;
      status: 403;
      message: string;
    };



/* =========================================================
   CONFIGURAÇÕES DO UPLOAD
   ========================================================= */

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];



/* =========================================================
   HELPERS
   ========================================================= */

function cleanText(value: unknown) {
  return String(value || "").trim();
}



function getSafeExtension(filename: string) {
  const ext = path.extname(filename || "").toLowerCase();

  if (!ext) return "";

  const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];

  if (!allowedExtensions.includes(ext)) {
    return "";
  }

  return ext;
}



function getDatabaseAccessId(access: ActiveUserAccess | null) {
  if (!access) {
    return null;
  }

  return access.source === "USER_ACCESS" ? access.accessId : null;
}



function isPrismaKnownRequestError(
  error: unknown
): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError;
}



/* =========================================================
   USUÁRIO COM CONTEXTO ATIVO
   ========================================================= */

async function getAdminAttachmentContextUser(): Promise<AdminAttachmentContextUser> {
  const sessionUser = (await getAuthUser()) as AuthSessionUser | null;

  if (!sessionUser?.id) {
    throw new Error("UNAUTHORIZED");
  }

  const activeAccess: ActiveUserAccess | null =
    await getActiveUserAccessFromCookies({
      userId: sessionUser.id,
    });

  if (!activeAccess) {
    return {
      ...sessionUser,
      activeAccess: null,
    };
  }

  return {
    ...sessionUser,

    role: activeAccess.role || sessionUser.role,

    administratorId:
      activeAccess.administratorId !== undefined
        ? activeAccess.administratorId
        : sessionUser.administratorId,

    condominiumId:
      activeAccess.condominiumId !== undefined
        ? activeAccess.condominiumId
        : sessionUser.condominiumId,

    unitId:
      activeAccess.unitId !== undefined
        ? activeAccess.unitId
        : sessionUser.unitId,

    residentId:
      activeAccess.residentId !== undefined
        ? activeAccess.residentId
        : sessionUser.residentId,

    activeAccess,
  };
}



/* =========================================================
   VALIDAÇÃO DO CONTEXTO
   ========================================================= */

function validateAdminAttachmentContext(
  user: AdminAttachmentContextUser
): ContextValidationResult {
  const activeAccess = user.activeAccess;

  if (!activeAccess) {
    return {
      ok: false,
      status: 403,
      message: "Não foi possível identificar o contexto de acesso.",
    };
  }

  if (!isAdministradoraAccess(activeAccess)) {
    return {
      ok: false,
      status: 403,
      message:
        "Este contexto não possui acesso à rota administrativa de anexos. Use o portal ou a área EloGest.",
    };
  }

  if (!user.administratorId) {
    return {
      ok: false,
      status: 403,
      message: "Contexto de administradora sem vínculo com administradora.",
    };
  }

  return {
    ok: true,
    status: 200,
    message: "",
  };
}



/* =========================================================
   FILTRO DE ACESSO AO CHAMADO
   ========================================================= */

function getAttachmentTicketWhere({
  user,
  ticketId,
}: {
  user: AdminAttachmentContextUser;
  ticketId: string;
}): Prisma.TicketWhereInput {
  const activeAccess = user.activeAccess;

  if (activeAccess && isAdministradoraAccess(activeAccess) && user.administratorId) {
    return {
      id: ticketId,
      condominium: {
        administratorId: user.administratorId,
      },
    };
  }

  return {
    id: "__NO_ACCESS__",
  };
}



/* =========================================================
   GET - LISTAR ANEXOS DO CHAMADO
   ========================================================= */

export async function GET(_req: Request, context: RouteContext) {
  try {
    const adminApiAccess = await requireActiveAdminApiAccess();

    if ("error" in adminApiAccess) {
      return adminApiAccess.error;
    }

    const user = await getAdminAttachmentContextUser();
    const { id } = await context.params;

    const ticketId = cleanText(id);

    if (!ticketId) {
      return NextResponse.json(
        { error: "ID do chamado não informado." },
        { status: 400 }
      );
    }

    const contextValidation = validateAdminAttachmentContext(user);

    if (!contextValidation.ok) {
      return NextResponse.json(
        { error: contextValidation.message },
        { status: contextValidation.status }
      );
    }

    const chamado = await db.ticket.findFirst({
      where: getAttachmentTicketWhere({
        user,
        ticketId,
      }),
      select: {
        id: true,
      },
    });

    if (!chamado) {
      return NextResponse.json(
        { error: "Chamado não encontrado ou acesso negado." },
        { status: 404 }
      );
    }

    const attachments = await db.ticketAttachment.findMany({
      where: {
        ticketId: chamado.id,
      },
      include: {
        uploadedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(
      attachments.map((attachment) => ({
        ...attachment,
        url: `/api/admin/chamados/${chamado.id}/attachments/${attachment.id}`,
      })),
    );
  } catch (error: unknown) {
    console.error("ERRO AO LISTAR ANEXOS:", error);

    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    if (isPrismaKnownRequestError(error)) {
      return NextResponse.json(
        { error: "Erro ao consultar anexos." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao listar anexos." },
      { status: 500 }
    );
  }
}



/* =========================================================
   POST - ENVIAR ANEXO DO CHAMADO
   ========================================================= */

export async function POST(req: Request, context: RouteContext) {
  try {
    const adminApiAccess = await requireActiveAdminApiAccess();

    if ("error" in adminApiAccess) {
      return adminApiAccess.error;
    }

    const user = await getAdminAttachmentContextUser();
    const { id } = await context.params;

    const ticketId = cleanText(id);

    if (!ticketId) {
      return NextResponse.json(
        { error: "ID do chamado não informado." },
        { status: 400 }
      );
    }

    const contextValidation = validateAdminAttachmentContext(user);

    if (!contextValidation.ok) {
      return NextResponse.json(
        { error: contextValidation.message },
        { status: contextValidation.status }
      );
    }

    const activeAccess = user.activeAccess;

    if (!activeAccess) {
      return NextResponse.json(
        { error: "Não foi possível identificar o contexto de acesso." },
        { status: 403 }
      );
    }

    if (!canUploadAttachment(activeAccess)) {
      return NextResponse.json(
        { error: "Usuário sem permissão para anexar arquivos." },
        { status: 403 }
      );
    }

    const chamado = await db.ticket.findFirst({
      where: getAttachmentTicketWhere({
        user,
        ticketId,
      }),
      select: {
        id: true,
        title: true,
        status: true,
        condominium: {
          select: {
            id: true,
            status: true,
            administrator: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!chamado) {
      return NextResponse.json(
        { error: "Chamado não encontrado ou acesso negado." },
        { status: 404 }
      );
    }

    if (chamado.status === "RESOLVED" || chamado.status === "CANCELED") {
      return NextResponse.json(
        {
          error:
            "Este chamado está finalizado. Reabra o chamado antes de anexar arquivos.",
        },
        { status: 400 }
      );
    }

    if (
      chamado.condominium?.status !== Status.ACTIVE ||
      chamado.condominium?.administrator?.status !== Status.ACTIVE
    ) {
      return NextResponse.json(
        {
          error:
            "O condomínio ou a administradora deste chamado está inativo. Não é possível anexar novos arquivos.",
        },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Nenhum arquivo enviado." },
        { status: 400 }
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error:
            "Tipo de arquivo não permitido. Envie JPG, PNG, WEBP ou PDF.",
        },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Arquivo muito grande. Limite máximo: 10 MB." },
        { status: 400 }
      );
    }

    const extension = getSafeExtension(file.name);

    if (!extension) {
      return NextResponse.json(
        { error: "Extensão de arquivo inválida." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const attachmentId = randomUUID();
    const storedName = `${randomUUID()}${extension}`;
    const storageKey = buildDocumentStorageKey(
      "chamados",
      "anexos",
      chamado.condominium.administrator.id,
      chamado.condominium.id,
      chamado.id,
      attachmentId,
      storedName,
    );

    const storage = await writePrivateDocument({
      key: storageKey,
      bytes: buffer,
      contentType: file.type,
      metadata: {
        ticketid: chamado.id,
        attachmentid: attachmentId,
        condominiumid: chamado.condominium.id,
        administratorid: chamado.condominium.administrator.id,
      },
    });

    const attachment = await db.ticketAttachment.create({
      data: {
        id: attachmentId,
        ticketId: chamado.id,
        uploadedByUserId: user.id,
        originalName: file.name,
        storedName,
        mimeType: file.type,
        sizeBytes: file.size,
        url: `private://${storage.key}`,
      },
      include: {
        uploadedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    const dbAccessId = getDatabaseAccessId(activeAccess);

    await db.ticketLog.create({
      data: {
        ticketId: chamado.id,
        userId: user.id,
        accessId: dbAccessId,
        actorRole: buildActorRole(activeAccess),
        actorLabel: buildActorLabel(activeAccess),
        action: "ATTACHMENT_ADDED",
        comment: `Anexo enviado: ${file.name}`,
      },
    });

    return NextResponse.json({
      ...attachment,
      url: `/api/admin/chamados/${chamado.id}/attachments/${attachment.id}`,
    });
  } catch (error: unknown) {
    console.error("ERRO AO ENVIAR ANEXO:", error);

    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    if (isPrismaKnownRequestError(error)) {
      return NextResponse.json(
        { error: "Erro ao registrar anexo." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao enviar anexo." },
      { status: 500 }
    );
  }
}


/* =========================================================
   ETAPA 52.9.2.1 — DOCUMENTOS PRIVADOS DOS CHAMADOS

   Ajuste:
   - Upload administrativo passa a persistir em LOCAL ou R2.
   - TicketAttachment.url armazena referência privada.
   - Resposta pública entrega somente rota autenticada do EloGest.
   ========================================================= */
