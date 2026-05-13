import { randomBytes, createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { passwordResetEmailTemplate } from "@/lib/mail-templates";



/* =========================================================
   API - SOLICITAR RECUPERAÇÃO DE SENHA

   Rota:
   POST /api/auth/forgot-password

   ETAPA 42.5 — SMTP REAL VIA RESEND / RAILWAY

   Ajustes desta revisão:
   - Mantém resposta genérica para segurança.
   - Usa APP_URL, NEXT_PUBLIC_APP_URL ou NEXTAUTH_URL para montar o link.
   - Registra logs seguros no Railway para confirmar se o envio foi chamado.
   - Não revela se o e-mail existe para o usuário final.
   - Não retorna token em produção.
   ========================================================= */

export const dynamic = "force-dynamic";



const RESET_TOKEN_EXPIRATION_MINUTES = 60;



function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}



function getBaseUrl(request: NextRequest) {
  /*
    Prioridade:
    1. APP_URL — variável que já configuramos no Railway.
    2. NEXT_PUBLIC_APP_URL — compatibilidade anterior.
    3. NEXTAUTH_URL — fallback comum em produção.
    4. Origin/host da requisição.
  */
  const appUrl =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL;

  if (appUrl) {
    return appUrl.replace(/\/$/, "");
  }

  const origin = request.headers.get("origin");

  if (origin) {
    return origin.replace(/\/$/, "");
  }

  const host = request.headers.get("host");

  if (host) {
    const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
    return `${protocol}://${host}`;
  }

  return "http://localhost:3000";
}



export async function POST(request: NextRequest) {
  const genericMessage =
    "Se o e-mail estiver cadastrado, enviaremos as instruções para redefinir sua senha.";

  try {
    const body = await request.json();
    const email = String(body?.email || "").trim().toLowerCase();

    if (!email) {
      return NextResponse.json(
        {
          error: "Informe o e-mail para continuar.",
        },
        {
          status: 400,
        }
      );
    }

    console.log("[EloGest] Solicitação de recuperação de senha recebida:", {
      email,
      nodeEnv: process.env.NODE_ENV,
    });

    const user = await db.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
        email: true,
        isActive: true,
      },
    });



    /* =======================================================
       RESPOSTA GENÉRICA

       Não revelamos se o e-mail existe ou não.
       Isso evita enumeração de usuários.

       Importante:
       - Se o usuário não existir ou estiver inativo, nenhum e-mail
         será enviado.
       - A tela ainda retorna mensagem genérica.
       ======================================================= */

    if (!user || !user.isActive) {
      console.log(
        "[EloGest] Recuperação solicitada para e-mail inexistente ou usuário inativo."
      );

      return NextResponse.json({
        message: genericMessage,
      });
    }

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);

    const expiresAt = new Date();
    expiresAt.setMinutes(
      expiresAt.getMinutes() + RESET_TOKEN_EXPIRATION_MINUTES
    );

    await db.user.update({
      where: {
        id: user.id,
      },
      data: {
        passwordResetToken: tokenHash,
        passwordResetTokenExpires: expiresAt,
        passwordResetRequestedAt: new Date(),
      },
    });

    const resetUrl = `${getBaseUrl(request)}/redefinir-senha?token=${rawToken}`;

    const template = passwordResetEmailTemplate({
      resetUrl,
      expiresInMinutes: RESET_TOKEN_EXPIRATION_MINUTES,
    });

    const mailResult = await sendMail({
      to: user.email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    if (!mailResult.ok) {
      console.error("[EloGest] Falha ao enviar e-mail de recuperação:", {
        userId: user.id,
        email: user.email,
        error: mailResult.error,
        skipped: mailResult.skipped || false,
      });
    } else {
      console.log("[EloGest] E-mail de recuperação processado:", {
        userId: user.id,
        email: user.email,
        skipped: mailResult.skipped || false,
        messageId: mailResult.messageId || null,
      });
    }



    /* =======================================================
       DESENVOLVIMENTO

       Em dev, mantemos o link retornando para facilitar teste.
       Em produção, jamais retornamos o token.
       ======================================================= */

    return NextResponse.json({
      message: genericMessage,
      devResetUrl: process.env.NODE_ENV === "production" ? undefined : resetUrl,
      mailPreview:
        process.env.NODE_ENV === "production"
          ? undefined
          : {
              sent: mailResult.ok,
              skipped: mailResult.skipped || false,
              messageId: mailResult.messageId || null,
            },
    });
  } catch (error) {
    console.error("Erro ao solicitar recuperação de senha:", error);

    return NextResponse.json(
      {
        error: "Não foi possível solicitar a recuperação de senha.",
      },
      {
        status: 500,
      }
    );
  }
}