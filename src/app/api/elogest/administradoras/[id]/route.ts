import { NextRequest, NextResponse } from "next/server";
import { Status } from "@prisma/client";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";



/* =========================================================
   API ELOGEST - DETALHE DA ADMINISTRADORA

   Rotas:
   GET   /api/elogest/administradoras/[id]
   PATCH /api/elogest/administradoras/[id]

   ETAPA 42.2 — AMBIENTE SUPER ADMIN ELOGEST

   Objetivo:
   - Buscar detalhes de uma administradora.
   - Atualizar dados principais.
   - Ativar/Inativar administradora.
   - Manter endpoint exclusivo para SUPER_ADMIN.
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



function normalizeOptional(value: unknown) {
  const normalized = normalizeText(value);

  return normalized || null;
}



function onlyNumbers(value: unknown) {
  return String(value || "").replace(/\D/g, "");
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

    const id = await getRouteId(context);

    if (!id) {
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
        id,
      },
      select: {
        id: true,
        name: true,
        cnpj: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        condominiums: {
          select: {
            id: true,
            name: true,
            city: true,
            state: true,
            status: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
          orderBy: {
            name: "asc",
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

    return NextResponse.json({
      administrator,
    });
  } catch (error) {
    console.error("Erro ao buscar administradora:", error);

    return NextResponse.json(
      {
        error: "Não foi possível buscar a administradora.",
      },
      {
        status: 500,
      }
    );
  }
}



export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireSuperAdmin();

    if ("error" in auth) {
      return auth.error;
    }

    const id = await getRouteId(context);

    if (!id) {
      return NextResponse.json(
        {
          error: "Administradora não identificada.",
        },
        {
          status: 400,
        }
      );
    }

    const body = await request.json();

    const name = normalizeText(body?.name);
    const cnpj = onlyNumbers(body?.cnpj) || null;
    const email = normalizeOptional(body?.email);
    const phone = onlyNumbers(body?.phone) || null;
    const status = normalizeText(body?.status);

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

    if (status !== Status.ACTIVE && status !== Status.INACTIVE) {
      return NextResponse.json(
        {
          error: "Status inválido.",
        },
        {
          status: 400,
        }
      );
    }

    const currentAdministrator = await db.administrator.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
      },
    });

    if (!currentAdministrator) {
      return NextResponse.json(
        {
          error: "Administradora não encontrada.",
        },
        {
          status: 404,
        }
      );
    }

    if (cnpj) {
      const duplicatedCnpj = await db.administrator.findFirst({
        where: {
          cnpj,
          NOT: {
            id,
          },
        },
        select: {
          id: true,
        },
      });

      if (duplicatedCnpj) {
        return NextResponse.json(
          {
            error: "Já existe outra administradora cadastrada com este CNPJ.",
          },
          {
            status: 409,
          }
        );
      }
    }

    const administrator = await db.administrator.update({
      where: {
        id,
      },
      data: {
        name,
        cnpj,
        email,
        phone,
        status,
      },
      select: {
        id: true,
        name: true,
        cnpj: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        condominiums: {
          select: {
            id: true,
            name: true,
            city: true,
            state: true,
            status: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
          orderBy: {
            name: "asc",
          },
        },
      },
    });

    return NextResponse.json({
      message: "Administradora atualizada com sucesso.",
      administrator,
    });
  } catch (error) {
    console.error("Erro ao atualizar administradora:", error);

    return NextResponse.json(
      {
        error: "Não foi possível atualizar a administradora.",
      },
      {
        status: 500,
      }
    );
  }
}