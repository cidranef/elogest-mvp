import { db } from "@/lib/db";
import { dispatchNotificationEmail } from "@/lib/notification-dispatcher";
import {
  getNotificationAvailableChannels,
  getNotificationEnabledChannels,
  getNotificationEventConfig,
  getNotificationEventLabel,
  isNotificationExternalReady,
  shouldRespectUserNotificationPreference,
  type NotificationChannel,
  type NotificationEventType,
} from "@/lib/notification-events";
import { isNotificationChannelEnabledForUser } from "@/lib/notification-preferences";



/* =========================================================
   ETAPA 22.7 - CENTRAL DE NOTIFICAÇÕES INTERNAS

   ETAPA 35.7.2 - AJUSTE FINAL DE ATRIBUIÇÃO

   Correção:
   - notifySingleUser agora aceita allowNotifyActor.
   - Por padrão continua NÃO notificando quem executou a ação.
   - Para notificação pública de responsável definido, liberamos
     allowNotifyActor: true para proteger cenários de múltiplos
     contextos, como Síndico + Morador.

   ETAPA 35.7.4 - EVENTO PÚBLICO DE ATRIBUIÇÃO

   Ajuste:
   - TICKET_ASSIGNED continua sendo usado para notificar o
     responsável operacional.
   - TICKET_ASSIGNED_PUBLIC passa a ser usado para notificar
     o morador/criador do chamado.
   - Isso evita que a notificação pública caia como GENERAL.
   - Mantém título e mensagem humanizados para o morador:
     "Responsável definido para seu chamado".

   ETAPA 40.4 — AUDITORIA DAS NOTIFICAÇÕES E CENTRAL DE NOTIFICAÇÕES

   Regra consolidada:
   - COMMENT_INTERNAL / Comunicado interno é ferramenta exclusiva
     de comunicação entre usuários da ADMINISTRADORA.
   - Não notifica SÍNDICO.
   - Não notifica MORADOR.
   - Não notifica PROPRIETÁRIO.
   - Não aparece no portal.
   - Pode notificar usuários ADMINISTRADORA da carteira e SUPER_ADMIN.
   - Se o responsável atribuído for ADMINISTRADORA ou SUPER_ADMIN,
     também pode receber o comentário interno.
   - Se o responsável atribuído for SÍNDICO, ele NÃO recebe
     comentário interno.

   Melhorias desta revisão:
   - Normalização de role com trim().toUpperCase().
   - Metadados de comentário interno agora indicam explicitamente
     internalOnly e notificationGroup ADMIN_INTERNAL_COMMUNICATION.
   - Mantida separação entre:
     1. notificação operacional do responsável;
     2. notificação pública do morador/criador;
     3. notificação interna da administradora.
   ========================================================= */



type NotificationChannelInput = NotificationChannel;

type SendNotificationInput = {
  channel?: NotificationChannelInput;

  userId?: string | null;

  to?: string | null;
  toName?: string | null;

  type?: string;
  title: string;
  message: string;

  ticketId?: string | null;
  href?: string | null;

  metadata?: any;
};



type BasicUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  isActive?: boolean | null;
};

type BasicActor = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
};

type TicketForNotification = {
  id: string;
  title: string;
  condominiumId?: string | null;

  condominium?: {
    id?: string | null;
    name?: string | null;
    administratorId?: string | null;
  } | null;

  resident?: {
    id?: string | null;
    name?: string | null;
    user?: BasicUser | null;
  } | null;

  createdByUser?: BasicUser | null;
  assignedToUser?: BasicUser | null;
};



/* =========================================================
   HELPERS DE PERFIL
   ========================================================= */

function normalizeRole(role?: string | null) {
  return String(role || "").trim().toUpperCase();
}



function isResidentialUser(user?: BasicUser | null) {
  const role = normalizeRole(user?.role);

  return role === "MORADOR" || role === "PROPRIETARIO";
}



function isSyndicUser(user?: BasicUser | null) {
  return normalizeRole(user?.role) === "SINDICO";
}



