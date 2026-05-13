import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import { getActiveUserAccessFromCookies } from "@/lib/user-access";
import { NextResponse } from "next/server";



/* =========================================================
   UNIDADES - API DE ATUALIZAÇÃO

   ETAPA 15.5.2

   PATCH:
   - Editar unidade
   - Alterar condomínio
   - Alterar bloco, número, tipo e status
   - Ativar / inativar unidade

   Regras:
   SUPER_ADMIN:
   - pode editar qualquer unidade.

   ADMINISTRADORA:
   - só pode editar unidades de condomínios da administradora ativa.

   ETAPA 35.2:
   Refinamento dos cadastros base.

   Ajustes aplicados:
   - Rota passa a respeitar contexto ativo.
   - ADMINISTRADORA usa administratorId do contexto ativo.
   - SUPER_ADMIN mantém edição global quando contexto for SUPER_ADMIN.
   - Contextos de portal são bloqueados nesta rota administrativa.
   - Edição aceita apenas condomínio da carteira ativa.
   - Unidade não pode ser movida para condomínio inativo.
   - Status é validado como ACTIVE ou INACTIVE.
   - Campos são normalizados antes de salvar.
   - Duplicidade de unidade no mesmo condomínio recebe mensagem amigável.
   ========================================================= */



interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}



/* =========================================================
   HELPERS
   ========================================================= */

function cleanText(value: unknown) {
  return String(value || "").trim();
}



function cleanOptionalText(value: unknown) {
  const text = cleanText(value);

  return text || null;
}



function normalizeBlock(value: unknown) {
  const text = cleanText(value).toUpperCase();

  return text || null;
}



function normalizeUnitNumber(value: unknown) {
  return cleanText(value);
}



function normalizeUnitType(value: unknown) {
  return cleanOptionalText(value);
}



function normalizeStatus(value: unknown) {
  const status = cleanText(value).toUpperCase();

  if (status === "ACTIVE" || status === "INACTIVE") {
    return status;
  }

  return null;
}



/* =========================================================
   USUÁRIO COM CONTEXTO ADMINISTRATIVO

   A sessão identifica o usuário logado.
   O contexto ativo define o papel/carteira em uso.
   ========================================================= */

