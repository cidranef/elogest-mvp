import { db } from "@/lib/db";
import { requireActiveAdminApiAccess } from "@/lib/admin-api-guard";
import { getAuthUser } from "@/lib/auth-guard";
import {
  getActiveUserAccessFromCookies,
  isAdministradoraAccess,
  type ActiveUserAccess,
} from "@/lib/user-access";
import { canManageResidents, canManageUsers } from "@/lib/access-control";
import { NextResponse } from "next/server";



/* =========================================================
   MORADORES - RESOLVER ACESSO

   ETAPA 43 — ARQUITETURA DE PERFIS, VÍNCULOS E PERMISSÕES

   ETAPA 44 — SUPER ADMIN E MULTIADMINISTRADORA
   - Adicionado requireActiveAdminApiAccess() para bloquear APIs /api/admin/*
     quando a administradora estiver inativa.

   ETAPA 45 — CADASTRO CONDOMINIAL AVANÇADO
   - Mantido isolamento por activeAccess.
   - Removidos tipos any.
   - Fluxo de acesso do morador continua protegido por carteira.
   - Administradora inativa não consegue resolver/criar acesso.
   - Mantida decisão automática:
     1. Morador já tem usuário vinculado:
        -> editar usuário vinculado.

     2. Morador não tem usuário, mas e-mail já existe na carteira:
        -> editar usuário existente para revisar/vincular.

     3. Morador não tem usuário e e-mail está livre:
        -> criar novo usuário MORADOR.

   Regras de segurança:
   - /admin é área operacional da ADMINISTRADORA.
   - SUPER_ADMIN não opera por esta rota; deve usar a área /elogest.
   - ADMINISTRADORA só pode gerenciar moradores da própria carteira.
   - Morador inativo não pode receber novo acesso.
   - Morador sem e-mail não pode gerar acesso ao portal.
   - E-mail duplicado fora da carteira bloqueia o fluxo.
   - Acesso exige permissão para gerenciar moradores e usuários.
   ========================================================= */



interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}



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



function normalizeEmail(value: unknown) {
  return cleanText(value).toLowerCase();
}



