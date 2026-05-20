import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import {
  getActiveUserAccessFromCookies,
  isAdministradoraAccess,
  type ActiveUserAccess,
} from "@/lib/user-access";
import { canManageResidents } from "@/lib/access-control";
import { NextResponse } from "next/server";
import { Status } from "@prisma/client";



/* =========================================================
   MORADORES - API ADMINISTRATIVA

   ETAPA 43 — ARQUITETURA DE PERFIS, VÍNCULOS E PERMISSÕES

   GET:
   - ADMINISTRADORA vê apenas moradores da própria carteira.

   POST:
   - ADMINISTRADORA cria novo morador vinculado a uma unidade
     permitida da sua carteira.
   - valida CPF duplicado quando informado.
   - valida CPF, e-mail, status e tipo de morador.

   Regras consolidadas:
   - /admin é área operacional da ADMINISTRADORA.
   - SUPER_ADMIN não opera por esta rota; deve usar a área /elogest.
   - SÍNDICO, MORADOR, PROPRIETÁRIO e CONSELHEIRO são bloqueados.
   - Todas as consultas usam administratorId do activeAccess.
   - A permissão MANAGE_RESIDENTS é validada no perfil ativo.
   - Unidade e condomínio precisam pertencer à carteira ativa.
   - Unidade, condomínio e administradora precisam estar ativos
     para criação operacional de novo morador.
   - O condomínio do morador é sempre derivado da unidade validada.

   PADRÃO BRASIL:
   Tipos de morador mantidos em português sem acento:
   - PROPRIETARIO
   - INQUILINO
   - FAMILIAR
   - RESPONSAVEL
   - OUTRO
   ========================================================= */



/* =========================================================
   HELPERS
   ========================================================= */

function onlyDigits(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}



function normalizeText(value?: string | null) {
  const cleaned = String(value || "").trim();
  return cleaned.length > 0 ? cleaned : null;
}



function normalizeEmail(value?: string | null) {
  const cleaned = String(value || "").trim().toLowerCase();
  return cleaned.length > 0 ? cleaned : null;
}



function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}



function isValidCpfFormat(cpf: string) {
  return /^\d{11}$/.test(cpf);
}



function normalizeStatus(value?: string | null): Status {
  const status = String(value || Status.ACTIVE).trim().toUpperCase();

  if (status === Status.INACTIVE) {
    return Status.INACTIVE;
  }

  return Status.ACTIVE;
}



function isValidStatus(status: Status) {
  return [Status.ACTIVE, Status.INACTIVE].includes(status);
}



function isValidResidentType(residentType?: string | null) {
  if (!residentType) return true;

  return [
    "PROPRIETARIO",
    "INQUILINO",
    "FAMILIAR",
    "RESPONSAVEL",
    "OUTRO",
  ].includes(residentType);
}



function countOpenTickets(tickets: Array<{ status: string }>) {
  return tickets.filter(
    (ticket) => ticket.status === "OPEN" || ticket.status === "IN_PROGRESS"
  ).length;
}



function formatMoradorResponse(morador: any) {
  return {
    id: morador.id,

    condominiumId: morador.condominiumId,
    unitId: morador.unitId,
    userId: morador.userId || null,

    condominium: morador.condominium,
    unit: morador.unit,
    user: morador.user,

    name: morador.name,
    cpf: morador.cpf,
    email: morador.email,
    phone: morador.phone,
    residentType: morador.residentType,
    status: morador.status,

    createdAt: morador.createdAt,
    updatedAt: morador.updatedAt,

    totalTickets: morador.tickets?.length || 0,
    openTickets: countOpenTickets(morador.tickets || []),
    hasUser: !!morador.user,
  };
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



/* =========================================================
   VALIDA CONTEXTO ADMINISTRATIVO
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
        "Este contexto não possui acesso ao cadastro administrativo de moradores. Use o portal ou a área EloGest.",
    };
  }

  if (!activeAccess.administratorId) {
    return {
      ok: false,
      status: 403,
      message: "Contexto de administradora sem vínculo com administradora.",
    };
  }

  if (!canManageResidents(activeAccess)) {
    return {
      ok: false,
      status: 403,
      message: "Usuário sem permissão para gerenciar moradores.",
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
   GET - LISTAR MORADORES
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

    const moradores = await db.resident.findMany({
      where: {
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
        tickets: {
          select: {
            id: true,
            status: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const result = moradores.map((morador) => formatMoradorResponse(morador));

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("ERRO AO LISTAR MORADORES:", error);

    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao listar moradores." },
      { status: 500 }
    );
  }
}



/* =========================================================
   POST - CRIAR MORADOR
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

    if (!body.unitId) {
      return NextResponse.json(
        { error: "Unidade é obrigatória." },
        { status: 400 }
      );
    }

    const name = normalizeText(body.name);

    if (!name) {
      return NextResponse.json(
        { error: "Nome do morador é obrigatório." },
        { status: 400 }
      );
    }

    const cpf = body.cpf ? onlyDigits(body.cpf) : null;
    const email = normalizeEmail(body.email);
    const phone = body.phone ? onlyDigits(body.phone) : null;
    const residentType = normalizeText(body.residentType);
    const status = normalizeStatus(body.status);

    if (cpf && !isValidCpfFormat(cpf)) {
      return NextResponse.json(
        { error: "CPF inválido. Informe um CPF com 11 dígitos." },
        { status: 400 }
      );
    }

    if (email && !isValidEmail(email)) {
      return NextResponse.json(
        { error: "E-mail inválido." },
        { status: 400 }
      );
    }

    if (!isValidStatus(status)) {
      return NextResponse.json(
        { error: "Status inválido." },
        { status: 400 }
      );
    }

    if (!isValidResidentType(residentType)) {
      return NextResponse.json(
        { error: "Tipo de morador inválido." },
        { status: 400 }
      );
    }



    /* =========================================================
       VALIDAR UNIDADE PERMITIDA

       Etapa 43:
       A unidade precisa pertencer à carteira ativa da administradora.
       Para criação operacional, unidade, condomínio e administradora
       precisam estar ativos.
       ========================================================= */

    const unidade = await db.unit.findFirst({
      where: {
        id: body.unitId,
        status: "ACTIVE",
        condominium: {
          administratorId,
          status: "ACTIVE",
          administrator: {
            status: "ACTIVE",
          },
        },
      },
      include: {
        condominium: true,
      },
    });

    if (!unidade) {
      return NextResponse.json(
        {
          error:
            "Unidade não encontrada, inativa, fora da carteira ou com condomínio/administradora inativos.",
        },
        { status: 403 }
      );
    }

    if (cpf) {
      const existing = await db.resident.findFirst({
        where: {
          cpf,
        },
        select: {
          id: true,
        },
      });

      if (existing) {
        return NextResponse.json(
          { error: "Já existe um morador cadastrado com esse CPF." },
          { status: 409 }
        );
      }
    }

    const morador = await db.resident.create({
      data: {
        condominiumId: unidade.condominiumId,
        unitId: unidade.id,

        name,
        cpf,
        email,
        phone,
        residentType,
        status,
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
        tickets: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    return NextResponse.json(formatMoradorResponse(morador), {
      status: 201,
    });
  } catch (error: unknown) {
    console.error("ERRO AO CRIAR MORADOR:", error);

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
        { error: "Já existe um morador cadastrado com esse CPF." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao criar morador." },
      { status: 500 }
    );
  }
}
