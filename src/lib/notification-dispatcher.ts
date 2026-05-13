import { sendMail } from "@/lib/mail";
import {
  getNotificationAvailableChannels,
  getNotificationEventConfig,
  getNotificationEventLabel,
  isNotificationExternalReady,
  shouldRespectUserNotificationPreference,
  type NotificationEventType,
} from "@/lib/notification-events";
import { isNotificationChannelEnabledForUser } from "@/lib/notification-preferences";
import { ticketNotificationEmailTemplate } from "@/lib/notification-email-templates";



/* =========================================================
   NOTIFICATION DISPATCHER - ELOGEST

   ETAPA 42.3.4 — DISPATCHER DE NOTIFICAÇÕES EXTERNAS

   Objetivo:
   - Disparar e-mail em paralelo às notificações internas.
   - Respeitar:
     evento externo habilitado,
     canal disponível,
     preferência do usuário,
     existência de e-mail do usuário.
   - Não quebrar o fluxo principal se o e-mail falhar.
   - Em desenvolvimento sem SMTP, usa o preview do src/lib/mail.ts.

   ETAPA 42.3.7 — LIMPEZA DE LOGS DE DIAGNÓSTICO

   Ajustes desta revisão:
   - Removidos logs temporários de diagnóstico do dispatcher.
   - Mantidos apenas avisos relevantes para falhas reais de envio.
   - Skips esperados continuam silenciosos:
     EMAIL_NOTIFICATIONS_DISABLED,
     EVENT_NOT_EXTERNAL_READY,
     EMAIL_NOT_AVAILABLE_FOR_EVENT,
     USER_WITHOUT_EMAIL,
     USER_EMAIL_PREFERENCE_DISABLED.
   - O preview de e-mail em desenvolvimento continua centralizado
     no src/lib/mail.ts.
   ========================================================= */



type DispatchNotificationEmailInput = {
  userId: string;
  to?: string | null;
  toName?: string | null;

  type: string;
  title: string;
  message: string;

  ticketId?: string | null;
  href?: string | null;

  metadata?: any;
};



type DispatchNotificationEmailResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
  messageId?: string;
  eventType?: NotificationEventType;
  eventLabel?: string;
  to?: string | null;
  toName?: string | null;
};



function normalizeNotificationType(type?: string | null): NotificationEventType {
  const eventType = String(type || "GENERAL") as NotificationEventType;

  return getNotificationEventConfig(eventType).type;
}



function getAppBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
    /\/$/,
    ""
  );
}



function buildAbsoluteUrl(href?: string | null) {
  if (!href) return null;

  if (href.startsWith("http://") || href.startsWith("https://")) {
    return href;
  }

  return `${getAppBaseUrl()}${href.startsWith("/") ? href : `/${href}`}`;
}



function isEmailGloballyEnabled() {
  const value = process.env.EMAIL_NOTIFICATIONS_ENABLED;

  if (value === "false") {
    return false;
  }

  return true;
}



function skipped(reason: string): DispatchNotificationEmailResult {
  return {
    ok: true,
    skipped: true,
    reason,
  };
}



export async function dispatchNotificationEmail({
  userId,
  to,
  toName,
  type,
  title,
  message,
  ticketId,
  href,
  metadata,
}: DispatchNotificationEmailInput): Promise<DispatchNotificationEmailResult> {
  try {
    const eventType = normalizeNotificationType(type);
    const eventConfig = getNotificationEventConfig(eventType);



    /* =======================================================
       BLOQUEIOS ESPERADOS

       Estes casos não são erros:
       - e-mail globalmente desligado;
       - evento não preparado para externo;
       - evento sem canal EMAIL;
       - usuário sem e-mail;
       - usuário desativou e-mail nas preferências.
       ======================================================= */

    if (!isEmailGloballyEnabled()) {
      return skipped("EMAIL_NOTIFICATIONS_DISABLED");
    }

    if (!isNotificationExternalReady(eventType)) {
      return skipped("EVENT_NOT_EXTERNAL_READY");
    }

    const availableChannels = getNotificationAvailableChannels(eventType);

    if (!availableChannels.includes("EMAIL")) {
      return skipped("EMAIL_NOT_AVAILABLE_FOR_EVENT");
    }

    if (!to) {
      return skipped("USER_WITHOUT_EMAIL");
    }

    if (shouldRespectUserNotificationPreference(eventType)) {
      const emailAllowed = await isNotificationChannelEnabledForUser({
        userId,
        eventType,
        channel: "EMAIL",
      });

      if (!emailAllowed) {
        return skipped("USER_EMAIL_PREFERENCE_DISABLED");
      }
    }



    /* =======================================================
       MONTA E ENVIA E-MAIL

       O sendMail() decide se envia via SMTP real ou se exibe
       preview em desenvolvimento.
       ======================================================= */

    const actionUrl = buildAbsoluteUrl(href);

    const template = ticketNotificationEmailTemplate({
      title,
      message,
      actionUrl,
      actionLabel: ticketId ? "Acessar chamado" : "Acessar EloGest",
      ticketTitle: metadata?.ticketTitle || null,
      condominiumName: metadata?.condominiumName || null,
      eventLabel: getNotificationEventLabel(eventType),
    });

    const result = await sendMail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    if (!result.ok) {
      console.error("[EloGest Dispatcher] Falha no envio de e-mail:", {
        userId,
        to,
        eventType,
        eventLabel: eventConfig.label,
        title,
        error: result.error,
      });
    }

    return {
      ...result,
      eventType,
      eventLabel: eventConfig.label,
      to,
      toName: toName || null,
    };
  } catch (error) {
    console.error("[EloGest Dispatcher] Falha ao despachar e-mail:", {
      userId,
      to,
      type,
      title,
      error,
    });

    return {
      ok: false,
      error: "Falha ao despachar e-mail.",
    };
  }
}
