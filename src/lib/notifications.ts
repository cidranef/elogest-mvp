import { AccessRole, type Prisma } from "@prisma/client";
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

   ETAPA 50 — ENQUETES

   Ajustes desta revisão:
   - SendNotificationInput passa a aceitar pollId e accessId.
   - A notificação interna pode ficar vinculada à enquete e ao
     perfil de acesso elegível do portal.
   - Adicionado notifyPollAudience() para publicar avisos de nova
     enquete, prorrogação de prazo e resultado oficial disponível.
   - O público é calculado a partir de PollTarget e UserAccess ativo,
     respeitando condomínio, bloco, unidade, perfil, vínculo e canVote.
   - Não ativa WhatsApp real para enquetes nesta etapa.
   - Adicionado notifyPollExpiryAdministradoraUsers() para lembrete
     operacional interno quando o prazo da enquete se esgota.

   ETAPA 52.9.1 — DEDUPLICAÇÃO PÓS-HOMOLOGAÇÃO

   Ajuste:
   - notifyPollAudience() consolida destinatários por userId.
   - Usuários com múltiplos perfis formais, como Síndico + Proprietário
     ou Conselheiro + Proprietário, recebem somente uma notificação
     interna por evento da enquete.
   ========================================================= */





type NotificationMetadata = Record<string, unknown>;

type PhoneSource = {
  toPhone?: unknown;
  whatsappPhone?: unknown;
  whatsapp?: unknown;
  phone?: unknown;
  phoneNumber?: unknown;
  mobilePhone?: unknown;
  cellphone?: unknown;
  celular?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}


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
  pollId?: string | null;
  assemblyId?: string | null;
  accessId?: string | null;
  href?: string | null;

  metadata?: NotificationMetadata;
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
  metadata?: NotificationMetadata;
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



