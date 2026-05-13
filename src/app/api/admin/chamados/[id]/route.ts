import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
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
  isAdministradora,
  isSuperAdmin,
} from "@/lib/access-control";
import { NextResponse } from "next/server";
import {
  buildActorLabel,
  buildActorRole,
  getActiveUserAccessFromCookies,
} from "@/lib/user-access";



/* =========================================================
   API ADMIN - CHAMADO INDIVIDUAL

   ETAPA 35.7 - AJUSTE DE NOTIFICAÇÕES E ATRIBUIÇÃO

   Ajustes aplicados:
   - resposta pública da administradora passa a notificar
     corretamente o morador/criador do chamado;
   - mensagem de resolução também notifica o morador/criador;
   - atribuição de responsável passa a notificar:
     1. o responsável atribuído;
     2. o morador/criador, com mensagem amigável;
   - ASSIGNED continua salvo no histórico administrativo;
   - o portal poderá exibir ASSIGNED de forma humanizada.

   Regras preservadas:
   - chamado RESOLVED ou CANCELED não permite alterar responsável;
   - comentário público exige permissão;
   - alteração de status exige permissão;
   - atribuição exige permissão;
   - contexto ativo continua sendo respeitado.

   ETAPA 40.2 — AUDITORIA DE PERMISSÕES E CONTEXTO ATIVO NAS APIs

   Ajustes desta revisão:
   - Comparações de perfil passam a usar helpers da matriz central.
   - Filtro de chamado fica defensivo contra contexto inválido.
   - Normalização de parâmetros/body.
   - Validação mais clara de contexto ADMINISTRADORA sem administratorId.
   - Mantida regra de preservar histórico e notificar públicos corretos.
   ========================================================= */



/* =========================================================
   TIPAGEM DA ROTA DINÂMICA
   ========================================================= */

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};



/* =========================================================
   STATUS PERMITIDOS
   ========================================================= */

