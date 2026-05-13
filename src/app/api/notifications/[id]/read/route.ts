import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import { canAccessNotifications } from "@/lib/access-control";
import { getActiveUserAccessFromCookies } from "@/lib/user-access";
import { NextResponse } from "next/server";



/* =========================================================
   ETAPA 22.5 - MARCAR NOTIFICAÇÃO COMO LIDA

   Rota:
   PATCH /api/notifications/[id]/read

   Objetivo:
   Marcar uma notificação específica como lida.

   Regras:
   - usuário precisa estar autenticado;
   - usuário só pode alterar suas próprias notificações;
   - se já estiver lida, mantém como lida;
   - se estiver arquivada, não volta para lida por esta rota;
   - retorna contador atualizado de não lidas.

   ETAPA 26.3:
   Usa matriz central de permissões.

   Permissão exigida:
   - ACCESS_NOTIFICATIONS

   ETAPA 29.3:
   - Agora respeita o contexto ativo.
   - A notificação precisa pertencer ao usuário logado.
   - Se estiver ligada a um chamado, o chamado precisa pertencer
     ao contexto ativo.
   - Notificações gerais sem ticketId continuam válidas para
     o próprio usuário.
   ========================================================= */



type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};



/* =========================================================
   USUÁRIO COM CONTEXTO ATIVO

   A sessão base identifica quem está logado.
   O contexto ativo define com qual vínculo ele está operando.
   ========================================================= */

async function getNotificationContextUser() {
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
   FILTRO POR CONTEXTO ATIVO

   A notificação sempre pertence ao usuário logado.

   Aqui filtramos apenas quando ela está associada a um ticket.

   Notificações sem ticketId:
   - continuam disponíveis para o próprio usuário.

   SUPER_ADMIN:
   - sem filtro adicional.

   ADMINISTRADORA:
   - chamado precisa pertencer à administradora ativa.

   SÍNDICO:
   - chamado precisa pertencer ao condomínio ativo.

   MORADOR / PROPRIETÁRIO:
   - chamado precisa pertencer ao vínculo ativo.
   ========================================================= */

function getContextNotificationFilter(user: any) {
  if (!user?.activeAccess) {
    return {};
  }

  if (user.role === "SUPER_ADMIN") {
    return {};
  }

  if (user.role === "ADMINISTRADORA") {
    if (!user.administratorId) {
      return {
        id: "__blocked__",
      };
    }

    return {
      OR: [
        {
          ticketId: null,
        },
        {
          ticket: {
            condominium: {
              administratorId: user.administratorId,
            },
          },
        },
      ],
    };
  }

  if (user.role === "SINDICO") {
    if (!user.condominiumId) {
      return {
        id: "__blocked__",
      };
    }

    return {
      OR: [
        {
          ticketId: null,
        },
        {
          ticket: {
            condominiumId: user.condominiumId,
          },
        },
      ],
    };
  }

  if (user.role === "MORADOR" || user.role === "PROPRIETARIO") {
    const ticketOrFilters: any[] = [];

    if (user.residentId) {
      ticketOrFilters.push({
        residentId: user.residentId,
      });
    }

    if (user.unitId) {
      ticketOrFilters.push({
        unitId: user.unitId,
      });
    }

    if (user.condominiumId) {
      ticketOrFilters.push({
        scope: "CONDOMINIUM",
        condominiumId: user.condominiumId,
      });
    }

    if (ticketOrFilters.length === 0) {
      return {
        id: "__blocked__",
      };
    }

    return {
      OR: [
        {
          ticketId: null,
        },
        {
          ticket: {
            OR: ticketOrFilters,
          },
        },
      ],
    };
  }

  return {
    OR: [
      {
        ticketId: null,
      },
    ],
  };
}



/* =========================================================
   MONTA WHERE COMPLETO

   Usado para:
   - localizar a notificação individual;
   - calcular contador de não lidas no contexto ativo.
   ========================================================= */

function buildNotificationWhere({
  user,
  extraWhere = {},
}: {
  user: any;
  extraWhere?: any;
}) {
  const baseWhere: any = {
    userId: user.id,
    channel: "SYSTEM",
    ...extraWhere,
  };

  const contextFilter = getContextNotificationFilter(user);

  if (Object.keys(contextFilter).length === 0) {
    return baseWhere;
  }

  return {
    AND: [baseWhere, contextFilter],
  };
}



/* =========================================================
   PATCH - MARCAR COMO LIDA
   ========================================================= */

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const user: any = await getNotificationContextUser();
    const { id } = await context.params;

    if (!user) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    if (!canAccessNotifications(user)) {
      return NextResponse.json(
        { error: "Usuário sem permissão para alterar notificações." },
        { status: 403 }
      );
    }

    if (!id) {
      return NextResponse.json(
        { error: "ID da notificação não informado." },
        { status: 400 }
      );
    }



    /* =========================================================
       BUSCA NOTIFICAÇÃO DO USUÁRIO LOGADO + CONTEXTO ATIVO

       Importante:
       Sempre filtramos por userId para impedir que um usuário
       altere notificação de outro usuário.

       ETAPA 29.3:
       Também filtramos pelo contexto ativo.
       ========================================================= */

    const notification = await db.notification.findFirst({
      where: buildNotificationWhere({
        user,
        extraWhere: {
          id,
        },
      }),
    });

    if (!notification) {
      return NextResponse.json(
        { error: "Notificação não encontrada ou acesso negado." },
        { status: 404 }
      );
    }



    /* =========================================================
       ATUALIZA STATUS

       Se já estiver READ ou ARCHIVED, não forçamos voltar.
       Apenas retornamos o estado atual.
       ========================================================= */

    let updatedNotification = notification;

    if (notification.status === "UNREAD") {
      updatedNotification = await db.notification.update({
        where: {
          id: notification.id,
        },
        data: {
          status: "READ",
          readAt: new Date(),
        },
      });
    }



    /* =========================================================
       CONTADOR DE NÃO LIDAS NO CONTEXTO ATIVO
       ========================================================= */

    const unreadCount = await db.notification.count({
      where: buildNotificationWhere({
        user,
        extraWhere: {
          status: "UNREAD",
        },
      }),
    });



    return NextResponse.json({
      success: true,
      message: "Notificação marcada como lida.",
      unreadCount,
      notification: updatedNotification,
    });
  } catch (error: any) {
    console.error("ERRO AO MARCAR NOTIFICAÇÃO COMO LIDA:", error);

    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao marcar notificação como lida." },
      { status: 500 }
    );
  }
}