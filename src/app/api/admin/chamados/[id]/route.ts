import { db } from "@/lib/db";
import { requireActiveAdminApiAccess } from "@/lib/admin-api-guard";
import { getAuthUser, type AuthUser } from "@/lib/auth-guard";
import {
  sendNotification,
  notifyTicketPublicTargets,
  notifyTicketAssignedTargets,
} from "@/lib/notifications";
import {
  canViewAdminTickets,
  canAssignTicket,
  canChangeTicketStatus,
  canCommentPublic,
} from "@/lib/access-control";
import { NextResponse } from "next/server";
import {
  buildActorLabel,
  buildActorRole,
  getActiveUserAccessFromCookies,
  isAdministradoraAccess,
  type ActiveUserAccess,
} from "@/lib/user-access";
import { Prisma, Role, TicketStatus } from "@prisma/client";



/* =========================================================
   API ADMIN - CHAMADO INDIVIDUAL

   ETAPA 43 — ARQUITETURA DE PERFIS, VÍNCULOS E PERMISSÕES

   ETAPA 44 — SUPER ADMIN E MULTIADMINISTRADORA
   - Adicionado requireActiveAdminApiAccess() para bloquear APIs /api/admin/*
     quando a administradora estiver inativa.

   Objetivo desta revisão:
   - A rota /admin/chamados/[id] passa a operar somente com
     perfil ativo ADMINISTRADORA.
   - SUPER_ADMIN não opera pela área /admin; deve usar rotas
     próprias da área /elogest.
   - Todas as consultas usam a carteira da administradora ativa.
   - Logs e notificações usam o perfil ativo para actorRole,
     actorLabel e accessId.
   - Mantidas regras anteriores:
     comentário público notifica morador/criador;
     resolução notifica morador/criador;
     atribuição notifica responsável e público do chamado;
     chamados finalizados preservam histórico e bloqueiam edição.
   ========================================================= */



/* =========================================================
   TIPAGEM DA ROTA DINÂMICA
   ========================================================= */

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type AdminContextUser = Omit<AuthUser, "activeAccess"> & {
  role: string | null;
  administratorId: string | null;
  condominiumId: string | null;
  unitId: string | null;
  residentId: string | null;
  activeAccess: ActiveUserAccess | null;
};

type AssignedValidationResult = {
  assignedToUserId: string | null;
  assignedUser: {
    id: string;
    name: string | null;
    email: string | null;
    role: Role;
    isActive: boolean | null;
  } | null;
  error: string | null;
  status: number;
};



/* =========================================================
   STATUS PERMITIDOS
   ========================================================= */

const ALLOWED_TICKET_STATUS: TicketStatus[] = [
  TicketStatus.OPEN,
  TicketStatus.IN_PROGRESS,
  TicketStatus.RESOLVED,
  TicketStatus.CANCELED,
];



/* =========================================================
   HELPERS GERAIS
   ========================================================= */

function normalizeText(value: unknown) {
  return String(value || "").trim();
}



function normalizeNullableText(value: unknown) {
  const text = normalizeText(value);

  return text ? text : null;
}



function normalizeTicketStatus(value: unknown): TicketStatus | null {
  const status = normalizeNullableText(value);

  if (!status) {
    return null;
  }

  if (status === TicketStatus.OPEN) return TicketStatus.OPEN;
  if (status === TicketStatus.IN_PROGRESS) return TicketStatus.IN_PROGRESS;
  if (status === TicketStatus.RESOLVED) return TicketStatus.RESOLVED;
  if (status === TicketStatus.CANCELED) return TicketStatus.CANCELED;

  return null;
}



function getDatabaseAccessId(access?: ActiveUserAccess | null) {
  return access?.source === "USER_ACCESS" ? access.accessId : null;
}



/* =========================================================
   HELPERS DE STATUS
   ========================================================= */

function statusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    OPEN: "Aberto",
    IN_PROGRESS: "Em andamento",
    RESOLVED: "Resolvido",
    CANCELED: "Cancelado",
  };

  return labels[status || ""] || status || "-";
}



function isTicketFinalized(status?: string | null) {
  return status === "RESOLVED" || status === "CANCELED";
}



function statusNotificationTitle(status?: string | null) {
  if (status === "OPEN") {
    return "Chamado reaberto";
  }

  if (status === "IN_PROGRESS") {
    return "Chamado em andamento";
  }

  if (status === "RESOLVED") {
    return "Chamado resolvido";
  }

  if (status === "CANCELED") {
    return "Chamado cancelado";
  }

  return "Status do chamado atualizado";
}



