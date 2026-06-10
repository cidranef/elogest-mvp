import {
  AccessRole,
  Prisma,
  Status,
  UnitPersonLinkType,
  type Condominium,
  type Resident,
  type Ticket,
  type Unit,
  type UnitPersonLink,
  type User,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireActiveAdminApiAccess } from "@/lib/admin-api-guard";
import { getAuthUser } from "@/lib/auth-guard";
import {
  getActiveUserAccessFromCookies,
  isAdministradoraAccess,
  type ActiveUserAccess,
} from "@/lib/user-access";
import { canManageResidents } from "@/lib/access-control";
import { NextResponse } from "next/server";
import {
  getPlanErrorPayload,
  isPlanAccessError,
  isPlanLimitError,
  MODULE_SLUGS,
  requireModuleAccess,
} from "@/lib/plan-limits";



/* =========================================================
   MORADORES - API ADMINISTRATIVA

   ETAPA 43 — ARQUITETURA DE PERFIS, VÍNCULOS E PERMISSÕES

   ETAPA 44 — SUPER ADMIN E MULTIADMINISTRADORA
   - Adicionado requireActiveAdminApiAccess() para bloquear APIs /api/admin/*
     quando a administradora estiver inativa.

   ETAPA 45.5 — FILTROS SERVER-SIDE E PAGINAÇÃO INICIAL

   ETAPA 45.6 — LISTAGENS ESCALÁVEIS DO DETALHE DO CONDOMÍNIO
   - GET aceita ?condominio=ID.
   - GET aceita ?page=1&limit=50.
   - Mantém retorno legado em array quando page/limit não são enviados.
   - Quando page/limit são enviados, retorna:
     { items, pagination }.
   - Paginação protegida com limite máximo.
   - Condominio informado na URL continua preso ao administratorId
     do perfil ativo.
   - Mantido isolamento por administradora ativa.
   - Mantido bloqueio para administradora inativa via
     requireActiveAdminApiAccess().
   - Mantidas validações de criação.
   - Removidos tipos any.

   GET:
   - ADMINISTRADORA vê apenas moradores da própria carteira.
   - Se informado condominio=ID, lista apenas moradores daquele
     condomínio, desde que pertença à carteira ativa.

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



type RelatedTicket = Pick<Ticket, "id" | "status">;



type RelatedUser = Pick<User, "id" | "name" | "email" | "role" | "isActive">;



type FormalUnitLink = Pick<
  UnitPersonLink,
  | "id"
  | "userId"
  | "residentId"
  | "condominiumId"
  | "unitId"
  | "linkType"
  | "isPrimary"
  | "canVote"
  | "canOpenTickets"
  | "receivesNotifications"
  | "status"
  | "notes"
>;



type ResidentWithRelations = Resident & {
  condominium: Condominium;
  unit: Unit;
  user: RelatedUser | null;
  tickets: RelatedTicket[];
  unitPersonLinks: FormalUnitLink[];
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
   CONSTANTES
   ========================================================= */

const DEFAULT_PAGE = 1;

const DEFAULT_LIMIT = 50;

const MAX_LIMIT = 200;



const VALID_RESIDENT_TYPES = [
  "PROPRIETARIO",
  "INQUILINO",
  "FAMILIAR",
  "RESPONSAVEL",
  "OUTRO",
];



/* =========================================================
   HELPERS
   ========================================================= */

function cleanText(value: unknown) {
  return String(value || "").trim();
}



function onlyDigits(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}



function normalizeText(value: unknown) {
  const cleaned = cleanText(value);

  return cleaned.length > 0 ? cleaned : null;
}



function normalizeEmail(value: unknown) {
  const cleaned = cleanText(value).toLowerCase();

  return cleaned.length > 0 ? cleaned : null;
}



function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}



function isValidCpfFormat(cpf: string) {
  return /^\d{11}$/.test(cpf);
}



function normalizeStatus(value: unknown): Status {
  const status = cleanText(value || Status.ACTIVE).toUpperCase();

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

  return VALID_RESIDENT_TYPES.includes(residentType);
}



function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "1", "yes", "sim"].includes(normalized)) return true;
    if (["false", "0", "no", "nao", "não"].includes(normalized)) return false;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  return fallback;
}



