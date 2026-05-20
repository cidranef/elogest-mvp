import { db } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import {
  getNotificationAvailableChannels,
  getNotificationEventConfig,
  getNotificationEventLabel,
  isNotificationExternalReady,
  shouldRespectUserNotificationPreference,
  type NotificationChannel,
  type NotificationEventType,
} from "@/lib/notification-events";
import { isNotificationChannelEnabledForUser } from "@/lib/notification-preferences";
import { ticketNotificationEmailTemplate } from "@/lib/notification-email-templates";
import { buildNotificationWhatsAppMessage } from "@/lib/notification-whatsapp-templates";
import { sendWhatsAppMessage } from "@/lib/whatsapp";



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

   ETAPA 42.10 — WHATSAPP EM MODO DEV

   Ajustes:
   - Adicionada função dispatchNotificationWhatsApp().
   - Mantido dispatchNotificationEmail() sem quebra.
   - WhatsApp respeita:
     evento externo habilitado,
     canal disponível,
     preferência do usuário,
     telefone do usuário.
   - Nesta etapa, o WhatsApp NÃO envia mensagem real.
   - O envio simulado fica centralizado no src/lib/whatsapp.ts.
   - O texto da mensagem fica centralizado em:
     src/lib/notification-whatsapp-templates.ts.

   ETAPA 42.10.3 — REVISÃO FINAL PARA DEV / RAILWAY

   Ajustes:
   - Importado NotificationChannel para remover casts "as any".
   - Padronizados helpers de canal ativo/disponível.
   - Padronizados motivos de skip.
   - Mantido e-mail e WhatsApp independentes entre si.
   - WhatsApp continua bloqueado para envio real pelo src/lib/whatsapp.ts.
   - Railway pode manter:
       WHATSAPP_AUTO_DISPATCH_ENABLED=false
       WHATSAPP_PROVIDER=dev
       WHATSAPP_DEV_LOGS=false

   ETAPA 42.10.6.1 — CONSENTIMENTO / OPTOUT WHATSAPP

   Ajustes desta revisão:
   - Dispatcher passa a consultar o usuário antes do envio WhatsApp.
   - Se phoneOptOutAt estiver preenchido, WhatsApp é ignorado.
   - Mantém a preferência por evento como controle principal.
   - Prepara o sistema para descadastramento futuro do canal.
   - Regras atuais para WhatsApp:
       1. WHATSAPP_NOTIFICATIONS_ENABLED não pode ser false;
       2. evento precisa estar pronto para externo;
       3. evento precisa ter canal WHATSAPP disponível;
       4. destinatário precisa ter telefone;
       5. usuário não pode ter phoneOptOutAt preenchido;
       6. preferência WHATSAPP do evento precisa estar ativa.
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



type DispatchNotificationWhatsAppInput = {
  userId: string;
  toPhone?: string | null;
  toName?: string | null;

  type: string;
  title: string;
  message: string;

  ticketId?: string | null;
  href?: string | null;

  metadata?: any;
};



type DispatchNotificationWhatsAppResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  error?: string;
  mode?: "dev" | "disabled" | "real";
  eventType?: NotificationEventType;
  eventLabel?: string;
  toPhone?: string | null;
  toName?: string | null;
};



/* =========================================================
   HELPERS GERAIS
   ========================================================= */

function normalizeNotificationType(type?: string | null): NotificationEventType {
  const eventType = String(type || "GENERAL") as NotificationEventType;

  return getNotificationEventConfig(eventType).type;
}



function getAppBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}



function buildAbsoluteUrl(href?: string | null) {
  if (!href) return null;

  if (href.startsWith("http://") || href.startsWith("https://")) {
    return href;
  }

  return `${getAppBaseUrl()}${href.startsWith("/") ? href : `/${href}`}`;
}



function isChannelAvailableForEvent({
  eventType,
  channel,
}: {
  eventType: NotificationEventType;
  channel: NotificationChannel;
}) {
  const availableChannels = getNotificationAvailableChannels(eventType);

  return availableChannels.includes(channel);
}