function statusNotificationMessage({
  title,
  fromStatus,
  toStatus,
}: {
  title: string;
  fromStatus?: string | null;
  toStatus?: string | null;
}) {
  if (toStatus === "IN_PROGRESS") {
    return `O chamado "${title}" foi colocado em andamento.`;
  }

  if (toStatus === "RESOLVED") {
    return `O chamado "${title}" foi resolvido.`;
  }

  if (toStatus === "OPEN") {
    return `O chamado "${title}" foi reaberto.`;
  }

  if (toStatus === "CANCELED") {
    return `O chamado "${title}" foi cancelado.`;
  }

  return `O chamado "${title}" mudou de ${statusLabel(fromStatus)} para ${statusLabel(
    toStatus
  )}.`;
}



/* =========================================================
   USUÁRIO COM CONTEXTO ATIVO

   Etapa 43:
   A área /admin exige perfil ativo ADMINISTRADORA.
   ========================================================= */

async function getAdminContextUser(): Promise<AdminContextUser> {
  const sessionUser = await getAuthUser();

  if (!sessionUser?.id) {
    throw new Error("UNAUTHORIZED");
  }

  const activeAccess = await getActiveUserAccessFromCookies({
    userId: sessionUser.id,
  });

  if (!activeAccess) {
    return {
      ...sessionUser,
      role: sessionUser.role || null,
      administratorId: sessionUser.administratorId || null,
      condominiumId: sessionUser.condominiumId || null,
      unitId: sessionUser.unitId || null,
      residentId: sessionUser.residentId || null,
      activeAccess: null,
    };
  }

  return {
    ...sessionUser,

    role: activeAccess.role || sessionUser.role || null,

    administratorId:
      activeAccess.administratorId !== undefined
        ? activeAccess.administratorId
        : sessionUser.administratorId || null,

    condominiumId:
      activeAccess.condominiumId !== undefined
        ? activeAccess.condominiumId
        : sessionUser.condominiumId || null,

    unitId:
      activeAccess.unitId !== undefined
        ? activeAccess.unitId
        : sessionUser.unitId || null,

    residentId:
      activeAccess.residentId !== undefined
        ? activeAccess.residentId
        : sessionUser.residentId || null,

    activeAccess,
  };
}



/* =========================================================
   PERFIL ADMINISTRATIVO

   /admin é exclusivo da ADMINISTRADORA.
   SUPER_ADMIN deve operar em /elogest.
   ========================================================= */

function isAdminContext(user: AdminContextUser) {
  return !!user.activeAccess && isAdministradoraAccess(user.activeAccess);
}



/* =========================================================
   INCLUDE DO CHAMADO ADMINISTRATIVO
   ========================================================= */

function getTicketInclude() {
  return {
    condominium: true,
    unit: true,
    resident: true,
    createdByUser: true,
    createdByAccess: true,
    assignedToUser: true,

    logs: {
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

      orderBy: {
        createdAt: "desc" as const,
      },
    },

    attachments: {
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
        createdAt: "desc" as const,
      },
    },

    rating: {
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    },
  };
}



/* =========================================================
   INCLUDE PARA NOTIFICAÇÕES
   ========================================================= */