function residentTypeToLinkType(residentType?: string | null): UnitPersonLinkType {
  if (residentType === "PROPRIETARIO") return UnitPersonLinkType.OWNER;
  if (residentType === "INQUILINO") return UnitPersonLinkType.TENANT;
  if (residentType === "FAMILIAR") return UnitPersonLinkType.DEPENDENT;
  if (residentType === "OUTRO") return UnitPersonLinkType.AUTHORIZED;

  return UnitPersonLinkType.RESIDENT;
}



function linkTypeToResidentType(linkType: UnitPersonLinkType) {
  if (linkType === UnitPersonLinkType.OWNER) return "PROPRIETARIO";
  if (linkType === UnitPersonLinkType.TENANT) return "INQUILINO";
  if (linkType === UnitPersonLinkType.DEPENDENT) return "FAMILIAR";
  if (linkType === UnitPersonLinkType.AUTHORIZED) return "OUTRO";

  return "RESPONSAVEL";
}



function normalizeLinkType(
  value: unknown,
  residentType?: string | null
): UnitPersonLinkType {
  const normalized = cleanText(value).toUpperCase();

  if (
    Object.values(UnitPersonLinkType).includes(
      normalized as UnitPersonLinkType
    )
  ) {
    return normalized as UnitPersonLinkType;
  }

  return residentTypeToLinkType(residentType);
}



function getDefaultLinkPermissions(linkType: UnitPersonLinkType) {
  return {
    canVote: linkType === UnitPersonLinkType.OWNER,
    canOpenTickets: true,
    receivesNotifications: true,
    isPrimary: true,
  };
}



function buildFormalAccessLabel({
  linkType,
  condominiumName,
  block,
  unitNumber,
}: {
  linkType: UnitPersonLinkType;
  condominiumName: string;
  block?: string | null;
  unitNumber: string;
}) {
  const roleLabel =
    linkType === UnitPersonLinkType.OWNER ? "Proprietário" : "Morador";

  const unitLabel = `${block ? `Bloco ${block} - ` : ""}Unidade ${unitNumber}`;

  return `${roleLabel} - ${condominiumName} / ${unitLabel}`;
}



async function syncResidentFormalUnitLink({
  tx,
  residentId,
  legacyUserId,
  administratorId,
  condominiumId,
  condominiumName,
  unitId,
  unitBlock,
  unitNumber,
  linkType,
  status,
  canVote,
  canOpenTickets,
  receivesNotifications,
  isPrimary,
  notes,
}: {
  tx: Prisma.TransactionClient;
  residentId: string;
  legacyUserId: string | null;
  administratorId: string;
  condominiumId: string;
  condominiumName: string;
  unitId: string;
  unitBlock?: string | null;
  unitNumber: string;
  linkType: UnitPersonLinkType;
  status: Status;
  canVote: boolean;
  canOpenTickets: boolean;
  receivesNotifications: boolean;
  isPrimary: boolean;
  notes?: string | null;
}) {
  const currentLink = await tx.unitPersonLink.findFirst({
    where: {
      residentId,
    },
    orderBy: [
      {
        isPrimary: "desc",
      },
      {
        createdAt: "asc",
      },
    ],
  });

  const data = {
    userId: legacyUserId,
    residentId,
    condominiumId,
    unitId,
    linkType,
    isPrimary,
    canVote,
    canOpenTickets,
    receivesNotifications,
    status,
    notes: notes || null,
    metadata: {
      source: "ADMIN_RESIDENT_FORM",
      syncedAt: new Date().toISOString(),
    },
  };

  const formalLink = currentLink
    ? await tx.unitPersonLink.update({
        where: {
          id: currentLink.id,
        },
        data,
      })
    : await tx.unitPersonLink.create({
        data,
      });

  await tx.unitPersonLink.updateMany({
    where: {
      residentId,
      id: {
        not: formalLink.id,
      },
    },
    data: {
      status: Status.INACTIVE,
      isPrimary: false,
    },
  });

  if (!legacyUserId) {
    return formalLink;
  }

  const accessRole =
    linkType === UnitPersonLinkType.OWNER
      ? AccessRole.PROPRIETARIO
      : AccessRole.MORADOR;

  const label = buildFormalAccessLabel({
    linkType,
    condominiumName,
    block: unitBlock,
    unitNumber,
  });

  const existingAccess = await tx.userAccess.findFirst({
    where: {
      userId: legacyUserId,
      residentId,
      role: {
        in: [AccessRole.MORADOR, AccessRole.PROPRIETARIO],
      },
    },
    orderBy: [
      {
        isDefault: "desc",
      },
      {
        createdAt: "asc",
      },
    ],
  });

  const accessData = {
    administratorId,
    condominiumId,
    unitId,
    residentId,
    unitPersonLinkId: formalLink.id,
    role: accessRole,
    label,
    isActive: status === Status.ACTIVE,
  };

  const formalAccess = existingAccess
    ? await tx.userAccess.update({
        where: {
          id: existingAccess.id,
        },
        data: accessData,
      })
    : await tx.userAccess.create({
        data: {
          userId: legacyUserId,
          ...accessData,
          isDefault: false,
        },
      });

  await tx.userAccess.updateMany({
    where: {
      userId: legacyUserId,
      residentId,
      role: {
        in: [AccessRole.MORADOR, AccessRole.PROPRIETARIO],
      },
      id: {
        not: formalAccess.id,
      },
    },
    data: {
      isActive: false,
      isDefault: false,
    },
  });

  return formalLink;
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

  const page = parsePositiveInteger(pageParam, DEFAULT_PAGE);
  const rawLimit = parsePositiveInteger(limitParam, DEFAULT_LIMIT);

  const limit = Math.min(Math.max(rawLimit, 1), MAX_LIMIT);
  const skip = (page - 1) * limit;

  return {
    page,
    limit,
    skip,
    shouldPaginate,
  };
}