async function getAdminContextUser() {
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
   ========================================================= */

function validateAdminContext(user: any) {
  if (user?.role !== "SUPER_ADMIN" && user?.role !== "ADMINISTRADORA") {
    return {
      ok: false,
      status: 403,
      message:
        "Este contexto não possui acesso ao cadastro administrativo de unidades.",
    };
  }

  if (user.role === "ADMINISTRADORA" && !user.administratorId) {
    return {
      ok: false,
      status: 403,
      message: "Contexto de administradora sem vínculo com administradora.",
    };
  }

  return {
    ok: true,
    status: 200,
    message: "",
  };
}



/* =========================================================
   WHERE DE ACESSO À UNIDADE

   SUPER_ADMIN:
   - pode editar qualquer unidade.

   ADMINISTRADORA:
   - só edita unidade de condomínio da administradora ativa.
   ========================================================= */

function getUnitWhereByContext(user: any, unitId: string) {
  if (user.role === "SUPER_ADMIN") {
    return {
      id: unitId,
    };
  }

  if (user.role === "ADMINISTRADORA") {
    return {
      id: unitId,
      condominium: {
        administratorId: user.administratorId,
      },
    };
  }

  return {
    id: "__blocked__",
  };
}



/* =========================================================
   WHERE DE CONDOMÍNIO PERMITIDO

   Usado quando a unidade é criada/editada para outro condomínio.
   ========================================================= */

function getAllowedCondominiumWhere(user: any, condominiumId: string) {
  if (user.role === "SUPER_ADMIN") {
    return {
      id: condominiumId,
    };
  }

  if (user.role === "ADMINISTRADORA") {
    return {
      id: condominiumId,
      administratorId: user.administratorId,
    };
  }

  return {
    id: "__blocked__",
  };
}



/* =========================================================
   RETORNO PADRONIZADO
   ========================================================= */

function buildUnitPayload(unidade: any) {
  const chamadosAbertos = unidade.tickets.filter(
    (ticket: any) =>
      ticket.status === "OPEN" || ticket.status === "IN_PROGRESS"
  ).length;

  const moradoresAtivos = unidade.residents.filter(
    (resident: any) => resident.status === "ACTIVE"
  ).length;

  return {
    id: unidade.id,
    condominiumId: unidade.condominiumId,
    condominium: unidade.condominium,

    block: unidade.block,
    unitNumber: unidade.unitNumber,
    unitType: unidade.unitType,
    status: unidade.status,

    createdAt: unidade.createdAt,
    updatedAt: unidade.updatedAt,

    totalResidents: unidade.residents.length,
    activeResidents: moradoresAtivos,

    totalTickets: unidade.tickets.length,
    openTickets: chamadosAbertos,
  };
}



/* =========================================================
   PATCH - ATUALIZAR UNIDADE
   ========================================================= */

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const user: any = await getAdminContextUser();
    const { id } = await context.params;
    const body = await req.json();

    if (!id) {
      return NextResponse.json(
        { error: "ID da unidade não informado." },
        { status: 400 }
      );
    }

    const contextValidation = validateAdminContext(user);

    if (!contextValidation.ok) {
      return NextResponse.json(
        { error: contextValidation.message },
        { status: contextValidation.status }
      );
    }



    /* =========================================================
       VALIDAR ACESSO À UNIDADE ATUAL
       ========================================================= */

    const unidadeAtual = await db.unit.findFirst({
      where: getUnitWhereByContext(user, id),
      include: {
        condominium: true,
      },
    });

    if (!unidadeAtual) {
      return NextResponse.json(
        { error: "Unidade não encontrada ou acesso negado." },
        { status: 404 }
      );
    }



    /* =========================================================
       DEFINIR CONDOMÍNIO FINAL

       Se body.condominiumId vier, valida o novo condomínio.
       Se não vier, mantém o condomínio atual.
       ========================================================= */

    let condominiumId = unidadeAtual.condominiumId;

    if (body.condominiumId !== undefined) {
      const requestedCondominiumId = cleanText(body.condominiumId);

      if (!requestedCondominiumId) {
        return NextResponse.json(
          { error: "Condomínio é obrigatório." },
          { status: 400 }
        );
      }

      const condominio = await db.condominium.findFirst({
        where: getAllowedCondominiumWhere(user, requestedCondominiumId),
      });

      if (!condominio) {
        return NextResponse.json(
          { error: "Condomínio não encontrado ou acesso negado." },
          { status: 403 }
        );
      }

      if (condominio.status !== "ACTIVE") {
        return NextResponse.json(
          { error: "Não é possível mover unidade para condomínio inativo." },
          { status: 400 }
        );
      }

      condominiumId = condominio.id;
    }



    /* =========================================================
       NORMALIZAÇÃO DOS CAMPOS
       ========================================================= */

    const block =
      body.block !== undefined
        ? normalizeBlock(body.block)
        : unidadeAtual.block;

    const unitNumber =
      body.unitNumber !== undefined
        ? normalizeUnitNumber(body.unitNumber)
        : unidadeAtual.unitNumber;

    const unitType =
      body.unitType !== undefined
        ? normalizeUnitType(body.unitType)
        : unidadeAtual.unitType;

    const status =
      body.status !== undefined
        ? normalizeStatus(body.status)
        : unidadeAtual.status;



    /* =========================================================
       VALIDAÇÃO DE NÚMERO DA UNIDADE
       ========================================================= */

    if (!unitNumber) {
      return NextResponse.json(
        { error: "Número da unidade é obrigatório." },
        { status: 400 }
      );
    }



    /* =========================================================
       VALIDAÇÃO DE STATUS
       ========================================================= */

    if (!status) {
      return NextResponse.json(
        { error: "Status inválido. Use ACTIVE ou INACTIVE." },
        { status: 400 }
      );
    }



    /* =========================================================
       VALIDAR DUPLICIDADE

       Não pode existir outra unidade com:
       - mesmo condomínio
       - mesmo bloco
       - mesmo número
       ========================================================= */

    const existing = await db.unit.findFirst({
      where: {
        condominiumId,
        block,
        unitNumber,
        id: {
          not: id,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        {
          error:
            "Já existe outra unidade cadastrada com este bloco/número neste condomínio.",
        },
        { status: 409 }
      );
    }



    /* =========================================================
       ATUALIZAÇÃO
       ========================================================= */

    const unidade = await db.unit.update({
      where: {
        id: unidadeAtual.id,
      },
      data: {
        condominiumId,
        block,
        unitNumber,
        unitType,
        status,
      },
      include: {
        condominium: true,
        residents: {
          select: {
            id: true,
            status: true,
          },
        },
        tickets: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    return NextResponse.json(buildUnitPayload(unidade));
  } catch (error: any) {
    console.error("ERRO AO ATUALIZAR UNIDADE:", error);

    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    if (error?.code === "P2002") {
      return NextResponse.json(
        {
          error:
            "Já existe outra unidade cadastrada com este bloco/número neste condomínio.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao atualizar unidade." },
      { status: 500 }
    );
  }
}