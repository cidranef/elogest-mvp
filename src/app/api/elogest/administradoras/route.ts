import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import {
  AccessRole,
  AdministratorPlanStatus,
  Role,
  Status,
} from "@prisma/client";
import { db } from "@/lib/db";
import { validateStrongPassword } from "@/lib/password-policy";
import { requireEloGestSuperAdmin } from "@/lib/elogest-api-guard";



/* =========================================================
   API ELOGEST - ADMINISTRADORAS

   Rotas:
   GET  /api/elogest/administradoras
   POST /api/elogest/administradoras

   ETAPA 44 — SUPER ADMIN E MULTIADMINISTRADORA

   ETAPA 47 — PLANOS, MÓDULOS E LIMITES
   - GET passa a retornar o plano vinculado de cada administradora.
   - POST passa a vincular novas administradoras ao Plano Free
     automaticamente, quando nenhum plano específico for informado.
   - Mantém a criação do primeiro responsável pelo acesso.

   Segurança:
   - A rota usa requireEloGestSuperAdmin().
   - A senha temporária usa a política central de senha forte.
   - Não existe senha padrão no backend.
   ========================================================= */

export const dynamic = "force-dynamic";



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



function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}



async function getDefaultFreePlan() {
  return db.plan.findUnique({
    where: {
      slug: "free",
    },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      maxCondominiums: true,
      maxUnits: true,
      maxUsers: true,
      maxMonthlyTickets: true,
      maxProviders: true,
    },
  });
}



function administratorSelect() {
  return {
    id: true,
    name: true,
    cnpj: true,
    email: true,
    phone: true,
    status: true,

    /* =====================================================
       ETAPA 47 - PLANO COMERCIAL
       ===================================================== */

    planId: true,
    planStatus: true,
    planStartedAt: true,
    planExpiresAt: true,
    customLimitsEnabled: true,
    plan: {
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        status: true,
        monthlyPriceCents: true,
        annualPriceCents: true,
        maxCondominiums: true,
        maxUnits: true,
        maxUsers: true,
        maxMonthlyTickets: true,
        maxProviders: true,
      },
    },

    createdAt: true,
    updatedAt: true,
    _count: {
      select: {
        condominiums: true,
        users: true,
        administratorProviders: true,
      },
    },
  } as const;
}



export async function GET() {
  try {
    const auth = await requireEloGestSuperAdmin();

    if ("error" in auth) {
      return auth.error;
    }

    const administradoras = await db.administrator.findMany({
      select: administratorSelect(),
      orderBy: [
        {
          status: "asc",
        },
        {
          createdAt: "desc",
        },
      ],
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
    const auth = await requireEloGestSuperAdmin();

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

    if (email && !isValidEmail(email)) {
      return NextResponse.json(
        {
          error: "Informe um e-mail institucional válido para a administradora.",
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
            error: "Informe o nome do usuário responsável.",
          },
          {
            status: 400,
          }
        );
      }

      if (!userEmail) {
        return NextResponse.json(
          {
            error: "Informe o e-mail do usuário responsável.",
          },
          {
            status: 400,
          }
        );
      }

      if (!isValidEmail(userEmail)) {
        return NextResponse.json(
          {
            error: "Informe um e-mail válido para o usuário responsável.",
          },
          {
            status: 400,
          }
        );
      }

      const passwordValidation = validateStrongPassword(userPassword, {
        email: userEmail,
        name: userName,
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



    /* =======================================================
       ETAPA 47 - PLANO PADRÃO

       Novas administradoras nascem no Plano Free, salvo ajuste
       posterior pelo Super Admin EloGest.
       ======================================================= */

    const freePlan = await getDefaultFreePlan();

    if (!freePlan) {
      return NextResponse.json(
        {
          error:
            "Plano Free não encontrado. Execute o seed da Etapa 47 antes de cadastrar novas administradoras.",
        },
        {
          status: 500,
        }
      );
    }

    const result = await db.$transaction(async (tx) => {
      const administrator = await tx.administrator.create({
        data: {
          name,
          cnpj,
          email,
          phone,
          status: Status.ACTIVE,
          planId: freePlan.id,
          planStatus: AdministratorPlanStatus.ACTIVE,
          planStartedAt: new Date(),
        },
        select: administratorSelect(),
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
            label: `Administradora - ${administrator.name}`,
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
