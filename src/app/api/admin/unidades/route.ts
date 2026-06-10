import {
  Prisma,
  type Condominium,
  type Resident,
  type Ticket,
  type Unit,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireActiveAdminApiAccess } from "@/lib/admin-api-guard";
import { getAuthUser } from "@/lib/auth-guard";
import {
  getActiveUserAccessFromCookies,
  isAdministradoraAccess,
  type ActiveUserAccess,
} from "@/lib/user-access";
import { canManageUnits } from "@/lib/access-control";
import { NextResponse } from "next/server";
import {
  getPlanErrorPayload,
  isPlanAccessError,
  isPlanLimitError,
  MODULE_SLUGS,
  requireCanCreateUnit,
  requireModuleAccess,
} from "@/lib/plan-limits";



/* =========================================================
   UNIDADES - API ADMINISTRATIVA

   ETAPA 43 — ARQUITETURA DE PERFIS, VÍNCULOS E PERMISSÕES

   ETAPA 44 — SUPER ADMIN E MULTIADMINISTRADORA
   - Adicionado requireActiveAdminApiAccess() para bloquear APIs /api/admin/*
     quando a administradora estiver inativa.

   ETAPA 45.5 — FILTROS SERVER-SIDE E PAGINAÇÃO INICIAL
   - GET passa a aceitar ?condominio=ID.
   - GET passa a aceitar ?page=1&limit=50.
   - Mantém retorno em array quando page/limit não são enviados,
     preservando compatibilidade com telas existentes.
   - Quando page/limit são enviados, retorna objeto paginado:
     { items, pagination }.
   - Removidos tipos any.
   - Mantido isolamento por administradora ativa e activeAccess.

   GET:
   - ADMINISTRADORA vê apenas unidades dos condomínios da sua
     carteira ativa.
   - Se informado condominio=ID, lista apenas unidades daquele
     condomínio, desde que pertença à carteira ativa.

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



type RequestBody = Record<string, unknown>;



type RelatedResident = Pick<Resident, "id" | "status">;



type RelatedTicket = Pick<Ticket, "id" | "status">;



type UnitWithRelations = Unit & {
  condominium: Condominium;
  residents: RelatedResident[];
  tickets: RelatedTicket[];
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



type PaginationParams = {
  page: number;
  limit: number;
  skip: number;
  shouldPaginate: boolean;
};



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
  return cleanText(value).toUpperCase();
}



function normalizeUnitType(value: unknown) {
  return cleanOptionalText(value);
}



function normalizeStatus(value: unknown): "ACTIVE" | "INACTIVE" {
  const status = cleanText(value || "ACTIVE").toUpperCase();

  if (status === "ACTIVE" || status === "INACTIVE") {
    return status;
  }

  return "ACTIVE";
}



function normalizeQueryId(value: string | null) {
  const text = cleanText(value);

  return text || null;
}



function parsePositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}



function getPaginationParams(url: URL): PaginationParams {
  const pageParam = url.searchParams.get("page");
  const limitParam = url.searchParams.get("limit");

  const shouldPaginate = !!pageParam || !!limitParam;

  const page = parsePositiveInteger(pageParam, 1);
  const rawLimit = parsePositiveInteger(limitParam, 50);

  const limit = Math.min(Math.max(rawLimit, 1), 200);
  const skip = (page - 1) * limit;

  return {
    page,
    limit,
    skip,
    shouldPaginate,
  };
}



function isPrismaKnownRequestError(
  error: unknown
): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError;
}



/* =========================================================
   USUÁRIO COM CONTEXTO ADMINISTRATIVO

   A sessão identifica o usuário logado.
   O contexto ativo define o papel/carteira em uso.
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

   Etapa 43:
   /admin é área operacional da administradora cliente.
   SUPER_ADMIN fica reservado para /elogest.
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



function getAdministratorIdFromContext(user: AdminContextUser) {
  return user.activeAccess?.administratorId || null;
}



/* =========================================================
   WHERE BASE DE ACESSO

   ADMINISTRADORA:
   - só enxerga unidades de condomínios da própria carteira.
   - se condominio=ID vier na URL, o filtro continua preso ao
     administratorId do activeAccess.
   ========================================================= */

function buildUnitWhere({
  administratorId,
  condominiumId,
}: {
  administratorId: string;
  condominiumId?: string | null;
}): Prisma.UnitWhereInput {
  return {
    ...(condominiumId ? { condominiumId } : {}),

    condominium: {
      administratorId,
    },
  };
}



/* =========================================================
   RETORNO PADRONIZADO
   ========================================================= */

function buildUnitPayload(unidade: UnitWithRelations) {
  const chamadosAbertos = unidade.tickets.filter(
    (ticket) => ticket.status === "OPEN" || ticket.status === "IN_PROGRESS"
  ).length;

  const moradoresAtivos = unidade.residents.filter(
    (resident) => resident.status === "ACTIVE"
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

export async function GET(req: Request) {
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

    await requireModuleAccess({
      administratorId,
      moduleSlug: MODULE_SLUGS.UNIDADES,
    });

    const url = new URL(req.url);
    const condominiumId = normalizeQueryId(url.searchParams.get("condominio"));
    const pagination = getPaginationParams(url);

    const where = buildUnitWhere({
      administratorId,
      condominiumId,
    });



    /* =========================================================
       PAGINAÇÃO OPCIONAL

       Compatibilidade:
       - Sem page/limit: retorna array puro.
       - Com page/limit: retorna { items, pagination }.
       ========================================================= */

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
      ...(pagination.shouldPaginate
        ? {
            skip: pagination.skip,
            take: pagination.limit,
          }
        : {}),
    });

    const result = unidades.map((unidade) => buildUnitPayload(unidade));

    if (!pagination.shouldPaginate) {
      return NextResponse.json(result);
    }

    const total = await db.unit.count({
      where,
    });

    return NextResponse.json({
      items: result,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / pagination.limit)),
        hasNextPage: pagination.page * pagination.limit < total,
        hasPreviousPage: pagination.page > 1,
      },
    });
  } catch (error: unknown) {
    console.error("ERRO AO LISTAR UNIDADES:", error);

    if (isPlanAccessError(error) || isPlanLimitError(error)) {
      return NextResponse.json(getPlanErrorPayload(error), {
        status: error.statusCode,
      });
    }

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
    const adminApiAccess = await requireActiveAdminApiAccess();

    if ("error" in adminApiAccess) {
      return adminApiAccess.error;
    }

    const user = await getAdminContextUser();
    const body = (await req.json()) as RequestBody;

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

    const condominiumId = cleanText(body.condominiumId);
    const block = normalizeBlock(body.block);
    const unitNumber = normalizeUnitNumber(body.unitNumber);
    const unitType = normalizeUnitType(body.unitType);
    const status = normalizeStatus(body.status);

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

    await requireCanCreateUnit(administratorId);



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

    if (isPlanAccessError(error) || isPlanLimitError(error)) {
      return NextResponse.json(getPlanErrorPayload(error), {
        status: error.statusCode,
      });
    }

    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    if (isPrismaKnownRequestError(error) && error.code === "P2002") {
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