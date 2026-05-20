import { db } from "@/lib/db";
import { requireActiveAdminApiAccess } from "@/lib/admin-api-guard";
import { getAuthUser } from "@/lib/auth-guard";
import {
  getActiveUserAccessFromCookies,
  isAdministradoraAccess,
  type ActiveUserAccess,
} from "@/lib/user-access";
import { canManageCondominiums } from "@/lib/access-control";
import { NextResponse } from "next/server";



/* =========================================================
   CONDOMÍNIOS - API ADMINISTRATIVA

   ETAPA 43 — ARQUITETURA DE PERFIS, VÍNCULOS E PERMISSÕES

   ETAPA 44 — SUPER ADMIN E MULTIADMINISTRADORA
   - Adicionado requireActiveAdminApiAccess() para bloquear APIs /api/admin/*
     quando a administradora estiver inativa.

   GET:
   - ADMINISTRADORA vê apenas condomínios da sua carteira ativa.

   POST:
   - ADMINISTRADORA cria condomínio vinculado à administradora
     do perfil ativo.

   Regras consolidadas:
   - /admin é área operacional da ADMINISTRADORA.
   - SUPER_ADMIN não opera por esta rota; deve usar a área /elogest.
   - SÍNDICO, MORADOR, PROPRIETÁRIO e CONSELHEIRO são bloqueados.
   - Todas as consultas usam administratorId do activeAccess.
   - A permissão MANAGE_CONDOMINIUMS é validada no perfil ativo.
   - CNPJ duplicado recebe mensagem amigável.
   - Status é validado.
   - Campos são normalizados antes de salvar.
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



function normalizeStatus(value: unknown) {
  const status = cleanText(value || "ACTIVE").toUpperCase();

  if (status === "ACTIVE" || status === "INACTIVE") {
    return status;
  }

  return "ACTIVE";
}



function normalizeUf(value: unknown) {
  const uf = cleanText(value).toUpperCase().slice(0, 2);

  return uf || null;
}



function normalizeCnpj(value: unknown) {
  const cnpj = cleanText(value);

  return cnpj || null;
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
        "Este contexto não possui acesso ao cadastro administrativo de condomínios. Use o portal ou a área EloGest.",
    };
  }

  if (!activeAccess.administratorId) {
    return {
      ok: false,
      status: 403,
      message: "Contexto de administradora sem vínculo com administradora.",
    };
  }

  if (!canManageCondominiums(activeAccess)) {
    return {
      ok: false,
      status: 403,
      message: "Usuário sem permissão para gerenciar condomínios.",
    };
  }

  return {
    ok: true,
    status: 200,
    message: "",
  };
}



/* =========================================================
   OBTÉM ADMINISTRADORA ATIVA DO CONTEXTO

   A validação acima garante administratorId no activeAccess,
   mas este helper deixa o TypeScript e os filtros Prisma mais
   explícitos.
   ========================================================= */

function getAdministratorIdFromContext(user: any) {
  const activeAccess = user?.activeAccess as ActiveUserAccess | null;

  return activeAccess?.administratorId || null;
}



/* =========================================================
   GET - LISTAR CONDOMÍNIOS
   ========================================================= */

export async function GET() {
  try {
    const adminApiAccess = await requireActiveAdminApiAccess();

    if ("error" in adminApiAccess) {
      return adminApiAccess.error;
    }

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

    const condominios = await db.condominium.findMany({
      where: {
        administratorId,
      },
      include: {
        administrator: true,

        units: {
          select: {
            id: true,
            status: true,
          },
        },

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
          status: "asc",
        },
        {
          createdAt: "desc",
        },
      ],
    });

    const result = condominios.map((condominio) => {
      const chamadosAbertos = condominio.tickets.filter(
        (ticket) => ticket.status === "OPEN" || ticket.status === "IN_PROGRESS"
      ).length;

      const unidadesAtivas = condominio.units.filter(
        (unit) => unit.status === "ACTIVE"
      ).length;

      const moradoresAtivos = condominio.residents.filter(
        (resident) => resident.status === "ACTIVE"
      ).length;

      return {
        id: condominio.id,
        administratorId: condominio.administratorId,
        administrator: condominio.administrator,

        name: condominio.name,
        cnpj: condominio.cnpj,
        email: condominio.email,
        phone: condominio.phone,
        cep: condominio.cep,
        address: condominio.address,
        number: condominio.number,
        complement: condominio.complement,
        district: condominio.district,
        city: condominio.city,
        state: condominio.state,
        status: condominio.status,

        createdAt: condominio.createdAt,
        updatedAt: condominio.updatedAt,

        totalUnits: condominio.units.length,
        activeUnits: unidadesAtivas,

        totalResidents: condominio.residents.length,
        activeResidents: moradoresAtivos,

        totalTickets: condominio.tickets.length,
        openTickets: chamadosAbertos,
      };
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("ERRO AO LISTAR CONDOMÍNIOS:", error);

    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao listar condomínios." },
      { status: 500 }
    );
  }
}



/* =========================================================
   POST - CRIAR CONDOMÍNIO
   ========================================================= */

export async function POST(req: Request) {
  try {
    const adminApiAccess = await requireActiveAdminApiAccess();

    if ("error" in adminApiAccess) {
      return adminApiAccess.error;
    }

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

    const name = cleanText(body?.name);

    if (!name) {
      return NextResponse.json(
        { error: "Nome do condomínio é obrigatório." },
        { status: 400 }
      );
    }

    const status = normalizeStatus(body?.status);
    const cnpj = normalizeCnpj(body?.cnpj);

    const administradora = await db.administrator.findFirst({
      where: {
        id: administratorId,
        status: "ACTIVE",
      },
    });

    if (!administradora) {
      return NextResponse.json(
        { error: "Administradora não encontrada ou inativa." },
        { status: 403 }
      );
    }



    /* =========================================================
       CNPJ ÚNICO

       Se informado, não pode existir em outro condomínio.
       ========================================================= */

    if (cnpj) {
      const existing = await db.condominium.findUnique({
        where: {
          cnpj,
        },
      });

      if (existing) {
        return NextResponse.json(
          { error: "Já existe um condomínio cadastrado com este CNPJ." },
          { status: 409 }
        );
      }
    }



    /* =========================================================
       CRIAÇÃO

       Etapa 43:
       administratorId sempre vem do perfil ativo da administradora.
       Não aceitamos administratorId enviado no body pela rota /admin.
       ========================================================= */

    const condominio = await db.condominium.create({
      data: {
        administratorId,
        name,
        cnpj,
        email: cleanOptionalText(body?.email),
        phone: cleanOptionalText(body?.phone),
        cep: cleanOptionalText(body?.cep),
        address: cleanOptionalText(body?.address),
        number: cleanOptionalText(body?.number),
        complement: cleanOptionalText(body?.complement),
        district: cleanOptionalText(body?.district),
        city: cleanOptionalText(body?.city),
        state: normalizeUf(body?.state),
        status,
      },
      include: {
        administrator: true,
      },
    });

    return NextResponse.json(condominio);
  } catch (error: unknown) {
    console.error("ERRO AO CRIAR CONDOMÍNIO:", error);

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
        { error: "Já existe um condomínio cadastrado com este dado único." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao criar condomínio." },
      { status: 500 }
    );
  }
}