const ALLOWED_TICKET_STATUS = [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "CANCELED",
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

   A sessão base identifica quem está logado.
   O contexto ativo define com qual papel/carteira ele está
   operando naquele momento.
   ========================================================= */

async function getAdminContextUser() {
  const sessionUser: any = await getAuthUser();

  if (!sessionUser?.id) {
    throw new Error("UNAUTHORIZED");
  }

  const activeAccess: any = await getActiveUserAccessFromCookies({
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
   PERFIL ADMINISTRATIVO

   Esta rota é exclusiva para:
   - SUPER_ADMIN
   - ADMINISTRADORA
   ========================================================= */

function isAdminContext(user: any) {
  return isSuperAdmin(user) || isAdministradora(user);
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

   Usado para:
   - notificar morador/criador em resposta pública;
   - notificar responsável atribuído;
   - notificar morador/criador quando responsável for definido.
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

   SUPER_ADMIN:
   - acessa qualquer chamado.

   ADMINISTRADORA:
   - acessa somente chamados de condomínios da sua carteira.

   Defesa:
   - contexto inválido retorna filtro impossível.
   ========================================================= */

function getAdminTicketWhere(user: any, ticketId: string) {
  if (isSuperAdmin(user)) {
    return {
      id: ticketId,
    };
  }

  if (isAdministradora(user) && user.administratorId) {
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

function validateAdminContext(user: any) {
  if (!isAdminContext(user)) {
    return {
      ok: false,
      status: 403,
      message:
        "Este contexto não possui acesso à rota administrativa de chamados. Use o portal.",
    };
  }

  if (isAdministradora(user) && !user.administratorId) {
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

   Regras:
   - Só valida se assignedToUserId foi informado.
   - Usuário atual precisa ter permissão ASSIGN_TICKET.
   - Responsável precisa estar ativo.
   - Responsável permitido:
     ADMINISTRADORA da mesma carteira;
     SÍNDICO do mesmo condomínio.

   Bloqueia:
   - MORADOR;
   - PROPRIETÁRIO;
   - SÍNDICO de outro condomínio;
   - ADMINISTRADORA de outra carteira.
   ========================================================= */

async function validateAssignedUser({
  currentUser,
  assignedToUserId,
  targetAdministratorId,
  targetCondominiumId,
}: {
  currentUser: any;
  assignedToUserId?: string | null;
  targetAdministratorId: string | null;
  targetCondominiumId: string;
}) {
  if (!assignedToUserId) {
    return {
      assignedToUserId: null as string | null,
      assignedUser: null as any,
      error: null as string | null,
      status: 200,
    };
  }

  if (!canAssignTicket(currentUser)) {
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
    const user: any = await getAdminContextUser();
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

    if (!canViewAdminTickets(user)) {
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
  } catch (error: any) {
    console.error("ERRO AO BUSCAR CHAMADO:", error);

    if (error.message === "UNAUTHORIZED") {
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

   Permissões:
   - Visualizar detalhe:
     VIEW_ADMIN_TICKETS.

   - Comentário público:
     COMMENT_PUBLIC.

   - Alterar status:
     CHANGE_TICKET_STATUS.

   - Atribuir responsável:
     ASSIGN_TICKET.

   ETAPA 35.7:
   - comentário público notifica morador/criador;
   - resolução com mensagem pública notifica morador/criador;
   - atribuição de responsável notifica responsável e morador/criador.
   ========================================================= */

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const user: any = await getAdminContextUser();
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

    if (!canViewAdminTickets(user)) {
      return NextResponse.json(
        { error: "Usuário sem permissão para atualizar este chamado." },
        { status: 403 }
      );
    }



    /* =========================================================
       CONTEXTO ATIVO DO USUÁRIO
       ========================================================= */

    const activeAccess = user.activeAccess;

    if (!activeAccess) {
      return NextResponse.json(
        { error: "Não foi possível identificar o contexto de acesso." },
        { status: 403 }
      );
    }



    /* =========================================================
       BASE DOS LOGS DA ROTA
       ========================================================= */

    const logActorData = {
      userId: user.id,
      accessId: activeAccess.accessId,
      actorRole: buildActorRole(activeAccess),
      actorLabel: buildActorLabel(activeAccess),
    };



    /* =========================================================
       ATOR DAS NOTIFICAÇÕES
       ========================================================= */

    const actorUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };



    /* =========================================================
       BUSCA DO CHAMADO
       ========================================================= */

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
       COMENTÁRIO DO CHAMADO - COMPATIBILIDADE ANTIGA

       Comentário recebido via PATCH é tratado como comunicação pública.
       Comentário interno deve ser criado apenas pela rota:
       /api/admin/chamados/[id]/comentarios
       ========================================================= */

    const publicComment = normalizeText(body.comment);

    if (publicComment) {
      if (!canCommentPublic(user)) {
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



      /* =========================================================
         NOTIFICAÇÃO - RESPOSTA PÚBLICA AO MORADOR/CRIADOR

         Corrige o caso de usuário Síndico + Morador:
         o morador/criador deve ser notificado da resposta pública,
         mesmo que também possua contexto de síndico.
       ========================================================= */

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

    const updateData: any = {};
    const logs: any[] = [];

    let responsavel: any = null;
    let resolutionCommentForNotification = "";



    /* =========================================================
       ALTERAÇÃO DE STATUS

       Exige CHANGE_TICKET_STATUS no contexto ativo.
       ========================================================= */

    const requestedStatus = normalizeNullableText(body.status);

    if (requestedStatus && requestedStatus !== chamado.status) {
      const nextStatus = requestedStatus;

      if (!ALLOWED_TICKET_STATUS.includes(nextStatus)) {
        return NextResponse.json(
          { error: "Status informado é inválido." },
          { status: 400 }
        );
      }

      if (!canChangeTicketStatus(user)) {
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

       REGRA:
       O responsável precisa ser:
       - ADMINISTRADORA da mesma administradora do condomínio; ou
       - SÍNDICO do mesmo condomínio do chamado.

       MORADOR / PROPRIETÁRIO não podem ser responsáveis pelo
       atendimento administrativo.
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
        toValue: responsavel.name,
        comment: `Responsável definido: ${responsavel.name}`,
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



    /* =========================================================
       CHAMADO PARA NOTIFICAÇÕES
       ========================================================= */

    const ticketForNotification = await db.ticket.findUnique({
      where: {
        id: chamado.id,
      },
      include: getTicketNotificationInclude(),
    });



    /* =========================================================
       NOTIFICAÇÃO - RESPONSÁVEL ATRIBUÍDO

       Nova regra:
       - responsável recebe notificação operacional;
       - morador/criador recebe notificação amigável informando
         quem acompanhará o chamado.
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

       A resolução cria uma COMMENT_PUBLIC.
       Portanto, o morador/criador também precisa receber
       notificação.
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

       Mantida para avisar o responsável atribuído quando o
       status do chamado mudar.
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
  } catch (error: any) {
    console.error("ERRO AO ATUALIZAR CHAMADO:", error);

    if (error.message === "UNAUTHORIZED") {
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