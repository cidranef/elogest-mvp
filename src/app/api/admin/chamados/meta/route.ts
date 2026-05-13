import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import { NextResponse } from "next/server";
import { Role, Status, type Prisma } from "@prisma/client";
import { getActiveUserAccessFromCookies } from "@/lib/user-access";



/* =========================================================
   META DADOS PARA ABERTURA ADMINISTRATIVA DE CHAMADOS

   ETAPA 35.5 — FILTROS DE REGISTROS ATIVOS NOS FLUXOS OPERACIONAIS

   Usado no modal "+ Novo Chamado" da área administrativa.

   Retorna:
   - condomínios ativos permitidos ao contexto ativo;
   - unidades ativas de cada condomínio;
   - moradores ativos por unidade;
   - usuários ativos para atribuição de responsável.

   Regras:
   - SUPER_ADMIN em contexto SUPER_ADMIN vê condomínios ativos.
   - ADMINISTRADORA vê apenas condomínios ativos da própria carteira.
   - SÍNDICO / MORADOR devem usar o portal, não esta rota administrativa.
   - Registros inativos permanecem no histórico, mas não entram nos selects.
   ========================================================= */



/* =========================================================
   USUÁRIO COM CONTEXTO ATIVO

   A sessão base identifica quem está logado.
   O contexto ativo define com qual papel/carteira ele está
   operando naquele momento.
   ========================================================= */

async function getMetaContextUser() {
  const sessionUser: any = await getAuthUser();

  if (!sessionUser?.id) {
    throw new Error("UNAUTHORIZED");
  }

  const activeAccess: any = await getActiveUserAccessFromCookies({
    userId: sessionUser.id,
  });

  if (!activeAccess) {
    return {
      ...sessionUser,
      activeAccess: null,
    };
  }

  return {
    ...sessionUser,

    role: activeAccess.role || sessionUser.role,

    administratorId:
      activeAccess.administratorId !== undefined
        ? activeAccess.administratorId
        : sessionUser.administratorId,

    condominiumId:
      activeAccess.condominiumId !== undefined
        ? activeAccess.condominiumId
        : sessionUser.condominiumId,

    unitId:
      activeAccess.unitId !== undefined
        ? activeAccess.unitId
        : sessionUser.unitId,

    residentId:
      activeAccess.residentId !== undefined
        ? activeAccess.residentId
        : sessionUser.residentId,

    activeAccess,
  };
}



/* =========================================================
   VALIDA CONTEXTO ADMINISTRATIVO

   Esta API é usada pelo modal administrativo de criação de
   chamado, portanto somente faz sentido para:

   - SUPER_ADMIN
   - ADMINISTRADORA

   Outros perfis devem usar o portal.
   ========================================================= */

function validateMetaContext(user: any) {
  if (user.role === Role.ADMINISTRADORA && !user.administratorId) {
    return {
      ok: false,
      status: 403,
      message: "Contexto de administradora sem vínculo com administradora.",
    };
  }

  if (user.role === Role.SINDICO) {
    return {
      ok: false,
      status: 403,
      message:
        "Síndico deve abrir chamados pelo portal, não pela rota administrativa.",
    };
  }

  if (user.role === Role.MORADOR || user.role === "PROPRIETARIO") {
    return {
      ok: false,
      status: 403,
      message:
        "Morador/proprietário deve abrir chamados pelo portal, não pela rota administrativa.",
    };
  }

  if (user.role !== Role.SUPER_ADMIN && user.role !== Role.ADMINISTRADORA) {
    return {
      ok: false,
      status: 403,
      message: "Usuário sem permissão para carregar dados administrativos.",
    };
  }

  return {
    ok: true,
    status: 200,
    message: "",
  };
}



/* =========================================================
   GET - CARREGAR META DO CHAMADO
   ========================================================= */

export async function GET() {
  try {
    const user: any = await getMetaContextUser();

    const contextValidation = validateMetaContext(user);

    if (!contextValidation.ok) {
      return NextResponse.json(
        { error: contextValidation.message },
        { status: contextValidation.status }
      );
    }



    /* =========================================================
       FILTRO DE CONDOMÍNIOS

       SUPER_ADMIN:
       - todos os condomínios ativos de administradoras ativas.

       ADMINISTRADORA:
       - somente condomínios ativos da administradora ativa.
       ========================================================= */

    const condominiumWhere: Prisma.CondominiumWhereInput =
      user.role === Role.SUPER_ADMIN
        ? {
            status: Status.ACTIVE,
            administrator: {
              status: Status.ACTIVE,
            },
          }
        : {
            administratorId: user.administratorId,
            status: Status.ACTIVE,
            administrator: {
              status: Status.ACTIVE,
            },
          };



    /* =========================================================
       FILTRO DE USUÁRIOS PARA ATRIBUIÇÃO

       SUPER_ADMIN:
       - usuários ativos administrativos/síndicos.

       ADMINISTRADORA:
       - usuários ativos da administradora ativa;
       - síndicos ativos dos condomínios ativos da carteira.

       Responsável permitido:
       - ADMINISTRADORA da carteira;
       - SINDICO do condomínio.
       ========================================================= */

    const userWhere: Prisma.UserWhereInput =
      user.role === Role.SUPER_ADMIN
        ? {
            isActive: true,
            role: {
              in: [Role.SUPER_ADMIN, Role.ADMINISTRADORA, Role.SINDICO],
            },
            OR: [
              {
                role: Role.SUPER_ADMIN,
              },
              {
                role: Role.ADMINISTRADORA,
                administrator: {
                  status: Status.ACTIVE,
                },
              },
              {
                role: Role.SINDICO,
                condominium: {
                  status: Status.ACTIVE,
                  administrator: {
                    status: Status.ACTIVE,
                  },
                },
              },
            ],
          }
        : {
            isActive: true,
            OR: [
              {
                role: Role.ADMINISTRADORA,
                administratorId: user.administratorId,
                administrator: {
                  status: Status.ACTIVE,
                },
              },
              {
                role: Role.SINDICO,
                condominium: {
                  administratorId: user.administratorId,
                  status: Status.ACTIVE,
                  administrator: {
                    status: Status.ACTIVE,
                  },
                },
              },
            ],
          };



    /* =========================================================
       CONSULTAS
       ========================================================= */

    const [condominiums, users] = await Promise.all([
      db.condominium.findMany({
        where: condominiumWhere,
        include: {
          administrator: {
            select: {
              id: true,
              name: true,
              status: true,
            },
          },

          units: {
            where: {
              status: Status.ACTIVE,
            },
            include: {
              residents: {
                where: {
                  status: Status.ACTIVE,
                },
                orderBy: {
                  name: "asc",
                },
              },
            },
            orderBy: [
              {
                block: "asc",
              },
              {
                unitNumber: "asc",
              },
            ],
          },
        },
        orderBy: {
          name: "asc",
        },
      }),

      db.user.findMany({
        where: userWhere,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,

          administratorId: true,
          condominiumId: true,

          administrator: {
            select: {
              id: true,
              name: true,
              status: true,
            },
          },

          condominium: {
            select: {
              id: true,
              name: true,
              status: true,
              administratorId: true,
            },
          },
        },
        orderBy: {
          name: "asc",
        },
      }),
    ]);



    return NextResponse.json({
      condominiums,
      users,
    });
  } catch (error: any) {
    console.error("ERRO AO CARREGAR META DE CHAMADOS:", error);

    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao carregar dados do chamado." },
      { status: 500 }
    );
  }
}