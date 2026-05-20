import { db } from "@/lib/db";
import {
  dispatchNotificationEmail,
  dispatchNotificationWhatsApp,
} from "@/lib/notification-dispatcher";
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

   ETAPA 42.10.5 — USER.PHONE PARA WHATSAPP

   Ajustes desta revisão:
   - resolveNotificationUser() agora busca phone do User.
   - notifyAdministradoraUsers() agora busca phone do User.
   - notifyCondominiumSyndics() agora busca phone do User.
   - BasicUser passa a aceitar phoneOptInAt / phoneOptOutAt.
   - resolveWhatsAppPhone() mantém prioridade:
       1. input.toPhone
       2. metadata.toPhone / whatsappPhone / phone / celular
       3. User.phone
       4. Resident.phone
   - Com isso, TICKET_CREATED pode disparar WhatsApp dev para
     administradora, atendimento, síndico e super admin quando
     esses usuários possuírem User.phone.
   ========================================================= */



type NotificationChannelInput = NotificationChannel;

type SendNotificationInput = {
  channel?: NotificationChannelInput;

  userId?: string | null;

  to?: string | null;
  toName?: string | null;
  toPhone?: string | null;

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

  phone?: string | null;
  phoneVerifiedAt?: Date | string | null;
  phoneOptInAt?: Date | string | null;
  phoneOptOutAt?: Date | string | null;

  phoneNumber?: string | null;
  mobilePhone?: string | null;
  cellphone?: string | null;
  celular?: string | null;
  whatsapp?: string | null;
  whatsappPhone?: string | null;
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
    phone?: string | null;
    phoneNumber?: string | null;
    mobilePhone?: string | null;
    cellphone?: string | null;
    celular?: string | null;
    whatsapp?: string | null;
    whatsappPhone?: string | null;
    user?: BasicUser | null;
  } | null;

  createdByUser?: BasicUser | null;
  assignedToUser?: BasicUser | null;
};



/* =========================================================
   SELECT PADRÃO DE USUÁRIO PARA NOTIFICAÇÕES

   Importante:
   Todos os fluxos que podem disparar WhatsApp precisam carregar
   User.phone. Caso contrário, o dispatcher entende que o usuário
   não possui telefone e faz skip silencioso.
   ========================================================= */

const userNotificationSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  phone: true,
  phoneVerifiedAt: true,
  phoneOptInAt: true,
  phoneOptOutAt: true,
} as const;



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



function isInternalAdministrativeUser(user?: BasicUser | null) {
  const role = normalizeRole(user?.role);

  return role === "ADMINISTRADORA" || role === "SUPER_ADMIN";
}



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
   TELEFONE PARA WHATSAPP

   Ordem de busca:
   1. input.toPhone;
   2. metadata.toPhone / whatsappPhone / phone / celular;
   3. User.phone;
   4. Resident.phone.
   ========================================================= */

function getValueAsString(value: unknown) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  return trimmed || null;
}



function extractPhoneFromAny(source: any) {
  if (!source) return null;

  return (
    getValueAsString(source.toPhone) ||
    getValueAsString(source.whatsappPhone) ||
    getValueAsString(source.whatsapp) ||
    getValueAsString(source.phone) ||
    getValueAsString(source.phoneNumber) ||
    getValueAsString(source.mobilePhone) ||
    getValueAsString(source.cellphone) ||
    getValueAsString(source.celular) ||
    null
  );
}



function resolveWhatsAppPhone({
  inputPhone,
  user,
  resident,
  metadata,
}: {
  inputPhone?: string | null;
  user?: BasicUser | null;
  resident?: TicketForNotification["resident"];
  metadata?: any;
}) {
  return (
    getValueAsString(inputPhone) ||
    extractPhoneFromAny(metadata) ||
    extractPhoneFromAny(user) ||
    extractPhoneFromAny(resident) ||
    null
  );
}



/* =========================================================
   WHATSAPP DEV — DISPARO AUTOMÁTICO CONTROLADO
   ========================================================= */

