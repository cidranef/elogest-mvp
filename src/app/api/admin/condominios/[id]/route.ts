import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import { getActiveUserAccessFromCookies } from "@/lib/user-access";
import { NextResponse } from "next/server";



/* =========================================================
   CONDOMÍNIOS - API DE ATUALIZAÇÃO

   ETAPA 15.5.1

   PATCH:
   - Editar dados do condomínio
   - Ativar / inativar condomínio

   Regras:
   SUPER_ADMIN:
   - pode editar qualquer condomínio.

   ADMINISTRADORA:
   - só pode editar condomínio vinculado à administradora ativa.

   ETAPA 35.1:
   Refinamento dos cadastros base.

   Ajustes aplicados:
   - Rota passa a respeitar contexto ativo.
   - ADMINISTRADORA usa administratorId do contexto ativo.
   - SUPER_ADMIN mantém edição global quando contexto for SUPER_ADMIN.
   - Contextos de portal são bloqueados nesta rota administrativa.
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
        "Este contexto não possui acesso ao cadastro administrativo de condomínios.",
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
   WHERE DE ACESSO AO CONDOMÍNIO

   SUPER_ADMIN:
   - pode editar qualquer condomínio.

   ADMINISTRADORA:
   - só edita condomínio da administradora ativa.
   ========================================================= */

function getCondominiumWhereByContext(user: any, condominiumId: string) {
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
   PATCH - ATUALIZAR CONDOMÍNIO
   ========================================================= */

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const user: any = await getAdminContextUser();
    const { id } = await context.params;
    const body = await req.json();

    if (!id) {
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



    /* =========================================================
       VALIDAR ACESSO AO CONDOMÍNIO
       ========================================================= */

    const condominioAtual = await db.condominium.findFirst({
      where: getCondominiumWhereByContext(user, id),
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

      if (existing && existing.id !== id) {
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

      const chamadosAbertos = current.tickets.filter(
        (ticket) => ticket.status === "OPEN" || ticket.status === "IN_PROGRESS"
      ).length;

      const unidadesAtivas = current.units.filter(
        (unit) => unit.status === "ACTIVE"
      ).length;

      const moradoresAtivos = current.residents.filter(
        (resident) => resident.status === "ACTIVE"
      ).length;

      return NextResponse.json({
        id: current.id,
        administratorId: current.administratorId,
        administrator: current.administrator,

        name: current.name,
        cnpj: current.cnpj,
        email: current.email,
        phone: current.phone,
        cep: current.cep,
        address: current.address,
        number: current.number,
        complement: current.complement,
        district: current.district,
        city: current.city,
        state: current.state,
        status: current.status,

        createdAt: current.createdAt,
        updatedAt: current.updatedAt,

        totalUnits: current.units.length,
        activeUnits: unidadesAtivas,

        totalResidents: current.residents.length,
        activeResidents: moradoresAtivos,

        totalTickets: current.tickets.length,
        openTickets: chamadosAbertos,
      });
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



    /* =========================================================
       RETORNO PADRONIZADO
       ========================================================= */

    const chamadosAbertos = condominio.tickets.filter(
      (ticket) => ticket.status === "OPEN" || ticket.status === "IN_PROGRESS"
    ).length;

    const unidadesAtivas = condominio.units.filter(
      (unit) => unit.status === "ACTIVE"
    ).length;

    const moradoresAtivos = condominio.residents.filter(
      (resident) => resident.status === "ACTIVE"
    ).length;

    return NextResponse.json({
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
    });
  } catch (error: any) {
    console.error("ERRO AO ATUALIZAR CONDOMÍNIO:", error);

    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    if (error?.code === "P2002") {
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