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
   MORADORES - API DE ATUALIZAÇÃO

   ETAPA 43 — ARQUITETURA DE PERFIS, VÍNCULOS E PERMISSÕES

   PATCH:
   - ADMINISTRADORA edita apenas moradores da própria carteira.
   - ADMINISTRADORA só pode mover morador para unidade da própria
     carteira.
   - CPF é normalizado e validado.
   - CPF duplicado é bloqueado.
   - E-mail é validado quando informado.
   - Status é validado.
   - Tipo de morador é validado.

   Regras consolidadas:
   - /admin é área operacional da ADMINISTRADORA.
   - SUPER_ADMIN não opera por esta rota; deve usar a área /elogest.
   - SÍNDICO, MORADOR, PROPRIETÁRIO e CONSELHEIRO são bloqueados.
   - Todas as consultas usam administratorId do activeAccess.
   - A permissão MANAGE_RESIDENTS é validada no perfil ativo.

   PADRÃO BRASIL:
   Tipos de morador mantidos em português sem acento:
   - PROPRIETARIO
   - INQUILINO
   - FAMILIAR
   - RESPONSAVEL
   - OUTRO
   ========================================================= */



interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}



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
   PATCH - ATUALIZAR MORADOR
   ========================================================= */

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const user: any = await getAdminContextUser();
    const { id } = await context.params;
    const body = await req.json();

    const residentId = String(id || "").trim();

    if (!residentId) {
      return NextResponse.json(
        { error: "ID do morador não informado." },
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

    const moradorAtual = await db.resident.findFirst({
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

    if (!moradorAtual) {
      return NextResponse.json(
        { error: "Morador não encontrado ou acesso negado." },
        { status: 404 }
      );
    }



    /* =========================================================
       DEFINIR UNIDADE FINAL

       O frontend não decide livremente o condomínio.
       O condomínio final sempre vem da unidade validada.
       ========================================================= */

    let unitId = moradorAtual.unitId;
    let condominiumId = moradorAtual.condominiumId;

    if (body.unitId !== undefined) {
      if (!body.unitId) {
        return NextResponse.json(
          { error: "Unidade é obrigatória." },
          { status: 400 }
        );
      }

      const unidade = await db.unit.findFirst({
        where: {
          id: body.unitId,
          condominium: {
            administratorId,
          },
        },
        include: {
          condominium: true,
        },
      });

      if (!unidade) {
        return NextResponse.json(
          { error: "Unidade não encontrada ou acesso negado." },
          { status: 403 }
        );
      }

      unitId = unidade.id;
      condominiumId = unidade.condominiumId;
    }

    const name =
      body.name !== undefined
        ? normalizeText(body.name)
        : moradorAtual.name;

    if (!name) {
      return NextResponse.json(
        { error: "Nome do morador é obrigatório." },
        { status: 400 }
      );
    }

    const cpf =
      body.cpf !== undefined
        ? body.cpf
          ? onlyDigits(body.cpf)
          : null
        : moradorAtual.cpf;

    const email =
      body.email !== undefined
        ? normalizeEmail(body.email)
        : moradorAtual.email;

    const phone =
      body.phone !== undefined
        ? body.phone
          ? onlyDigits(body.phone)
          : null
        : moradorAtual.phone;

    const residentType =
      body.residentType !== undefined
        ? normalizeText(body.residentType)
        : moradorAtual.residentType;

    const status =
      body.status !== undefined
        ? normalizeStatus(body.status)
        : moradorAtual.status;

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

    if (cpf) {
      const existing = await db.resident.findFirst({
        where: {
          cpf,
          NOT: {
            id: residentId,
          },
        },
        select: {
          id: true,
        },
      });

      if (existing) {
        return NextResponse.json(
          { error: "Já existe outro morador cadastrado com esse CPF." },
          { status: 409 }
        );
      }
    }

    const morador = await db.resident.update({
      where: {
        id: residentId,
      },
      data: {
        condominiumId,
        unitId,

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

    return NextResponse.json(formatMoradorResponse(morador));
  } catch (error: unknown) {
    console.error("ERRO AO ATUALIZAR MORADOR:", error);

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
        { error: "Já existe um morador cadastrado com esses dados." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao atualizar morador." },
      { status: 500 }
    );
  }
}
