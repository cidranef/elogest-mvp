import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import { NextResponse } from "next/server";
import { Role, Status } from "@prisma/client";



/* =========================================================
   USUÁRIOS - META DADOS

   ETAPA 35.5 — FILTROS DE REGISTROS ATIVOS NOS SELECTS

   Usado no formulário de criação/edição de usuários.

   Retorna:
   - administradoras ativas
   - condomínios ativos
   - moradores ativos, sem usuário vinculado, em condomínio ativo
   - usuários existentes para checagem/listagem auxiliar

   Regras:
   SUPER_ADMIN:
   - vê tudo que está operacionalmente ativo nos selects

   ADMINISTRADORA:
   - vê apenas dados da própria carteira

   Importante:
   - Esta API alimenta selects operacionais.
   - Registros inativos continuam preservados no histórico e nas
     listagens próprias, mas não devem aparecer para novos vínculos.
   ========================================================= */



/* =========================================================
   HELPERS
   ========================================================= */

function buildUserScope(user: any) {
  if (user.role === Role.SUPER_ADMIN) {
    return {};
  }

  return {
    OR: [
      {
        administratorId: user.administratorId,
      },
      {
        condominium: {
          administratorId: user.administratorId,
        },
      },
      {
        resident: {
          condominium: {
            administratorId: user.administratorId,
          },
        },
      },
    ],
  };
}



/* =========================================================
   GET - META DADOS DE USUÁRIOS
   ========================================================= */

export async function GET() {
  try {
    const user: any = await getAuthUser();



    /* =========================================================
       AUTORIZAÇÃO
       ========================================================= */

    if (user.role !== Role.SUPER_ADMIN && user.role !== Role.ADMINISTRADORA) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }



    if (user.role === Role.ADMINISTRADORA && !user.administratorId) {
      return NextResponse.json(
        { error: "Usuário administrador sem administradora vinculada." },
        { status: 403 }
      );
    }



    /* =========================================================
       FILTROS POR PERFIL

       Regra da etapa:
       - selects operacionais devem exibir somente registros ativos.
       ========================================================= */

    const administratorWhere =
      user.role === Role.SUPER_ADMIN
        ? {
            status: Status.ACTIVE,
          }
        : {
            id: user.administratorId,
            status: Status.ACTIVE,
          };



    const condominiumWhere =
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



    const residentWhere =
      user.role === Role.SUPER_ADMIN
        ? {
            user: null,
            status: Status.ACTIVE,
            email: {
              not: null,
            },
            condominium: {
              status: Status.ACTIVE,
              administrator: {
                status: Status.ACTIVE,
              },
            },
          }
        : {
            user: null,
            status: Status.ACTIVE,
            email: {
              not: null,
            },
            condominium: {
              administratorId: user.administratorId,
              status: Status.ACTIVE,
              administrator: {
                status: Status.ACTIVE,
              },
            },
          };



    const userWhere = buildUserScope(user);



    /* =========================================================
       CONSULTAS
       ========================================================= */

    const [administrators, condominiums, residents, existingUsers] =
      await Promise.all([
        db.administrator.findMany({
          where: administratorWhere,
          select: {
            id: true,
            name: true,
            status: true,
          },
          orderBy: {
            name: "asc",
          },
        }),

        db.condominium.findMany({
          where: condominiumWhere,
          select: {
            id: true,
            name: true,
            administratorId: true,
            status: true,
            administrator: {
              select: {
                id: true,
                name: true,
                status: true,
              },
            },
          },
          orderBy: {
            name: "asc",
          },
        }),

        db.resident.findMany({
          where: residentWhere,
          select: {
            id: true,
            name: true,
            email: true,
            cpf: true,
            status: true,
            condominiumId: true,
            unitId: true,
            condominium: {
              select: {
                id: true,
                name: true,
                status: true,
                administratorId: true,
              },
            },
            unit: {
              select: {
                id: true,
                block: true,
                unitNumber: true,
              },
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
            residentId: true,

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
              },
            },

            resident: {
              select: {
                id: true,
                name: true,
                email: true,
                status: true,
                condominium: {
                  select: {
                    id: true,
                    name: true,
                    status: true,
                  },
                },
                unit: {
                  select: {
                    id: true,
                    block: true,
                    unitNumber: true,
                  },
                },
              },
            },

            createdAt: true,
          },
          orderBy: {
            name: "asc",
          },
        }),
      ]);



    /* =========================================================
       FILTRO EXTRA DE SEGURANÇA EM MEMÓRIA

       Motivo:
       - Alguns bancos antigos podem ter e-mail vazio como string "".
       - O filtro Prisma email not null não remove string vazia.
       - Para criação de acesso do portal, e-mail vazio não serve.
       ========================================================= */

    const residentsWithValidEmail = residents.filter((resident) => {
      const email = resident.email?.trim();

      return !!email;
    });



    return NextResponse.json({
      administrators,
      condominiums,
      residents: residentsWithValidEmail,
      existingUsers,
    });
  } catch (error: any) {
    console.error("ERRO AO CARREGAR META DE USUÁRIOS:", error);



    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }



    return NextResponse.json(
      { error: "Erro ao carregar dados para usuários." },
      { status: 500 }
    );
  }
}