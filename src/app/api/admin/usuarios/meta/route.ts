import { Prisma, Status } from "@prisma/client";
import { db } from "@/lib/db";
import { requireActiveAdminApiAccess } from "@/lib/admin-api-guard";
import { getAuthUser } from "@/lib/auth-guard";
import {
  getActiveUserAccessFromCookies,
  isAdministradoraAccess,
  type ActiveUserAccess,
} from "@/lib/user-access";
import { canManageUsers } from "@/lib/access-control";
import { NextResponse } from "next/server";



/* =========================================================
   USUÁRIOS - META DADOS

   ETAPA 43 — ARQUITETURA DE PERFIS, VÍNCULOS E PERMISSÕES

   ETAPA 44 — SUPER ADMIN E MULTIADMINISTRADORA
   - Adicionado requireActiveAdminApiAccess() para bloquear APIs /api/admin/*
     quando a administradora estiver inativa.

   ETAPA 45 — CADASTRO CONDOMINIAL AVANÇADO / ACESSOS
   - Mantido isolamento por activeAccess.
   - Removidos tipos any.
   - Tipados filtros Prisma.
   - Mantido retorno para selects da página /admin/usuarios.
   - Mantido filtro de moradores ativos sem usuário vinculado.
   - Mantida proteção para não expor dados fora da carteira.

   Usado no formulário de criação/edição de usuários.

   Retorna:
   - administradora ativa do perfil ativo;
   - condomínios ativos da carteira;
   - moradores ativos, sem usuário vinculado, em condomínio ativo;
   - usuários existentes da carteira para checagem/listagem auxiliar.

   Regras:
   - /admin é área operacional da ADMINISTRADORA.
   - SUPER_ADMIN não opera por esta rota; deve usar a área /elogest.
   - Dados retornados são sempre da carteira do activeAccess.
   - Esta API alimenta selects operacionais.
   - Registros inativos continuam preservados no histórico e nas
     listagens próprias, mas não devem aparecer para novos vínculos.
   ========================================================= */



/* =========================================================
   TYPES
   ========================================================= */

type AuthSessionUser = {
  id: string;
  role?: string | null;
  administratorId?: string | null;
  condominiumId?: string | null;
  unitId?: string | null;
  residentId?: string | null;
};



type AdminContextUser = AuthSessionUser & {
  activeAccess: ActiveUserAccess | null;
};



type ContextValidationResult =
  | {
      ok: true;
      status: 200;
      message: "";
    }
  | {
      ok: false;
      status: 403;
      message: string;
    };



/* =========================================================
   HELPERS
   ========================================================= */

function cleanText(value: unknown) {
  return String(value || "").trim();
}



/* =========================================================
   USUÁRIO COM CONTEXTO ADMINISTRATIVO

   A sessão identifica quem está logado.
   O contexto ativo define a carteira/perfil em operação.
   ========================================================= */

async function getAdminContextUser(): Promise<AdminContextUser> {
  const sessionUser = (await getAuthUser()) as AuthSessionUser | null;

  if (!sessionUser?.id) {
    throw new Error("UNAUTHORIZED");
  }

  const activeAccess: ActiveUserAccess | null =
    await getActiveUserAccessFromCookies({
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
   ========================================================= */

function validateAdminContext(user: AdminContextUser): ContextValidationResult {
  const activeAccess = user.activeAccess;

  if (!activeAccess) {
    return {
      ok: false,
      status: 403,
      message: "Não foi possível identificar o contexto de acesso.",
    };
  }

  if (!isAdministradoraAccess(activeAccess)) {
    return {
      ok: false,
      status: 403,
      message:
        "Este contexto não possui acesso aos metadados administrativos de usuários. Use o portal ou a área EloGest.",
    };
  }

  if (!activeAccess.administratorId) {
    return {
      ok: false,
      status: 403,
      message: "Contexto de administradora sem vínculo com administradora.",
    };
  }

  if (!canManageUsers(activeAccess)) {
    return {
      ok: false,
      status: 403,
      message: "Usuário sem permissão para gerenciar usuários.",
    };
  }

  return {
    ok: true,
    status: 200,
    message: "",
  };
}



function getAdministratorIdFromContext(user: AdminContextUser) {
  return user.activeAccess?.administratorId || null;
}



/* =========================================================
   GET - META DADOS DE USUÁRIOS
   ========================================================= */

export async function GET() {
  try {
    const adminApiAccess = await requireActiveAdminApiAccess();

    if ("error" in adminApiAccess) {
      return adminApiAccess.error;
    }

    const user = await getAdminContextUser();

    const contextValidation = validateAdminContext(user);

    if (!contextValidation.ok) {
      return NextResponse.json(
        { error: contextValidation.message },
        { status: contextValidation.status }
      );
    }

    const administratorId = getAdministratorIdFromContext(user);

    if (!administratorId) {
      return NextResponse.json(
        { error: "Contexto de administradora sem vínculo com administradora." },
        { status: 403 }
      );
    }



    /* =========================================================
       FILTROS POR PERFIL

       Selects operacionais devem exibir somente registros ativos
       e somente dados da carteira ativa.
       ========================================================= */

    const administratorWhere: Prisma.AdministratorWhereInput = {
      id: administratorId,
      status: Status.ACTIVE,
    };

    const condominiumWhere: Prisma.CondominiumWhereInput = {
      administratorId,
      status: Status.ACTIVE,
      administrator: {
        status: Status.ACTIVE,
      },
    };

    const residentWhere: Prisma.ResidentWhereInput = {
      user: null,
      status: Status.ACTIVE,
      email: {
        not: null,
      },
      condominium: {
        administratorId,
        status: Status.ACTIVE,
        administrator: {
          status: Status.ACTIVE,
        },
      },
    };

    const userWhere: Prisma.UserWhereInput = {
      OR: [
        {
          administratorId,
        },
        {
          condominium: {
            administratorId,
          },
        },
        {
          resident: {
            condominium: {
              administratorId,
            },
          },
        },
      ],
    };



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
      const email = cleanText(resident.email);

      return !!email;
    });

    return NextResponse.json({
      administrators,
      condominiums,
      residents: residentsWithValidEmail,
      existingUsers,
    });
  } catch (error: unknown) {
    console.error("ERRO AO CARREGAR META DE USUÁRIOS:", error);

    if (error instanceof Error && error.message === "UNAUTHORIZED") {
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