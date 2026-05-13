import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import {
  canAccessNotifications,
  isAdministradora,
  isMorador,
  isProprietario,
  isSindico,
  isSuperAdmin,
} from "@/lib/access-control";
import { getActiveUserAccessFromCookies } from "@/lib/user-access";
import { NextResponse } from "next/server";



/* =========================================================
   ETAPA 22.3 - API DA CENTRAL DE NOTIFICAÇÕES

   Rota:
   GET /api/notifications

   PATCH /api/notifications

   ETAPA 35.7.7 - FILTRO SEGURO POR CONTEXTO

   Problema anterior:
   - o filtro por metadata direto no Prisma ficou restritivo demais;
   - no contexto PROPRIETARIO/MORADOR, nenhuma notificação retornou.

   Correção:
   - o Prisma filtra apenas:
     usuário, canal, status e vínculo do ticket com o contexto ativo;
   - a separação fina por finalidade da notificação é feita em JS;
   - isso evita incompatibilidades/rigidez de filtro JSON no banco.

   Regra final:

   Contexto MORADOR / PROPRIETARIO:
   - vê notificações públicas do seu chamado;
   - vê respostas públicas;
   - vê responsável definido para seu chamado;
   - não vê notificações de síndico;
   - não vê notificações operacionais de responsável.

   Contexto SINDICO:
   - vê notificações do condomínio;
   - vê atribuições operacionais;
   - não vê a notificação pública específica do morador:
     "Responsável definido para seu chamado".

   ETAPA 40.2 — AUDITORIA DE PERMISSÕES E CONTEXTO ATIVO NAS APIs

   Ajustes desta revisão:
   - Usa helpers da matriz central access-control.
   - Valida explicitamente se existe contexto ativo.
   - Normaliza status recebido na URL.
   - Mantém filtro Prisma por usuário/ticket/contexto.
   - Mantém filtro fino por metadata em JS.
   - Mantém separação correta para usuários com múltiplos contextos.
   ========================================================= */



/* =========================================================
   USUÁRIO COM CONTEXTO ATIVO
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
   HELPERS DE CONTEXTO
   ========================================================= */

function hasActiveAccess(user: any) {
  return !!user?.activeAccess;
}



function isResidentialContext(user: any) {
  return isMorador(user) || isProprietario(user);
}



/* =========================================================
   FILTRO DE STATUS
   ========================================================= */

function normalizeStatus(status?: string | null) {
  const value = String(status || "").trim().toUpperCase();

  if (value === "UNREAD") return "UNREAD";
  if (value === "READ") return "READ";
  if (value === "ARCHIVED") return "ARCHIVED";
  if (value === "ALL") return "ALL";

  return "";
}



function applyStatusFilter(where: any, status: string) {
  if (status === "UNREAD" || status === "READ" || status === "ARCHIVED") {
    where.status = status;
    return;
  }

  if (status === "ALL") {
    return;
  }

  where.status = {
    not: "ARCHIVED",
  };
}



/* =========================================================
   LER METADATA COM SEGURANÇA

   metadata vem como JSON.
   Em alguns casos pode estar null, string ou objeto.
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



/* =========================================================
   FILTRO FINAL DE FINALIDADE POR CONTEXTO

   Aqui separamos notificações do mesmo userId quando o usuário
   tem múltiplos contextos, por exemplo:
   - Síndico + Proprietário;
   - Síndico + Morador.

   Importante:
   A notificação pode pertencer ao mesmo usuário e ao mesmo chamado,
   mas ter finalidade diferente.
   ========================================================= */

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



  /* =========================================================
     CONTEXTO MORADOR / PROPRIETÁRIO

     Deve ver:
     - TICKET_ASSIGNED_PUBLIC
     - TICKET_PUBLIC_COMMENT
     - TICKET_STATUS_CHANGED
     - TICKET_RESOLVED
     - outras notificações públicas do próprio chamado

     Não deve ver:
     - notificações do grupo de síndicos;
     - atribuição operacional;
     - "Você foi atribuído a um chamado".
     ========================================================= */

  if (isResidentialContext(user)) {
    if (notificationScope === "CONDOMINIUM_SYNDICS") {
      return false;
    }

    if (notificationAudience === "SINDICO") {
      return false;
    }

    if (notificationScope === "ASSIGNED_RESPONSIBLE") {
      return false;
    }

    if (notificationGroup === "RESPONSIBLE_OPERATIONAL") {
      return false;
    }

    if (type === "TICKET_ASSIGNED") {
      return false;
    }

    return true;
  }



  /* =========================================================
     CONTEXTO SÍNDICO

     Deve ver:
     - notificações do condomínio;
     - atribuição operacional;
     - chamados abertos no condomínio.

     Não deve ver:
     - notificação pública exclusiva do morador/criador:
       "Responsável definido para seu chamado".
     ========================================================= */

  if (isSindico(user)) {
    if (notificationScope === "ASSIGNED_PUBLIC_TARGETS") {
      return false;
    }

    if (notificationGroup === "PUBLIC_TICKET_OWNER") {
      return false;
    }

    if (type === "TICKET_ASSIGNED_PUBLIC") {
      return false;
    }

    return true;
  }



  /*
    SUPER_ADMIN / ADMINISTRADORA:
    mantêm visão administrativa normal.
  */
  return true;
}



