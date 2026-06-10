/* =========================================================
   NOTIFICATION EMAIL TEMPLATES - ELOGEST

   ETAPA 42.3.4 — NOTIFICAÇÕES EXTERNAS POR E-MAIL

   Objetivo:
   - Centralizar templates de e-mails transacionais de notificação.
   - Atender eventos de chamados:
     novo chamado,
     atribuição,
     comentário,
     status,
     resolução e avaliação.
   - Manter visual simples, seguro e compatível com clientes de e-mail.

   ETAPA 49 — REUNIÕES DE CONSELHO
   - Adicionado template genérico de reunião para Sala De Reunião EloGest.
   - O mesmo padrão poderá ser reaproveitado futuramente em Assembleias.
   ========================================================= */



export type NotificationEmailTemplateInput = {
  title: string;
  message: string;
  actionUrl?: string | null;
  actionLabel?: string;
  ticketTitle?: string | null;
  condominiumName?: string | null;
  eventLabel?: string | null;
};



function escapeHtml(value?: string | null) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}



function baseNotificationEmailTemplate({
  title,
  preview,
  children,
}: {
  title: string;
  preview: string;
  children: string;
}) {
  return `
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>

  <body style="margin:0;padding:0;background:#F6F8F7;font-family:Arial,Helvetica,sans-serif;color:#17211B;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${escapeHtml(preview)}
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F8F7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#FFFFFF;border:1px solid #DDE5DF;border-radius:28px;overflow:hidden;box-shadow:0 18px 55px rgba(23,33,27,0.08);">
            <tr>
              <td style="padding:28px 32px;background:#17211B;">
                <div style="font-size:26px;font-weight:700;letter-spacing:-0.04em;">
                  <span style="color:#8ED08E;">Elo</span><span style="color:#FFFFFF;">Gest</span>
                </div>
                <div style="margin-top:6px;font-size:13px;color:rgba(255,255,255,0.62);">
                  Governança Condominial
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:32px;">
                ${children}
              </td>
            </tr>

            <tr>
              <td style="padding:20px 32px;background:#F7F9F8;border-top:1px solid #DDE5DF;">
                <p style="margin:0;font-size:12px;line-height:20px;color:#64736A;">
                  Esta é uma mensagem automática da plataforma EloGest.
                  Você pode ajustar suas preferências de notificação dentro da plataforma.
                </p>
              </td>
            </tr>
          </table>

          <p style="margin:18px 0 0;font-size:12px;color:#7A877F;">
            EloGest · Plataforma de governança condominial
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
}



export function ticketNotificationEmailTemplate({
  title,
  message,
  actionUrl,
  actionLabel = "Acessar chamado",
  ticketTitle,
  condominiumName,
  eventLabel,
}: NotificationEmailTemplateInput) {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const safeTicketTitle = escapeHtml(ticketTitle);
  const safeCondominiumName = escapeHtml(condominiumName);
  const safeEventLabel = escapeHtml(eventLabel || "Notificação");
  const safeActionUrl = escapeHtml(actionUrl);
  const safeActionLabel = escapeHtml(actionLabel);

  const subject = `${title} — EloGest`;

  const details = [
    ticketTitle
      ? `<p style="margin:0 0 8px;font-size:13px;line-height:21px;color:#64736A;"><strong style="color:#17211B;">Chamado:</strong> ${safeTicketTitle}</p>`
      : "",
    condominiumName
      ? `<p style="margin:0;font-size:13px;line-height:21px;color:#64736A;"><strong style="color:#17211B;">Condomínio:</strong> ${safeCondominiumName}</p>`
      : "",
  ].join("");

  const html = baseNotificationEmailTemplate({
    title: subject,
    preview: message,
    children: `
      <div style="display:inline-block;margin-bottom:18px;padding:6px 12px;border-radius:999px;background:#EAF7EE;border:1px solid #CFE6D4;color:#256D3C;font-size:12px;font-weight:700;">
        ${safeEventLabel}
      </div>

      <h1 style="margin:0 0 12px;font-size:28px;line-height:34px;letter-spacing:-0.04em;color:#17211B;">
        ${safeTitle}
      </h1>

      <p style="margin:0 0 22px;font-size:15px;line-height:25px;color:#64736A;">
        ${safeMessage}
      </p>

      ${
        details
          ? `<div style="margin:22px 0;padding:16px;border-radius:18px;background:#F7F9F8;border:1px solid #DDE5DF;">${details}</div>`
          : ""
      }

      ${
        actionUrl
          ? `
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0;">
              <tr>
                <td>
                  <a href="${safeActionUrl}" style="display:inline-block;background:#256D3C;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:700;padding:14px 22px;border-radius:16px;">
                    ${safeActionLabel}
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0;font-size:12px;line-height:20px;color:#64736A;word-break:break-all;">
              ${safeActionUrl}
            </p>
          `
          : ""
      }
    `,
  });

  const text = [
    subject,
    "",
    message,
    "",
    ticketTitle ? `Chamado: ${ticketTitle}` : "",
    condominiumName ? `Condomínio: ${condominiumName}` : "",
    "",
    actionUrl ? `${actionLabel}: ${actionUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject,
    html,
    text,
  };
}



