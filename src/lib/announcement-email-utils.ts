import {
  AnnouncementLogAction,
  NotificationChannel,
  NotificationStatus,
} from "@prisma/client";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { announcementNotificationEmailTemplate } from "@/lib/notification-email-templates";
import {
  findAnnouncementNotificationTargets,
  type AnnouncementNotificationTarget,
} from "@/lib/announcement-admin-utils";



/* =========================================================
   ANNOUNCEMENT EMAIL UTILS - ELOGEST

   Arquivo:
   src/lib/announcement-email-utils.ts

   ETAPA 48.9.5 — E-MAIL EM COMUNICADOS

   Objetivo:
   - Integrar comunicados ao serviço de e-mail já existente.
   - Reutilizar src/lib/mail.ts como único serviço real de envio.
   - Não criar novo provider, SMTP, Resend paralelo ou API externa.
   - Enviar e-mail ao publicar comunicado.
   - Enviar e-mail de lembrete apenas para quem ainda não leu.
   ========================================================= */



type AnnouncementEmailMode = "published" | "reminder";

type EmailRecipient = {
  userId: string;
  accessId: string;
  email: string;
  name: string | null;
  role: string;
  condominiumId: string | null;
  unitId: string | null;
};

type AnnouncementEmailResult = {
  attempted: number;
  sent: number;
  skipped: number;
  failed: number;
  recipients: string[];
};



function getAppUrl() {
  const appUrl = process.env.APP_URL || process.env.NEXTAUTH_URL;

  if (appUrl && appUrl.trim()) {
    return appUrl.trim().replace(/\/$/, "");
  }

  return "http://localhost:3000";
}



function uniqueTargetsByUser(targets: AnnouncementNotificationTarget[]) {
  const map = new Map<string, AnnouncementNotificationTarget>();

  for (const target of targets) {
    if (!map.has(target.userId)) {
      map.set(target.userId, target);
    }
  }

  return Array.from(map.values());
}



async function filterUnreadTargets({
  announcementId,
  targets,
}: {
  announcementId: string;
  targets: AnnouncementNotificationTarget[];
}) {
  if (targets.length === 0) {
    return [];
  }

  const readings = await db.announcementReading.findMany({
    where: {
      announcementId,
      accessId: {
        in: targets.map((target) => target.id),
      },
    },
    select: {
      accessId: true,
    },
  });

  const readAccessIds = new Set(readings.map((reading) => reading.accessId));

  return targets.filter((target) => !readAccessIds.has(target.id));
}