function isValidEmail(email: string) {
  if (!email) return false;

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

function validateAdminContext(
  user: AdminContextUser
): ContextValidationResult {
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
        "Este contexto não possui acesso ao gerenciamento de acesso do morador. Use o portal ou a área EloGest.",
    };
  }

  if (!activeAccess.administratorId) {
    return {
      ok: false,
      status: 403,
      message: "Contexto de administradora sem vínculo com administradora.",
    };
  }

  if (!canManageResidents(activeAccess) || !canManageUsers(activeAccess)) {
    return {
      ok: false,
      status: 403,
      message: "Usuário sem permissão para gerenciar moradores ou usuários.",
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
   GET - RESOLVER ACESSO DO MORADOR
   ========================================================= */

export async function GET(_req: Request, context: RouteContext) {
  try {
    const adminApiAccess = await requireActiveAdminApiAccess();

    if ("error" in adminApiAccess) {
      return adminApiAccess.error;
    }

    const authUser = await getAdminContextUser();
    const { id } = await context.params;

    const residentId = cleanText(id);

    if (!residentId) {
      return NextResponse.json(
        { error: "ID do morador não informado." },
        { status: 400 }
      );
    }

    const contextValidation = validateAdminContext(authUser);

    if (!contextValidation.ok) {
      return NextResponse.json(
        { error: contextValidation.message },
        { status: contextValidation.status }
      );
    }

    const administratorId = getAdministratorIdFromContext(authUser);

    if (!administratorId) {
      return NextResponse.json(
        { error: "Contexto de administradora sem vínculo com administradora." },
        { status: 403 }
      );
    }



    /* =========================================================
       LOCALIZA MORADOR DENTRO DA CARTEIRA ATIVA

       ADMINISTRADORA:
       - só resolve acesso de morador vinculado a condomínio da
         própria carteira.
       ========================================================= */

    const morador = await db.resident.findFirst({
      where: {
        id: residentId,
        condominium: {
          administratorId,
        },
      },
      include: {
        condominium: true,
        unit: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
          },
        },
      },
    });

    if (!morador) {
      return NextResponse.json(
        { error: "Morador não encontrado ou acesso negado." },
        { status: 404 }
      );
    }

    if (morador.status !== "ACTIVE") {
      return NextResponse.json(
        {
          error:
            "Este morador está inativo. Reative o cadastro antes de gerenciar o acesso ao portal.",
        },
        { status: 400 }
      );
    }



    /* =========================================================
       CASO 1 — MORADOR JÁ POSSUI USUÁRIO VINCULADO
       ========================================================= */

    if (morador.user?.id) {
      const params = new URLSearchParams({
        action: "edit",
        userId: morador.user.id,
      });

      return NextResponse.json({
        mode: "EDIT_LINKED_USER",
        message: "Morador já possui usuário vinculado.",
        userId: morador.user.id,
        residentId: morador.id,
        url: `/admin/usuarios?${params.toString()}`,
      });
    }



    /* =========================================================
       VALIDA E-MAIL DO MORADOR
       ========================================================= */

    const residentEmail = normalizeEmail(morador.email);

    if (!residentEmail) {
      return NextResponse.json(
        {
          error:
            "Este morador ainda não possui e-mail cadastrado. Informe um e-mail antes de criar o acesso ao portal.",
        },
        { status: 400 }
      );
    }

    if (!isValidEmail(residentEmail)) {
      return NextResponse.json(
        {
          error:
            "O e-mail cadastrado para este morador é inválido. Corrija o e-mail antes de criar o acesso ao portal.",
        },
        { status: 400 }
      );
    }



    /* =========================================================
       CASO 2 — E-MAIL JÁ EXISTE DENTRO DA CARTEIRA

       Abre o usuário existente para revisão/vínculo.
       ========================================================= */

    const existingUserByEmail = await db.user.findFirst({
      where: {
        email: {
          equals: residentEmail,
          mode: "insensitive",
        },
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
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        residentId: true,
      },
    });

    if (existingUserByEmail) {
      const params = new URLSearchParams({
        action: "edit",
        userId: existingUserByEmail.id,
        residentId: morador.id,
      });

      return NextResponse.json({
        mode: "EDIT_EXISTING_EMAIL_USER",
        message:
          "Já existe um usuário com o e-mail deste morador. Abra o usuário existente para revisar ou vincular o morador.",
        userId: existingUserByEmail.id,
        residentId: morador.id,
        url: `/admin/usuarios?${params.toString()}`,
      });
    }



    /* =========================================================
       BLOQUEIO — E-MAIL EXISTE FORA DA CARTEIRA

       Evita que uma administradora assuma acesso de usuário que
       pertence a outro escopo/carteira.
       ========================================================= */

    const existingUserOutOfScope = await db.user.findFirst({
      where: {
        email: {
          equals: residentEmail,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
      },
    });

    if (existingUserOutOfScope) {
      return NextResponse.json(
        {
          error:
            "Já existe um usuário com este e-mail, mas ele não está dentro da sua carteira de acesso.",
        },
        { status: 409 }
      );
    }



    /* =========================================================
       CASO 3 — E-MAIL LIVRE PARA CRIAÇÃO DE USUÁRIO MORADOR
       ========================================================= */

    const params = new URLSearchParams({
      action: "create",
      role: "MORADOR",
      residentId: morador.id,
    });

    return NextResponse.json({
      mode: "CREATE_NEW_USER",
      message: "Morador sem usuário e com e-mail livre para criação.",
      residentId: morador.id,
      url: `/admin/usuarios?${params.toString()}`,
    });
  } catch (error: unknown) {
    console.error("ERRO AO RESOLVER ACESSO DO MORADOR:", error);

    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao resolver acesso do morador." },
      { status: 500 }
    );
  }
}