import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import { canAccessNotifications } from "@/lib/access-control";
import { getActiveUserAccessFromCookies } from "@/lib/user-access";
import { NextResponse } from "next/server";



/* =========================================================
   ETAPA 24.3 - DESARQUIVAR NOTIFICAÇÃO

   Rota:
   PATCH /api/notifications/[id]/unarchive

   Objetivo:
   Desarquivar uma notificação específica do usuário logado.

   Regras:
   - usuário precisa estar autenticado;
   - usuário só pode desarquivar suas próprias notificações;
   - status volta para READ;
   - não volta para UNREAD, pois já foi tratada;
   - retorna contador atualizado de não lidas.

   ETAPA 26.3:
   Usa a matriz central de permissões.

   Permissão exigida:
   - ACCESS_NOTIFICATIONS

   ETAPA 29.3:
   - Agora respeita o contexto ativo.
   - A notificação precisa pertencer ao usuário logado.
   - Se estiver ligada a um chamado, o chamado precisa pertencer
     ao contexto ativo.
   - Notificações gerais sem ticketId continuam válidas para
     o próprio usuário.

   ETAPA 31.15:
   Revisão final de segurança por contexto nas ações críticas.

   Reforços aplicados:
   - Sem contexto ativo, a rota não desarquiva notificações.
   - Isso evita desarquivar uma notificação de outro vínculo quando
     o usuário possui múltiplos contextos.
   - O mesmo filtro usado para localizar a notificação também é usado
     para recalcular o contador de não lidas.
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
   - continuam disponíveis para o próprio usuário;
   - porém somente quando existe contexto ativo selecionado.

   Sem contexto ativo:
   - bloqueia a alteração para evitar mistura de vínculos.

   SUPER_ADMIN:
   - sem filtro adicional, desde que o contexto ativo seja SUPER_ADMIN.

   ADMINISTRADORA:
   - chamado precisa pertencer à administradora ativa.

   SÍNDICO:
   - chamado precisa pertencer ao condomínio ativo.

   MORADOR / PROPRIETÁRIO:
   - chamado precisa pertencer ao vínculo ativo.
   ========================================================= */

function getContextNotificationFilter(user: any) {
  if (!user?.activeAccess) {
    return {
      id: "__blocked__",
    };
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

    /*
      Chamados gerais do condomínio também podem gerar
      notificação ao morador/proprietário, desde que estejam
      vinculados ao condomínio do contexto ativo.
    */
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
    id: "__blocked__",
  };
}



/* =========================================================
   MONTA WHERE COMPLETO

   Usado para:
   - localizar a notificação individual;
   - calcular contador de não lidas no contexto ativo.

   Importante:
   Se não houver contexto ativo, getContextNotificationFilter()
   retorna id="__blocked__", impedindo alteração indevida.
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
   PATCH - DESARQUIVAR NOTIFICAÇÃO
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
        { error: "Usuário sem permissão para desarquivar notificações." },
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
       CONTEXTO ATIVO OBRIGATÓRIO

       ETAPA 31.15:
       Sem contexto ativo, não desarquivamos notificações.
       O usuário deve selecionar o contexto em /contexto.
       ========================================================= */

    if (!user.activeAccess) {
      return NextResponse.json(
        {
          error:
            "Selecione um contexto de acesso antes de desarquivar notificações.",
        },
        { status: 403 }
      );
    }



    /* =========================================================
       BUSCA NOTIFICAÇÃO DO USUÁRIO LOGADO + CONTEXTO ATIVO

       Importante:
       Sempre filtramos por userId para impedir que um usuário
       desarquive notificação de outro usuário.

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
       DESARQUIVA

       Regra:
       Volta para READ, não para UNREAD.

       Se não estiver arquivada, apenas retorna o estado atual.
       ========================================================= */

    let updatedNotification = notification;

    if (notification.status === "ARCHIVED") {
      updatedNotification = await db.notification.update({
        where: {
          id: notification.id,
        },
        data: {
          status: "READ",
          readAt: notification.readAt || new Date(),
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
      message: "Notificação desarquivada com sucesso.",
      unreadCount,
      notification: updatedNotification,
    });
  } catch (error: any) {
    console.error("ERRO AO DESARQUIVAR NOTIFICAÇÃO:", error);

    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao desarquivar notificação." },
      { status: 500 }
    );
  }
}