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