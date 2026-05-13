import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import {
  AccessRole,
  Role,
  Status,
} from "@prisma/client";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";



/* =========================================================
   API ELOGEST - ADMINISTRADORAS

   Rotas:
   GET  /api/elogest/administradoras
   POST /api/elogest/administradoras

   ETAPA 42.2 — AMBIENTE SUPER ADMIN ELOGEST

   Objetivo:
   - Permitir que a EloGest liste e cadastre administradoras.
   - Opcionalmente criar o primeiro usuário administrador.
   - Criar UserAccess para o usuário administrador.
   - Manter endpoint exclusivo para SUPER_ADMIN.
   ========================================================= */

export const dynamic = "force-dynamic";



type AuthUser = {
  id: string;
  role?: string | null;
};



function normalizeText(value: unknown) {
  return String(value || "").trim();
}



function normalizeOptional(value: unknown) {
  const normalized = normalizeText(value);

  return normalized || null;
}



function onlyNumbers(value: unknown) {
  return String(value || "").replace(/\D/g, "");
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



export async function GET() {
  try {
    const auth = await requireSuperAdmin();

    if ("error" in auth) {
      return auth.error;
    }

    const administradoras = await db.administrator.findMany({
      select: {
        id: true,
        name: true,
        cnpj: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            condominiums: true,
            users: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({
      administradoras,
    });
  } catch (error) {
    console.error("Erro ao listar administradoras:", error);

    return NextResponse.json(
      {
        error: "Não foi possível listar as administradoras.",
      },
      {
        status: 500,
      }
    );
  }
}



export async function POST(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin();

    if ("error" in auth) {
      return auth.error;
    }

    const body = await request.json();

    const name = normalizeText(body?.name);
    const cnpj = onlyNumbers(body?.cnpj) || null;
    const email = normalizeOptional(body?.email);
    const phone = onlyNumbers(body?.phone) || null;

    const createUser = Boolean(body?.createUser);

    const userName = normalizeText(body?.userName);
    const userEmail = normalizeText(body?.userEmail).toLowerCase();
    const userPassword = normalizeText(body?.userPassword);

    if (!name) {
      return NextResponse.json(
        {
          error: "Informe o nome da administradora.",
        },
        {
          status: 400,
        }
      );
    }

    if (cnpj && cnpj.length !== 14) {
      return NextResponse.json(
        {
          error: "Informe um CNPJ válido com 14 dígitos.",
        },
        {
          status: 400,
        }
      );
    }

    if (cnpj) {
      const existingAdministrator = await db.administrator.findUnique({
        where: {
          cnpj,
        },
        select: {
          id: true,
        },
      });

      if (existingAdministrator) {
        return NextResponse.json(
          {
            error: "Já existe uma administradora cadastrada com este CNPJ.",
          },
          {
            status: 409,
          }
        );
      }
    }

    if (createUser) {
      if (!userName) {
        return NextResponse.json(
          {
            error: "Informe o nome do usuário administrador.",
          },
          {
            status: 400,
          }
        );
      }

      if (!userEmail) {
        return NextResponse.json(
          {
            error: "Informe o e-mail do usuário administrador.",
          },
          {
            status: 400,
          }
        );
      }

      if (!userPassword || userPassword.length < 8) {
        return NextResponse.json(
          {
            error: "A senha inicial deve ter pelo menos 8 caracteres.",
          },
          {
            status: 400,
          }
        );
      }

      const existingUser = await db.user.findUnique({
        where: {
          email: userEmail,
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
    }

    const result = await db.$transaction(async (tx) => {
      const administrator = await tx.administrator.create({
        data: {
          name,
          cnpj,
          email,
          phone,
          status: Status.ACTIVE,
        },
      });

      let user = null;

      if (createUser) {
        const passwordHash = await bcrypt.hash(userPassword, 10);

        user = await tx.user.create({
          data: {
            name: userName,
            email: userEmail,
            passwordHash,
            role: Role.ADMINISTRADORA,
            administratorId: administrator.id,
            isActive: true,
          },
        });

        await tx.userAccess.create({
          data: {
            userId: user.id,
            role: AccessRole.ADMINISTRADORA,
            label: administrator.name,
            administratorId: administrator.id,
            isDefault: true,
            isActive: true,
          },
        });
      }

      return {
        administrator,
        user,
      };
    });

    return NextResponse.json(
      {
        message: "Administradora cadastrada com sucesso.",
        administrator: result.administrator,
        user: result.user,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error("Erro ao cadastrar administradora:", error);

    return NextResponse.json(
      {
        error: "Não foi possível cadastrar a administradora.",
      },
      {
        status: 500,
      }
    );
  }
}