import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import { getActiveUserAccessFromCookies } from "@/lib/user-access";
import { NextResponse } from "next/server";



/* =========================================================
   CONDOMÍNIOS - API ADMINISTRATIVA

   ETAPA 15.1

   GET:
   - SUPER_ADMIN vê todos os condomínios.
   - ADMINISTRADORA vê apenas condomínios da sua administradora.

   POST:
   - SUPER_ADMIN pode criar vinculado a administratorId informado.
   - ADMINISTRADORA cria vinculado à administradora ativa.

   ETAPA 35.1:
   Refinamento dos cadastros base.

   Ajustes aplicados:
   - Rota passa a respeitar contexto ativo.
   - ADMINISTRADORA usa administratorId do contexto ativo.
   - SUPER_ADMIN mantém visão global quando contexto for SUPER_ADMIN.
   - Contextos de portal são bloqueados nesta rota administrativa.
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

   Exemplos:
   - SUPER_ADMIN + contexto SUPER_ADMIN:
     vê todos.

   - SUPER_ADMIN + contexto ADMINISTRADORA:
     opera como administradora específica.

   - ADMINISTRADORA:
     opera somente na administradora ativa.

   - SÍNDICO / MORADOR:
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
   WHERE DE LISTAGEM POR CONTEXTO
   ========================================================= */

function getCondominiumWhereByContext(user: any) {
  if (user.role === "SUPER_ADMIN") {
    return {};
  }

  if (user.role === "ADMINISTRADORA") {
    return {
      administratorId: user.administratorId,
    };
  }

  return {
    id: "__blocked__",
  };
}



/* =========================================================
   DEFINIR ADMINISTRADORA PARA CRIAÇÃO

   ADMINISTRADORA:
   - sempre usa administratorId do contexto ativo.

   SUPER_ADMIN:
   - pode informar body.administratorId;
   - se estiver operando em contexto de administradora, usa esse vínculo;
   - se não tiver administratorId, retorna erro pedindo seleção.
   ========================================================= */

function getAdministratorIdForCreate(user: any, body: any) {
  if (user.role === "ADMINISTRADORA") {
    return user.administratorId || null;
  }

  if (user.role === "SUPER_ADMIN") {
    return cleanText(body?.administratorId) || user.administratorId || null;
  }

  return null;
}



/* =========================================================
   GET - LISTAR CONDOMÍNIOS
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

    const where = getCondominiumWhereByContext(user);

    const condominios = await db.condominium.findMany({
      where,
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
  } catch (error: any) {
    console.error("ERRO AO LISTAR CONDOMÍNIOS:", error);

    if (error.message === "UNAUTHORIZED") {
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
    const user: any = await getAdminContextUser();
    const body = await req.json();

    const contextValidation = validateAdminContext(user);

    if (!contextValidation.ok) {
      return NextResponse.json(
        { error: contextValidation.message },
        { status: contextValidation.status }
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

    const administratorId = getAdministratorIdForCreate(user, body);

    if (!administratorId) {
      return NextResponse.json(
        {
          error:
            "Administradora não identificada. Selecione uma administradora antes de cadastrar o condomínio.",
        },
        { status: 400 }
      );
    }

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
  } catch (error: any) {
    console.error("ERRO AO CRIAR CONDOMÍNIO:", error);

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
      { error: "Erro ao criar condomínio." },
      { status: 500 }
    );
  }
}