import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import { getActiveUserAccessFromCookies } from "@/lib/user-access";
import { NextResponse } from "next/server";



/* =========================================================
   UNIDADES - API ADMINISTRATIVA

   ETAPA 15.2

   GET:
   - SUPER_ADMIN vê todas as unidades.
   - ADMINISTRADORA vê apenas unidades dos seus condomínios.

   POST:
   - cria nova unidade vinculada a um condomínio permitido.
   - valida duplicidade por condomínio + bloco + número.

   ETAPA 35.2:
   Refinamento dos cadastros base.

   Ajustes aplicados:
   - Rota passa a respeitar contexto ativo.
   - ADMINISTRADORA usa administratorId do contexto ativo.
   - SUPER_ADMIN mantém visão global quando contexto for SUPER_ADMIN.
   - Contextos de portal são bloqueados nesta rota administrativa.
   - Cadastro aceita apenas condomínio da carteira ativa.
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

   Exemplos:
   - SUPER_ADMIN + contexto SUPER_ADMIN:
     vê todas as unidades.

   - SUPER_ADMIN + contexto ADMINISTRADORA:
     opera na carteira da administradora selecionada.

   - ADMINISTRADORA:
     opera somente na administradora ativa.

   - SÍNDICO / MORADOR / PROPRIETÁRIO:
     bloqueados nesta rota.
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
   WHERE DE LISTAGEM POR CONTEXTO

   SUPER_ADMIN:
   - vê tudo.

   ADMINISTRADORA:
   - vê apenas unidades de condomínios da administradora ativa.
   ========================================================= */

function getUnitWhereByContext(user: any) {
  if (user.role === "SUPER_ADMIN") {
    return {};
  }

  if (user.role === "ADMINISTRADORA") {
    return {
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

   Usado no cadastro para garantir que a unidade só será criada
   em condomínio acessível ao contexto ativo.
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

    const where = getUnitWhereByContext(user);

    const unidades = await db.unit.findMany({
      where,
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
  } catch (error: any) {
    console.error("ERRO AO LISTAR UNIDADES:", error);

    if (error.message === "UNAUTHORIZED") {
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

       SUPER_ADMIN:
       - pode criar em qualquer condomínio existente.
       ========================================================= */

    const condominio = await db.condominium.findFirst({
      where: getAllowedCondominiumWhere(user, condominiumId),
    });

    if (!condominio) {
      return NextResponse.json(
        { error: "Condomínio não encontrado ou acesso negado." },
        { status: 403 }
      );
    }

    if (condominio.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Não é possível cadastrar unidade em condomínio inativo." },
        { status: 400 }
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
  } catch (error: any) {
    console.error("ERRO AO CRIAR UNIDADE:", error);

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