function countOpenTickets(tickets: Array<{ status: string }>) {
  return tickets.filter(
    (ticket) => ticket.status === "OPEN" || ticket.status === "IN_PROGRESS"
  ).length;
}



function isPrismaKnownRequestError(
  error: unknown
): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError;
}



/* =========================================================
   RETORNO PADRONIZADO
   ========================================================= */

function formatMoradorResponse(morador: ResidentWithRelations) {
  const formalUnitLink = morador.unitPersonLinks[0] || null;

  return {
    id: morador.id,

    condominiumId: morador.condominiumId,
    unitId: morador.unitId,
    userId: morador.user?.id || null,

    condominium: morador.condominium,
    unit: morador.unit,
    user: morador.user,

    name: morador.name,
    cpf: morador.cpf,
    email: morador.email,
    phone: morador.phone,
    residentType: morador.residentType,
    status: morador.status,

    formalUnitLink,
    linkType:
      formalUnitLink?.linkType ||
      residentTypeToLinkType(morador.residentType),
    isPrimary: formalUnitLink?.isPrimary ?? true,
    canVote:
      formalUnitLink?.canVote ??
      residentTypeToLinkType(morador.residentType) === UnitPersonLinkType.OWNER,
    canOpenTickets: formalUnitLink?.canOpenTickets ?? true,
    receivesNotifications: formalUnitLink?.receivesNotifications ?? true,
    formalLinkNotes: formalUnitLink?.notes || null,

    createdAt: morador.createdAt,
    updatedAt: morador.updatedAt,

    totalTickets: morador.tickets.length,
    openTickets: countOpenTickets(morador.tickets),
    hasUser: !!morador.user,
  };
}



/* =========================================================
   USUÁRIO COM CONTEXTO ADMINISTRATIVO

   A sessão identifica o usuário logado.
   O contexto ativo define o perfil/carteira em uso.
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



function getAdministratorIdFromContext(user: AdminContextUser) {
  return user.activeAccess?.administratorId || null;
}



/* =========================================================
   WHERE BASE DE ACESSO

   ADMINISTRADORA:
   - só enxerga moradores de condomínios da própria carteira.
   - se condominio=ID vier na URL, o filtro continua preso ao
     administratorId do activeAccess.
   ========================================================= */

function buildResidentWhere({
  administratorId,
  condominiumId,
}: {
  administratorId: string;
  condominiumId?: string | null;
}): Prisma.ResidentWhereInput {
  return {
    ...(condominiumId ? { condominiumId } : {}),

    condominium: {
      administratorId,
    },
  };
}



/* =========================================================
   INCLUDE PADRÃO
   ========================================================= */

const residentInclude = {
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
  unitPersonLinks: {
    where: {
      status: Status.ACTIVE,
    },
    orderBy: [
      {
        isPrimary: "desc" as const,
      },
      {
        createdAt: "asc" as const,
      },
    ],
    take: 1,
    select: {
      id: true,
      userId: true,
      residentId: true,
      condominiumId: true,
      unitId: true,
      linkType: true,
      isPrimary: true,
      canVote: true,
      canOpenTickets: true,
      receivesNotifications: true,
      status: true,
      notes: true,
    },
  },
} satisfies Prisma.ResidentInclude;



