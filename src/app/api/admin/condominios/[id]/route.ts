import {
  CondominiumType,
  type Administrator,
  type Condominium,
  type Resident,
  type Ticket,
  type Unit,
  Prisma,
} from "@prisma/client";
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
   CONDOMÍNIOS - API DE ATUALIZAÇÃO

   ETAPA 43 — ARQUITETURA DE PERFIS, VÍNCULOS E PERMISSÕES

   ETAPA 44 — SUPER ADMIN E MULTIADMINISTRADORA
   - Adicionado requireActiveAdminApiAccess() para bloquear APIs /api/admin/*
     quando a administradora estiver inativa.

   ETAPA 45 — CADASTRO CONDOMINIAL AVANÇADO
   - Edição dos novos campos cadastrais, institucionais,
     operacionais e administrativos do condomínio.
   - Preparação para fornecedores, comunicados, assembleias,
     financeiro, relatórios e governança condominial.
   - Removidos tipos any para compatibilidade com lint/TypeScript.

   ETAPA 45.2 — IMAGEM DA FACHADA
   - Adicionado facadeImagePath no retorno e na edição.
   - Neste primeiro momento o campo aceita URL/caminho da imagem.
   - Upload real pode ser evoluído depois em API própria.

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
   - administratorId enviado no body é ignorado por segurança.
   ========================================================= */



interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}



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



type RelatedUnit = Pick<Unit, "id" | "status">;



type RelatedResident = Pick<Resident, "id" | "status">;



type RelatedTicket = Pick<Ticket, "id" | "status">;



