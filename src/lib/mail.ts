import nodemailer from "nodemailer";



/* =========================================================
   MAIL SERVICE - ELOGEST

   ETAPA 42.5 — SMTP REAL VIA RESEND / RAILWAY

   Objetivo:
   - Centralizar o envio de e-mails da plataforma.
   - Usar SMTP real quando configurado no Railway.
   - Continuar permitindo preview em desenvolvimento.
   - Não expor senhas/API keys nos logs.
   - Suportar tanto SMTP_FROM quanto MAIL_FROM_NAME/MAIL_FROM_EMAIL.

   Variáveis suportadas:

   SMTP_HOST=smtp.resend.com
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER=resend
   SMTP_PASS=API_KEY_DA_RESEND
   SMTP_FROM=EloGest <nao-responda@elogest.com.br>

   Alternativas antigas ainda suportadas:
   MAIL_FROM_NAME=EloGest
   MAIL_FROM_EMAIL=nao-responda@elogest.com.br

   Comportamento:
   - Em desenvolvimento sem SMTP: mostra preview no console.
   - Em produção sem SMTP: retorna erro controlado e registra log seguro.
   ========================================================= */



export type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};



export type SendMailResult = {
  ok: boolean;
  skipped?: boolean;
  messageId?: string;
  error?: string;
};



function getMailFrom() {
  /*
    Prioridade:
    1. SMTP_FROM — padrão usado agora no Railway/Resend.
    2. MAIL_FROM_NAME + MAIL_FROM_EMAIL — compatibilidade.
    3. Fallback seguro do EloGest.
  */
  const smtpFrom = process.env.SMTP_FROM;

  if (smtpFrom && smtpFrom.trim()) {
    return smtpFrom.trim();
  }

  const fromName = process.env.MAIL_FROM_NAME || "EloGest";
  const fromEmail =
    process.env.MAIL_FROM_EMAIL || "nao-responda@elogest.com.br";

  return `"${fromName}" <${fromEmail}>`;
}



function getMissingSmtpConfig() {
  const required = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
  ];

  return required.filter((key) => {
    const value = process.env[key];
    return !value || !String(value).trim();
  });
}



function hasSmtpConfig() {
  return getMissingSmtpConfig().length === 0;
}



function getSmtpTransporter() {
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || "false") === "true";

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}



function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|h1|h2|h3|li|br)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}



export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  const to = String(input.to || "").trim();
  const subject = String(input.subject || "").trim();
  const html = String(input.html || "").trim();
  const text = input.text || htmlToText(html);

  if (!to || !subject || !html) {
    return {
      ok: false,
      error: "Dados insuficientes para envio de e-mail.",
    };
  }



  /* =========================================================
     MODO SEM SMTP

     Em desenvolvimento:
     - Mantém preview em console.

     Em produção:
     - Retorna erro controlado.
     - Não derruba a aplicação.
     - Permite identificar nos logs do Railway que o SMTP
       não foi chamado.
     ========================================================= */

  if (!hasSmtpConfig()) {
    const missing = getMissingSmtpConfig();

    console.log("");
    console.log("=========================================================");
    console.log("[EloGest Mail] SMTP não configurado completamente.");
    console.log("[EloGest Mail] Variáveis ausentes:", missing.join(", "));
    console.log("[EloGest Mail] Remetente configurado:", getMailFrom());
    console.log("---------------------------------------------------------");
    console.log("Para:", to);
    console.log("Assunto:", subject);

    if (process.env.NODE_ENV !== "production") {
      console.log("Texto:", text);
      console.log("[EloGest Mail] Preview exibido apenas em desenvolvimento.");
    }

    console.log("=========================================================");
    console.log("");

    if (process.env.NODE_ENV === "production") {
      return {
        ok: false,
        skipped: true,
        error: `SMTP incompleto: ${missing.join(", ")}`,
      };
    }

    return {
      ok: true,
      skipped: true,
      messageId: "dev-mail-preview",
    };
  }



  /* =========================================================
     ENVIO SMTP REAL
     ========================================================= */

  try {
    const transporter = getSmtpTransporter();

    console.log("[EloGest Mail] Enviando e-mail via SMTP:", {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_SECURE,
      user: process.env.SMTP_USER,
      from: getMailFrom(),
      to,
      subject,
    });

    const result = await transporter.sendMail({
      from: getMailFrom(),
      to,
      subject,
      html,
      text,
    });

    console.log("[EloGest Mail] E-mail enviado com sucesso:", {
      to,
      messageId: result.messageId,
    });

    return {
      ok: true,
      messageId: result.messageId,
    };
  } catch (error) {
    console.error("[EloGest Mail] Erro ao enviar e-mail:", error);

    return {
      ok: false,
      error: "Falha ao enviar e-mail.",
    };
  }
}