function isEmailGloballyEnabled() {
  const value = process.env.EMAIL_NOTIFICATIONS_ENABLED;

  if (value === "false") {
    return false;
  }

  return true;
}



function isWhatsAppGloballyEnabled() {
  /*
    Variável principal:
    - WHATSAPP_NOTIFICATIONS_ENABLED

    Regra:
    - false desliga completamente o canal;
    - qualquer outro valor mantém o canal disponível para o dispatcher;
    - o envio real continua controlado/bloqueado em src/lib/whatsapp.ts.
  */
  const value = process.env.WHATSAPP_NOTIFICATIONS_ENABLED;

  if (value === "false") {
    return false;
  }

  return true;
}



function skippedEmail(reason: string): DispatchNotificationEmailResult {
  return {
    ok: true,
    skipped: true,
    reason,
  };
}



function skippedWhatsApp(reason: string): DispatchNotificationWhatsAppResult {
  return {
    ok: true,
    skipped: true,
    mode: "disabled",
    reason,
  };
}



/* =========================================================
   CONTROLE DE CONSENTIMENTO WHATSAPP

   Por enquanto:
   - phoneOptOutAt preenchido bloqueia WhatsApp.
   - phoneOptInAt ainda não é obrigatório, porque já temos:
       preferência por evento + telefone cadastrado.
   - Quando formos para provedor real, podemos endurecer:
       exigir phoneOptInAt preenchido.
   ========================================================= */

async function getWhatsAppUserConsent(userId: string) {
  const user = await db.user.findFirst({
    where: {
      id: userId,
      isActive: true,
    },
    select: {
      id: true,
      phone: true,
      phoneOptInAt: true,
      phoneOptOutAt: true,
    },
  });

  if (!user) {
    return {
      ok: false,
      reason: "USER_NOT_FOUND_OR_INACTIVE",
      user: null,
    };
  }

  if (user.phoneOptOutAt) {
    return {
      ok: false,
      reason: "USER_WHATSAPP_OPTED_OUT",
      user,
    };
  }

  return {
    ok: true,
    reason: null,
    user,
  };
}



/* =========================================================
   DISPATCHER DE E-MAIL
   ========================================================= */

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
      return skippedEmail("EMAIL_NOTIFICATIONS_DISABLED");
    }

    if (!isNotificationExternalReady(eventType)) {
      return skippedEmail("EVENT_NOT_EXTERNAL_READY");
    }

    if (
      !isChannelAvailableForEvent({
        eventType,
        channel: "EMAIL",
      })
    ) {
      return skippedEmail("EMAIL_NOT_AVAILABLE_FOR_EVENT");
    }

    if (!to) {
      return skippedEmail("USER_WITHOUT_EMAIL");
    }

    if (shouldRespectUserNotificationPreference(eventType)) {
      const emailAllowed = await isNotificationChannelEnabledForUser({
        userId,
        eventType,
        channel: "EMAIL",
      });

      if (!emailAllowed) {
        return skippedEmail("USER_EMAIL_PREFERENCE_DISABLED");
      }
    }



    /* =======================================================
       MONTA E ENVIA E-MAIL

       O sendMail() decide se envia via Resend real ou se exibe
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



/* =========================================================
   DISPATCHER DE WHATSAPP

   Nesta etapa:
   - Prepara mensagem;
   - Valida evento, canal, preferência, telefone e opt-out;
   - Chama sendWhatsAppMessage();
   - sendWhatsAppMessage() decide se loga em modo dev ou bloqueia real.
   ========================================================= */

