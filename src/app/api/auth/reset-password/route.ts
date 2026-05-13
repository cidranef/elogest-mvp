import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { validateStrongPassword } from "@/lib/password-policy";



/* =========================================================
   API - REDEFINIR SENHA

   Rota:
   POST /api/auth/reset-password

   ETAPA 41.3:
   - Recebe token e nova senha.
   - Valida token pelo hash salvo no banco.
   - Confere validade.
   - Atualiza passwordHash.
   - Remove token para impedir reutilização.

   ETAPA 42.8 — SEGURANÇA DE SENHA
   - Aplica política central de senha forte.
   - Exige:
     mínimo de 8 caracteres,
     letra maiúscula,
     letra minúscula,
     número,
     caractere especial.
   - Bloqueia senhas óbvias/previsíveis.
   - Bloqueia senha contendo parte do e-mail ou nome do usuário.
   ========================================================= */

export const dynamic = "force-dynamic";



function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}



export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const token = String(body?.token || "").trim();
    const password = String(body?.password || "");

    if (!token) {
      return NextResponse.json(
        {
          error: "Token de recuperação inválido.",
        },
        {
          status: 400,
        }
      );
    }

    const tokenHash = hashToken(token);

    const user = await db.user.findFirst({
      where: {
        passwordResetToken: tokenHash,
        passwordResetTokenExpires: {
          gt: new Date(),
        },
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          error: "Link de recuperação inválido ou expirado.",
        },
        {
          status: 400,
        }
      );
    }



    /* =======================================================
       VALIDAÇÃO DE SENHA FORTE

       A validação ocorre depois da validação do token para que
       possamos comparar a senha com e-mail/nome do usuário.
       ======================================================= */

    const passwordValidation = validateStrongPassword(password, {
      email: user.email,
      name: user.name,
    });

    if (!passwordValidation.valid) {
      return NextResponse.json(
        {
          error: passwordValidation.errors.join(" "),
          errors: passwordValidation.errors,
        },
        {
          status: 400,
        }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await db.user.update({
      where: {
        id: user.id,
      },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetTokenExpires: null,
        passwordResetRequestedAt: null,
      },
    });

    return NextResponse.json({
      message: "Senha redefinida com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao redefinir senha:", error);

    return NextResponse.json(
      {
        error: "Não foi possível redefinir a senha.",
      },
      {
        status: 500,
      }
    );
  }
}