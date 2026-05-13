import nodemailer from "nodemailer";
import { Resend } from "resend";



/* =========================================================
   MAIL SERVICE - ELOGEST

   ETAPA 42.5 — RESEND API / SMTP FALLBACK

   Objetivo:
   - Centralizar o envio de e-mails da plataforma.
   - Priorizar envio pela API HTTPS da Resend.
   - Manter SMTP como fallback.
   - Continuar permitindo preview em desenvolvimento.
   - Evitar bloqueio de portas SMTP no Railway Free/Hobby.

   Variáveis recomendadas no Railway:

   RESEND_API_KEY=
   MAIL_FROM=EloGest <nao-responda@elogest.com.br>

   Fallback SMTP, se necessário:
   SMTP_HOST=
   SMTP_PORT=
   SMTP_SECURE=
   SMTP_USER=
   SMTP_PASS=
   SMTP_FROM=

   Compatibilidade antiga:
   MAIL_FROM_NAME=EloGest
   MAIL_FROM_EMAIL=nao-responda@elogest.com.br
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
    1. MAIL_FROM — padrão recomendado para Resend API.
    2. SMTP_FROM — compatibilidade com configuração SMTP.
    3. MAIL_FROM_NAME + MAIL_FROM_EMAIL.
    4. Fallback seguro EloGest.
  */

  const mailFrom = process.env.MAIL_FROM;

  if (mailFrom && mailFrom.trim()) {
    return mailFrom.trim();
  }

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
  const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"];

  return required.filter((key) => {
    const value = process.env[key];
    return !value || !String(value).trim();
  });
}



function hasSmtpConfig() {
  return getMissingSmtpConfig().length === 0;
}



function hasResendConfig() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
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



async function sendMailWithResend({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendMailResult> {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);

    console.log("[EloGest Mail] Enviando e-mail via Resend API:", {
      from: getMailFrom(),
      to,
      subject,
    });

    const result = await resend.emails.send({
      from: getMailFrom(),
      to,
      subject,
      html,
      text,
    });

    if (result.error) {
      console.error("[EloGest Mail] Erro retornado pela Resend:", {
        name: result.error.name,
        message: result.error.message,
      });

      return {
        ok: false,
        error: result.error.message || "Falha ao enviar e-mail pela Resend.",
      };
    }

    console.log("[EloGest Mail] E-mail enviado com sucesso via Resend:", {
      to,
      messageId: result.data?.id || null,
    });

    return {
      ok: true,
      messageId: result.data?.id || undefined,
    };
  } catch (error) {
    console.error("[EloGest Mail] Erro ao enviar e-mail via Resend:", error);

    return {
      ok: false,
      error: "Falha ao enviar e-mail pela Resend.",
    };
  }
}



async function sendMailWithSmtp({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendMailResult> {
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

    console.log("[EloGest Mail] E-mail enviado com sucesso via SMTP:", {
      to,
      messageId: result.messageId,
    });

    return {
      ok: true,
      messageId: result.messageId,
    };
  } catch (error) {
    console.error("[EloGest Mail] Erro ao enviar e-mail via SMTP:", error);

    return {
      ok: false,
      error: "Falha ao enviar e-mail por SMTP.",
    };
  }
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
     PRIORIDADE 1 — RESEND API HTTPS

     Este é o caminho recomendado no Railway, pois não depende
     de portas SMTP de saída.
     ========================================================= */

  if (hasResendConfig()) {
    return sendMailWithResend({
      to,
      subject,
      html,
      text,
    });
  }



  /* =========================================================
     PRIORIDADE 2 — SMTP FALLBACK
     ========================================================= */

  if (hasSmtpConfig()) {
    return sendMailWithSmtp({
      to,
      subject,
      html,
      text,
    });
  }



  /* =========================================================
     MODO SEM CONFIGURAÇÃO DE ENVIO
     ========================================================= */

  console.log("");
  console.log("=========================================================");
  console.log("[EloGest Mail] Nenhum provedor de e-mail configurado.");
  console.log("[EloGest Mail] RESEND_API_KEY ausente.");
  console.log(
    "[EloGest Mail] SMTP ausente:",
    getMissingSmtpConfig().join(", ")
  );
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
      error: "Nenhum provedor de e-mail configurado.",
    };
  }

  return {
    ok: true,
    skipped: true,
    messageId: "dev-mail-preview",
  };
}