/* =========================================================
   USUÁRIO ADMINISTRATIVO INTERNO

   Regra importante:
   - Comentário interno é exclusivo da administradora.
   - SÍNDICO não é considerado usuário interno da administradora.
   - MORADOR e PROPRIETÁRIO também não são.
   ========================================================= */

function isInternalAdministrativeUser(user?: BasicUser | null) {
  const role = normalizeRole(user?.role);

  return role === "ADMINISTRADORA" || role === "SUPER_ADMIN";
}



/* =========================================================
   USUÁRIO OPERACIONAL PARA ATRIBUIÇÃO

   Usado para notificação operacional de responsável atribuído.

   Aqui SÍNDICO pode receber notificação operacional quando for
   definido como responsável pelo chamado.

   Isso NÃO se aplica ao COMMENT_INTERNAL.
   ========================================================= */

function isOperationalResponsibleUser(user?: BasicUser | null) {
  const role = normalizeRole(user?.role);

  if (!user?.id) {
    return false;
  }

  if (user.isActive === false) {
    return false;
  }

  if (isResidentialUser(user)) {
    return false;
  }

  return (
    role === "ADMINISTRADORA" ||
    role === "SUPER_ADMIN" ||
    role === "SINDICO"
  );
}



/* =========================================================
   EVENTOS
   ========================================================= */

function normalizeNotificationType(type?: string | null): NotificationEventType {
  const value = String(type || "").trim() as NotificationEventType;

  const config = getNotificationEventConfig(value);

  return config.type || "GENERAL";
}



function buildEventMetadata({
  type,
  requestedChannel,
  metadata,
  userPreference,
}: {
  type: NotificationEventType;
  requestedChannel: NotificationChannel;
  metadata?: any;
  userPreference?: {
    checked: boolean;
    channelAllowed: boolean;
  };
}) {
  const eventConfig = getNotificationEventConfig(type);

  return {
    ...(metadata || {}),

    notificationEvent: {
      type: eventConfig.type,
      label: eventConfig.label,
      description: eventConfig.description,
      requestedChannel,
      enabledChannels: getNotificationEnabledChannels(type),
      availableChannels: getNotificationAvailableChannels(type),
      externalReady: isNotificationExternalReady(type),
      userPreferenceEnabled: shouldRespectUserNotificationPreference(type),
      userPreference: userPreference || {
        checked: false,
        channelAllowed: true,
      },
    },
  };
}



/* =========================================================
   LINK DO CHAMADO POR PERFIL

   Observação:
   - SÍNDICO acessa chamado pelo portal.
   - MORADOR e PROPRIETÁRIO acessam pelo portal.
   - ADMINISTRADORA e SUPER_ADMIN acessam pelo admin.
   ========================================================= */

export function getTicketHrefForUser(targetUser: any, ticketId: string) {
  const role = normalizeRole(targetUser?.role);

  if (role === "MORADOR") {
    return `/portal/chamados/${ticketId}`;
  }

  if (role === "PROPRIETARIO") {
    return `/portal/chamados/${ticketId}`;
  }

  if (role === "SINDICO") {
    return `/portal/chamados/${ticketId}`;
  }

  return `/admin/chamados/${ticketId}`;
}



/* =========================================================
   RESOLVER DESTINATÁRIO
   ========================================================= */