function extractPhoneFromAny(source: unknown) {
  if (!isRecord(source)) return null;

  const phoneSource = source as PhoneSource;

  return (
    getValueAsString(phoneSource.toPhone) ||
    getValueAsString(phoneSource.whatsappPhone) ||
    getValueAsString(phoneSource.whatsapp) ||
    getValueAsString(phoneSource.phone) ||
    getValueAsString(phoneSource.phoneNumber) ||
    getValueAsString(phoneSource.mobilePhone) ||
    getValueAsString(phoneSource.cellphone) ||
    getValueAsString(phoneSource.celular) ||
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
  metadata?: NotificationMetadata;
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

export function getTicketHrefForUser(
  targetUser: Pick<BasicUser, "role"> | null | undefined,
  ticketId: string,
) {
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
      pollId: input.pollId || null,
      assemblyId: input.assemblyId || null,
      accessId: input.accessId || null,
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
      }) as Prisma.InputJsonObject,
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
          toPhone: input.toPhone || extractPhoneFromAny(input.metadata) || null,
        },
      });

      console.info(
        `Canal ${channel} solicitado. Evento salvo como SYSTEM e dispatcher externo processado quando permitido.`,
        {
          type,
          eventLabel,
          channelEnabled,
          to: input.to || null,
          toPhone: input.toPhone || extractPhoneFromAny(input.metadata) || null,
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
  pollId,
  assemblyId,
  accessId,
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
  pollId?: string | null;
  assemblyId?: string | null;
  accessId?: string | null;
  type: string;
  title: string;
  message: string;
  href?: string | null;
  metadata?: NotificationMetadata;
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
    pollId,
    assemblyId,
    accessId,
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
  metadata?: NotificationMetadata;
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
  metadata?: NotificationMetadata;
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
  metadata?: NotificationMetadata;
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
  metadata?: NotificationMetadata;
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
  metadata?: NotificationMetadata;
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
  metadata?: NotificationMetadata;
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
  metadata?: NotificationMetadata;
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
   REUNIÕES DE CONSELHO — ETAPA 49

   Estes helpers ficam genéricos o suficiente para preservar a
   arquitetura da Sala De Reunião EloGest e facilitar o reaproveitamento
   posterior em Assembleias.

   Observações:
   - Não usam ticketId.
   - O href é decidido por perfil do destinatário.
   - O disparo externo continua protegido pela matriz de eventos,
     preferências do usuário e dispatcher.
   ========================================================= */

type CouncilMeetingForNotification = {
  id: string;
  title: string;
  administratorId?: string | null;
  condominiumId?: string | null;
  scheduledStartAt?: Date | string | null;
  scheduledEndAt?: Date | string | null;
  meetingMode?: string | null;

  condominium?: {
    id?: string | null;
    name?: string | null;
    administratorId?: string | null;
  } | null;

  meetingRoom?: {
    id?: string | null;
    roomStatus?: string | null;
    status?: string | null;
  } | null;
};

type CouncilMeetingTargetUser = BasicUser & {
  accessId?: string | null;
  accessRole?: string | null;
};

function getCouncilMeetingHrefForUser({
  targetUser,
  meetingId,
  room = false,
}: {
  targetUser?: BasicUser | null;
  meetingId: string;
  room?: boolean;
}) {
  const role = normalizeRole(targetUser?.role);

  const suffix = room ? "/sala" : "";

  if (role === "ADMINISTRADORA" || role === "SUPER_ADMIN") {
    return `/admin/reunioes-conselho/${meetingId}${suffix}`;
  }

  return `/portal/reunioes-conselho/${meetingId}${suffix}`;
}

function buildCouncilMeetingNotificationMetadata({
  meeting,
  metadata,
}: {
  meeting: CouncilMeetingForNotification;
  metadata?: NotificationMetadata;
}) {
  return {
    ...(metadata || {}),
    meetingId: meeting.id,
    meetingTitle: meeting.title,
    councilMeetingId: meeting.id,
    councilMeetingTitle: meeting.title,
    condominiumId: meeting.condominiumId || meeting.condominium?.id || null,
    condominiumName: meeting.condominium?.name || null,
    administratorId:
      meeting.administratorId ||
      meeting.condominium?.administratorId ||
      null,
    scheduledStartAt: meeting.scheduledStartAt || null,
    scheduledEndAt: meeting.scheduledEndAt || null,
    meetingMode: meeting.meetingMode || null,
    roomStatus:
      meeting.meetingRoom?.roomStatus ||
      meeting.meetingRoom?.status ||
      null,
    notificationScope: "COUNCIL_MEETING",
    notificationGroup: "GOVERNANCE_MEETING",
  };
}

export async function notifyCouncilMeetingUsers({
  meeting,
  targetUsers,
  actorUser,
  notifiedUserIds,
  type,
  title,
  message,
  href,
  metadata,
  room = false,
  allowNotifyActor = false,
}: {
  meeting: CouncilMeetingForNotification;
  targetUsers: CouncilMeetingTargetUser[];
  actorUser?: BasicActor | null;
  notifiedUserIds?: Set<string>;
  type: string;
  title: string;
  message: string;
  href?: string | null;
  metadata?: NotificationMetadata;
  room?: boolean;
  allowNotifyActor?: boolean;
}) {
  const createdNotifications = [];
  const uniqueIds = notifiedUserIds || new Set<string>();
  const baseMetadata = buildCouncilMeetingNotificationMetadata({
    meeting,
    metadata,
  });

  for (const targetUser of targetUsers) {
    if (!targetUser?.id || targetUser.isActive === false) {
      continue;
    }

    const notificationHref =
      href ||
      getCouncilMeetingHrefForUser({
        targetUser,
        meetingId: meeting.id,
        room,
      });

    const notification = await notifySingleUser({
      targetUser,
      actorUser,
      notifiedUserIds: uniqueIds,
      ticketId: null,
      type,
      title,
      message,
      href: notificationHref,
      allowNotifyActor,
      metadata: {
        ...baseMetadata,
        accessId: targetUser.accessId || null,
        accessRole: targetUser.accessRole || targetUser.role || null,
        actionLabel: room ? "Entrar na sala" : "Acessar reunião",
      },
    });

    if (notification) {
      createdNotifications.push(notification);
    }
  }

  return createdNotifications;
}

export async function notifyCouncilMeetingAdministradoraUsers({
  meeting,
  actorUser,
  notifiedUserIds,
  type,
  title,
  message,
  metadata,
  room = false,
}: {
  meeting: CouncilMeetingForNotification;
  actorUser?: BasicActor | null;
  notifiedUserIds?: Set<string>;
  type: string;
  title: string;
  message: string;
  metadata?: NotificationMetadata;
  room?: boolean;
}) {
  const administratorId =
    meeting.administratorId || meeting.condominium?.administratorId || null;

  if (!administratorId) {
    console.warn(
      "notifyCouncilMeetingAdministradoraUsers: administratorId não informado.",
      {
        meetingId: meeting.id,
        type,
        actorUserId: actorUser?.id || null,
      },
    );

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

  return notifyCouncilMeetingUsers({
    meeting,
    targetUsers: users,
    actorUser,
    notifiedUserIds,
    type,
    title,
    message,
    metadata: {
      ...(metadata || {}),
      notificationScope: "COUNCIL_MEETING_ADMINISTRADORA_USERS",
    },
    room,
  });
}

export async function notifyCouncilMeetingGovernanceUsers({
  meeting,
  actorUser,
  notifiedUserIds,
  type,
  title,
  message,
  metadata,
  room = false,
}: {
  meeting: CouncilMeetingForNotification;
  actorUser?: BasicActor | null;
  notifiedUserIds?: Set<string>;
  type: string;
  title: string;
  message: string;
  metadata?: NotificationMetadata;
  room?: boolean;
}) {
  const condominiumId = meeting.condominiumId || meeting.condominium?.id || null;

  if (!condominiumId) {
    console.warn(
      "notifyCouncilMeetingGovernanceUsers: condominiumId não informado.",
      {
        meetingId: meeting.id,
        type,
        actorUserId: actorUser?.id || null,
      },
    );

    return [];
  }

  const governanceRoles: AccessRole[] = [
    AccessRole.SINDICO,
    AccessRole.CONSELHEIRO,
  ];

  const accessUsers = await db.userAccess.findMany({
    where: {
      isActive: true,
      role: {
        in: governanceRoles,
      },
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
  });

  const usersMap = new Map<string, CouncilMeetingTargetUser>();

  for (const access of accessUsers) {
    if (access.user?.id) {
      usersMap.set(access.user.id, {
        ...access.user,
        accessId: access.id,
        accessRole: access.role,
      });
    }
  }

  return notifyCouncilMeetingUsers({
    meeting,
    targetUsers: Array.from(usersMap.values()),
    actorUser,
    notifiedUserIds,
    type,
    title,
    message,
    metadata: {
      ...(metadata || {}),
      notificationScope: "COUNCIL_MEETING_GOVERNANCE_USERS",
    },
    room,
  });
}

export async function notifyCouncilMeetingParticipants({
  meeting,
  actorUser,
  notifiedUserIds,
  type,
  title,
  message,
  metadata,
  room = false,
}: {
  meeting: CouncilMeetingForNotification;
  actorUser?: BasicActor | null;
  notifiedUserIds?: Set<string>;
  type: string;
  title: string;
  message: string;
  metadata?: NotificationMetadata;
  room?: boolean;
}) {
  const participants = await db.councilMeetingParticipant.findMany({
    where: {
      councilMeetingId: meeting.id,
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
      invitedAt: "asc",
    },
  });

  const usersMap = new Map<string, CouncilMeetingTargetUser>();

  for (const participant of participants) {
    if (participant.user?.id) {
      usersMap.set(participant.user.id, {
        ...participant.user,
        accessId: participant.userAccessId || null,
        accessRole: participant.role || null,
      });
    }
  }

  return notifyCouncilMeetingUsers({
    meeting,
    targetUsers: Array.from(usersMap.values()),
    actorUser,
    notifiedUserIds,
    type,
    title,
    message,
    metadata: {
      ...(metadata || {}),
      notificationScope: "COUNCIL_MEETING_PARTICIPANTS",
    },
    room,
  });
}


export async function notifyCouncilMeetingRecordKeeperAssigned({
  meeting,
  recordKeeperUserId,
  actorUser,
  title = "Você foi definido como responsável pelo registro",
  message,
  metadata,
}: {
  meeting: CouncilMeetingForNotification;
  recordKeeperUserId?: string | null;
  actorUser?: BasicActor | null;
  title?: string;
  message?: string;
  metadata?: NotificationMetadata;
}) {
  if (!recordKeeperUserId) {
    console.warn("notifyCouncilMeetingRecordKeeperAssigned: usuário não informado.", {
      meetingId: meeting.id,
      actorUserId: actorUser?.id || null,
    });

    return [];
  }

  const targetUser = await db.user.findFirst({
    where: {
      id: recordKeeperUserId,
      isActive: true,
    },
    select: userNotificationSelect,
  });

  if (!targetUser) {
    console.warn("notifyCouncilMeetingRecordKeeperAssigned: usuário destinatário não encontrado.", {
      meetingId: meeting.id,
      recordKeeperUserId,
    });

    return [];
  }

  return notifyCouncilMeetingUsers({
    meeting,
    targetUsers: [targetUser],
    actorUser,
    type: "COUNCIL_MEETING_RECORD_KEEPER_ASSIGNED",
    title,
    message:
      message ||
      `Você foi escolhido como responsável pelo registro da reunião "${meeting.title}".`,
    room: true,
    allowNotifyActor: true,
    metadata: {
      ...(metadata || {}),
      recordKeeperUserId,
      notificationScope: "COUNCIL_MEETING_RECORD_KEEPER",
      notificationGroup: "GOVERNANCE_MEETING_RECORD_KEEPER",
      actionLabel: "Acessar sala da reunião",
    },
  });
}


export async function notifyCouncilMeetingAudience({
  meeting,
  actorUser,
  type,
  title,
  message,
  metadata,
  room = false,
  includeAdministradora = false,
}: {
  meeting: CouncilMeetingForNotification;
  actorUser?: BasicActor | null;
  type: string;
  title: string;
  message: string;
  metadata?: NotificationMetadata;
  room?: boolean;
  includeAdministradora?: boolean;
}) {
  const notifiedUserIds = new Set<string>();
  const createdNotifications = [];

  const participantNotifications = await notifyCouncilMeetingParticipants({
    meeting,
    actorUser,
    notifiedUserIds,
    type,
    title,
    message,
    metadata,
    room,
  });

  createdNotifications.push(...participantNotifications);

  const governanceNotifications = await notifyCouncilMeetingGovernanceUsers({
    meeting,
    actorUser,
    notifiedUserIds,
    type,
    title,
    message,
    metadata,
    room,
  });

  createdNotifications.push(...governanceNotifications);

  if (includeAdministradora) {
    const adminNotifications = await notifyCouncilMeetingAdministradoraUsers({
      meeting,
      actorUser,
      notifiedUserIds,
      type,
      title,
      message,
      metadata,
      room,
    });

    createdNotifications.push(...adminNotifications);
  }

  return createdNotifications;
}


/* =========================================================
   ENQUETES — ETAPA 50

   A notificação interna de enquete respeita o mesmo público que
   poderá acessar a enquete no portal:
   - condomínio;
   - bloco;
   - unidade;
   - perfil;
   - tipo de vínculo;
   - governança;
   - público personalizado;
   - canVote quando a enquete exigir participante elegível.

   Segurança:
   - somente UserAccess ativo é considerado;
   - condomínio e administradora precisam estar ativos;
   - unidade e vínculo inativos são descartados;
   - receivesNotifications=false impede o aviso daquele vínculo;
   - cada notificação fica vinculada ao pollId e ao accessId.
   ========================================================= */

type PollForNotification = {
  id: string;
  title: string;
  administratorId: string;
  condominiumId?: string | null;
  targetScope?: string | null;
  requireEligibleVoter?: boolean | null;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  resultsPublishedAt?: Date | string | null;
  condominium?: {
    id?: string | null;
    name?: string | null;
    administratorId?: string | null;
    status?: string | null;
    administrator?: {
      id?: string | null;
      status?: string | null;
    } | null;
  } | null;
  targets?: Array<{
    condominiumId?: string | null;
    unitId?: string | null;
    block?: string | null;
    role?: AccessRole | null;
    linkType?: string | null;
  }>;
};

type PollTargetAccess = {
  accessId: string;
  user: BasicUser;
  role: AccessRole;
  condominiumId: string;
  unitId: string | null;
  block: string | null;
  linkType: string | null;
  canVote: boolean;
  receivesNotifications: boolean;
  isGovernanceProfile: boolean;
};

function isPollGovernanceRole(role: AccessRole) {
  const governanceRoles: AccessRole[] = [
    AccessRole.SINDICO,
    AccessRole.CONSELHEIRO,
  ];

  return governanceRoles.includes(role);
}

function canPollTargetMatchAccess(
  target: NonNullable<PollForNotification["targets"]>[number],
  access: PollTargetAccess,
) {
  if (target.condominiumId && target.condominiumId !== access.condominiumId) {
    return false;
  }

  if (target.unitId && target.unitId !== access.unitId) {
    return false;
  }

  if (target.block && target.block !== access.block) {
    return false;
  }

  if (target.role && target.role !== access.role) {
    return false;
  }

  if (target.linkType && target.linkType !== access.linkType) {
    return false;
  }

  return true;
}

function isPollNotificationAccessEligible({
  poll,
  access,
}: {
  poll: PollForNotification;
  access: PollTargetAccess;
}) {
  if (!poll.condominiumId || poll.condominiumId !== access.condominiumId) {
    return false;
  }

  if (poll.requireEligibleVoter && !access.canVote) {
    return false;
  }

  if (poll.targetScope === "CONDOMINIUM") {
    return true;
  }

  if (poll.targetScope === "GOVERNANCE") {
    return access.isGovernanceProfile;
  }

  const targets = poll.targets || [];

  if (poll.targetScope === "BLOCK") {
    return targets.some((target) => {
      return Boolean(access.block) && canPollTargetMatchAccess(target, access);
    });
  }

  if (poll.targetScope === "UNIT") {
    return targets.some((target) => {
      return Boolean(access.unitId) && canPollTargetMatchAccess(target, access);
    });
  }

  if (poll.targetScope === "ROLE") {
    return targets.some((target) => {
      return target.role === access.role && canPollTargetMatchAccess(target, access);
    });
  }

  if (poll.targetScope === "LINK_TYPE") {
    return targets.some((target) => {
      return Boolean(access.linkType) && canPollTargetMatchAccess(target, access);
    });
  }

  if (poll.targetScope === "CUSTOM") {
    return targets.some((target) => canPollTargetMatchAccess(target, access));
  }

  return false;
}

async function loadPollForNotification(pollId: string) {
  return db.poll.findFirst({
    where: {
      id: pollId,
    },
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
              status: true,
            },
          },
        },
      },
      targets: true,
    },
  });
}

