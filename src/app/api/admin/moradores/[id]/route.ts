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
   MORADORES - API ADMINISTRATIVA DE DETALHE

   Arquivo:
   src/app/api/admin/moradores/[id]/route.ts

   ELOGEST — ETAPA 51.5.3
   SANEAMENTO CADASTRAL DE PESSOAS, UNIDADES E DIREITO A VOTO

   Métodos:
   - GET: retorna o vínculo completo do morador.
   - PATCH: atualiza cadastro, unidade e vínculo formal.

   Correção:
   - O arquivo [id]/route.ts anterior estava com conteúdo duplicado
     da rota de listagem/criação e não possuía PATCH.
   - A edição agora sincroniza Resident, UnitPersonLink e UserAccess.
   ========================================================= */

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

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

function normalizeStatus(
  value: unknown,
  fallback: Status = Status.ACTIVE
): Status {
  const status = cleanText(value || fallback).toUpperCase();
  return status === Status.INACTIVE ? Status.INACTIVE : Status.ACTIVE;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidCpfFormat(cpf: string) {
  return /^\d{11}$/.test(cpf);
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
  fallback: UnitPersonLinkType
): UnitPersonLinkType {
  const normalized = cleanText(value).toUpperCase();

  if (
    Object.values(UnitPersonLinkType).includes(
      normalized as UnitPersonLinkType
    )
  ) {
    return normalized as UnitPersonLinkType;
  }

  return fallback;
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

async function getAdminContextUser(): Promise<AdminContextUser> {
  const sessionUser = (await getAuthUser()) as AuthSessionUser | null;

  if (!sessionUser?.id) {
    throw new Error("UNAUTHORIZED");
  }

  const activeAccess = await getActiveUserAccessFromCookies({
    userId: sessionUser.id,
  });

  return {
    ...sessionUser,
    role: activeAccess?.role || sessionUser.role,
    administratorId:
      activeAccess?.administratorId !== undefined
        ? activeAccess.administratorId
        : sessionUser.administratorId,
    condominiumId:
      activeAccess?.condominiumId !== undefined
        ? activeAccess.condominiumId
        : sessionUser.condominiumId,
    unitId:
      activeAccess?.unitId !== undefined
        ? activeAccess.unitId
        : sessionUser.unitId,
    residentId:
      activeAccess?.residentId !== undefined
        ? activeAccess.residentId
        : sessionUser.residentId,
    activeAccess,
  };
}

function validateAdminContext(user: AdminContextUser): ContextValidationResult {
  if (!user.activeAccess) {
    return {
      ok: false,
      status: 403,
      message: "Não foi possível identificar o contexto de acesso.",
    };
  }

  if (!isAdministradoraAccess(user.activeAccess)) {
    return {
      ok: false,
      status: 403,
      message:
        "Este contexto não possui acesso ao cadastro administrativo de moradores.",
    };
  }

  if (!user.activeAccess.administratorId) {
    return {
      ok: false,
      status: 403,
      message: "Contexto de administradora sem vínculo com administradora.",
    };
  }

  if (!canManageResidents(user.activeAccess)) {
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

  const linkData = {
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
        data: linkData,
      })
    : await tx.unitPersonLink.create({
        data: linkData,
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

  await tx.user.update({
    where: {
      id: legacyUserId,
    },
    data: {
      condominiumId,
      residentId,
    },
  });

  return formalLink;
}

export async function GET(_req: Request, context: RouteContext) {
  try {
    const adminApiAccess = await requireActiveAdminApiAccess();

    if ("error" in adminApiAccess) {
      return adminApiAccess.error;
    }

    const user = await getAdminContextUser();
    const validation = validateAdminContext(user);

    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.message },
        { status: validation.status }
      );
    }

    const administratorId = user.activeAccess?.administratorId;

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

    const { id } = await context.params;

    const morador = await db.resident.findFirst({
      where: {
        id,
        condominium: {
          administratorId,
        },
      },
      include: residentInclude,
    });

    if (!morador) {
      return NextResponse.json(
        { error: "Morador não encontrado ou acesso negado." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      formatMoradorResponse(morador as ResidentWithRelations)
    );
  } catch (error: unknown) {
    console.error("ERRO AO CONSULTAR MORADOR:", error);

    if (isPlanAccessError(error) || isPlanLimitError(error)) {
      return NextResponse.json(getPlanErrorPayload(error), {
        status: error.statusCode,
      });
    }

    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Erro ao consultar morador." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const adminApiAccess = await requireActiveAdminApiAccess();

    if ("error" in adminApiAccess) {
      return adminApiAccess.error;
    }

    const user = await getAdminContextUser();
    const validation = validateAdminContext(user);

    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.message },
        { status: validation.status }
      );
    }

    const administratorId = user.activeAccess?.administratorId;

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

    const { id } = await context.params;
    const body = (await req.json()) as RequestBody;

    const current = await db.resident.findFirst({
      where: {
        id,
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
            isActive: true,
          },
        },
        unitPersonLinks: {
          orderBy: [
            {
              isPrimary: "desc",
            },
            {
              createdAt: "asc",
            },
          ],
          take: 1,
        },
      },
    });

    if (!current) {
      return NextResponse.json(
        { error: "Morador não encontrado ou acesso negado." },
        { status: 404 }
      );
    }

    const unitId =
      body.unitId !== undefined ? cleanText(body.unitId) : current.unitId;

    if (!unitId) {
      return NextResponse.json(
        { error: "Unidade é obrigatória." },
        { status: 400 }
      );
    }

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

    const name =
      body.name !== undefined ? normalizeText(body.name) : current.name;

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
        : current.cpf;

    const email =
      body.email !== undefined ? normalizeEmail(body.email) : current.email;

    const phone =
      body.phone !== undefined
        ? body.phone
          ? onlyDigits(body.phone)
          : null
        : current.phone;

    const currentLink =
      current.unitPersonLinks[0] || null;

    const fallbackLinkType =
      currentLink?.linkType ||
      residentTypeToLinkType(current.residentType);

    const linkType = normalizeLinkType(body.linkType, fallbackLinkType);
    const residentType = linkTypeToResidentType(linkType);
    const status = normalizeStatus(body.status, current.status);
    const defaultPermissions = getDefaultLinkPermissions(linkType);

    const canVote = normalizeBoolean(
      body.canVote,
      currentLink?.canVote ?? defaultPermissions.canVote
    );

    const canOpenTickets = normalizeBoolean(
      body.canOpenTickets,
      currentLink?.canOpenTickets ?? defaultPermissions.canOpenTickets
    );

    const receivesNotifications = normalizeBoolean(
      body.receivesNotifications,
      currentLink?.receivesNotifications ??
        defaultPermissions.receivesNotifications
    );

    const isPrimary = normalizeBoolean(
      body.isPrimary,
      currentLink?.isPrimary ?? defaultPermissions.isPrimary
    );

    const formalLinkNotes =
      body.formalLinkNotes !== undefined
        ? normalizeText(body.formalLinkNotes)
        : currentLink?.notes || null;

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

    if (cpf) {
      const existingCpf = await db.resident.findFirst({
        where: {
          cpf,
          NOT: {
            id: current.id,
          },
        },
        select: {
          id: true,
        },
      });

      if (existingCpf) {
        return NextResponse.json(
          { error: "Já existe um morador cadastrado com esse CPF." },
          { status: 409 }
        );
      }
    }

    await db.$transaction(async (tx) => {
      await tx.resident.update({
        where: {
          id: current.id,
        },
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
      });

      await syncResidentFormalUnitLink({
        tx,
        residentId: current.id,
        legacyUserId: current.user?.id || null,
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
    });

    const morador = await db.resident.findUnique({
      where: {
        id: current.id,
      },
      include: residentInclude,
    });

    if (!morador) {
      return NextResponse.json(
        { error: "Morador atualizado, mas não foi possível recarregar os dados." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      formatMoradorResponse(morador as ResidentWithRelations)
    );
  } catch (error: unknown) {
    console.error("ERRO AO ATUALIZAR MORADOR:", error);

    if (isPlanAccessError(error) || isPlanLimitError(error)) {
      return NextResponse.json(getPlanErrorPayload(error), {
        status: error.statusCode,
      });
    }

    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }

    if (isPrismaKnownRequestError(error) && error.code === "P2002") {
      return NextResponse.json(
        { error: "Já existe um morador cadastrado com esse CPF." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao atualizar morador." },
      { status: 500 }
    );
  }
}
