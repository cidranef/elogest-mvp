import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import { canAccessNotifications } from "@/lib/access-control";
import {
  getActiveUserAccessFromCookies,
  type ActiveUserAccess,
} from "@/lib/user-access";
import { NextResponse } from "next/server";


/* =========================================================
   ETAPA 43 - AÇÕES EM LOTE NAS NOTIFICAÇÕES

   Rota:
   PATCH /api/notifications/bulk

   Ações aceitas:
   - MARK_READ
   - ARCHIVE
   - ARCHIVE_READ

   Regras:
   - usuário precisa estar autenticado;
   - exige perfil ativo;
   - usuário só altera suas próprias notificações;
   - ações afetam apenas canal SYSTEM;
   - filtro de contexto usa o perfil ativo;
   - filtro fino por metadata preserva separação Síndico x Morador.
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
   ========================================================= */

async function getNotificationContextUser() {
  const sessionUser: any = await getAuthUser();

  if (!sessionUser?.id) {
    throw new Error("UNAUTHORIZED");
  }

  const activeAccess: ActiveUserAccess | null = await getActiveUserAccessFromCookies({
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

  if (user.role === "SINDICO" || user.role === "CONSELHEIRO") {
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

    ticketOrFilters.push({
      createdByUserId: user.id,
    });

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
    id: "__blocked__",
  };
}



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
   FILTRO FINO POR FINALIDADE DA NOTIFICAÇÃO

   Mantém a separação correta quando o mesmo usuário possui
   múltiplos perfis, por exemplo Síndico + Morador/Proprietário.
   ========================================================= */

function getMetadata(notification: any) {
  const metadata = notification?.metadata;

  if (!metadata) {
    return {};
  }

  if (typeof metadata === "string") {
    try {
      return JSON.parse(metadata);
    } catch {
      return {};
    }
  }

  if (typeof metadata === "object") {
    return metadata;
  }

  return {};
}



function getMetadataValue(notification: any, key: string) {
  const metadata = getMetadata(notification);
  const value = metadata?.[key];

  if (value === undefined || value === null) {
    return "";
  }

  return String(value);
}



function notificationBelongsToActiveContext(notification: any, user: any) {
  const type = String(notification?.type || "");

  const notificationScope = getMetadataValue(
    notification,
    "notificationScope"
  );

  const notificationGroup = getMetadataValue(
    notification,
    "notificationGroup"
  );

  const notificationAudience = getMetadataValue(
    notification,
    "notificationAudience"
  );

  if (user.role === "MORADOR" || user.role === "PROPRIETARIO") {
    if (notificationScope === "CONDOMINIUM_SYNDICS") return false;
    if (notificationAudience === "SINDICO") return false;
    if (notificationScope === "ASSIGNED_RESPONSIBLE") return false;
    if (notificationGroup === "RESPONSIBLE_OPERATIONAL") return false;
    if (type === "TICKET_ASSIGNED") return false;

    return true;
  }

  if (user.role === "SINDICO" || user.role === "CONSELHEIRO") {
    if (notificationScope === "ASSIGNED_PUBLIC_TARGETS") return false;
    if (notificationGroup === "PUBLIC_TICKET_OWNER") return false;
    if (type === "TICKET_ASSIGNED_PUBLIC") return false;

    return true;
  }

  return true;
}



async function countUnreadContextNotifications(user: any) {
  const unreadNotifications = await db.notification.findMany({
    where: buildNotificationWhere({
      user,
      extraWhere: {
        status: "UNREAD",
      },
    }),
    take: 500,
    select: {
      id: true,
      type: true,
      metadata: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return unreadNotifications.filter((notification) =>
    notificationBelongsToActiveContext(notification, user)
  ).length;
}




async function getFilteredNotificationIds({
  user,
  extraWhere,
  take = 1000,
}: {
  user: any;
  extraWhere: any;
  take?: number;
}) {
  const notifications = await db.notification.findMany({
    where: buildNotificationWhere({
      user,
      extraWhere,
    }),
    take,
    select: {
      id: true,
      type: true,
      metadata: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return notifications
    .filter((notification) => notificationBelongsToActiveContext(notification, user))
    .map((notification) => notification.id);
}



/* =========================================================
   PATCH - AÇÕES EM LOTE
   ========================================================= */

export async function PATCH(req: Request) {
  try {
    const user: any = await getNotificationContextUser();
    const body = await req.json();

    if (!user?.id) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    if (!user.activeAccess) {
      return NextResponse.json(
        { error: "Selecione um perfil de acesso antes de alterar notificações." },
        { status: 403 }
      );
    }

    if (!canAccessNotifications(user.activeAccess || user)) {
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

    if (action === "MARK_READ") {
      if (ids.length === 0) {
        return NextResponse.json(
          { error: "Nenhuma notificação informada." },
          { status: 400 }
        );
      }

      const safeIds = await getFilteredNotificationIds({
        user,
        extraWhere: {
          id: {
            in: ids,
          },
          status: "UNREAD",
        },
      });

      if (safeIds.length > 0) {
        await db.notification.updateMany({
          where: {
            id: {
              in: safeIds,
            },
          },
          data: {
            status: "READ",
            readAt: now,
          },
        });
      }
    }

    if (action === "ARCHIVE") {
      if (ids.length === 0) {
        return NextResponse.json(
          { error: "Nenhuma notificação informada." },
          { status: 400 }
        );
      }

      const safeIds = await getFilteredNotificationIds({
        user,
        extraWhere: {
          id: {
            in: ids,
          },
          status: {
            not: "ARCHIVED",
          },
        },
      });

      if (safeIds.length > 0) {
        await db.notification.updateMany({
          where: {
            id: {
              in: safeIds,
            },
          },
          data: {
            status: "ARCHIVED",
            readAt: now,
          },
        });
      }
    }

    if (action === "ARCHIVE_READ") {
      const safeIds = await getFilteredNotificationIds({
        user,
        extraWhere: {
          status: "READ",
        },
      });

      if (safeIds.length > 0) {
        await db.notification.updateMany({
          where: {
            id: {
              in: safeIds,
            },
          },
          data: {
            status: "ARCHIVED",
            readAt: now,
          },
        });
      }
    }

    const unreadCount = await countUnreadContextNotifications(user);

    return NextResponse.json({
      success: true,
      message: "Ação em lote executada com sucesso.",
      action,
      unreadCount,
    });
  } catch (error: unknown) {
    console.error("ERRO AO EXECUTAR AÇÃO EM LOTE NAS NOTIFICAÇÕES:", error);

    if (error instanceof Error && error.message === "UNAUTHORIZED") {
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
