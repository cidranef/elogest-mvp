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
import {
  getPlanErrorPayload,
  isPlanAccessError,
  isPlanLimitError,
  MODULE_SLUGS,
  requireCanCreateCondominium,
  requireModuleAccess,
} from "@/lib/plan-limits";



/* =========================================================
   CONDOMÍNIOS - API ADMINISTRATIVA

   ETAPA 43 — ARQUITETURA DE PERFIS, VÍNCULOS E PERMISSÕES

   ETAPA 44 — SUPER ADMIN E MULTIADMINISTRADORA
   - Adicionado requireActiveAdminApiAccess() para bloquear APIs /api/admin/*
     quando a administradora estiver inativa.

   ETAPA 45 — CADASTRO CONDOMINIAL AVANÇADO
   - Cadastro ampliado do condomínio.
   - Adicionados dados institucionais, operacionais e administrativos.
   - Preparação para fornecedores, comunicados, assembleias, financeiro,
     relatórios e governança condominial.
   - Removidos tipos any para compatibilidade com lint/TypeScript.

   ETAPA 45.2 — IMAGEM DA FACHADA
   - Adicionado facadeImagePath no retorno e criação do condomínio.
   - Neste primeiro momento o campo aceita URL/caminho da imagem.
   - Upload real pode ser evoluído depois em API própria.

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
   - administratorId enviado no body é ignorado por segurança.
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



function normalizeStatus(value: unknown): "ACTIVE" | "INACTIVE" {
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



function normalizeCondominiumType(value: unknown): CondominiumType {
  const type = cleanText(value || "RESIDENTIAL").toUpperCase();

  if (
    type === "RESIDENTIAL" ||
    type === "COMMERCIAL" ||
    type === "MIXED" ||
    type === "HORIZONTAL" ||
    type === "OTHER"
  ) {
    return type as CondominiumType;
  }

  return CondominiumType.RESIDENTIAL;
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



/* =========================================================
   OBTÉM ADMINISTRADORA ATIVA DO CONTEXTO

   A validação acima garante administratorId no activeAccess,
   mas este helper deixa o TypeScript e os filtros Prisma mais
   explícitos.
   ========================================================= */

function getAdministratorIdFromContext(user: AdminContextUser) {
  return user.activeAccess?.administratorId || null;
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

    /* =====================================================
       ETAPA 45 - DADOS CADASTRAIS
       ===================================================== */

    name: condominio.name,
    legalName: condominio.legalName,
    cnpj: condominio.cnpj,
    type: condominio.type,
    status: condominio.status,

    /* =====================================================
       ETAPA 45.2 - IMAGEM DA FACHADA
       ===================================================== */

    facadeImagePath: condominio.facadeImagePath,

    /* =====================================================
       ETAPA 45 - CONTATO
       ===================================================== */

    email: condominio.email,
    phone: condominio.phone,
    administrativeContactName: condominio.administrativeContactName,
    administrativeContactEmail: condominio.administrativeContactEmail,
    administrativeContactPhone: condominio.administrativeContactPhone,

    /* =====================================================
       ETAPA 45 - ENDEREÇO
       ===================================================== */

    cep: condominio.cep,
    address: condominio.address,
    number: condominio.number,
    complement: condominio.complement,
    district: condominio.district,
    city: condominio.city,
    state: condominio.state,

    /* =====================================================
       ETAPA 45 - DADOS OPERACIONAIS
       ===================================================== */

    unitsCount: condominio.unitsCount,
    blocksCount: condominio.blocksCount,
    managementStartDate: condominio.managementStartDate,
    managementEndDate: condominio.managementEndDate,
    notes: condominio.notes,
    metadata: condominio.metadata,

    createdAt: condominio.createdAt,
    updatedAt: condominio.updatedAt,

    /* =====================================================
       INDICADORES CALCULADOS

       totalUnits:
       quantidade real de unidades cadastradas.

       unitsCount:
       quantidade informada no cadastro avançado.
       ===================================================== */

    totalUnits: condominio.units.length,
    activeUnits: unidadesAtivas,

    totalResidents: condominio.residents.length,
    activeResidents: moradoresAtivos,

    totalTickets: condominio.tickets.length,
    openTickets: chamadosAbertos,
  };
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
      moduleSlug: MODULE_SLUGS.CONDOMINIOS,
    });

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
          name: "asc",
        },
      ],
    });

    const result = condominios.map((condominio) =>
      buildCondominiumResponse(condominio)
    );

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("ERRO AO LISTAR CONDOMÍNIOS:", error);

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

    const name = cleanText(body.name);

    if (!name) {
      return NextResponse.json(
        { error: "Nome do condomínio é obrigatório." },
        { status: 400 }
      );
    }

    const status = normalizeStatus(body.status);
    const cnpj = normalizeCnpj(body.cnpj);
    const type = normalizeCondominiumType(body.type);

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

    await requireCanCreateCondominium(administratorId);



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

       Etapa 45:
       Incluímos os novos campos do cadastro condominial avançado.

       Etapa 45.2:
       Incluímos facadeImagePath para imagem da fachada.
       ========================================================= */

    const createData: Prisma.CondominiumUncheckedCreateInput = {
      administratorId,

      /* =====================================================
         DADOS CADASTRAIS
         ===================================================== */

      name,
      legalName: cleanOptionalText(body.legalName),
      cnpj,
      type,
      status,

      /* =====================================================
         ETAPA 45.2 - IMAGEM DA FACHADA
         ===================================================== */

      facadeImagePath: cleanOptionalText(body.facadeImagePath),

      /* =====================================================
         CONTATO
         ===================================================== */

      email: cleanOptionalText(body.email),
      phone: cleanOptionalText(body.phone),
      administrativeContactName: cleanOptionalText(
        body.administrativeContactName
      ),
      administrativeContactEmail: cleanOptionalText(
        body.administrativeContactEmail
      ),
      administrativeContactPhone: cleanOptionalText(
        body.administrativeContactPhone
      ),

      /* =====================================================
         ENDEREÇO
         ===================================================== */

      cep: cleanOptionalText(body.cep),
      address: cleanOptionalText(body.address),
      number: cleanOptionalText(body.number),
      complement: cleanOptionalText(body.complement),
      district: cleanOptionalText(body.district),
      city: cleanOptionalText(body.city),
      state: normalizeUf(body.state),

      /* =====================================================
         DADOS OPERACIONAIS
         ===================================================== */

      unitsCount: normalizeOptionalInteger(body.unitsCount),
      blocksCount: normalizeOptionalInteger(body.blocksCount),
      managementStartDate: normalizeOptionalDate(body.managementStartDate),
      managementEndDate: normalizeOptionalDate(body.managementEndDate),
      notes: cleanOptionalText(body.notes),
      metadata: normalizeOptionalJson(body.metadata),
    };

    const condominio = await db.condominium.create({
      data: createData,
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
    console.error("ERRO AO CRIAR CONDOMÍNIO:", error);

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