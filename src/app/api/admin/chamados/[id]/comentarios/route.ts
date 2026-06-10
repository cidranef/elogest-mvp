import { Prisma, Status } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveAdminApiAccess } from "@/lib/admin-api-guard";
import { getAuthUser } from "@/lib/auth-guard";
import {
  notifyTicketInternalTargets,
  notifyTicketPublicTargets,
} from "@/lib/notifications";
import {
  canCommentInternal,
  canCommentPublic,
} from "@/lib/access-control";
import {
  buildActorLabel,
  buildActorRole,
  getActiveUserAccessFromCookies,
  isAdministradoraAccess,
  type ActiveUserAccess,
} from "@/lib/user-access";



/* =========================================================
   API DE COMENTÁRIOS DO CHAMADO - ADMIN

   Rota:
   POST /api/admin/chamados/[id]/comentarios

   Revisão de lint/segurança:
   - Removidos tipos any.
   - Adicionado requireActiveAdminApiAccess().
   - Mantida operação exclusiva para ADMINISTRADORA ativa.
   - Mantido isolamento por administratorId do activeAccess.
   - Mantidos logs com accessId, actorRole e actorLabel.
   ========================================================= */



type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};



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



type CommentContextUser = AuthSessionUser & {
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



type CommentAction = "COMMENT_INTERNAL" | "COMMENT_PUBLIC";



type CommentRequestBody = {
  comment?: unknown;
  type?: unknown;
};



/* =========================================================
   HELPERS
   ========================================================= */

function cleanText(value: unknown) {
  return String(value || "").trim();
}



function getDatabaseAccessId(access: ActiveUserAccess | null) {
  if (!access) {
    return null;
  }

  return access.source === "USER_ACCESS" ? access.accessId : null;
}



function resolveCommentAction(type: unknown): CommentAction {
  if (type === "public") {
    return "COMMENT_PUBLIC";
  }

  return "COMMENT_INTERNAL";
}



function isPrismaKnownRequestError(
  error: unknown
): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError;
}



/* =========================================================
   USUÁRIO COM CONTEXTO ATIVO
   ========================================================= */

