import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { AccessRole, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import { validateStrongPassword } from "@/lib/password-policy";



/* =========================================================
   API ELOGEST - USUÁRIOS DA ADMINISTRADORA

   Rotas:
   GET  /api/elogest/administradoras/[id]/usuarios
   POST /api/elogest/administradoras/[id]/usuarios

   ETAPA 42.2.1 — USUÁRIOS DA ADMINISTRADORA

   Objetivo:
   - Listar usuários vinculados a uma administradora.
   - Criar novo usuário administrativo.
   - Criar UserAccess ADMINISTRADORA.
   - Manter endpoint exclusivo para SUPER_ADMIN.

   ETAPA 42.8 — SEGURANÇA DE SENHA
   - Senha inicial passa a usar a política central de senha forte.
   - Bloqueia senha fraca, previsível ou contendo parte do e-mail/nome.
   ========================================================= */

export const dynamic = "force-dynamic";



type AuthUser = {
  id: string;
  role?: string | null;
};



type RouteContext = {
  params:
    | Promise<{
        id: string;
      }>
    | {
        id: string;
      };
};



function normalizeText(value: unknown) {
  return String(value || "").trim();
}



async function getRouteId(context: RouteContext) {
  const params = await Promise.resolve(context.params);

  return params.id;
}



async function requireSuperAdmin() {
  const authUser = (await getAuthUser()) as AuthUser | null;

  if (!authUser) {
    return {
      error: NextResponse.json(
        {
          error: "Usuário não autenticado.",
        },
        {
          status: 401,
        }
      ),
    };
  }

  if (authUser.role !== "SUPER_ADMIN") {
    return {
      error: NextResponse.json(
        {
          error: "Acesso restrito ao Super Admin EloGest.",
        },
        {
          status: 403,
        }
      ),
    };
  }

  return {
    authUser,
  };
}



export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireSuperAdmin();

    if ("error" in auth) {
      return auth.error;
    }

    const administratorId = await getRouteId(context);

    if (!administratorId) {
      return NextResponse.json(
        {
          error: "Administradora não identificada.",
        },
        {
          status: 400,
        }
      );
    }

    const administrator = await db.administrator.findUnique({
      where: {
        id: administratorId,
      },
      select: {
        id: true,
      },
    });

    if (!administrator) {
      return NextResponse.json(
        {
          error: "Administradora não encontrada.",
        },
        {
          status: 404,
        }
      );
    }

    const users = await db.user.findMany({
      where: {
        administratorId,
        role: Role.ADMINISTRADORA,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        accesses: {
          select: {
            id: true,
            role: true,
            label: true,
            isActive: true,
            isDefault: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json({
      users,
    });
  } catch (error) {
    console.error("Erro ao listar usuários da administradora:", error);

    return NextResponse.json(
      {
        error: "Não foi possível listar os usuários da administradora.",
      },
      {
        status: 500,
      }
    );
  }
}



export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireSuperAdmin();

    if ("error" in auth) {
      return auth.error;
    }

    const administratorId = await getRouteId(context);

    if (!administratorId) {
      return NextResponse.json(
        {
          error: "Administradora não identificada.",
        },
        {
          status: 400,
        }
      );
    }

    const administrator = await db.administrator.findUnique({
      where: {
        id: administratorId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!administrator) {
      return NextResponse.json(
        {
          error: "Administradora não encontrada.",
        },
        {
          status: 404,
        }
      );
    }

    const body = await request.json();

    const name = normalizeText(body?.name);
    const email = normalizeText(body?.email).toLowerCase();
    const password = String(body?.password || "");
    const isActive = body?.isActive !== false;

    if (!name) {
      return NextResponse.json(
        {
          error: "Informe o nome do usuário.",
        },
        {
          status: 400,
        }
      );
    }

    if (!email) {
      return NextResponse.json(
        {
          error: "Informe o e-mail do usuário.",
        },
        {
          status: 400,
        }
      );
    }

    const passwordValidation = validateStrongPassword(password, {
      email,
      name,
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

    const existingUser = await db.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
      },
    });

    if (existingUser) {
      return NextResponse.json(
        {
          error: "Já existe um usuário cadastrado com este e-mail.",
        },
        {
          status: 409,
        }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          role: Role.ADMINISTRADORA,
          administratorId: administrator.id,
          isActive,
        },
      });

      const access = await tx.userAccess.create({
        data: {
          userId: user.id,
          role: AccessRole.ADMINISTRADORA,
          label: administrator.name,
          administratorId: administrator.id,
          isDefault: true,
          isActive,
        },
      });

      return {
        user,
        access,
      };
    });

    return NextResponse.json(
      {
        message: "Usuário criado com sucesso.",
        user: result.user,
        access: result.access,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error("Erro ao criar usuário da administradora:", error);

    return NextResponse.json(
      {
        error: "Não foi possível criar o usuário da administradora.",
      },
      {
        status: 500,
      }
    );
  }
}