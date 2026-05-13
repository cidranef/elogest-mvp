import nodemailer from "nodemailer";



/* =========================================================
   MAIL SERVICE - ELOGEST

   ETAPA 42.3 — NOTIFICAÇÕES POR E-MAIL

   Objetivo:
   - Centralizar o envio de e-mails da plataforma.
   - Funcionar em modo desenvolvimento mesmo sem SMTP.
   - Permitir ativação futura em produção apenas configurando .env.
   - Não derrubar rotinas críticas se o envio falhar.

   Variáveis suportadas no .env:

   SMTP_HOST=
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=
   SMTP_PASS=

   MAIL_FROM_NAME=EloGest
   MAIL_FROM_EMAIL=no-reply@elogest.com.br

   NEXT_PUBLIC_APP_URL=http://localhost:3000

   Comportamento:
   - Se SMTP estiver incompleto:
     em desenvolvimento: loga o e-mail no console e retorna skipped.
     em produção: retorna erro controlado, sem quebrar a aplicação.
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
  const fromName = process.env.MAIL_FROM_NAME || "EloGest";
  const fromEmail = process.env.MAIL_FROM_EMAIL || "no-reply@elogest.com.br";

  return `"${fromName}" <${fromEmail}>`;
}



function hasSmtpConfig() {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
  );
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

     Mantém o MVP funcional enquanto ainda não configuramos
     provedor real de e-mail.
     ========================================================= */

  if (!hasSmtpConfig()) {
    console.log("");
    console.log("=========================================================");
    console.log("[EloGest Mail] SMTP não configurado.");
    console.log("[EloGest Mail] E-mail não enviado. Preview abaixo:");
    console.log("---------------------------------------------------------");
    console.log("Para:", to);
    console.log("Assunto:", subject);
    console.log("Texto:", text);
    console.log("=========================================================");
    console.log("");

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

    const result = await transporter.sendMail({
      from: getMailFrom(),
      to,
      subject,
      html,
      text,
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