async function resolveNotificationUser(input: SendNotificationInput) {
  if (input.userId) {
    return db.user.findFirst({
      where: {
        id: input.userId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });
  }

  const email = String(input.to || "").trim();

  if (!email) {
    return null;
  }

  return db.user.findFirst({
    where: {
      email,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });
}



/* =========================================================
   CRIAR NOTIFICAÇÃO SYSTEM
   ========================================================= */

async function createSystemNotification(input: SendNotificationInput) {
  const user = await resolveNotificationUser(input);

  if (!user) {
    console.warn("Notificação não criada: usuário destinatário não encontrado.", {
      userId: input.userId || null,
      to: input.to || null,
      title: input.title,
    });

    return null;
  }

  const type = normalizeNotificationType(input.type);

  const systemAllowed = await isNotificationChannelEnabledForUser({
    userId: user.id,
    eventType: type,
    channel: "SYSTEM",
  });

  if (!systemAllowed) {
    console.info("Notificação SYSTEM ignorada por preferência do usuário.", {
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      type,
      title: input.title,
    });

    return null;
  }

  const href =
    input.href ||
    (input.ticketId ? getTicketHrefForUser(user, input.ticketId) : null);

  const requestedChannel = input.channel || "SYSTEM";

  const notification = await db.notification.create({
  data: {
    userId: user.id,
    ticketId: input.ticketId || null,
    channel: "SYSTEM",
    status: "UNREAD",
    type,
    title: input.title,
    message: input.message,
    href,
    metadata: buildEventMetadata({
      type,
      requestedChannel,
      metadata: input.metadata,
      userPreference: {
        checked: true,
        channelAllowed: systemAllowed,
      },
    }),
  },
});



/* =========================================================
   DISPATCH EXTERNO — E-MAIL

   A notificação interna continua sendo a fonte principal.
   O e-mail é enviado em paralelo quando:
   - o evento permite e-mail;
   - o usuário tem e-mail;
   - a preferência do usuário permite;
   - EMAIL_NOTIFICATIONS_ENABLED não está false.

   Falha no e-mail não impede a criação da notificação interna.
   ========================================================= */

void dispatchNotificationEmail({
  userId: user.id,
  to: user.email || input.to || null,
  toName: user.name || input.toName || null,
  type,
  title: input.title,
  message: input.message,
  ticketId: input.ticketId || null,
  href,
  metadata: input.metadata,
}).then((result) => {
  if (!result?.ok) {
    console.error("[EloGest] E-mail de notificação não enviado:", {
      userId: user.id,
      type,
      title: input.title,
      result,
    });
  }
});

return notification;

}



/* =========================================================
   CANAIS EXTERNOS
   ========================================================= */

function isChannelEnabledForEvent({
  type,
  channel,
}: {
  type: NotificationEventType;
  channel: NotificationChannel;
}) {
  const enabledChannels = getNotificationEnabledChannels(type);

  return enabledChannels.includes(channel);
}



/* =========================================================
   ENVIO PRINCIPAL
   ========================================================= */

export async function sendNotification(input: SendNotificationInput) {
  try {
    const channel = input.channel || "SYSTEM";
    const type = normalizeNotificationType(input.type);

    const eventLabel = getNotificationEventLabel(type);

    if (!input.title || !input.message) {
      console.warn("Notificação ignorada: título ou mensagem não informado.", {
        type,
        eventLabel,
        title: input.title,
        message: input.message,
      });

      return null;
    }

    if (channel === "SYSTEM") {
      return await createSystemNotification({
        ...input,
        channel: "SYSTEM",
        type,
      });
    }

    if (channel === "EMAIL" || channel === "WHATSAPP") {
      const channelEnabled = isChannelEnabledForEvent({
        type,
        channel,
      });

      const notification = await createSystemNotification({
        ...input,
        channel,
        type,
        metadata: {
          ...(input.metadata || {}),
          requestedChannel: channel,
          requestedExternalDelivery: true,
          externalChannelEnabledNow: channelEnabled,
          externalDeliveryStatus: channelEnabled
            ? "READY_BUT_PROVIDER_NOT_IMPLEMENTED"
            : "CHANNEL_NOT_ENABLED_FOR_EVENT",
          to: input.to || null,
          toName: input.toName || null,
        },
      });

      console.info(
        `Canal ${channel} ainda não implementado. Evento salvo como SYSTEM quando permitido.`,
        {
          type,
          eventLabel,
          channelEnabled,
          to: input.to || null,
          title: input.title,
        }
      );

      return notification;
    }

    return await createSystemNotification({
      ...input,
      channel: "SYSTEM",
      type,
    });
  } catch (error) {
    console.error("Erro ao criar notificação:", error);

    return null;
  }
}



/* =========================================================
   ENVIA NOTIFICAÇÃO PARA UM USUÁRIO ESPECÍFICO

   allowNotifyActor:
   - false/padrão: não notifica quem executou a ação.
   - true: permite notificar o próprio usuário quando o evento
     tem finalidade diferente, como no caso Síndico + Morador.
   ========================================================= */

export async function notifySingleUser({
  targetUser,
  actorUser,
  notifiedUserIds,
  ticketId,
  type,
  title,
  message,
  href,
  metadata,
  allowNotifyActor = false,
}: {
  targetUser?: BasicUser | null;
  actorUser?: BasicActor | null;
  notifiedUserIds?: Set<string>;
  ticketId?: string | null;
  type: string;
  title: string;
  message: string;
  href?: string | null;
  metadata?: any;
  allowNotifyActor?: boolean;
}) {
  if (!targetUser?.id) return null;

  if (targetUser.isActive === false) {
    return null;
  }

  if (!allowNotifyActor && actorUser?.id && targetUser.id === actorUser.id) {
    return null;
  }

  if (notifiedUserIds?.has(targetUser.id)) {
    return null;
  }

  notifiedUserIds?.add(targetUser.id);

  return sendNotification({
    channel: "SYSTEM",
    userId: targetUser.id,
    to: targetUser.email || null,
    toName: targetUser.name || null,
    ticketId,
    type,
    title,
    message,
    href: href || (ticketId ? getTicketHrefForUser(targetUser, ticketId) : null),
    metadata,
  });
}



/* =========================================================
   NOTIFICAR ADMINISTRADORA / SUPER_ADMIN
   ========================================================= */

export async function notifyAdministradoraUsers({
  administratorId,
  actorUser,
  notifiedUserIds,
  ticketId,
  type,
  title,
  message,
  metadata,
}: {
  administratorId?: string | null;
  actorUser?: BasicActor | null;
  notifiedUserIds?: Set<string>;
  ticketId?: string | null;
  type: string;
  title: string;
  message: string;
  metadata?: any;
}) {
  if (!administratorId) {
    console.warn("notifyAdministradoraUsers: administratorId não informado.", {
      ticketId,
      type,
      actorUserId: actorUser?.id || null,
      actorUserName: actorUser?.name || null,
    });

    return [];
  }

  const users = await db.user.findMany({
    where: {
      isActive: true,
      OR: [
        {
          role: "ADMINISTRADORA",
          administratorId,
        },
        {
          role: "SUPER_ADMIN",
        },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      administratorId: true,
      isActive: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  const createdNotifications = [];

  for (const targetUser of users) {
    const notification = await notifySingleUser({
      targetUser,
      actorUser,
      notifiedUserIds,
      ticketId,
      type,
      title,
      message,
      metadata: {
        ...(metadata || {}),
        administratorId,
        notificationScope: "ADMINISTRADORA_USERS",
      },
    });

    if (notification) {
      createdNotifications.push(notification);
    }
  }

  return createdNotifications;
}



/* =========================================================
   NOTIFICAR SÍNDICOS DO CONDOMÍNIO

   Usado para notificações operacionais do portal/condomínio,
   não para comunicado interno da administradora.
   ========================================================= */

export async function notifyCondominiumSyndics({
  condominiumId,
  actorUser,
  notifiedUserIds,
  ticketId,
  type,
  title,
  message,
  metadata,
}: {
  condominiumId?: string | null;
  actorUser?: BasicActor | null;
  notifiedUserIds?: Set<string>;
  ticketId?: string | null;
  type: string;
  title: string;
  message: string;
  metadata?: any;
}) {
  if (!condominiumId) {
    console.warn("notifyCondominiumSyndics: condominiumId não informado.", {
      ticketId,
      type,
      actorUserId: actorUser?.id || null,
      actorUserName: actorUser?.name || null,
    });

    return [];
  }

  const [legacySyndics, accessSyndics] = await Promise.all([
    db.user.findMany({
      where: {
        isActive: true,
        role: "SINDICO",
        condominiumId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
      orderBy: {
        name: "asc",
      },
    }),

    db.userAccess.findMany({
      where: {
        isActive: true,
        role: "SINDICO",
        condominiumId,
        user: {
          isActive: true,
        },
      },
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
      orderBy: {
        createdAt: "asc",
      },
    }),
  ]);

  const usersMap = new Map<string, BasicUser>();

  for (const user of legacySyndics) {
    usersMap.set(user.id, user);
  }

  for (const access of accessSyndics) {
    if (access.user?.id) {
      usersMap.set(access.user.id, access.user);
    }
  }

  const users = Array.from(usersMap.values());

  const createdNotifications = [];

  for (const targetUser of users) {
    const notification = await notifySingleUser({
      targetUser,
      actorUser,
      notifiedUserIds,
      ticketId,
      type,
      title,
      message,
      metadata: {
        ...(metadata || {}),
        condominiumId,
        notificationScope: "CONDOMINIUM_SYNDICS",
      },
    });

    if (notification) {
      createdNotifications.push(notification);
    }
  }

  return createdNotifications;
}



/* =========================================================
   NOTIFICAR ALVOS PÚBLICOS DO CHAMADO

   Usado para:
   - resposta pública;
   - resolução;
   - mensagens públicas destinadas ao criador/morador.

   Observação:
   Por padrão, não notifica quem executou a ação.
   ========================================================= */

export async function notifyTicketPublicTargets({
  ticket,
  actorUser,
  type,
  title,
  message,
  metadata,
}: {
  ticket: TicketForNotification;
  actorUser?: BasicActor | null;
  type: string;
  title: string;
  message: string;
  metadata?: any;
}) {
  const notifiedUserIds = new Set<string>();
  const createdNotifications = [];

  const possibleTargets = [
    ticket.createdByUser || null,
    ticket.resident?.user || null,
  ].filter(Boolean) as BasicUser[];

  for (const targetUser of possibleTargets) {
    const notification = await notifySingleUser({
      targetUser,
      actorUser,
      notifiedUserIds,
      ticketId: ticket.id,
      type,
      title,
      message,
      metadata: {
        ...(metadata || {}),
        ticketTitle: ticket.title,
        condominiumName: ticket.condominium?.name || null,
        notificationScope: "TICKET_PUBLIC_TARGETS",
      },
    });

    if (notification) {
      createdNotifications.push(notification);
    }
  }

  return createdNotifications;
}



/* =========================================================
   NOTIFICAR ALVOS INTERNOS DO CHAMADO

   COMMENT_INTERNAL / Comunicado interno:
   - comunicação exclusiva entre usuários da ADMINISTRADORA;
   - notifica ADMINISTRADORA da carteira;
   - notifica SUPER_ADMIN;
   - se o responsável atribuído for ADMINISTRADORA ou SUPER_ADMIN,
     também pode ser notificado;
   - não notifica SÍNDICO;
   - não notifica MORADOR;
   - não notifica PROPRIETÁRIO;
   - evita duplicidade;
   - evita notificar quem executou a ação.
   ========================================================= */

export async function notifyTicketInternalTargets({
  ticket,
  actorUser,
  type,
  title,
  message,
  metadata,
}: {
  ticket: TicketForNotification;
  actorUser?: BasicActor | null;
  type: string;
  title: string;
  message: string;
  metadata?: any;
}) {
  const notifiedUserIds = new Set<string>();
  const createdNotifications = [];

  const administratorId = ticket.condominium?.administratorId || null;

  const adminNotifications = await notifyAdministradoraUsers({
    administratorId,
    actorUser,
    notifiedUserIds,
    ticketId: ticket.id,
    type,
    title,
    message,
    metadata: {
      ...(metadata || {}),
      ticketTitle: ticket.title,
      condominiumName: ticket.condominium?.name || null,
      notificationScope: "INTERNAL_COMMENT_ADMIN_USERS",
      notificationGroup: "ADMIN_INTERNAL_COMMUNICATION",
      internalOnly: true,
    },
  });

  createdNotifications.push(...adminNotifications);



  /* =========================================================
     RESPONSÁVEL ATRIBUÍDO

     Só recebe comunicado interno se também for usuário interno
     da administradora:
     - ADMINISTRADORA
     - SUPER_ADMIN

     SÍNDICO não recebe comunicado interno.
     ========================================================= */

  if (
    ticket.assignedToUser &&
    isInternalAdministrativeUser(ticket.assignedToUser)
  ) {
    const notification = await notifySingleUser({
      targetUser: ticket.assignedToUser,
      actorUser,
      notifiedUserIds,
      ticketId: ticket.id,
      type,
      title,
      message,
      metadata: {
        ...(metadata || {}),
        ticketTitle: ticket.title,
        condominiumName: ticket.condominium?.name || null,
        assignedToUserId: ticket.assignedToUser.id,
        assignedToUserName: ticket.assignedToUser.name || null,
        notificationScope: "INTERNAL_COMMENT_ASSIGNED_ADMIN_USER",
        notificationGroup: "ADMIN_INTERNAL_COMMUNICATION",
        internalOnly: true,
      },
    });

    if (notification) {
      createdNotifications.push(notification);
    }
  }

  return createdNotifications;
}



/* =========================================================
   NOTIFICAR RESPONSÁVEL ATRIBUÍDO

   Notificação operacional:
   - usada para quem foi definido como responsável;
   - pode ir para ADMINISTRADORA, SUPER_ADMIN ou SÍNDICO;
   - não deve ir para MORADOR/PROPRIETÁRIO como responsável
     operacional;
   - não substitui comunicado interno.
   ========================================================= */

export async function notifyAssignedResponsible({
  ticket,
  assignedUser,
  actorUser,
  notifiedUserIds,
  type = "TICKET_ASSIGNED",
  title = "Você foi atribuído a um chamado",
  metadata,
}: {
  ticket: TicketForNotification;
  assignedUser?: BasicUser | null;
  actorUser?: BasicActor | null;
  notifiedUserIds?: Set<string>;
  type?: string;
  title?: string;
  metadata?: any;
}) {
  if (!assignedUser?.id) return null;

  if (!isOperationalResponsibleUser(assignedUser)) {
    return null;
  }

  const message = `Você foi definido como responsável pelo chamado "${ticket.title}".`;

  return notifySingleUser({
    targetUser: assignedUser,
    actorUser,
    notifiedUserIds,
    ticketId: ticket.id,
    type,
    title,
    message,
    metadata: {
      ...(metadata || {}),
      ticketTitle: ticket.title,
      condominiumName: ticket.condominium?.name || null,
      assignedToUserId: assignedUser.id,
      assignedToUserName: assignedUser.name || null,
      notificationScope: "ASSIGNED_RESPONSIBLE",
      notificationGroup: "RESPONSIBLE_OPERATIONAL",
    },
  });
}



/* =========================================================
   NOTIFICAR MORADOR/CRIADOR SOBRE RESPONSÁVEL DEFINIDO

   Notificação pública:
   - usada para informar ao morador/criador quem acompanhará
     o chamado;
   - usa evento TICKET_ASSIGNED_PUBLIC;
   - permite notificar o próprio usuário quando ele tem múltiplos
     contextos, por exemplo Síndico + Morador.
   ========================================================= */

export async function notifyTicketAssignedPublicTargets({
  ticket,
  assignedUser,
  actorUser,
  notifiedUserIds,
  type = "TICKET_ASSIGNED_PUBLIC",
  title = "Responsável definido para seu chamado",
  metadata,
}: {
  ticket: TicketForNotification;
  assignedUser?: BasicUser | null;
  actorUser?: BasicActor | null;
  notifiedUserIds?: Set<string>;
  type?: string;
  title?: string;
  metadata?: any;
}) {
  const createdNotifications = [];

  const assignedName = assignedUser?.name || "um responsável";

  const message = `${assignedName} acompanhará o chamado "${ticket.title}".`;

  const possibleTargets = [
    ticket.createdByUser || null,
    ticket.resident?.user || null,
  ].filter(Boolean) as BasicUser[];

  for (const targetUser of possibleTargets) {
    const notification = await notifySingleUser({
      targetUser,
      actorUser,
      notifiedUserIds,
      ticketId: ticket.id,
      type,
      title,
      message,
      allowNotifyActor: true,
      metadata: {
        ...(metadata || {}),
        ticketTitle: ticket.title,
        condominiumName: ticket.condominium?.name || null,
        assignedToUserId: assignedUser?.id || null,
        assignedToUserName: assignedUser?.name || null,
        notificationScope: "ASSIGNED_PUBLIC_TARGETS",
        notificationGroup: "PUBLIC_TICKET_OWNER",
        allowNotifyActorReason:
          "Permite notificar usuário com múltiplos contextos, como Síndico + Morador.",
      },
    });

    if (notification) {
      createdNotifications.push(notification);
    }
  }

  return createdNotifications;
}



/* =========================================================
   NOTIFICAR ATRIBUIÇÃO COMPLETA

   Cria duas notificações separadas:

   1. Operacional:
      - para o responsável atribuído;
      - TICKET_ASSIGNED.

   2. Pública:
      - para o morador/criador;
      - TICKET_ASSIGNED_PUBLIC.

   Sets separados:
   - permitem que o mesmo usuário receba as duas notificações
     quando atua em contextos diferentes.
   ========================================================= */

export async function notifyTicketAssignedTargets({
  ticket,
  assignedUser,
  actorUser,
  typeResponsible = "TICKET_ASSIGNED",
  typePublic = "TICKET_ASSIGNED_PUBLIC",
  metadata,
}: {
  ticket: TicketForNotification;
  assignedUser?: BasicUser | null;
  actorUser?: BasicActor | null;
  typeResponsible?: string;
  typePublic?: string;
  metadata?: any;
}) {
  const responsibleNotifiedUserIds = new Set<string>();
  const publicNotifiedUserIds = new Set<string>();

  const createdNotifications = [];



  /* =========================================================
     1. NOTIFICAÇÃO OPERACIONAL DO RESPONSÁVEL

     Exemplo:
     "Você foi atribuído a um chamado"
     ========================================================= */

  const responsibleNotification = await notifyAssignedResponsible({
    ticket,
    assignedUser,
    actorUser,
    notifiedUserIds: responsibleNotifiedUserIds,
    type: typeResponsible,
    title: "Você foi atribuído a um chamado",
    metadata: {
      ...(metadata || {}),
      notificationGroup: "RESPONSIBLE_OPERATIONAL",
    },
  });

  if (responsibleNotification) {
    createdNotifications.push(responsibleNotification);
  }



  /* =========================================================
     2. NOTIFICAÇÃO PÚBLICA DO MORADOR/CRIADOR

     Exemplo:
     "Responsável definido para seu chamado"

     Usa Set separado para permitir o caso Síndico + Morador:
     o mesmo usuário pode receber uma notificação operacional
     e uma notificação pública.
   ========================================================= */

  const publicNotifications = await notifyTicketAssignedPublicTargets({
    ticket,
    assignedUser,
    actorUser,
    notifiedUserIds: publicNotifiedUserIds,
    type: typePublic,
    title: "Responsável definido para seu chamado",
    metadata: {
      ...(metadata || {}),
      notificationGroup: "PUBLIC_TICKET_OWNER",
      publicNotificationReason:
        "Morador/criador deve saber quem acompanhará o chamado.",
    },
  });

  createdNotifications.push(...publicNotifications);

  return createdNotifications;
}



/* =========================================================
   COMPATIBILIDADE COM CHAMADAS ANTIGAS
   ========================================================= */

export async function sendTicketNotification({
  userId,
  to,
  toName,
  ticketId,
  type,
  title,
  message,
  href,
  metadata,
}: {
  userId?: string | null;
  to?: string | null;
  toName?: string | null;
  ticketId: string;
  type: string;
  title: string;
  message: string;
  href?: string | null;
  metadata?: any;
}) {
  return sendNotification({
    channel: "SYSTEM",
    userId,
    to,
    toName,
    ticketId,
    type,
    title,
    message,
    href: href || `/admin/chamados/${ticketId}`,
    metadata,
  });
}