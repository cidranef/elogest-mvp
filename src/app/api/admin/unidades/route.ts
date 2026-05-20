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
   UNIDADES - API ADMINISTRATIVA

   ETAPA 43 — ARQUITETURA DE PERFIS, VÍNCULOS E PERMISSÕES

   GET:
   - ADMINISTRADORA vê apenas unidades dos condomínios da sua
     carteira ativa.

   POST:
   - ADMINISTRADORA cria nova unidade apenas em condomínio da
     administradora do perfil ativo.
   - valida duplicidade por condomínio + bloco + número.

   Regras consolidadas:
   - /admin é área operacional da ADMINISTRADORA.
   - SUPER_ADMIN não opera por esta rota; deve usar a área /elogest.
   - SÍNDICO, MORADOR, PROPRIETÁRIO e CONSELHEIRO são bloqueados.
   - Todas as consultas usam administratorId do activeAccess.
   - A permissão MANAGE_UNITS é validada no perfil ativo.
   - Cadastro aceita apenas condomínio da carteira ativa.
   - Condomínio precisa estar ativo para receber nova unidade.
   - Administradora do condomínio precisa estar ativa.
   - Status é validado como ACTIVE ou INACTIVE.
   - Campos são normalizados antes de salvar.
   - Duplicidade de unidade no mesmo condomínio recebe mensagem amigável.
   ========================================================= */



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
  const status = cleanText(value || "ACTIVE").toUpperCase();

  if (status === "ACTIVE" || status === "INACTIVE") {
    return status;
  }

  return "ACTIVE";
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
   GET - LISTAR UNIDADES
   ========================================================= */

export async function GET() {
  try {
    const user: any = await getAdminContextUser();

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

    const unidades = await db.unit.findMany({
      where: {
        condominium: {
          administratorId,
        },
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
      orderBy: [
        {
          condominium: {
            name: "asc",
          },
        },
        {
          status: "asc",
        },
        {
          block: "asc",
        },
        {
          unitNumber: "asc",
        },
      ],
    });

    const result = unidades.map((unidade) => buildUnitPayload(unidade));

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("ERRO AO LISTAR UNIDADES:", error);

    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao listar unidades." },
      { status: 500 }
    );
  }
}



/* =========================================================
   POST - CRIAR UNIDADE
   ========================================================= */

export async function POST(req: Request) {
  try {
    const user: any = await getAdminContextUser();
    const body = await req.json();

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

    const condominiumId = cleanText(body?.condominiumId);
    const block = normalizeBlock(body?.block);
    const unitNumber = normalizeUnitNumber(body?.unitNumber);
    const unitType = normalizeUnitType(body?.unitType);
    const status = normalizeStatus(body?.status);

    if (!condominiumId) {
      return NextResponse.json(
        { error: "Condomínio é obrigatório." },
        { status: 400 }
      );
    }

    if (!unitNumber) {
      return NextResponse.json(
        { error: "Número da unidade é obrigatório." },
        { status: 400 }
      );
    }



    /* =========================================================
       VALIDAR CONDOMÍNIO PERMITIDO

       ADMINISTRADORA:
       - só pode criar unidade em condomínio da própria carteira.
       - o condomínio e a administradora precisam estar ativos.
       ========================================================= */

    const condominio = await db.condominium.findFirst({
      where: {
        id: condominiumId,
        administratorId,
        status: "ACTIVE",
        administrator: {
          status: "ACTIVE",
        },
      },
      include: {
        administrator: true,
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



    /* =========================================================
       VALIDAR DUPLICIDADE

       Regra:
       - condomínio + bloco + número deve ser único.
       - bloco vazio é tratado como null.
       ========================================================= */

    const existing = await db.unit.findFirst({
      where: {
        condominiumId: condominio.id,
        block,
        unitNumber,
      },
    });

    if (existing) {
      return NextResponse.json(
        {
          error:
            "Já existe uma unidade cadastrada com este bloco/número neste condomínio.",
        },
        { status: 409 }
      );
    }



    /* =========================================================
       CRIAÇÃO
       ========================================================= */

    const unidade = await db.unit.create({
      data: {
        condominiumId: condominio.id,
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
    console.error("ERRO AO CRIAR UNIDADE:", error);

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
            "Já existe uma unidade cadastrada com este bloco/número neste condomínio.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao criar unidade." },
      { status: 500 }
    );
  }
}
