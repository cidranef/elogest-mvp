import { db } from "@/lib/db";
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

   Objetivo:
   Ao clicar em "Gerenciar acesso" no cadastro do morador,
   o sistema decide automaticamente:

   1. Se o morador já tem usuário vinculado:
      -> editar usuário vinculado.

   2. Se o morador não tem usuário, mas o e-mail já existe:
      -> editar usuário existente para permitir vínculo.

   3. Se o morador não tem usuário e o e-mail não existe:
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
   HELPERS
   ========================================================= */

function normalizeEmail(value?: string | null) {
  return String(value || "").trim().toLowerCase();
}



function isValidEmail(email: string) {
  if (!email) return false;

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}



/* =========================================================
   USUÁRIO COM CONTEXTO ADMINISTRATIVO
   ========================================================= */

async function getAdminContextUser() {
  const sessionUser: any = await getAuthUser();

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



function validateAdminContext(user: any) {
  const activeAccess = user?.activeAccess as ActiveUserAccess | null;

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
      message:
        "Usuário sem permissão para gerenciar moradores ou usuários.",
    };
  }

  return {
    ok: true,
    status: 200,
    message: "",
  };
}



function getAdministratorIdFromContext(user: any) {
  const activeAccess = user?.activeAccess as ActiveUserAccess | null;

  return activeAccess?.administratorId || null;
}



/* =========================================================
   GET - RESOLVER ACESSO DO MORADOR
   ========================================================= */

export async function GET(req: Request, context: RouteContext) {
  try {
    const authUser: any = await getAdminContextUser();
    const { id } = await context.params;
    const residentId = String(id || "").trim();

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
