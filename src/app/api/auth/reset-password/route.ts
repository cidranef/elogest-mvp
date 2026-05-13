import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";



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

    if (!password || password.length < 8) {
      return NextResponse.json(
        {
          error: "A nova senha deve ter pelo menos 8 caracteres.",
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