const WHATSAPP_DEV_AUTO_EVENTS = new Set<NotificationEventType>([
  "TICKET_CREATED",
  "TICKET_PUBLIC_COMMENT",
  "TICKET_ASSIGNED_PUBLIC",
  "TICKET_RESOLVED",
]);



function isWhatsAppAutoDispatchEnabled() {
  if (process.env.WHATSAPP_AUTO_DISPATCH_ENABLED !== "true") {
    return false;
  }

  const provider = process.env.WHATSAPP_PROVIDER || "dev";

  if (process.env.NODE_ENV === "production" && provider === "dev") {
    return false;
  }

  return true;
}



function shouldAutoDispatchWhatsApp(type: NotificationEventType) {
  if (!isWhatsAppAutoDispatchEnabled()) {
    return false;
  }

  return WHATSAPP_DEV_AUTO_EVENTS.has(type);
}



/* =========================================================
   LINK DO CHAMADO POR PERFIL
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
      select: userNotificationSelect,
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
    select: userNotificationSelect,
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



  /* =========================================================
     DISPATCH EXTERNO — WHATSAPP DEV CONTROLADO

     Agora User.phone é carregado no select do usuário.
     ========================================================= */

  if (shouldAutoDispatchWhatsApp(type)) {
    const whatsAppPhone = resolveWhatsAppPhone({
      inputPhone: input.toPhone || null,
      user: user as BasicUser,
      metadata: input.metadata,
    });

    void dispatchNotificationWhatsApp({
      userId: user.id,
      toPhone: whatsAppPhone,
      toName: user.name || input.toName || null,
      type,
      title: input.title,
      message: input.message,
      ticketId: input.ticketId || null,
      href,
      metadata: {
        ...(input.metadata || {}),
        toPhone: whatsAppPhone,
      },
    }).then((result) => {
      if (!result?.ok && !result?.skipped) {
        console.error("[EloGest] WhatsApp dev de notificação não processado:", {
          userId: user.id,
          type,
          title: input.title,
          result,
        });
      }
    });
  }

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
            ? channel === "WHATSAPP"
              ? "READY_FOR_DEV_DISPATCH_AUTO_CONTROLLED"
              : "READY_FOR_EMAIL_DISPATCH"
            : "CHANNEL_NOT_ENABLED_FOR_EVENT",
          to: input.to || null,
          toName: input.toName || null,
          toPhone: input.toPhone || input.metadata?.toPhone || null,
        },
      });

      console.info(
        `Canal ${channel} solicitado. Evento salvo como SYSTEM e dispatcher externo processado quando permitido.`,
        {
          type,
          eventLabel,
          channelEnabled,
          to: input.to || null,
          toPhone: input.toPhone || input.metadata?.toPhone || null,
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

  const whatsAppPhone = resolveWhatsAppPhone({
    user: targetUser,
    metadata,
  });

  return sendNotification({
    channel: "SYSTEM",
    userId: targetUser.id,
    to: targetUser.email || null,
    toName: targetUser.name || null,
    toPhone: whatsAppPhone,
    ticketId,
    type,
    title,
    message,
    href: href || (ticketId ? getTicketHrefForUser(targetUser, ticketId) : null),
    metadata: {
      ...(metadata || {}),
      toPhone: whatsAppPhone,
    },
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
      ...userNotificationSelect,
      administratorId: true,
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
      select: userNotificationSelect,
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
          select: userNotificationSelect,
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
    const whatsAppPhone = resolveWhatsAppPhone({
      user: targetUser,
      resident: ticket.resident,
      metadata,
    });

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
        toPhone: whatsAppPhone,
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
    const whatsAppPhone = resolveWhatsAppPhone({
      user: targetUser,
      resident: ticket.resident,
      metadata,
    });

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
        toPhone: whatsAppPhone,
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
    toPhone: resolveWhatsAppPhone({
      metadata,
    }),
    ticketId,
    type,
    title,
    message,
    href: href || `/admin/chamados/${ticketId}`,
    metadata,
  });
}