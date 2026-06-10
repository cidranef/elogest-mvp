import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { AccessRole, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { validateStrongPassword } from "@/lib/password-policy";
import { requireEloGestSuperAdmin } from "@/lib/elogest-api-guard";
import {
  getPlanErrorPayload,
  isPlanAccessError,
  isPlanLimitError,
  requireCanCreateUser,
} from "@/lib/plan-limits";



/* =========================================================
   API ELOGEST - RESPONSÁVEIS PELO ACESSO DA ADMINISTRADORA

   Rotas:
   GET  /api/elogest/administradoras/[id]/usuarios
   POST /api/elogest/administradoras/[id]/usuarios

   ETAPA 44 — SUPER ADMIN E MULTIADMINISTRADORA

   ETAPA 47 — PLANOS, MÓDULOS E LIMITES
   - POST passa a respeitar o limite maxUsers do plano atual.
   - A validação usa a mesma regra central aplicada nas APIs /admin.
   - Mantém endpoint exclusivo para SUPER_ADMIN.

   Segurança:
   - A rota usa requireEloGestSuperAdmin().
   - A senha temporária usa a política central de senha forte.
   - Bloqueia senha fraca, previsível ou contendo parte do e-mail/nome.
   - Valida e-mail do responsável.
   - Não existe senha padrão no backend.

   Observação operacional:
   - O Super Admin pode criar responsáveis mesmo para administradora inativa.
   - Porém o acesso ao painel administrativo só funcionará quando a
     administradora estiver ACTIVE, conforme bloqueios já aplicados em:
     /admin e /api/admin/*.
   ========================================================= */

export const dynamic = "force-dynamic";



type RouteContext = {
  params:
    | Promise<{
        id: string;
      }>
    | {
        id: string;
      };
};



/* =========================================================
   HELPERS
   ========================================================= */

function normalizeText(value: unknown) {
  return String(value || "").trim();
}



function normalizeEmail(value: unknown) {
  return normalizeText(value).toLowerCase();
}



function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}



async function getRouteId(context: RouteContext) {
  const params = await Promise.resolve(context.params);

  return params.id;
}



/* =========================================================
   GET - LISTAR RESPONSÁVEIS PELO ACESSO
   ========================================================= */

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireEloGestSuperAdmin();

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
        status: true,
        planId: true,
        planStatus: true,
        plan: {
          select: {
            id: true,
            name: true,
            slug: true,
            maxUsers: true,
          },
        },
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
      administrator: {
        id: administrator.id,
        name: administrator.name,
        status: administrator.status,
        planId: administrator.planId,
        planStatus: administrator.planStatus,
        plan: administrator.plan,
      },
      users,
    });
  } catch (error) {
    console.error("Erro ao listar responsáveis da administradora:", error);

    return NextResponse.json(
      {
        error: "Não foi possível listar os responsáveis pelo acesso.",
      },
      {
        status: 500,
      }
    );
  }
}



/* =========================================================
   POST - CRIAR RESPONSÁVEL PELO ACESSO
   ========================================================= */

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireEloGestSuperAdmin();

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
        status: true,
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
    const email = normalizeEmail(body?.email);
    const password = String(body?.password || "");
    const isActive = body?.isActive !== false;

    if (!name) {
      return NextResponse.json(
        {
          error: "Informe o nome do responsável pelo acesso.",
        },
        {
          status: 400,
        }
      );
    }

    if (!email) {
      return NextResponse.json(
        {
          error: "Informe o e-mail de acesso.",
        },
        {
          status: 400,
        }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        {
          error: "Informe um e-mail válido para o responsável pelo acesso.",
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



    /* =======================================================
       ETAPA 47 - LIMITE DE USUÁRIOS

       Super Admin também respeita o limite comercial ao criar
       novos responsáveis pelo acesso da administradora.
       ======================================================= */

    await requireCanCreateUser(administrator.id);

    const existingUser = await db.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: "insensitive",
        },
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
          label: `Administradora - ${administrator.name}`,
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
        message: "Responsável pelo acesso criado com sucesso.",
        user: result.user,
        access: result.access,
        administrator: {
          id: administrator.id,
          name: administrator.name,
          status: administrator.status,
        },
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error("Erro ao criar responsável da administradora:", error);

    if (isPlanAccessError(error) || isPlanLimitError(error)) {
      return NextResponse.json(getPlanErrorPayload(error), {
        status: error.statusCode,
      });
    }

    return NextResponse.json(
      {
        error: "Não foi possível criar o responsável pelo acesso.",
      },
      {
        status: 500,
      }
    );
  }
}