function getTicketNotificationInclude() {
  return {
    condominium: {
      select: {
        id: true,
        name: true,
        administratorId: true,
      },
    },

    resident: {
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
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
  };
}



/* =========================================================
   FILTRO DE ACESSO DO CHAMADO

   Etapa 43:
   Administradora acessa somente chamados de condomínios da sua
   carteira ativa.
   ========================================================= */

function getAdminTicketWhere(user: AdminContextUser, ticketId: string) {
  if (isAdminContext(user) && user.administratorId) {
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
   VALIDAÇÃO DO CONTEXTO
   ========================================================= */

function validateAdminContext(user: AdminContextUser) {
  if (!isAdminContext(user)) {
    return {
      ok: false,
      status: 403,
      message:
        "Este contexto não possui acesso à rota administrativa de chamados. Use o portal ou a área EloGest.",
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
   VALIDA RESPONSÁVEL ATRIBUÍDO
   ========================================================= */

async function validateAssignedUser({
  currentUser,
  assignedToUserId,
  targetAdministratorId,
  targetCondominiumId,
}: {
  currentUser: AdminContextUser;
  assignedToUserId?: string | null;
  targetAdministratorId: string | null;
  targetCondominiumId: string;
}): Promise<AssignedValidationResult> {
  if (!assignedToUserId) {
    return {
      assignedToUserId: null,
      assignedUser: null,
      error: null,
      status: 200,
    };
  }

  if (!canAssignTicket(currentUser.activeAccess || currentUser)) {
    return {
      assignedToUserId: null,
      assignedUser: null,
      error: "Usuário sem permissão para atribuir responsável.",
      status: 403,
    };
  }

  const assignedUser = await db.user.findFirst({
    where: {
      id: assignedToUserId,
      isActive: true,
      OR: [
        {
          role: "ADMINISTRADORA",
          administratorId: targetAdministratorId || undefined,
        },
        {
          role: "SINDICO",
          condominiumId: targetCondominiumId,
        },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
    },
  });

  if (!assignedUser) {
    return {
      assignedToUserId: null,
      assignedUser: null,
      error:
        "Responsável inválido. O chamado só pode ser atribuído para a administradora da carteira ou para o síndico do mesmo condomínio.",
      status: 403,
    };
  }

  return {
    assignedToUserId: assignedUser.id,
    assignedUser,
    error: null,
    status: 200,
  };
}



/* =========================================================
   GET - BUSCAR CHAMADO INDIVIDUAL
   ========================================================= */

export async function GET(req: Request, context: RouteContext) {
  try {
    const adminApiAccess = await requireActiveAdminApiAccess();

    if ("error" in adminApiAccess) {
      return adminApiAccess.error;
    }

    const user = await getAdminContextUser();
    const { id } = await context.params;

    const ticketId = normalizeText(id);

    if (!ticketId) {
      return NextResponse.json(
        { error: "ID do chamado não informado." },
        { status: 400 }
      );
    }

    const contextValidation = validateAdminContext(user);

    if (!contextValidation.ok) {
      return NextResponse.json(
        { error: contextValidation.message },
        { status: contextValidation.status }
      );
    }

    if (!canViewAdminTickets(user.activeAccess || user)) {
      return NextResponse.json(
        { error: "Usuário sem permissão para acessar este chamado." },
        { status: 403 }
      );
    }

    const chamado = await db.ticket.findFirst({
      where: getAdminTicketWhere(user, ticketId),
      include: getTicketInclude(),
    });

    if (!chamado) {
      return NextResponse.json(
        { error: "Chamado não encontrado ou acesso negado." },
        { status: 404 }
      );
    }

    return NextResponse.json(chamado);
  } catch (error: unknown) {
    console.error("ERRO AO BUSCAR CHAMADO:", error);

    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao buscar chamado." },
      { status: 500 }
    );
  }
}



/* =========================================================
   PATCH - ATUALIZAR CHAMADO
   ========================================================= */

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const adminApiAccess = await requireActiveAdminApiAccess();

    if ("error" in adminApiAccess) {
      return adminApiAccess.error;
    }

    const user = await getAdminContextUser();
    const body = await req.json();

    const { id } = await context.params;
    const ticketId = normalizeText(id);

    if (!ticketId) {
      return NextResponse.json(
        { error: "ID do chamado não informado." },
        { status: 400 }
      );
    }

    const contextValidation = validateAdminContext(user);

    if (!contextValidation.ok) {
      return NextResponse.json(
        { error: contextValidation.message },
        { status: contextValidation.status }
      );
    }

    if (!canViewAdminTickets(user.activeAccess || user)) {
      return NextResponse.json(
        { error: "Usuário sem permissão para atualizar este chamado." },
        { status: 403 }
      );
    }

    const activeAccess = user.activeAccess;

    if (!activeAccess) {
      return NextResponse.json(
        { error: "Não foi possível identificar o contexto de acesso." },
        { status: 403 }
      );
    }

    const dbAccessId = getDatabaseAccessId(activeAccess);

    const logActorData = {
      userId: user.id,
      accessId: dbAccessId,
      actorRole: buildActorRole(activeAccess),
      actorLabel: buildActorLabel(activeAccess),
    };

    const actorUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    const chamado = await db.ticket.findFirst({
      where: getAdminTicketWhere(user, ticketId),
      include: {
        condominium: true,
        unit: true,
        resident: true,
        assignedToUser: true,
      },
    });

    if (!chamado) {
      return NextResponse.json(
        { error: "Chamado não encontrado ou acesso negado." },
        { status: 404 }
      );
    }



    /* =========================================================
       COMENTÁRIO PÚBLICO
       ========================================================= */

    const publicComment = normalizeText(body.comment);

    if (publicComment) {
      if (!canCommentPublic(activeAccess)) {
        return NextResponse.json(
          { error: "Usuário sem permissão para comentar neste chamado." },
          { status: 403 }
        );
      }

      if (isTicketFinalized(chamado.status)) {
        return NextResponse.json(
          {
            error:
              "Este chamado está finalizado. Reabra o chamado antes de comentar.",
          },
          { status: 400 }
        );
      }

      await db.ticketLog.create({
        data: {
          ticketId: chamado.id,
          ...logActorData,
          action: "COMMENT_PUBLIC",
          comment: publicComment,
        },
      });

      const ticketForNotification = await db.ticket.findUnique({
        where: {
          id: chamado.id,
        },
        include: getTicketNotificationInclude(),
      });

      if (ticketForNotification) {
        await notifyTicketPublicTargets({
          ticket: ticketForNotification,
          actorUser,
          type: "TICKET_PUBLIC_COMMENT",
          title: "Nova resposta no chamado",
          message: `${user.name} enviou uma resposta no chamado "${chamado.title}".`,
          metadata: {
            ticketTitle: chamado.title,
            condominiumName: chamado.condominium?.name || null,
            commentPreview: publicComment.substring(0, 180),
            source: "ADMIN",
            action: "COMMENT_PUBLIC",
            actorRole: buildActorRole(activeAccess),
            actorLabel: buildActorLabel(activeAccess),
          },
        });
      }

      const updated = await db.ticket.findUnique({
        where: {
          id: chamado.id,
        },
        include: getTicketInclude(),
      });

      return NextResponse.json(updated);
    }



    /* =========================================================
       ATUALIZAÇÕES DE STATUS E RESPONSÁVEL
       ========================================================= */

    const updateData: Prisma.TicketUncheckedUpdateInput = {};

    const logs: Array<{
      ticketId: string;
      userId: string;
      accessId: string | null;
      actorRole: string | null;
      actorLabel: string | null;
      action: string;
      fromValue?: string | null;
      toValue?: string | null;
      comment?: string | null;
    }> = [];

    let responsavel: AssignedValidationResult["assignedUser"] = null;
    let resolutionCommentForNotification = "";



    /* =========================================================
       ALTERAÇÃO DE STATUS
       ========================================================= */

    const requestedStatus = normalizeTicketStatus(body.status);

    if (requestedStatus && requestedStatus !== chamado.status) {
      const nextStatus = requestedStatus;

      if (!ALLOWED_TICKET_STATUS.includes(nextStatus)) {
        return NextResponse.json(
          { error: "Status informado é inválido." },
          { status: 400 }
        );
      }

      if (!canChangeTicketStatus(activeAccess)) {
        return NextResponse.json(
          { error: "Usuário sem permissão para alterar status do chamado." },
          { status: 403 }
        );
      }

      updateData.status = nextStatus;

      if (nextStatus === "IN_PROGRESS" && !chamado.firstResponseAt) {
        updateData.firstResponseAt = new Date();
      }

      if (nextStatus === "RESOLVED") {
        const resolutionComment = normalizeText(body?.resolutionComment);

        if (chamado.status !== "IN_PROGRESS") {
          return NextResponse.json(
            {
              error:
                "O chamado precisa estar em andamento antes de ser resolvido.",
            },
            { status: 400 }
          );
        }

        if (!resolutionComment) {
          return NextResponse.json(
            {
              error:
                "Informe a mensagem de resolução antes de finalizar o chamado.",
            },
            { status: 400 }
          );
        }

        resolutionCommentForNotification = resolutionComment;

        updateData.resolvedAt = new Date();
        updateData.closedAt = new Date();

        if (!chamado.firstResponseAt) {
          updateData.firstResponseAt = new Date();
        }

        logs.push({
          ticketId: chamado.id,
          ...logActorData,
          action: "COMMENT_PUBLIC",
          fromValue: null,
          toValue: null,
          comment: resolutionComment,
        });
      }

      if (nextStatus === "OPEN") {
        updateData.resolvedAt = null;
        updateData.closedAt = null;
      }

      logs.push({
        ticketId: chamado.id,
        ...logActorData,
        action: "STATUS_CHANGED",
        fromValue: statusLabel(chamado.status),
        toValue: statusLabel(nextStatus),
      });
    }



    /* =========================================================
       ALTERAÇÃO DE RESPONSÁVEL
       ========================================================= */

    const requestedAssignedToUserId = normalizeNullableText(body.assignedToUserId);

    if (
      requestedAssignedToUserId &&
      requestedAssignedToUserId !== chamado.assignedToUserId
    ) {
      if (isTicketFinalized(chamado.status)) {
        return NextResponse.json(
          {
            error:
              "Este chamado está finalizado. Reabra o chamado antes de alterar o responsável.",
          },
          { status: 400 }
        );
      }

      const assignedValidation = await validateAssignedUser({
        currentUser: user,
        assignedToUserId: requestedAssignedToUserId,
        targetAdministratorId: chamado.condominium?.administratorId || null,
        targetCondominiumId: chamado.condominiumId,
      });

      if (assignedValidation.error) {
        return NextResponse.json(
          { error: assignedValidation.error },
          { status: assignedValidation.status }
        );
      }

      responsavel = assignedValidation.assignedUser;
      updateData.assignedToUserId = assignedValidation.assignedToUserId;

      logs.push({
        ticketId: chamado.id,
        ...logActorData,
        action: "ASSIGNED",
        fromValue: chamado.assignedToUser?.name || null,
        toValue: responsavel?.name || null,
        comment: responsavel?.name
          ? `Responsável definido: ${responsavel.name}`
          : null,
      });
    }



    /* =========================================================
       SE NÃO HOUVE ALTERAÇÃO
       ========================================================= */

    if (Object.keys(updateData).length === 0) {
      const chamadoAtualizado = await db.ticket.findUnique({
        where: {
          id: chamado.id,
        },
        include: getTicketInclude(),
      });

      return NextResponse.json(chamadoAtualizado);
    }



    /* =========================================================
       ATUALIZA CHAMADO E CRIA LOGS EM TRANSAÇÃO
       ========================================================= */

    await db.$transaction(async (tx) => {
      await tx.ticket.update({
        where: {
          id: chamado.id,
        },
        data: updateData,
      });

      if (logs.length > 0) {
        await tx.ticketLog.createMany({
          data: logs,
        });
      }
    });



    /* =========================================================
       RETORNA CHAMADO ATUALIZADO
       ========================================================= */

    const updated = await db.ticket.findUnique({
      where: {
        id: chamado.id,
      },
      include: getTicketInclude(),
    });

    const ticketForNotification = await db.ticket.findUnique({
      where: {
        id: chamado.id,
      },
      include: getTicketNotificationInclude(),
    });



    /* =========================================================
       NOTIFICAÇÃO - RESPONSÁVEL ATRIBUÍDO
       ========================================================= */

    if (responsavel && ticketForNotification) {
      await notifyTicketAssignedTargets({
        ticket: ticketForNotification,
        assignedUser: responsavel,
        actorUser,
        metadata: {
          ticketTitle: chamado.title,
          condominiumName: chamado.condominium?.name || null,
          assignedToUserId: responsavel.id,
          assignedToUserName: responsavel.name || null,
          source: "ADMIN",
          action: "ASSIGNED",
          actorRole: buildActorRole(activeAccess),
          actorLabel: buildActorLabel(activeAccess),
        },
      });
    }



    /* =========================================================
       NOTIFICAÇÃO - RESOLUÇÃO / MENSAGEM PÚBLICA
       ========================================================= */

    if (resolutionCommentForNotification && ticketForNotification) {
      await notifyTicketPublicTargets({
        ticket: ticketForNotification,
        actorUser,
        type: "TICKET_RESOLVED",
        title: "Chamado resolvido",
        message: `O chamado "${chamado.title}" foi resolvido.`,
        metadata: {
          ticketTitle: chamado.title,
          condominiumName: chamado.condominium?.name || null,
          commentPreview: resolutionCommentForNotification.substring(0, 180),
          source: "ADMIN",
          action: "COMMENT_PUBLIC",
          status: "RESOLVED",
          actorRole: buildActorRole(activeAccess),
          actorLabel: buildActorLabel(activeAccess),
        },
      });
    }



    /* =========================================================
       NOTIFICAÇÃO - STATUS ATUALIZADO PARA RESPONSÁVEL
       ========================================================= */

    if (
      updated?.assignedToUser?.email &&
      requestedStatus &&
      requestedStatus !== chamado.status
    ) {
      await sendNotification({
        channel: "SYSTEM",
        userId: updated.assignedToUser.id,
        to: updated.assignedToUser.email,
        toName: updated.assignedToUser.name,
        ticketId: updated.id,
        type:
          updated.status === "RESOLVED"
            ? "TICKET_RESOLVED"
            : "TICKET_STATUS_CHANGED",
        title: statusNotificationTitle(updated.status),
        message: statusNotificationMessage({
          title: updated.title,
          fromStatus: chamado.status,
          toStatus: updated.status,
        }),
      });
    }

    return NextResponse.json(updated);
  } catch (error: unknown) {
    console.error("ERRO AO ATUALIZAR CHAMADO:", error);

    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao atualizar chamado." },
      { status: 500 }
    );
  }
}