async function loadEligiblePollTargetAccesses(poll: PollForNotification) {
  if (!poll.condominiumId) {
    return [] as PollTargetAccess[];
  }

  if (
    poll.condominium?.status !== "ACTIVE" ||
    poll.condominium?.administrator?.status !== "ACTIVE"
  ) {
    return [] as PollTargetAccess[];
  }

  const allowedRoles: AccessRole[] = [
    AccessRole.SINDICO,
    AccessRole.CONSELHEIRO,
    AccessRole.PROPRIETARIO,
    AccessRole.MORADOR,
  ];

  const accesses = await db.userAccess.findMany({
    where: {
      isActive: true,
      condominiumId: poll.condominiumId,
      role: {
        in: allowedRoles,
      },
      user: {
        isActive: true,
      },
    },
    include: {
      user: {
        select: userNotificationSelect,
      },
      unit: {
        select: {
          id: true,
          block: true,
          status: true,
        },
      },
      unitPersonLink: {
        select: {
          linkType: true,
          canVote: true,
          receivesNotifications: true,
          status: true,
        },
      },
      condominium: {
        select: {
          id: true,
          administratorId: true,
          status: true,
          administrator: {
            select: {
              status: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const normalized: PollTargetAccess[] = [];

  for (const access of accesses) {
    if (!access.condominium || access.condominium.status !== "ACTIVE") {
      continue;
    }

    if (access.condominium.administrator.status !== "ACTIVE") {
      continue;
    }

    if (access.condominium.administratorId !== poll.administratorId) {
      continue;
    }

    if (access.unit && access.unit.status !== "ACTIVE") {
      continue;
    }

    if (access.unitPersonLink && access.unitPersonLink.status !== "ACTIVE") {
      continue;
    }

    if (access.unitPersonLink?.receivesNotifications === false) {
      continue;
    }

    const normalizedAccess: PollTargetAccess = {
      accessId: access.id,
      user: access.user,
      role: access.role,
      condominiumId: access.condominiumId || poll.condominiumId,
      unitId: access.unitId || null,
      block: access.unit?.block || null,
      linkType: access.unitPersonLink?.linkType || null,
      canVote: Boolean(access.unitPersonLink?.canVote),
      receivesNotifications:
        access.unitPersonLink?.receivesNotifications ?? true,
      isGovernanceProfile: isPollGovernanceRole(access.role),
    };

    if (
      isPollNotificationAccessEligible({
        poll,
        access: normalizedAccess,
      })
    ) {
      normalized.push(normalizedAccess);
    }
  }

  return normalized;
}

export async function notifyPollAudience({
  pollId,
  actorUser,
  type,
  title,
  message,
  metadata,
}: {
  pollId: string;
  actorUser?: BasicActor | null;
  type: "POLL_PUBLISHED" | "POLL_EXTENDED" | "POLL_RESULTS_PUBLISHED";
  title: string;
  message: string;
  metadata?: NotificationMetadata;
}) {
  const poll = await loadPollForNotification(pollId);

  if (!poll) {
    console.warn("notifyPollAudience: enquete não encontrada.", {
      pollId,
      type,
      actorUserId: actorUser?.id || null,
    });

    return [];
  }

  const accesses = await loadEligiblePollTargetAccesses(poll);
  const notifiedUserIds = new Set<string>();
  const createdNotifications = [];

  for (const access of accesses) {
    if (notifiedUserIds.has(access.user.id)) {
      continue;
    }

    notifiedUserIds.add(access.user.id);

    const notification = await sendNotification({
      channel: "SYSTEM",
      userId: access.user.id,
      to: access.user.email || null,
      toName: access.user.name || null,
      pollId: poll.id,
      accessId: access.accessId,
      type,
      title,
      message,
      href: `/portal/enquetes?pollId=${encodeURIComponent(poll.id)}`,
      metadata: {
        ...(metadata || {}),
        pollId: poll.id,
        pollTitle: poll.title,
        condominiumId: poll.condominiumId || null,
        condominiumName: poll.condominium?.name || null,
        administratorId: poll.administratorId,
        targetScope: poll.targetScope || null,
        requireEligibleVoter: Boolean(poll.requireEligibleVoter),
        startsAt: poll.startsAt || null,
        endsAt: poll.endsAt || null,
        resultsPublishedAt: poll.resultsPublishedAt || null,
        accessId: access.accessId,
        accessRole: access.role,
        notificationScope: "POLL_AUDIENCE",
        notificationGroup: "CONDOMINIUM_POLL",
        actionLabel: "Acessar enquete",
      },
    });

    if (notification) {
      createdNotifications.push(notification);
    }
  }

  return createdNotifications;
}


/* =========================================================
   ENQUETES — LEMBRETE OPERACIONAL PARA ADMINISTRADORA

   Dispara aviso interno quando a enquete publicada atinge o
   prazo final e precisa de decisão administrativa:
   - encerrar;
   - prorrogar;
   - publicar resultados depois do encerramento.

   Observações:
   - não notifica moradores;
   - não inclui SUPER_ADMIN;
   - o cron controla a idempotência pelo campo
     Poll.adminExpiryReminderSentAt.
   ========================================================= */

export async function notifyPollExpiryAdministradoraUsers({
  pollId,
  administratorId,
  pollTitle,
  condominiumName,
  endsAt,
  metadata,
}: {
  pollId: string;
  administratorId: string;
  pollTitle: string;
  condominiumName?: string | null;
  endsAt?: Date | string | null;
  metadata?: NotificationMetadata;
}) {
  const users = await db.user.findMany({
    where: {
      isActive: true,
      role: "ADMINISTRADORA",
      administratorId,
    },
    select: userNotificationSelect,
    orderBy: {
      name: "asc",
    },
  });

  const createdNotifications = [];
  const notifiedUserIds = new Set<string>();

  for (const targetUser of users) {
    const notification = await notifySingleUser({
      targetUser,
      notifiedUserIds,
      pollId,
      type: "POLL_EXPIRED_ADMIN_REMINDER",
      title: "Prazo da enquete encerrado",
      message: `A enquete "${pollTitle}" atingiu o prazo final. Revise as respostas para encerrar, prorrogar ou publicar o resultado.`,
      href: `/admin/enquetes`,
      allowNotifyActor: true,
      metadata: {
        ...(metadata || {}),
        pollId,
        pollTitle,
        administratorId,
        condominiumName: condominiumName || null,
        endsAt: endsAt || null,
        notificationScope: "POLL_ADMIN_EXPIRY_REMINDER",
        notificationGroup: "POLL_ADMIN_OPERATIONAL",
        actionLabel: "Revisar enquete",
      },
    });

    if (notification) {
      createdNotifications.push(notification);
    }
  }

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
  metadata?: NotificationMetadata;
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

/* =========================================================
   ASSEMBLEIAS — ETAPA 51.7
   ========================================================= */

type AssemblyNotificationMode = "CONVOCATION" | "REMINDER" | "EXTENSION" | "RESULTS";

type AssemblyNotificationContext = {
  previousVotingEndsAt?: Date | string | null;
  extensionReason?: string | null;
  reopened?: boolean;
};

type AssemblyAudienceUser = BasicUser & {
  accessId?: string | null;
  representedUnits: string[];
  representedUnitIds: string[];
  sources: string[];
};

function formatAssemblyUnitLabel(unit?: { block?: string | null; unitNumber?: string | null } | null) {
  if (!unit) return "Unidade";
  return `${unit.block ? `${unit.block} - ` : ""}${unit.unitNumber || "Unidade"}`;
}

function addAssemblyAudienceUser(
  map: Map<string, AssemblyAudienceUser>,
  params: {
    user: BasicUser;
    accessId?: string | null;
    unitId: string;
    unitLabel: string;
    source: string;
  },
) {
  const current = map.get(params.user.id) || {
    ...params.user,
    accessId: params.accessId || null,
    representedUnits: [],
    representedUnitIds: [],
    sources: [],
  };

  if (!current.accessId && params.accessId) current.accessId = params.accessId;
  if (!current.representedUnitIds.includes(params.unitId)) current.representedUnitIds.push(params.unitId);
  if (!current.representedUnits.includes(params.unitLabel)) current.representedUnits.push(params.unitLabel);
  if (!current.sources.includes(params.source)) current.sources.push(params.source);
  map.set(params.user.id, current);
}

async function loadAssemblyAudience(assemblyId: string, onlyPending: boolean) {
  const assembly = await db.assembly.findFirst({
    where: { id: assemblyId },
    include: {
      condominium: { select: { id: true, name: true, administratorId: true } },
      eligibleUnits: {
        where: { status: "ELIGIBLE" },
        include: { unit: { select: { id: true, block: true, unitNumber: true } } },
      },
      agendaItems: {
        where: { type: { not: "INFORMATIVE" } },
        select: { id: true },
      },
      representations: {
        where: { status: "ACTIVE" },
        include: {
          unit: { select: { id: true, block: true, unitNumber: true } },
          representativeUser: { select: userNotificationSelect },
        },
      },
    },
  });

  if (!assembly || !assembly.condominium) return null;

  const eligibleUnitIds = assembly.eligibleUnits.map((item) => item.unitId);
  const pendingUnitIds = new Set<string>(eligibleUnitIds);

  if (onlyPending && assembly.agendaItems.length > 0) {
    const votes = await db.assemblyVote.findMany({
      where: {
        assemblyId: assembly.id,
        agendaItemId: { in: assembly.agendaItems.map((item) => item.id) },
      },
      select: { eligibleUnitId: true, agendaItemId: true },
    });
    const votedKeys = new Set(votes.map((vote) => `${vote.eligibleUnitId}:${vote.agendaItemId}`));
    pendingUnitIds.clear();
    for (const eligibleUnit of assembly.eligibleUnits) {
      const hasPending = assembly.agendaItems.some((item) => !votedKeys.has(`${eligibleUnit.id}:${item.id}`));
      if (hasPending) pendingUnitIds.add(eligibleUnit.unitId);
    }
  }

  const accesses = await db.userAccess.findMany({
    where: {
      isActive: true,
      condominiumId: assembly.condominiumId,
      unitId: { in: Array.from(pendingUnitIds) },
      user: { isActive: true },
    },
    include: {
      user: { select: userNotificationSelect },
      unit: { select: { id: true, block: true, unitNumber: true, status: true } },
      unitPersonLink: { select: { status: true, canVote: true, receivesNotifications: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const recipients = new Map<string, AssemblyAudienceUser>();

  for (const access of accesses) {
    if (!access.unitId || !pendingUnitIds.has(access.unitId)) continue;
    if (access.unit && access.unit.status !== "ACTIVE") continue;
    if (access.unitPersonLink && access.unitPersonLink.status !== "ACTIVE") continue;
    if (access.unitPersonLink?.receivesNotifications === false) continue;

    const canVote = Boolean(access.unitPersonLink?.canVote) || access.role === AccessRole.PROPRIETARIO;
    if (!canVote) continue;

    addAssemblyAudienceUser(recipients, {
      user: access.user,
      accessId: access.id,
      unitId: access.unitId,
      unitLabel: formatAssemblyUnitLabel(access.unit),
      source: "UNIT_ACCESS",
    });
  }

  const now = new Date();
  const externalRepresentatives: Array<{ name: string; email: string; unitLabel: string }> = [];

  for (const representation of assembly.representations) {
    if (!pendingUnitIds.has(representation.unitId)) continue;
    if (representation.validFrom && representation.validFrom > now) continue;
    if (representation.validUntil && representation.validUntil < now) continue;

    const unitLabel = formatAssemblyUnitLabel(representation.unit);

    if (representation.representativeUser) {
      addAssemblyAudienceUser(recipients, {
        user: representation.representativeUser,
        unitId: representation.unitId,
        unitLabel,
        source: "ACTIVE_REPRESENTATION",
      });
    } else if (representation.externalRepresentativeEmail) {
      externalRepresentatives.push({
        name: representation.externalRepresentativeName || "Representante externo",
        email: representation.externalRepresentativeEmail,
        unitLabel,
      });
    }
  }

  return { assembly, recipients: Array.from(recipients.values()), externalRepresentatives };
}

export async function notifyAssemblyAudience({
  assemblyId,
  mode,
  actorUser,
  context,
}: {
  assemblyId: string;
  mode: AssemblyNotificationMode;
  actorUser?: BasicActor | null;
  context?: AssemblyNotificationContext;
}) {
  const audience = await loadAssemblyAudience(assemblyId, mode === "REMINDER");

  if (!audience) {
    console.warn("notifyAssemblyAudience: assembleia não encontrada.", { assemblyId, mode });
    return { createdNotifications: [], externalRepresentatives: [] };
  }

  const { assembly, recipients, externalRepresentatives } = audience;

  const type =
    mode === "REMINDER"
      ? "ASSEMBLY_VOTING_REMINDER"
      : mode === "EXTENSION"
        ? "ASSEMBLY_VOTING_DEADLINE_EXTENDED"
        : mode === "RESULTS"
          ? "ASSEMBLY_RESULTS_PUBLISHED"
          : "ASSEMBLY_CONVOCATION_PUBLISHED";

  const title =
    mode === "REMINDER"
      ? "Lembrete de votação da assembleia"
      : mode === "EXTENSION"
        ? context?.reopened
          ? "Votação da assembleia reaberta"
          : "Prazo da votação da assembleia prorrogado"
        : mode === "RESULTS"
          ? "Resultados da assembleia publicados"
          : "Convocação de assembleia publicada";

  const message =
    mode === "REMINDER"
      ? `A assembleia "${assembly.title}" ainda possui votação pendente para ao menos uma unidade representada por você.`
      : mode === "EXTENSION"
        ? context?.reopened
          ? `A votação da assembleia "${assembly.title}" foi reaberta com novo prazo final. Consulte a assembleia para acompanhar as pendências.`
          : `O prazo para votar na assembleia "${assembly.title}" foi prorrogado. Consulte a assembleia para acompanhar o novo prazo final.`
        : mode === "RESULTS"
          ? `Os resultados oficiais da assembleia "${assembly.title}" foram publicados. Consulte a apuração por pauta no portal.`
          : `A convocação oficial da assembleia "${assembly.title}" foi publicada. Consulte as pautas, os documentos e o prazo da votação.`;

  const createdNotifications = [];

  for (const recipient of recipients) {
    const notification = await notifySingleUser({
      targetUser: recipient,
      actorUser,
      assemblyId: assembly.id,
      accessId: recipient.accessId || null,
      type,
      title,
      message,
      href: `/portal/assembleias?assemblyId=${encodeURIComponent(assembly.id)}`,
      allowNotifyActor: true,
      metadata: {
        assemblyId: assembly.id,
        assemblyTitle: assembly.title,
        condominiumId: assembly.condominiumId,
        condominiumName: assembly.condominium.name,
        administratorId: assembly.administratorId,
        scheduledStartAt: assembly.scheduledStartAt || null,
        votingStartsAt: assembly.votingStartsAt || null,
        votingEndsAt: assembly.votingEndsAt || null,
        previousVotingEndsAt: context?.previousVotingEndsAt || null,
        extensionReason: context?.extensionReason || null,
        votingReopened: context?.reopened || false,
        meetingMode: assembly.mode,
        representedUnits: recipient.representedUnits,
        representedUnitIds: recipient.representedUnitIds,
        audienceSources: recipient.sources,
        notificationScope: "ASSEMBLY_AUDIENCE",
        notificationGroup: "ASSEMBLY_GOVERNANCE",
        actionLabel: "Acessar assembleia",
      },
    });
    if (notification) createdNotifications.push(notification);
  }

  return { createdNotifications, externalRepresentatives };
}