export async function dispatchNotificationWhatsApp({
  userId,
  toPhone,
  toName,
  type,
  title,
  message,
  ticketId,
  href,
  metadata,
}: DispatchNotificationWhatsAppInput): Promise<DispatchNotificationWhatsAppResult> {
  try {
    const eventType = normalizeNotificationType(type);
    const eventConfig = getNotificationEventConfig(eventType);



    /* =======================================================
       BLOQUEIOS ESPERADOS

       Estes casos não são erros:
       - WhatsApp globalmente desligado;
       - evento não preparado para externo;
       - evento sem canal WHATSAPP;
       - usuário sem telefone;
       - usuário fez opt-out de WhatsApp;
       - usuário desativou WhatsApp nas preferências.
       ======================================================= */

    if (!isWhatsAppGloballyEnabled()) {
      return skippedWhatsApp("WHATSAPP_NOTIFICATIONS_DISABLED");
    }

    if (!isNotificationExternalReady(eventType)) {
      return skippedWhatsApp("EVENT_NOT_EXTERNAL_READY");
    }

    if (
      !isChannelAvailableForEvent({
        eventType,
        channel: "WHATSAPP",
      })
    ) {
      return skippedWhatsApp("WHATSAPP_NOT_AVAILABLE_FOR_EVENT");
    }

    if (!toPhone) {
      return skippedWhatsApp("USER_WITHOUT_PHONE");
    }

    const consent = await getWhatsAppUserConsent(userId);

    if (!consent.ok) {
      return skippedWhatsApp(consent.reason || "USER_WHATSAPP_NOT_ALLOWED");
    }

    if (shouldRespectUserNotificationPreference(eventType)) {
      const whatsAppAllowed = await isNotificationChannelEnabledForUser({
        userId,
        eventType,
        channel: "WHATSAPP",
      });

      if (!whatsAppAllowed) {
        return skippedWhatsApp("USER_WHATSAPP_PREFERENCE_DISABLED");
      }
    }



    /* =======================================================
       MONTA MENSAGEM DE WHATSAPP

       O texto é propositalmente mais curto que o e-mail.
       ======================================================= */

    const actionUrl = buildAbsoluteUrl(href);

    const whatsAppMessage = buildNotificationWhatsAppMessage({
      eventType,
      recipientName: toName || null,

      ticketId: ticketId || null,
      ticketTitle: metadata?.ticketTitle || title || null,
      ticketStatus: metadata?.ticketStatus || metadata?.status || null,
      ticketPriority: metadata?.ticketPriority || metadata?.priority || null,

      condominiumName: metadata?.condominiumName || null,
      unitLabel: metadata?.unitLabel || metadata?.unitName || null,

      actorName: metadata?.actorName || metadata?.userName || null,
      comment: metadata?.comment || metadata?.commentPreview || message || null,

      appUrl: actionUrl || getAppBaseUrl(),
    });



    /* =======================================================
       ENVIO / SIMULAÇÃO

       O comportamento real fica isolado no src/lib/whatsapp.ts.

       Enquanto WHATSAPP_PROVIDER=dev:
       - não envia real;
       - loga em dev local se WHATSAPP_DEV_LOGS=true;
       - não polui Railway se WHATSAPP_DEV_LOGS=false.
       ======================================================= */

    const result = await sendWhatsAppMessage({
      to: toPhone,
      message: whatsAppMessage,
      eventType,
      recipientName: toName || null,
      ticketId: ticketId || null,
    });

    if (!result.ok && !result.skipped) {
      console.error("[EloGest Dispatcher] Falha no envio de WhatsApp:", {
        userId,
        toPhone,
        eventType,
        eventLabel: eventConfig.label,
        title,
        reason: result.reason,
      });
    }

    return {
      ok: result.ok,
      skipped: result.skipped,
      reason: result.reason,
      mode: result.mode,
      eventType,
      eventLabel: eventConfig.label,
      toPhone,
      toName: toName || null,
    };
  } catch (error) {
    console.error("[EloGest Dispatcher] Falha ao despachar WhatsApp:", {
      userId,
      toPhone,
      type,
      title,
      error,
    });

    return {
      ok: false,
      error: "Falha ao despachar WhatsApp.",
    };
  }
}