type CondominiumWithRelations = Condominium & {
  administrator: Administrator;
  units: RelatedUnit[];
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



function normalizeStatus(value: unknown): "ACTIVE" | "INACTIVE" | null {
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



function normalizeCondominiumType(value: unknown): CondominiumType | null {
  const type = cleanText(value).toUpperCase();

  if (
    type === "RESIDENTIAL" ||
    type === "COMMERCIAL" ||
    type === "MIXED" ||
    type === "HORIZONTAL" ||
    type === "OTHER"
  ) {
    return type as CondominiumType;
  }

  return null;
}



function normalizeOptionalInteger(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.floor(parsed);
}



function normalizeOptionalDate(value: unknown) {
  const text = cleanText(value);

  if (!text) {
    return null;
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}



function normalizeOptionalJson(
  value: unknown
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined || value === "") {
    return Prisma.JsonNull;
  }

  if (typeof value === "object") {
    return value as Prisma.InputJsonValue;
  }

  try {
    return JSON.parse(String(value)) as Prisma.InputJsonValue;
  } catch {
    return Prisma.JsonNull;
  }
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



function getAdministratorIdFromContext(user: AdminContextUser) {
  return user.activeAccess?.administratorId || null;
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

function buildUpdateData(body: RequestBody) {
  const data: Prisma.CondominiumUncheckedUpdateInput = {};



  /* =========================================================
     ETAPA 45 - DADOS CADASTRAIS
     ========================================================= */

  if (body.name !== undefined) {
    data.name = cleanText(body.name);
  }

  if (body.legalName !== undefined) {
    data.legalName = cleanOptionalText(body.legalName);
  }

  if (body.cnpj !== undefined) {
    data.cnpj = normalizeCnpj(body.cnpj);
  }

  if (body.type !== undefined) {
    const type = normalizeCondominiumType(body.type);

    if (type) {
      data.type = type;
    }
  }

  if (body.status !== undefined) {
    const status = normalizeStatus(body.status);

    if (status) {
      data.status = status;
    }
  }



  /* =========================================================
     ETAPA 45.2 - IMAGEM DA FACHADA
     ========================================================= */

  if (body.facadeImagePath !== undefined) {
    data.facadeImagePath = cleanOptionalText(body.facadeImagePath);
  }



  /* =========================================================
     ETAPA 45 - CONTATO
     ========================================================= */

  if (body.email !== undefined) {
    data.email = cleanOptionalText(body.email);
  }

  if (body.phone !== undefined) {
    data.phone = cleanOptionalText(body.phone);
  }

  if (body.administrativeContactName !== undefined) {
    data.administrativeContactName = cleanOptionalText(
      body.administrativeContactName
    );
  }

  if (body.administrativeContactEmail !== undefined) {
    data.administrativeContactEmail = cleanOptionalText(
      body.administrativeContactEmail
    );
  }

  if (body.administrativeContactPhone !== undefined) {
    data.administrativeContactPhone = cleanOptionalText(
      body.administrativeContactPhone
    );
  }



  /* =========================================================
     ETAPA 45 - ENDEREÇO
     ========================================================= */

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



  /* =========================================================
     ETAPA 45 - DADOS OPERACIONAIS
     ========================================================= */

  if (body.unitsCount !== undefined) {
    data.unitsCount = normalizeOptionalInteger(body.unitsCount);
  }

  if (body.blocksCount !== undefined) {
    data.blocksCount = normalizeOptionalInteger(body.blocksCount);
  }

  if (body.managementStartDate !== undefined) {
    data.managementStartDate = normalizeOptionalDate(body.managementStartDate);
  }

  if (body.managementEndDate !== undefined) {
    data.managementEndDate = normalizeOptionalDate(body.managementEndDate);
  }

  if (body.notes !== undefined) {
    data.notes = cleanOptionalText(body.notes);
  }

  if (body.metadata !== undefined) {
    data.metadata = normalizeOptionalJson(body.metadata);
  }

  return data;
}



/* =========================================================
   RESPOSTA PADRONIZADA
   ========================================================= */

function buildCondominiumResponse(condominio: CondominiumWithRelations) {
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



    /* =========================================================
       ETAPA 45 - DADOS CADASTRAIS
       ========================================================= */

    name: condominio.name,
    legalName: condominio.legalName,
    cnpj: condominio.cnpj,
    type: condominio.type,
    status: condominio.status,



    /* =========================================================
       ETAPA 45.2 - IMAGEM DA FACHADA
       ========================================================= */

    facadeImagePath: condominio.facadeImagePath,



    /* =========================================================
       ETAPA 45 - CONTATO
       ========================================================= */

    email: condominio.email,
    phone: condominio.phone,
    administrativeContactName: condominio.administrativeContactName,
    administrativeContactEmail: condominio.administrativeContactEmail,
    administrativeContactPhone: condominio.administrativeContactPhone,



    /* =========================================================
       ETAPA 45 - ENDEREÇO
       ========================================================= */

    cep: condominio.cep,
    address: condominio.address,
    number: condominio.number,
    complement: condominio.complement,
    district: condominio.district,
    city: condominio.city,
    state: condominio.state,



    /* =========================================================
       ETAPA 45 - DADOS OPERACIONAIS
       ========================================================= */

    unitsCount: condominio.unitsCount,
    blocksCount: condominio.blocksCount,
    managementStartDate: condominio.managementStartDate,
    managementEndDate: condominio.managementEndDate,
    notes: condominio.notes,
    metadata: condominio.metadata,

    createdAt: condominio.createdAt,
    updatedAt: condominio.updatedAt,



    /* =========================================================
       INDICADORES CALCULADOS

       totalUnits:
       quantidade real de unidades cadastradas.

       unitsCount:
       quantidade informada no cadastro avançado.
       ========================================================= */

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
    const adminApiAccess = await requireActiveAdminApiAccess();

    if ("error" in adminApiAccess) {
      return adminApiAccess.error;
    }

    const user = await getAdminContextUser();
    const { id } = await context.params;
    const body = (await req.json()) as RequestBody;

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

       Etapa 45:
       Mantém o isolamento por carteira. Mesmo que o usuário envie
       um ID válido de outro condomínio, a busca exige administratorId
       do perfil ativo.
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
       VALIDAÇÃO DE TIPO DE CONDOMÍNIO
       ========================================================= */

    if (body.type !== undefined && !normalizeCondominiumType(body.type)) {
      return NextResponse.json(
        {
          error:
            "Tipo de condomínio inválido. Use RESIDENTIAL, COMMERCIAL, MIXED, HORIZONTAL ou OTHER.",
        },
        { status: 400 }
      );
    }



    /* =========================================================
       VALIDAÇÃO DE QUANTIDADES
       ========================================================= */

    if (
      body.unitsCount !== undefined &&
      body.unitsCount !== null &&
      body.unitsCount !== "" &&
      normalizeOptionalInteger(body.unitsCount) === null
    ) {
      return NextResponse.json(
        { error: "Quantidade de unidades inválida." },
        { status: 400 }
      );
    }

    if (
      body.blocksCount !== undefined &&
      body.blocksCount !== null &&
      body.blocksCount !== "" &&
      normalizeOptionalInteger(body.blocksCount) === null
    ) {
      return NextResponse.json(
        { error: "Quantidade de blocos/torres inválida." },
        { status: 400 }
      );
    }



    /* =========================================================
       VALIDAÇÃO DE DATAS DE GESTÃO
       ========================================================= */

    const managementStartDate =
      body.managementStartDate !== undefined
        ? normalizeOptionalDate(body.managementStartDate)
        : condominioAtual.managementStartDate;

    const managementEndDate =
      body.managementEndDate !== undefined
        ? normalizeOptionalDate(body.managementEndDate)
        : condominioAtual.managementEndDate;

    if (
      body.managementStartDate !== undefined &&
      body.managementStartDate !== null &&
      body.managementStartDate !== "" &&
      !managementStartDate
    ) {
      return NextResponse.json(
        { error: "Data de início da gestão inválida." },
        { status: 400 }
      );
    }

    if (
      body.managementEndDate !== undefined &&
      body.managementEndDate !== null &&
      body.managementEndDate !== "" &&
      !managementEndDate
    ) {
      return NextResponse.json(
        { error: "Data de encerramento da gestão inválida." },
        { status: 400 }
      );
    }

    if (
      managementStartDate &&
      managementEndDate &&
      managementEndDate < managementStartDate
    ) {
      return NextResponse.json(
        {
          error:
            "A data de encerramento da gestão não pode ser anterior à data de início.",
        },
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

       Etapa 45:
       Atualiza somente campos enviados no body.

       Etapa 45.2:
       Atualiza facadeImagePath quando enviado no body.
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

    if (isPrismaKnownRequestError(error) && error.code === "P2002") {
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