/* =========================================================
   GET - LISTAR MORADORES
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
      moduleSlug: MODULE_SLUGS.MORADORES,
    });

    const url = new URL(req.url);
    const condominiumId = normalizeQueryId(url.searchParams.get("condominio"));
    const pagination = getPaginationParams(url);

    const where = buildResidentWhere({
      administratorId,
      condominiumId,
    });



    /* =========================================================
       CONSULTA

       Compatibilidade:
       - Sem page/limit: retorna array puro.
       - Com page/limit: retorna { items, pagination }.
       ========================================================= */

    const moradores = await db.resident.findMany({
      where,
      include: residentInclude,
      orderBy: [
        {
          condominium: {
            name: "asc",
          },
        },
        {
          unit: {
            block: "asc",
          },
        },
        {
          unit: {
            unitNumber: "asc",
          },
        },
        {
          name: "asc",
        },
      ],
      ...(pagination.shouldPaginate
        ? {
            skip: pagination.skip,
            take: pagination.limit,
          }
        : {}),
    });

    const result = moradores.map((morador) =>
      formatMoradorResponse(morador as ResidentWithRelations)
    );

    if (!pagination.shouldPaginate) {
      return NextResponse.json(result);
    }

    const total = await db.resident.count({
      where,
    });

    const totalPages = Math.max(1, Math.ceil(total / pagination.limit));

    return NextResponse.json({
      items: result,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages,
        hasNextPage: pagination.page < totalPages,
        hasPreviousPage: pagination.page > 1,
      },
    });
  } catch (error: unknown) {
    console.error("ERRO AO LISTAR MORADORES:", error);

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

    await requireModuleAccess({
      administratorId,
      moduleSlug: MODULE_SLUGS.MORADORES,
    });

    const unitId = cleanText(body.unitId);

    if (!unitId) {
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
    const inputResidentType = normalizeText(body.residentType);
    const linkType = normalizeLinkType(body.linkType, inputResidentType);
    const residentType = linkTypeToResidentType(linkType);
    const status = normalizeStatus(body.status);
    const defaultPermissions = getDefaultLinkPermissions(linkType);
    const canVote = normalizeBoolean(body.canVote, defaultPermissions.canVote);
    const canOpenTickets = normalizeBoolean(
      body.canOpenTickets,
      defaultPermissions.canOpenTickets
    );
    const receivesNotifications = normalizeBoolean(
      body.receivesNotifications,
      defaultPermissions.receivesNotifications
    );
    const isPrimary = normalizeBoolean(
      body.isPrimary,
      defaultPermissions.isPrimary
    );
    const formalLinkNotes = normalizeText(body.formalLinkNotes);

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

       A unidade precisa pertencer à carteira ativa da administradora.
       Para criação operacional, unidade, condomínio e administradora
       precisam estar ativos.
       ========================================================= */

    const unidade = await db.unit.findFirst({
      where: {
        id: unitId,
        status: Status.ACTIVE,
        condominium: {
          administratorId,
          status: Status.ACTIVE,
          administrator: {
            status: Status.ACTIVE,
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



    /* =========================================================
       CPF ÚNICO

       CPF é opcional. Quando informado, precisa ser único no sistema.
       ========================================================= */

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



    /* =========================================================
       CRIAÇÃO

       condominiumId sempre é derivado da unidade validada.
       Não aceitamos condominiumId enviado no body para evitar
       inconsistência de vínculo.
       ========================================================= */

    const moradorId = await db.$transaction(async (tx) => {
      const created = await tx.resident.create({
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
        select: {
          id: true,
        },
      });

      await syncResidentFormalUnitLink({
        tx,
        residentId: created.id,
        legacyUserId: null,
        administratorId,
        condominiumId: unidade.condominiumId,
        condominiumName: unidade.condominium.name,
        unitId: unidade.id,
        unitBlock: unidade.block,
        unitNumber: unidade.unitNumber,
        linkType,
        status,
        canVote,
        canOpenTickets,
        receivesNotifications,
        isPrimary,
        notes: formalLinkNotes,
      });

      return created.id;
    });

    const morador = await db.resident.findUnique({
      where: {
        id: moradorId,
      },
      include: residentInclude,
    });

    if (!morador) {
      return NextResponse.json(
        { error: "Morador criado, mas não foi possível recarregar os dados." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      formatMoradorResponse(morador as ResidentWithRelations),
      {
        status: 201,
      }
    );
  } catch (error: unknown) {
    console.error("ERRO AO CRIAR MORADOR:", error);

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