async function getCommentContextUser(): Promise<CommentContextUser> {
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
   VALIDA CONTEXTO DA ROTA ADMINISTRATIVA
   ========================================================= */

function validateCommentContext(
  user: CommentContextUser
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
        "Este contexto não possui acesso à rota administrativa de comentários. Use o portal ou a área EloGest.",
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
   FILTRO DO CHAMADO PELO CONTEXTO ATIVO
   ========================================================= */

function getTicketWhereByContext(
  user: CommentContextUser,
  ticketId: string
): Prisma.TicketWhereInput {
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
   POST - CRIAR COMENTÁRIO NO CHAMADO
   ========================================================= */

export async function POST(request: Request, context: RouteContext) {
  try {
    const adminApiAccess = await requireActiveAdminApiAccess();

    if ("error" in adminApiAccess) {
      return adminApiAccess.error;
    }

    const authUser = await getCommentContextUser();
    const { id } = await context.params;

    const ticketId = cleanText(id);

    if (!ticketId) {
      return NextResponse.json(
        { error: "ID do chamado não informado." },
        { status: 400 }
      );
    }

    const contextValidation = validateCommentContext(authUser);

    if (!contextValidation.ok) {
      return NextResponse.json(
        { error: contextValidation.message },
        { status: contextValidation.status }
      );
    }

    const activeAccess = authUser.activeAccess;

    if (!activeAccess) {
      return NextResponse.json(
        { error: "Contexto ativo inválido para registrar comentário." },
        { status: 403 }
      );
    }

    const body = (await request.json()) as CommentRequestBody;

    const comment = cleanText(body.comment);
    const action = resolveCommentAction(body.type);

    if (!comment) {
      return NextResponse.json(
        { error: "Informe o comentário." },
        { status: 400 }
      );
    }

    if (action === "COMMENT_PUBLIC" && !canCommentPublic(activeAccess)) {
      return NextResponse.json(
        { error: "Usuário sem permissão para responder publicamente." },
        { status: 403 }
      );
    }

    if (action === "COMMENT_INTERNAL" && !canCommentInternal(activeAccess)) {
      return NextResponse.json(
        { error: "Usuário sem permissão para registrar comentário interno." },
        { status: 403 }
      );
    }

    const ticket = await db.ticket.findFirst({
      where: getTicketWhereByContext(authUser, ticketId),
      include: {
        condominium: {
          select: {
            id: true,
            name: true,
            administratorId: true,
            status: true,
            administrator: {
              select: {
                id: true,
                name: true,
                status: true,
              },
            },
          },
        },

        unit: true,

        resident: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                isActive: true,
              },
            },
          },
        },

        createdByUser: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
          },
        },

        assignedToUser: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
          },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json(
        { error: "Chamado não encontrado ou sem permissão de acesso." },
        { status: 404 }
      );
    }

    if (ticket.status === "RESOLVED" || ticket.status === "CANCELED") {
      return NextResponse.json(
        {
          error:
            "Este chamado está finalizado. Reabra o chamado antes de adicionar comunicação.",
        },
        { status: 400 }
      );
    }

    if (
      ticket.condominium?.status !== Status.ACTIVE ||
      ticket.condominium?.administrator?.status !== Status.ACTIVE
    ) {
      return NextResponse.json(
        {
          error:
            "O condomínio ou a administradora deste chamado está inativo. Não é possível adicionar nova comunicação.",
        },
        { status: 400 }
      );
    }

    const dbAccessId = getDatabaseAccessId(activeAccess);

    const log = await db.ticketLog.create({
      data: {
        ticketId: ticket.id,
        userId: authUser.id,
        accessId: dbAccessId,
        actorRole: buildActorRole(activeAccess),
        actorLabel: buildActorLabel(activeAccess),
        action,
        comment,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        access: true,
      },
    });

    if (action === "COMMENT_PUBLIC" && !ticket.firstResponseAt) {
      await db.ticket.update({
        where: {
          id: ticket.id,
        },
        data: {
          firstResponseAt: new Date(),
        },
      });
    }

    const notificationMetadata = {
      commentPreview: comment.substring(0, 180),
      action,
      accessId: activeAccess.accessId,
      accessSource: activeAccess.source,
      actorRole: buildActorRole(activeAccess),
      actorLabel: buildActorLabel(activeAccess),
      createdByUserId: authUser.id,
      createdByUserName: authUser.name,
      createdByUserRole: activeAccess.role,
    };

    const actorUser = {
      id: authUser.id,
      name: authUser.name,
      email: authUser.email,
      role: activeAccess.role,
    };

    if (action === "COMMENT_PUBLIC") {
      await notifyTicketPublicTargets({
        ticket,
        actorUser,
        type: "TICKET_PUBLIC_COMMENT",
        title: "Nova resposta no chamado",
        message: `O chamado "${ticket.title}" recebeu uma nova resposta.`,
        metadata: notificationMetadata,
      });
    }

    if (action === "COMMENT_INTERNAL") {
      await notifyTicketInternalTargets({
        ticket,
        actorUser,
        type: "TICKET_INTERNAL_COMMENT",
        title: "Novo comentário interno",
        message: `O chamado "${ticket.title}" recebeu um comentário interno.`,
        metadata: notificationMetadata,
      });
    }

    return NextResponse.json({
      success: true,
      message:
        action === "COMMENT_PUBLIC"
          ? "Resposta ao morador registrada com sucesso."
          : "Comentário interno registrado com sucesso.",
      log,
    });
  } catch (error: unknown) {
    console.error("Erro ao criar comentário no chamado:", error);

    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Usuário não autenticado." },
        { status: 401 }
      );
    }

    if (isPrismaKnownRequestError(error)) {
      return NextResponse.json(
        { error: "Erro ao registrar comentário no chamado." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Erro interno ao criar comentário no chamado." },
      { status: 500 }
    );
  }
}
