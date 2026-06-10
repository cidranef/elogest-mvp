import { Prisma, Role, Status } from "@prisma/client";
import { db } from "@/lib/db";
import { requireActiveAdminApiAccess } from "@/lib/admin-api-guard";
import { getAuthUser } from "@/lib/auth-guard";
import { canCreateAdminTicket } from "@/lib/access-control";
import {
  getActiveUserAccessFromCookies,
  isAdministradoraAccess,
  type ActiveUserAccess,
} from "@/lib/user-access";
import { NextResponse } from "next/server";



/* =========================================================
   META DADOS PARA ABERTURA ADMINISTRATIVA DE CHAMADOS

   ETAPA 35.5 — FILTROS DE REGISTROS ATIVOS NOS FLUXOS OPERACIONAIS

   ETAPA 43 — ARQUITETURA DE PERFIS, VÍNCULOS E PERMISSÕES
   - A área /admin passa a operar somente com perfil ativo
     ADMINISTRADORA.
   - SUPER_ADMIN deve usar a área /elogest.
   - SÍNDICO, MORADOR, PROPRIETÁRIO e CONSELHEIRO devem usar o portal.

   ETAPA 44 — SUPER ADMIN E MULTIADMINISTRADORA
   - Adicionado requireActiveAdminApiAccess() para bloquear APIs /api/admin/*
     quando a administradora estiver inativa.

   ETAPA 45 — CADASTRO CONDOMINIAL AVANÇADO
   - Removidos tipos any.
   - Tipado contexto administrativo.
   - Mantido isolamento por administratorId do activeAccess.
   - Mantidos apenas registros ativos nos selects operacionais.

   Usado no modal "Novo Chamado" da área administrativa.

   Retorna:
   - condomínios ativos da carteira da administradora ativa;
   - unidades ativas de cada condomínio;
   - moradores ativos por unidade;
   - usuários ativos para atribuição de responsável.

   Responsável permitido:
   - usuário ADMINISTRADORA da própria carteira;
   - usuário SINDICO do condomínio da carteira.

   Regras:
   - /admin é área operacional da ADMINISTRADORA.
   - SUPER_ADMIN não opera por esta rota.
   - Dados retornados são sempre da carteira do activeAccess.
   - Registros inativos permanecem no histórico, mas não entram nos selects.
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
   USUÁRIO COM CONTEXTO ATIVO

   A sessão base identifica quem está logado.
   O contexto ativo define com qual papel/carteira ele está
   operando naquele momento.
   ========================================================= */

async function getMetaContextUser(): Promise<AdminContextUser> {
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

   Esta API alimenta o modal administrativo de criação de chamado,
   portanto somente faz sentido para ADMINISTRADORA em perfil ativo.
   ========================================================= */

function validateMetaContext(user: AdminContextUser): ContextValidationResult {
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
        "Este contexto não possui acesso aos metadados administrativos de chamados. Use o portal ou a área EloGest.",
    };
  }

  if (!activeAccess.administratorId) {
    return {
      ok: false,
      status: 403,
      message: "Contexto de administradora sem vínculo com administradora.",
    };
  }

  if (!canCreateAdminTicket(activeAccess)) {
    return {
      ok: false,
      status: 403,
      message: "Usuário sem permissão para criar chamados administrativos.",
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
   GET - CARREGAR META DO CHAMADO
   ========================================================= */

export async function GET() {
  try {
    const adminApiAccess = await requireActiveAdminApiAccess();

    if ("error" in adminApiAccess) {
      return adminApiAccess.error;
    }

    const user = await getMetaContextUser();

    const contextValidation = validateMetaContext(user);

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
       FILTRO DE CONDOMÍNIOS

       ADMINISTRADORA:
       - somente condomínios ativos da administradora ativa.
       ========================================================= */

    const condominiumWhere: Prisma.CondominiumWhereInput = {
      administratorId,
      status: Status.ACTIVE,
      administrator: {
        status: Status.ACTIVE,
      },
    };



    /* =========================================================
       FILTRO DE USUÁRIOS PARA ATRIBUIÇÃO

       ADMINISTRADORA:
       - usuários ativos da administradora ativa;
       - síndicos ativos dos condomínios ativos da carteira.

       Responsável permitido:
       - ADMINISTRADORA da carteira;
       - SINDICO do condomínio.
       ========================================================= */

    const userWhere: Prisma.UserWhereInput = {
      isActive: true,
      OR: [
        {
          role: Role.ADMINISTRADORA,
          administratorId,
          administrator: {
            status: Status.ACTIVE,
          },
        },
        {
          role: Role.SINDICO,
          condominium: {
            administratorId,
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
  } catch (error: unknown) {
    console.error("ERRO AO CARREGAR META DE CHAMADOS:", error);

    if (error instanceof Error && error.message === "UNAUTHORIZED") {
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