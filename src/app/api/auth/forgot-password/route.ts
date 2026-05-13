import { randomBytes, createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { passwordResetEmailTemplate } from "@/lib/mail-templates";



/* =========================================================
   API - SOLICITAR RECUPERAÇÃO DE SENHA

   Rota:
   POST /api/auth/forgot-password

   ETAPA 41.3:
   - Recebe e-mail.
   - Se usuário existir e estiver ativo, gera token seguro.
   - Salva apenas o hash do token no banco.
   - Como ainda não há configuração de e-mail, retorna devResetUrl
     apenas fora de produção.
   - Em produção, nunca revela se o e-mail existe.

   ETAPA 42.3 — E-MAIL DE RECUPERAÇÃO DE SENHA

   Ajustes desta revisão:
   - Integra envio com src/lib/mail.ts.
   - Usa template central em src/lib/mail-templates.ts.
   - Mantém resposta genérica para evitar enumeração de usuários.
   - Em desenvolvimento, se SMTP não estiver configurado, o e-mail
     é exibido no console e o devResetUrl continua sendo retornado.
   - Em produção, não retorna o link.
   - Falha no envio não revela se o usuário existe.
   ========================================================= */

export const dynamic = "force-dynamic";



const RESET_TOKEN_EXPIRATION_MINUTES = 60;



function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}



function getBaseUrl(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

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
       ======================================================= */

    if (!user || !user.isActive) {
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