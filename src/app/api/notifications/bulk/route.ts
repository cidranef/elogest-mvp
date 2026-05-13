import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import { canAccessNotifications } from "@/lib/access-control";
import { getActiveUserAccessFromCookies } from "@/lib/user-access";
import { NextResponse } from "next/server";



/* =========================================================
   ETAPA 24.5 - AÇÕES EM LOTE NAS NOTIFICAÇÕES

   Rota:
   PATCH /api/notifications/bulk

   Ações aceitas:
   - MARK_READ:
     Marca notificações específicas como lidas.

   - ARCHIVE:
     Arquiva notificações específicas.

   - ARCHIVE_READ:
     Arquiva todas as notificações lidas do usuário logado.

   Regras:
   - usuário precisa estar autenticado;
   - usuário só altera suas próprias notificações;
   - ações afetam apenas canal SYSTEM;
   - retorna contador atualizado de não lidas.

   ETAPA 26.3:
   Usa a matriz central de permissões.

   Permissão exigida:
   - ACCESS_NOTIFICATIONS

   ETAPA 29.3:
   - Agora respeita o contexto ativo.
   - Ações em lote afetam somente notificações do vínculo ativo.
   - Notificações gerais sem ticketId continuam válidas para
     o próprio usuário.
   ========================================================= */



type BulkAction = "MARK_READ" | "ARCHIVE" | "ARCHIVE_READ";



function normalizeIds(value: any): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}



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
   - MARK_READ;
   - ARCHIVE;
   - ARCHIVE_READ;
   - contador de não lidas.

   Mantém sempre:
   - userId do usuário logado;
   - canal SYSTEM;
   - filtro do contexto ativo.
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
   PATCH - AÇÕES EM LOTE
   ========================================================= */

export async function PATCH(req: Request) {
  try {
    const user: any = await getNotificationContextUser();
    const body = await req.json();

    if (!user) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    if (!canAccessNotifications(user)) {
      return NextResponse.json(
        { error: "Usuário sem permissão para executar ações em lote." },
        { status: 403 }
      );
    }

    const action = String(body?.action || "").trim() as BulkAction;
    const ids = normalizeIds(body?.ids);

    if (!action) {
      return NextResponse.json(
        { error: "Ação não informada." },
        { status: 400 }
      );
    }

    if (
      action !== "MARK_READ" &&
      action !== "ARCHIVE" &&
      action !== "ARCHIVE_READ"
    ) {
      return NextResponse.json(
        { error: "Ação inválida." },
        { status: 400 }
      );
    }

    const now = new Date();



    /* =========================================================
       MARK_READ

       Marca como lidas apenas notificações:
       - do usuário logado;
       - canal SYSTEM;
       - contexto ativo;
       - status UNREAD;
       - ids informados.
       ========================================================= */

    if (action === "MARK_READ") {
      if (ids.length === 0) {
        return NextResponse.json(
          { error: "Nenhuma notificação informada." },
          { status: 400 }
        );
      }

      await db.notification.updateMany({
        where: buildNotificationWhere({
          user,
          extraWhere: {
            id: {
              in: ids,
            },
            status: "UNREAD",
          },
        }),
        data: {
          status: "READ",
          readAt: now,
        },
      });
    }



    /* =========================================================
       ARCHIVE

       Arquiva notificações informadas.
       Se alguma estava UNREAD, também define readAt.

       ETAPA 29.3:
       Só arquiva notificações do contexto ativo.
       ========================================================= */

    if (action === "ARCHIVE") {
      if (ids.length === 0) {
        return NextResponse.json(
          { error: "Nenhuma notificação informada." },
          { status: 400 }
        );
      }

      await db.notification.updateMany({
        where: buildNotificationWhere({
          user,
          extraWhere: {
            id: {
              in: ids,
            },
            status: {
              not: "ARCHIVED",
            },
          },
        }),
        data: {
          status: "ARCHIVED",
          readAt: now,
        },
      });
    }



    /* =========================================================
       ARCHIVE_READ

       Arquiva todas as notificações READ do usuário logado
       no contexto ativo.

       Não altera UNREAD.
       Não altera ARCHIVED.
       ========================================================= */

    if (action === "ARCHIVE_READ") {
      await db.notification.updateMany({
        where: buildNotificationWhere({
          user,
          extraWhere: {
            status: "READ",
          },
        }),
        data: {
          status: "ARCHIVED",
          readAt: now,
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
      message: "Ação em lote executada com sucesso.",
      action,
      unreadCount,
    });
  } catch (error: any) {
    console.error("ERRO AO EXECUTAR AÇÃO EM LOTE NAS NOTIFICAÇÕES:", error);

    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao executar ação em lote nas notificações." },
      { status: 500 }
    );
  }
}