export type AnnouncementEmailAttachment = {
  originalName: string;
  url: string;
};

export type AnnouncementNotificationEmailTemplateInput = {
  mode: "published" | "reminder";
  title: string;
  content: string;
  actionUrl?: string | null;
  condominiumName?: string | null;
  eventStartAt?: Date | string | null;
  eventEndAt?: Date | string | null;
  requireReadingConfirmation?: boolean;
  attachments?: AnnouncementEmailAttachment[];
};



function formatDateTimeForEmail(value?: Date | string | null) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}



function formatMultilineHtml(value?: string | null) {
  return escapeHtml(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("<br />");
}



export type MeetingNotificationEmailTemplateInput = {
  title: string;
  message: string;
  actionUrl?: string | null;
  actionLabel?: string;
  meetingTitle?: string | null;
  condominiumName?: string | null;
  scheduledStartAt?: Date | string | null;
  scheduledEndAt?: Date | string | null;
  meetingMode?: string | null;
  roomStatus?: string | null;
  eventLabel?: string | null;
};



function formatMeetingModeForEmail(value?: string | null) {
  const mode = String(value || "").trim().toUpperCase();

  const labels: Record<string, string> = {
    ONLINE: "Online",
    PRESENTIAL: "Presencial",
    HYBRID: "Híbrida",
  };

  return labels[mode] || value || null;
}



function formatRoomStatusForEmail(value?: string | null) {
  const status = String(value || "").trim().toUpperCase();

  const labels: Record<string, string> = {
    NOT_CREATED: "Ainda não criada",
    NOT_STARTED: "Aguardando início",
    SCHEDULED: "Agendada",
    OPEN: "Aberta",
    CLOSED: "Encerrada",
    CANCELED: "Cancelada",
  };

  return labels[status] || value || null;
}



export function meetingNotificationEmailTemplate({
  title,
  message,
  actionUrl,
  actionLabel = "Acessar reunião",
  meetingTitle,
  condominiumName,
  scheduledStartAt,
  scheduledEndAt,
  meetingMode,
  roomStatus,
  eventLabel,
}: MeetingNotificationEmailTemplateInput) {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const safeMeetingTitle = escapeHtml(meetingTitle);
  const safeCondominiumName = escapeHtml(condominiumName);
  const safeEventLabel = escapeHtml(eventLabel || "Reunião EloGest");
  const safeActionUrl = escapeHtml(actionUrl);
  const safeActionLabel = escapeHtml(actionLabel);

  const startLabel = formatDateTimeForEmail(scheduledStartAt);
  const endLabel = formatDateTimeForEmail(scheduledEndAt);
  const modeLabel = formatMeetingModeForEmail(meetingMode);
  const roomStatusLabel = formatRoomStatusForEmail(roomStatus);

  const subject = `${title} — EloGest`;

  const details = [
    meetingTitle
      ? `<p style="margin:0 0 8px;font-size:13px;line-height:21px;color:#64736A;"><strong style="color:#17211B;">Reunião:</strong> ${safeMeetingTitle}</p>`
      : "",
    condominiumName
      ? `<p style="margin:0 0 8px;font-size:13px;line-height:21px;color:#64736A;"><strong style="color:#17211B;">Condomínio:</strong> ${safeCondominiumName}</p>`
      : "",
    startLabel
      ? `<p style="margin:0 0 8px;font-size:13px;line-height:21px;color:#64736A;"><strong style="color:#17211B;">Início previsto:</strong> ${escapeHtml(startLabel)}</p>`
      : "",
    endLabel
      ? `<p style="margin:0 0 8px;font-size:13px;line-height:21px;color:#64736A;"><strong style="color:#17211B;">Término previsto:</strong> ${escapeHtml(endLabel)}</p>`
      : "",
    modeLabel
      ? `<p style="margin:0 0 8px;font-size:13px;line-height:21px;color:#64736A;"><strong style="color:#17211B;">Formato:</strong> ${escapeHtml(modeLabel)}</p>`
      : "",
    roomStatusLabel
      ? `<p style="margin:0;font-size:13px;line-height:21px;color:#64736A;"><strong style="color:#17211B;">Sala EloGest:</strong> ${escapeHtml(roomStatusLabel)}</p>`
      : "",
  ].join("");

  const html = baseNotificationEmailTemplate({
    title: subject,
    preview: message,
    children: `
      <div style="display:inline-block;margin-bottom:18px;padding:6px 12px;border-radius:999px;background:#EAF7EE;border:1px solid #CFE6D4;color:#256D3C;font-size:12px;font-weight:700;">
        ${safeEventLabel}
      </div>

      <h1 style="margin:0 0 12px;font-size:28px;line-height:34px;letter-spacing:-0.04em;color:#17211B;">
        ${safeTitle}
      </h1>

      <p style="margin:0 0 22px;font-size:15px;line-height:25px;color:#64736A;">
        ${safeMessage}
      </p>

      ${
        details
          ? `<div style="margin:22px 0;padding:16px;border-radius:18px;background:#F7F9F8;border:1px solid #DDE5DF;">${details}</div>`
          : ""
      }

      ${
        actionUrl
          ? `
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0;">
              <tr>
                <td>
                  <a href="${safeActionUrl}" style="display:inline-block;background:#256D3C;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:700;padding:14px 22px;border-radius:16px;">
                    ${safeActionLabel}
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0;font-size:12px;line-height:20px;color:#64736A;word-break:break-all;">
              ${safeActionUrl}
            </p>
          `
          : ""
      }
    `,
  });

  const text = [
    subject,
    "",
    message,
    "",
    meetingTitle ? `Reunião: ${meetingTitle}` : "",
    condominiumName ? `Condomínio: ${condominiumName}` : "",
    startLabel ? `Início previsto: ${startLabel}` : "",
    endLabel ? `Término previsto: ${endLabel}` : "",
    modeLabel ? `Formato: ${modeLabel}` : "",
    roomStatusLabel ? `Sala EloGest: ${roomStatusLabel}` : "",
    "",
    actionUrl ? `${actionLabel}: ${actionUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject,
    html,
    text,
  };
}



export function announcementNotificationEmailTemplate({
  mode,
  title,
  content,
  actionUrl,
  condominiumName,
  eventStartAt,
  eventEndAt,
  requireReadingConfirmation = true,
  attachments = [],
}: AnnouncementNotificationEmailTemplateInput) {
  const eventLabel = mode === "reminder"
    ? "Lembrete de comunicado"
    : "Novo comunicado";

  const subject = mode === "reminder"
    ? `Lembrete de leitura — ${title}`
    : `Novo comunicado — ${title}`;

  const safeTitle = escapeHtml(title);
  const safeContent = formatMultilineHtml(content);
  const safeCondominiumName = escapeHtml(condominiumName);
  const safeActionUrl = escapeHtml(actionUrl);
  const eventStartLabel = formatDateTimeForEmail(eventStartAt);
  const eventEndLabel = formatDateTimeForEmail(eventEndAt);

  const detailRows = [
    condominiumName
      ? `<p style="margin:0 0 8px;font-size:13px;line-height:21px;color:#64736A;"><strong style="color:#17211B;">Condomínio:</strong> ${safeCondominiumName}</p>`
      : "",
    eventStartLabel
      ? `<p style="margin:0 0 8px;font-size:13px;line-height:21px;color:#64736A;"><strong style="color:#17211B;">Início previsto:</strong> ${escapeHtml(eventStartLabel)}</p>`
      : "",
    eventEndLabel
      ? `<p style="margin:0;font-size:13px;line-height:21px;color:#64736A;"><strong style="color:#17211B;">Término previsto:</strong> ${escapeHtml(eventEndLabel)}</p>`
      : "",
  ].join("");

  const attachmentRows = attachments
    .filter((attachment) => attachment.originalName && attachment.url)
    .map((attachment) => {
      const safeName = escapeHtml(attachment.originalName);
      const safeUrl = escapeHtml(attachment.url);

      return `<li style="margin:0 0 8px;font-size:13px;line-height:21px;color:#64736A;"><a href="${safeUrl}" style="color:#256D3C;font-weight:700;text-decoration:none;">${safeName}</a></li>`;
    })
    .join("");

  const html = baseNotificationEmailTemplate({
    title: subject,
    preview: mode === "reminder"
      ? `Você ainda não confirmou a leitura do comunicado: ${title}`
      : `Você recebeu um novo comunicado: ${title}`,
    children: `
      <div style="display:inline-block;margin-bottom:18px;padding:6px 12px;border-radius:999px;background:#EAF7EE;border:1px solid #CFE6D4;color:#256D3C;font-size:12px;font-weight:700;">
        ${escapeHtml(eventLabel)}
      </div>

      <h1 style="margin:0 0 12px;font-size:28px;line-height:34px;letter-spacing:-0.04em;color:#17211B;">
        ${safeTitle}
      </h1>

      <p style="margin:0 0 22px;font-size:15px;line-height:25px;color:#64736A;">
        ${mode === "reminder"
          ? "Este é um lembrete para confirmar a leitura de um comunicado ainda pendente no portal EloGest."
          : "A administradora publicou um comunicado para o seu perfil no portal EloGest."}
      </p>

      ${
        detailRows
          ? `<div style="margin:22px 0;padding:16px;border-radius:18px;background:#F7F9F8;border:1px solid #DDE5DF;">${detailRows}</div>`
          : ""
      }

      <div style="margin:22px 0;padding:18px;border-radius:18px;background:#FFFFFF;border:1px solid #DDE5DF;">
        <p style="margin:0;font-size:14px;line-height:24px;color:#17211B;">
          ${safeContent || "Consulte o comunicado completo no portal EloGest."}
        </p>
      </div>

      ${
        attachmentRows
          ? `<div style="margin:22px 0;padding:16px;border-radius:18px;background:#F7F9F8;border:1px solid #DDE5DF;"><p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#17211B;">Documentos anexos</p><ul style="margin:0;padding-left:18px;">${attachmentRows}</ul></div>`
          : ""
      }

      ${
        requireReadingConfirmation
          ? `<p style="margin:0 0 18px;font-size:13px;line-height:21px;color:#64736A;">Este comunicado exige confirmação de leitura pelo portal.</p>`
          : ""
      }

      ${
        actionUrl
          ? `
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0;">
              <tr>
                <td>
                  <a href="${safeActionUrl}" style="display:inline-block;background:#256D3C;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:700;padding:14px 22px;border-radius:16px;">
                    Abrir comunicado
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0;font-size:12px;line-height:20px;color:#64736A;word-break:break-all;">
              ${safeActionUrl}
            </p>
          `
          : ""
      }
    `,
  });

  const text = [
    subject,
    "",
    mode === "reminder"
      ? "Você ainda não confirmou a leitura deste comunicado no portal EloGest."
      : "Você recebeu um novo comunicado no portal EloGest.",
    "",
    `Título: ${title}`,
    condominiumName ? `Condomínio: ${condominiumName}` : "",
    eventStartLabel ? `Início previsto: ${eventStartLabel}` : "",
    eventEndLabel ? `Término previsto: ${eventEndLabel}` : "",
    "",
    content,
    "",
    attachments.length > 0
      ? `Anexos: ${attachments.map((attachment) => attachment.originalName).join(", ")}`
      : "",
    requireReadingConfirmation ? "Este comunicado exige confirmação de leitura pelo portal." : "",
    actionUrl ? `Abrir comunicado: ${actionUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject,
    html,
    text,
  };
}


/* =========================================================
   ETAPA 51.7 — E-MAILS DE ASSEMBLEIAS
   ========================================================= */

export type AssemblyNotificationEmailTemplateInput = {
  mode: "convocation" | "reminder" | "deadline_extended" | "results";
  title: string;
  message: string;
  actionUrl?: string | null;
  condominiumName?: string | null;
  scheduledStartAt?: Date | string | null;
  votingStartsAt?: Date | string | null;
  votingEndsAt?: Date | string | null;
  previousVotingEndsAt?: Date | string | null;
  extensionReason?: string | null;
  meetingMode?: string | null;
  representedUnits?: string[];
};

export function assemblyNotificationEmailTemplate({
  mode,
  title,
  message,
  actionUrl,
  condominiumName,
  scheduledStartAt,
  votingStartsAt,
  votingEndsAt,
  previousVotingEndsAt,
  extensionReason,
  meetingMode,
  representedUnits = [],
}: AssemblyNotificationEmailTemplateInput) {
  const eventLabel =
    mode === "reminder"
      ? "Lembrete de assembleia"
      : mode === "deadline_extended"
        ? "Prazo da votação prorrogado"
        : mode === "results"
          ? "Resultados da assembleia"
          : "Convocação de assembleia";

  const subject =
    mode === "reminder"
      ? `Lembrete de votação — ${title}`
      : mode === "deadline_extended"
        ? `Prazo da votação prorrogado — ${title}`
        : mode === "results"
          ? `Resultados da assembleia — ${title}`
          : `Convocação de assembleia — ${title}`;
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const safeCondominiumName = escapeHtml(condominiumName);
  const safeActionUrl = escapeHtml(actionUrl);
  const startLabel = formatDateTimeForEmail(scheduledStartAt);
  const votingStartLabel = formatDateTimeForEmail(votingStartsAt);
  const votingEndLabel = formatDateTimeForEmail(votingEndsAt);
  const previousVotingEndLabel = formatDateTimeForEmail(previousVotingEndsAt);
  const safeExtensionReason = escapeHtml(extensionReason);
  const modeLabel = formatMeetingModeForEmail(meetingMode);
  const representedUnitsLabel = representedUnits
    .map((unit) => escapeHtml(unit))
    .filter(Boolean)
    .join(", ");

  const details = [
    condominiumName
      ? `<p style="margin:0 0 8px;font-size:13px;line-height:21px;color:#64736A;"><strong style="color:#17211B;">Condomínio:</strong> ${safeCondominiumName}</p>`
      : "",
    startLabel
      ? `<p style="margin:0 0 8px;font-size:13px;line-height:21px;color:#64736A;"><strong style="color:#17211B;">Assembleia:</strong> ${escapeHtml(startLabel)}</p>`
      : "",
    votingStartLabel
      ? `<p style="margin:0 0 8px;font-size:13px;line-height:21px;color:#64736A;"><strong style="color:#17211B;">Início da votação:</strong> ${escapeHtml(votingStartLabel)}</p>`
      : "",
    previousVotingEndLabel
      ? `<p style="margin:0 0 8px;font-size:13px;line-height:21px;color:#64736A;"><strong style="color:#17211B;">Prazo anterior:</strong> ${escapeHtml(previousVotingEndLabel)}</p>`
      : "",
    votingEndLabel
      ? `<p style="margin:0 0 8px;font-size:13px;line-height:21px;color:#64736A;"><strong style="color:#17211B;">${mode === "deadline_extended" ? "Novo prazo final" : "Fim da votação"}:</strong> ${escapeHtml(votingEndLabel)}</p>`
      : "",
    extensionReason
      ? `<p style="margin:0 0 8px;font-size:13px;line-height:21px;color:#64736A;"><strong style="color:#17211B;">Motivo:</strong> ${safeExtensionReason}</p>`
      : "",
    modeLabel
      ? `<p style="margin:0 0 8px;font-size:13px;line-height:21px;color:#64736A;"><strong style="color:#17211B;">Modalidade:</strong> ${escapeHtml(modeLabel)}</p>`
      : "",
    representedUnitsLabel
      ? `<p style="margin:0;font-size:13px;line-height:21px;color:#64736A;"><strong style="color:#17211B;">Unidades representadas:</strong> ${representedUnitsLabel}</p>`
      : "",
  ].join("");

  const html = baseNotificationEmailTemplate({
    title: subject,
    preview: message,
    children: `
      <div style="display:inline-block;margin-bottom:18px;padding:6px 12px;border-radius:999px;background:#EAF7EE;border:1px solid #CFE6D4;color:#256D3C;font-size:12px;font-weight:700;">
        ${escapeHtml(eventLabel)}
      </div>
      <h1 style="margin:0 0 12px;font-size:28px;line-height:34px;letter-spacing:-0.04em;color:#17211B;">${safeTitle}</h1>
      <p style="margin:0 0 22px;font-size:15px;line-height:25px;color:#64736A;">${safeMessage}</p>
      ${details ? `<div style="margin:22px 0;padding:16px;border-radius:18px;background:#F7F9F8;border:1px solid #DDE5DF;">${details}</div>` : ""}
      ${actionUrl ? `
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0;"><tr><td>
          <a href="${safeActionUrl}" style="display:inline-block;background:#256D3C;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:700;padding:14px 22px;border-radius:16px;">Acessar assembleia</a>
        </td></tr></table>
        <p style="margin:0;font-size:12px;line-height:20px;color:#64736A;word-break:break-all;">${safeActionUrl}</p>
      ` : ""}
    `,
  });

  const text = [
    subject,
    "",
    message,
    "",
    condominiumName ? `Condomínio: ${condominiumName}` : "",
    startLabel ? `Assembleia: ${startLabel}` : "",
    votingStartLabel ? `Início da votação: ${votingStartLabel}` : "",
    previousVotingEndLabel ? `Prazo anterior: ${previousVotingEndLabel}` : "",
    votingEndLabel ? `${mode === "deadline_extended" ? "Novo prazo final" : "Fim da votação"}: ${votingEndLabel}` : "",
    extensionReason ? `Motivo: ${extensionReason}` : "",
    modeLabel ? `Modalidade: ${modeLabel}` : "",
    representedUnits.length ? `Unidades representadas: ${representedUnits.join(", ")}` : "",
    "",
    actionUrl ? `Acessar assembleia: ${actionUrl}` : "",
  ].filter(Boolean).join("\\n");

  return { subject, html, text };
}
