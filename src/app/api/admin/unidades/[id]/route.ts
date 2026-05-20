import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import {
  getActiveUserAccessFromCookies,
  isAdministradoraAccess,
  type ActiveUserAccess,
} from "@/lib/user-access";
import { canManageUnits } from "@/lib/access-control";
import { NextResponse } from "next/server";



/* =========================================================
   UNIDADES - API DE ATUALIZAÇÃO

   ETAPA 43 — ARQUITETURA DE PERFIS, VÍNCULOS E PERMISSÕES

   PATCH:
   - ADMINISTRADORA edita apenas unidades de condomínios da sua
     carteira ativa.
   - Pode alterar condomínio, bloco, número, tipo e status, desde
     que o novo condomínio também pertença à carteira ativa.

   Regras consolidadas:
   - /admin é área operacional da ADMINISTRADORA.
   - SUPER_ADMIN não opera por esta rota; deve usar a área /elogest.
   - SÍNDICO, MORADOR, PROPRIETÁRIO e CONSELHEIRO são bloqueados.
   - Todas as consultas usam administratorId do activeAccess.
   - A permissão MANAGE_UNITS é validada no perfil ativo.
   - Edição aceita apenas condomínio da carteira ativa.
   - Unidade não pode ser movida para condomínio inativo.
   - Administradora do condomínio precisa estar ativa.
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

   Etapa 43:
   /admin é área operacional da administradora cliente.
   SUPER_ADMIN fica reservado para /elogest.
   ========================================================= */

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
        "Este contexto não possui acesso ao cadastro administrativo de unidades. Use o portal ou a área EloGest.",
    };
  }

  if (!activeAccess.administratorId) {
    return {
      ok: false,
      status: 403,
      message: "Contexto de administradora sem vínculo com administradora.",
    };
  }

  if (!canManageUnits(activeAccess)) {
    return {
      ok: false,
      status: 403,
      message: "Usuário sem permissão para gerenciar unidades.",
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

    const unitId = cleanText(id);

    if (!unitId) {
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

    const administratorId = getAdministratorIdFromContext(user);

    if (!administratorId) {
      return NextResponse.json(
        { error: "Contexto de administradora sem vínculo com administradora." },
        { status: 403 }
      );
    }



    /* =========================================================
       VALIDAR ACESSO À UNIDADE ATUAL
       ========================================================= */

    const unidadeAtual = await db.unit.findFirst({
      where: {
        id: unitId,
        condominium: {
          administratorId,
        },
      },
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
        where: {
          id: requestedCondominiumId,
          administratorId,
          status: "ACTIVE",
          administrator: {
            status: "ACTIVE",
          },
        },
      });

      if (!condominio) {
        return NextResponse.json(
          {
            error:
              "Condomínio não encontrado, inativo, fora da carteira ou com administradora inativa.",
          },
          { status: 403 }
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
          not: unitId,
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
  } catch (error: unknown) {
    console.error("ERRO AO ATUALIZAR UNIDADE:", error);

    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
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
