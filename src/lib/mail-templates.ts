/* =========================================================
   MAIL TEMPLATES - ELOGEST

   ETAPA 42.3 — NOTIFICAÇÕES POR E-MAIL

   Objetivo:
   - Centralizar templates básicos de e-mail.
   - Começar pela recuperação de senha.
   - Preparar base para notificações futuras:
     chamados, comentários, atribuições e status.
   ========================================================= */



type PasswordResetTemplateInput = {
  resetUrl: string;
  expiresInMinutes: number;
};



function baseEmailTemplate({
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
    <title>${title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>

  <body style="margin:0;padding:0;background:#F6F8F7;font-family:Arial,Helvetica,sans-serif;color:#17211B;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${preview}
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
                  Se você não solicitou esta ação, ignore este e-mail.
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



export function passwordResetEmailTemplate({
  resetUrl,
  expiresInMinutes,
}: PasswordResetTemplateInput) {
  const subject = "Redefinição de senha — EloGest";

  const html = baseEmailTemplate({
    title: subject,
    preview: "Use o link seguro para redefinir sua senha no EloGest.",
    children: `
      <div style="display:inline-block;margin-bottom:18px;padding:6px 12px;border-radius:999px;background:#EAF7EE;border:1px solid #CFE6D4;color:#256D3C;font-size:12px;font-weight:700;">
        Recuperação de acesso
      </div>

      <h1 style="margin:0 0 12px;font-size:28px;line-height:34px;letter-spacing:-0.04em;color:#17211B;">
        Redefina sua senha.
      </h1>

      <p style="margin:0 0 22px;font-size:15px;line-height:25px;color:#64736A;">
        Recebemos uma solicitação para redefinir a senha da sua conta no EloGest.
        Clique no botão abaixo para criar uma nova senha.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0;">
        <tr>
          <td>
            <a href="${resetUrl}" style="display:inline-block;background:#256D3C;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:700;padding:14px 22px;border-radius:16px;">
              Redefinir senha
            </a>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 16px;font-size:14px;line-height:23px;color:#64736A;">
        Por segurança, este link expira em ${expiresInMinutes} minutos.
      </p>

      <div style="margin-top:22px;padding:16px;border-radius:18px;background:#F7F9F8;border:1px solid #DDE5DF;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#17211B;">
          Caso o botão não funcione, copie e cole este link no navegador:
        </p>

        <p style="margin:0;font-size:12px;line-height:20px;color:#64736A;word-break:break-all;">
          ${resetUrl}
        </p>
      </div>
    `,
  });

  const text = [
    "Redefinição de senha — EloGest",
    "",
    "Recebemos uma solicitação para redefinir a senha da sua conta no EloGest.",
    `Acesse o link abaixo para criar uma nova senha. O link expira em ${expiresInMinutes} minutos.`,
    "",
    resetUrl,
    "",
    "Se você não solicitou esta ação, ignore este e-mail.",
  ].join("\n");

  return {
    subject,
    html,
    text,
  };
}