/* =========================================================
   FILTRO POR CONTEXTO ATIVO

   A notificação sempre pertence ao usuário logado.

   Aqui filtramos apenas quando ela está associada a um ticket.

   Regras por contexto:

   SUPER_ADMIN:
   - vê as notificações próprias sem filtro adicional.

   ADMINISTRADORA:
   - ticket precisa pertencer à administradora ativa.

   SÍNDICO:
   - ticket precisa pertencer ao condomínio ativo.

   MORADOR / PROPRIETÁRIO:
   - ticket precisa estar vinculado ao contexto ativo por:
     1. createdByUserId = usuário logado;
     2. residentId = residentId do contexto;
     3. unitId = unitId do contexto;
     4. chamado geral do condomínio ativo.
   ========================================================= */

function getContextNotificationFilter(user: any) {
  if (!hasActiveAccess(user)) {
    return {
      id: "__NO_ACCESS__",
    };
  }

  if (isSuperAdmin(user)) {
    return {};
  }

  if (isAdministradora(user)) {
    if (!user.administratorId) {
      return {
        id: "__NO_ACCESS__",
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

  if (isSindico(user)) {
    if (!user.condominiumId) {
      return {
        id: "__NO_ACCESS__",
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

  if (isResidentialContext(user)) {
    const ticketOrFilters: any[] = [];



    /*
      Se o próprio usuário criou o chamado, ele deve ver
      as notificações públicas do chamado.
    */
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



    /*
      Chamados gerais do condomínio também podem gerar
      notificação ao morador/proprietário.
    */
    if (user.condominiumId) {
      ticketOrFilters.push({
        scope: "CONDOMINIUM",
        condominiumId: user.condominiumId,
      });
    }

    if (ticketOrFilters.length === 0) {
      return {
        id: "__NO_ACCESS__",
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
    id: "__NO_ACCESS__",
  };
}



/* =========================================================
   MONTA WHERE BASE DE NOTIFICAÇÕES

   Aqui NÃO usamos metadata.
   Metadata será filtrado em JS.
   ========================================================= */

function buildNotificationWhere({
  user,
  status,
}: {
  user: any;
  status?: string;
}) {
  const baseWhere: any = {
    userId: user.id,
    channel: "SYSTEM",
  };

  if (status !== undefined) {
    applyStatusFilter(baseWhere, status);
  }

  const contextFilter = getContextNotificationFilter(user);

  if (Object.keys(contextFilter).length === 0) {
    return baseWhere;
  }

  return {
    AND: [baseWhere, contextFilter],
  };
}



/* =========================================================
   MONTA PAYLOAD DO CONTEXTO ATIVO
   ========================================================= */

function buildActiveAccessPayload(user: any) {
  if (!user?.activeAccess) {
    return null;
  }

  return {
    accessId: user.activeAccess.accessId,
    role: user.activeAccess.role,
    label: user.activeAccess.label,
    administratorId: user.activeAccess.administratorId,
    condominiumId: user.activeAccess.condominiumId,
    unitId: user.activeAccess.unitId,
    residentId: user.activeAccess.residentId,
    source: user.activeAccess.source,
  };
}



/* =========================================================
   INCLUDE PADRÃO PARA NOTIFICAÇÕES
   ========================================================= */

const notificationInclude = {
  ticket: {
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      scope: true,

      createdByUserId: true,
      condominiumId: true,
      unitId: true,
      residentId: true,

      condominium: {
        select: {
          id: true,
          name: true,
        },
      },

      unit: {
        select: {
          id: true,
          block: true,
          unitNumber: true,
        },
      },

      resident: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
};



/* =========================================================
   BUSCAR NOTIFICAÇÕES FILTRADAS POR CONTEXTO

   Como o filtro fino é em JS, buscamos uma margem maior
   e depois aplicamos slice(take).
   ========================================================= */

async function findContextNotifications({
  user,
  status,
  take,
}: {
  user: any;
  status: string;
  take: number;
}) {
  const where = buildNotificationWhere({
    user,
    status,
  });

  const rawNotifications = await db.notification.findMany({
    where,
    take: Math.max(take * 5, 50),
    include: notificationInclude,
    orderBy: {
      createdAt: "desc",
    },
  });

  return rawNotifications
    .filter((notification) =>
      notificationBelongsToActiveContext(notification, user)
    )
    .slice(0, take);
}



/* =========================================================
   CONTAR NÃO LIDAS DO CONTEXTO

   Para o MVP, buscamos as não lidas do contexto e contamos
   depois do filtro JS.
   ========================================================= */

async function countUnreadContextNotifications(user: any) {
  const where = buildNotificationWhere({
    user,
    status: "UNREAD",
  });

  const unreadNotifications = await db.notification.findMany({
    where,
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



/* =========================================================
   GET - LISTAR NOTIFICAÇÕES DO USUÁRIO LOGADO
   ========================================================= */

export async function GET(req: Request) {
  try {
    const user: any = await getNotificationContextUser();

    if (!user?.id) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    if (!hasActiveAccess(user)) {
      return NextResponse.json(
        { error: "Nenhum perfil de acesso ativo foi identificado." },
        { status: 403 }
      );
    }

    if (!canAccessNotifications(user)) {
      return NextResponse.json(
        { error: "Usuário sem permissão para acessar notificações." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);

    const status = normalizeStatus(searchParams.get("status"));

    const takeParam = Number(searchParams.get("take") || 20);

    const take =
      Number.isFinite(takeParam) && takeParam > 0 && takeParam <= 100
        ? takeParam
        : 20;



    const [notifications, unreadCount] = await Promise.all([
      findContextNotifications({
        user,
        status,
        take,
      }),

      countUnreadContextNotifications(user),
    ]);



    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        activeAccess: buildActiveAccessPayload(user),
      },

      unreadCount,
      notifications,
    });
  } catch (error: any) {
    console.error("ERRO AO LISTAR NOTIFICAÇÕES:", error);

    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao listar notificações." },
      { status: 500 }
    );
  }
}



/* =========================================================
   PATCH - MARCAR TODAS COMO LIDAS DO CONTEXTO ATIVO
   ========================================================= */

export async function PATCH() {
  try {
    const user: any = await getNotificationContextUser();

    if (!user?.id) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    if (!hasActiveAccess(user)) {
      return NextResponse.json(
        { error: "Nenhum perfil de acesso ativo foi identificado." },
        { status: 403 }
      );
    }

    if (!canAccessNotifications(user)) {
      return NextResponse.json(
        { error: "Usuário sem permissão para alterar notificações." },
        { status: 403 }
      );
    }

    const unreadWhere = buildNotificationWhere({
      user,
      status: "UNREAD",
    });

    const unreadNotifications = await db.notification.findMany({
      where: unreadWhere,
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

    const notificationIdsToMark = unreadNotifications
      .filter((notification) =>
        notificationBelongsToActiveContext(notification, user)
      )
      .map((notification) => notification.id);

    const now = new Date();

    if (notificationIdsToMark.length > 0) {
      await db.notification.updateMany({
        where: {
          id: {
            in: notificationIdsToMark,
          },
        },
        data: {
          status: "READ",
          readAt: now,
        },
      });
    }

    const unreadCount = await countUnreadContextNotifications(user);

    return NextResponse.json({
      success: true,
      message: "Notificações marcadas como lidas.",
      unreadCount,
    });
  } catch (error: any) {
    console.error("ERRO AO MARCAR NOTIFICAÇÕES COMO LIDAS:", error);

    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao marcar notificações como lidas." },
      { status: 500 }
    );
  }
}