async function resolveRecipients({
  announcementId,
  administratorId,
  mode,
}: {
  announcementId: string;
  administratorId: string;
  mode: AnnouncementEmailMode;
}) {
  const targets = await findAnnouncementNotificationTargets({
    administratorId,
    announcementId,
  });

  const filteredTargets = mode === "reminder"
    ? await filterUnreadTargets({ announcementId, targets })
    : targets;

  const uniqueTargets = uniqueTargetsByUser(filteredTargets);

  if (uniqueTargets.length === 0) {
    return [];
  }

  const users = await db.user.findMany({
    where: {
      id: {
        in: uniqueTargets.map((target) => target.userId),
      },
      isActive: true,
      email: {
        not: "",
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  const eventType = mode === "reminder"
    ? "ANNOUNCEMENT_READING_REMINDER"
    : "ANNOUNCEMENT_PUBLISHED";

  const preferences = await db.notificationPreference.findMany({
    where: {
      userId: {
        in: users.map((user) => user.id),
      },
      eventType,
    },
    select: {
      userId: true,
      emailEnabled: true,
    },
  });

  const preferenceByUserId = new Map(
    preferences.map((preference) => [preference.userId, preference]),
  );

  const userById = new Map(users.map((user) => [user.id, user]));
  const recipients: EmailRecipient[] = [];

  for (const target of uniqueTargets) {
    const user = userById.get(target.userId);

    if (!user?.email?.trim()) {
      continue;
    }

    const preference = preferenceByUserId.get(user.id);

    if (preference && !preference.emailEnabled) {
      continue;
    }

    recipients.push({
      userId: user.id,
      accessId: target.id,
      email: user.email.trim(),
      name: user.name,
      role: target.role,
      condominiumId: target.condominiumId,
      unitId: target.unitId,
    });
  }

  return recipients;
}



async function sendAnnouncementEmails({
  administratorId,
  announcementId,
  userId,
  mode,
}: {
  administratorId: string;
  announcementId: string;
  userId: string;
  mode: AnnouncementEmailMode;
}): Promise<AnnouncementEmailResult> {
  const announcement = await db.announcement.findFirst({
    where: {
      id: announcementId,
      administratorId,
    },
    include: {
      condominium: {
        select: {
          name: true,
        },
      },
      attachments: {
        orderBy: {
          createdAt: "asc",
        },
        select: {
          originalName: true,
          url: true,
        },
      },
    },
  });

  if (!announcement) {
    return {
      attempted: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      recipients: [],
    };
  }

  const recipients = await resolveRecipients({
    announcementId,
    administratorId,
    mode,
  });

  if (recipients.length === 0) {
    await db.announcementLog.create({
      data: {
        announcementId,
        userId,
        action: mode === "reminder"
          ? AnnouncementLogAction.REMINDER_SENT
          : AnnouncementLogAction.PUBLISHED,
        message: mode === "reminder"
          ? "Nenhum e-mail de lembrete foi enviado. Não há destinatários pendentes com e-mail elegível."
          : "Nenhum e-mail de comunicado foi enviado. Não há destinatários com e-mail elegível.",
        metadata: {
          channel: "EMAIL",
          reason: "NO_ELIGIBLE_RECIPIENTS",
          mode,
        },
      },
    });

    return {
      attempted: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      recipients: [],
    };
  }

  const actionUrl = `${getAppUrl()}/portal/comunicados/${announcementId}`;
  const template = announcementNotificationEmailTemplate({
    mode,
    title: announcement.title,
    content: announcement.content,
    actionUrl,
    condominiumName: announcement.condominium?.name || null,
    eventStartAt: announcement.eventStartAt,
    eventEndAt: announcement.eventEndAt,
    requireReadingConfirmation: announcement.requireReadingConfirmation,
    attachments: announcement.attachments.map((attachment) => ({
      originalName: attachment.originalName,
      url: attachment.url.startsWith("http")
        ? attachment.url
        : `${getAppUrl()}${attachment.url.startsWith("/") ? "" : "/"}${attachment.url}`,
    })),
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const recipient of recipients) {
    const result = await sendMail({
      to: recipient.email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    if (result.ok && result.skipped) {
      skipped += 1;
    } else if (result.ok) {
      sent += 1;
    } else {
      failed += 1;
    }

    await db.notification.create({
      data: {
        userId: recipient.userId,
        accessId: recipient.accessId,
        channel: NotificationChannel.EMAIL,
        status: NotificationStatus.READ,
        type: mode === "reminder"
          ? "ANNOUNCEMENT_READING_REMINDER"
          : "ANNOUNCEMENT_PUBLISHED",
        title: mode === "reminder"
          ? "E-mail De Lembrete De Comunicado"
          : "E-mail De Comunicado Enviado",
        message: result.ok
          ? template.subject
          : result.error || "Falha ao enviar e-mail de comunicado.",
        href: actionUrl,
        metadata: {
          announcementId,
          source: "ANNOUNCEMENT",
          mode,
          email: recipient.email,
          ok: result.ok,
          skipped: result.skipped || false,
          messageId: result.messageId || null,
          error: result.error || null,
        },
      },
    });
  }

  await db.announcementLog.create({
    data: {
      announcementId,
      userId,
      action: mode === "reminder"
        ? AnnouncementLogAction.REMINDER_SENT
        : AnnouncementLogAction.PUBLISHED,
      message: mode === "reminder"
        ? `E-mail de lembrete processado: ${sent} enviado(s), ${skipped} ignorado(s) em desenvolvimento/configuração e ${failed} falha(s).`
        : `E-mail de comunicado processado: ${sent} enviado(s), ${skipped} ignorado(s) em desenvolvimento/configuração e ${failed} falha(s).`,
      metadata: {
        channel: "EMAIL",
        mode,
        attempted: recipients.length,
        sent,
        skipped,
        failed,
      },
    },
  });

  return {
    attempted: recipients.length,
    sent,
    skipped,
    failed,
    recipients: recipients.map((recipient) => recipient.email),
  };
}



export async function sendAnnouncementPublishedEmails({
  administratorId,
  announcementId,
  userId,
}: {
  administratorId: string;
  announcementId: string;
  userId: string;
}) {
  return sendAnnouncementEmails({
    administratorId,
    announcementId,
    userId,
    mode: "published",
  });
}



export async function sendAnnouncementUnreadReminderEmails({
  administratorId,
  announcementId,
  userId,
}: {
  administratorId: string;
  announcementId: string;
  userId: string;
}) {
  return sendAnnouncementEmails({
    administratorId,
    announcementId,
    userId,
    mode: "reminder",
  });
}
