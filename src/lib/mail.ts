import { Resend } from "resend";



/* =========================================================
   MAIL SERVICE - ELOGEST

   ETAPA 42.9 — LIMPEZA DE SEGURANÇA

   Objetivo:
   - Centralizar o envio de e-mails da plataforma.
   - Usar exclusivamente a API HTTPS da Resend.
   - Evitar dependência de SMTP no Railway.
   - Evitar termos sensíveis em comentários/logs do código.
   - Nunca salvar chaves, tokens ou senhas no repositório.

   Variáveis necessárias no Railway:
   - RESEND_API_KEY
   - MAIL_FROM

   Exemplo de remetente em produção:
   - nao-responda@mail.elogest.com.br
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
  const mailFrom = process.env.MAIL_FROM;

  if (mailFrom && mailFrom.trim()) {
    return mailFrom.trim();
  }

  return "nao-responda@mail.elogest.com.br";
}



function hasResendConfig() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
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
     SEM PROVEDOR CONFIGURADO

     Em desenvolvimento:
     - Exibe preview seguro no console.

     Em produção:
     - Retorna erro controlado sem derrubar a aplicação.
     ========================================================= */

  if (!hasResendConfig()) {
    console.log("");
    console.log("=========================================================");
    console.log("[EloGest Mail] Provedor de e-mail não configurado.");
    console.log("[EloGest Mail] Remetente:", getMailFrom());
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
        error: "Provedor de e-mail não configurado.",
      };
    }

    return {
      ok: true,
      skipped: true,
      messageId: "dev-mail-preview",
    };
  }



  /* =========================================================
     ENVIO REAL VIA RESEND API
     ========================================================= */

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);

    console.log("[EloGest Mail] Enviando e-mail via Resend:", {
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
        error: result.error.message || "Falha ao enviar e-mail.",
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
    console.error("[EloGest Mail] Erro ao enviar e-mail:", error);

    return {
      ok: false,
      error: "Falha ao enviar e-mail.",
    };
  }
}