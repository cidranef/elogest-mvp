import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import {
  getActiveUserAccessFromCookies,
  isAdministradoraAccess,
  type ActiveUserAccess,
} from "@/lib/user-access";
import { canManageCondominiums } from "@/lib/access-control";
import { NextResponse } from "next/server";



/* =========================================================
   CONDOMÍNIOS - API DE ATUALIZAÇÃO

   ETAPA 43 — ARQUITETURA DE PERFIS, VÍNCULOS E PERMISSÕES

   PATCH:
   - ADMINISTRADORA edita apenas condomínios vinculados à
     administradora do perfil ativo.

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



function normalizeStatus(value: unknown) {
  const status = cleanText(value).toUpperCase();

  if (status === "ACTIVE" || status === "INACTIVE") {
    return status;
  }

  return null;
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



function getAdministratorIdFromContext(user: any) {
  const activeAccess = user?.activeAccess as ActiveUserAccess | null;

  return activeAccess?.administratorId || null;
}



/* =========================================================
   WHERE DE ACESSO AO CONDOMÍNIO

   ADMINISTRADORA:
   - só edita condomínio da administradora ativa.
   ========================================================= */

function getCondominiumWhereByContext({
  condominiumId,
  administratorId,
}: {
  condominiumId: string;
  administratorId: string;
}) {
  return {
    id: condominiumId,
    administratorId,
  };
}



/* =========================================================
   MONTA DATA DE ATUALIZAÇÃO

   Só atualiza campos presentes no body.
   ========================================================= */

function buildUpdateData(body: any) {
  const data: any = {};

  if (body.name !== undefined) {
    data.name = cleanText(body.name);
  }

  if (body.cnpj !== undefined) {
    data.cnpj = normalizeCnpj(body.cnpj);
  }

  if (body.email !== undefined) {
    data.email = cleanOptionalText(body.email);
  }

  if (body.phone !== undefined) {
    data.phone = cleanOptionalText(body.phone);
  }

  if (body.cep !== undefined) {
    data.cep = cleanOptionalText(body.cep);
  }

  if (body.address !== undefined) {
    data.address = cleanOptionalText(body.address);
  }

  if (body.number !== undefined) {
    data.number = cleanOptionalText(body.number);
  }

  if (body.complement !== undefined) {
    data.complement = cleanOptionalText(body.complement);
  }

  if (body.district !== undefined) {
    data.district = cleanOptionalText(body.district);
  }

  if (body.city !== undefined) {
    data.city = cleanOptionalText(body.city);
  }

  if (body.state !== undefined) {
    data.state = normalizeUf(body.state);
  }

  if (body.status !== undefined) {
    data.status = normalizeStatus(body.status);
  }

  return data;
}



/* =========================================================
   RESPOSTA PADRONIZADA
   ========================================================= */

function buildCondominiumResponse(condominio: any) {
  const chamadosAbertos = condominio.tickets.filter(
    (ticket: any) => ticket.status === "OPEN" || ticket.status === "IN_PROGRESS"
  ).length;

  const unidadesAtivas = condominio.units.filter(
    (unit: any) => unit.status === "ACTIVE"
  ).length;

  const moradoresAtivos = condominio.residents.filter(
    (resident: any) => resident.status === "ACTIVE"
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
}



/* =========================================================
   PATCH - ATUALIZAR CONDOMÍNIO
   ========================================================= */

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const user: any = await getAdminContextUser();
    const { id } = await context.params;
    const body = await req.json();

    const condominiumId = cleanText(id);

    if (!condominiumId) {
      return NextResponse.json(
        { error: "ID do condomínio não informado." },
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
       VALIDAR ACESSO AO CONDOMÍNIO
       ========================================================= */

    const condominioAtual = await db.condominium.findFirst({
      where: getCondominiumWhereByContext({
        condominiumId,
        administratorId,
      }),
    });

    if (!condominioAtual) {
      return NextResponse.json(
        { error: "Condomínio não encontrado ou acesso negado." },
        { status: 404 }
      );
    }



    /* =========================================================
       VALIDAÇÃO DE NOME
       ========================================================= */

    if (body.name !== undefined && !cleanText(body.name)) {
      return NextResponse.json(
        { error: "Nome do condomínio é obrigatório." },
        { status: 400 }
      );
    }



    /* =========================================================
       VALIDAÇÃO DE STATUS
       ========================================================= */

    if (body.status !== undefined && !normalizeStatus(body.status)) {
      return NextResponse.json(
        { error: "Status inválido. Use ACTIVE ou INACTIVE." },
        { status: 400 }
      );
    }



    /* =========================================================
       VALIDAR CNPJ DUPLICADO, QUANDO ALTERADO
       ========================================================= */

    const cnpj =
      body.cnpj !== undefined ? normalizeCnpj(body.cnpj) : condominioAtual.cnpj;

    if (cnpj && cnpj !== condominioAtual.cnpj) {
      const existing = await db.condominium.findUnique({
        where: {
          cnpj,
        },
      });

      if (existing && existing.id !== condominiumId) {
        return NextResponse.json(
          { error: "Já existe um condomínio cadastrado com este CNPJ." },
          { status: 409 }
        );
      }
    }



    /* =========================================================
       ATUALIZAÇÃO
       ========================================================= */

    const updateData = buildUpdateData(body);

    if (Object.keys(updateData).length === 0) {
      const current = await db.condominium.findUnique({
        where: {
          id: condominioAtual.id,
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
      });

      if (!current) {
        return NextResponse.json(
          { error: "Condomínio não encontrado." },
          { status: 404 }
        );
      }

      return NextResponse.json(buildCondominiumResponse(current));
    }

    const condominio = await db.condominium.update({
      where: {
        id: condominioAtual.id,
      },
      data: updateData,
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
    });

    return NextResponse.json(buildCondominiumResponse(condominio));
  } catch (error: unknown) {
    console.error("ERRO AO ATUALIZAR CONDOMÍNIO:", error);

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
      { error: "Erro ao atualizar condomínio." },
      { status: 500 }
    );
  }
}
