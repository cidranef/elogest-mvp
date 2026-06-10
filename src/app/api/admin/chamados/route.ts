import {
  Prisma,
  Role,
  Status,
  TicketPriority,
  type Ticket,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireActiveAdminApiAccess } from "@/lib/admin-api-guard";
import { getAuthUser, type AuthUser } from "@/lib/auth-guard";
import { sendNotification } from "@/lib/notifications";
import {
  canAssignTicket,
  canCreateAdminTicket,
  canViewAdminTickets,
} from "@/lib/access-control";
import {
  buildActorLabel,
  buildActorRole,
  getActiveUserAccessFromCookies,
  isAdministradoraAccess,
  type ActiveUserAccess,
} from "@/lib/user-access";
import { NextResponse } from "next/server";
import {
  getPlanErrorPayload,
  isPlanAccessError,
  isPlanLimitError,
  MODULE_SLUGS,
  requireCanCreateTicket,
  requireModuleAccess,
} from "@/lib/plan-limits";



/* =========================================================
   API ADMIN - CHAMADOS

   ETAPA 43 — ARQUITETURA DE PERFIS, VÍNCULOS E PERMISSÕES

   ETAPA 44 — SUPER ADMIN E MULTIADMINISTRADORA
   - Adicionado requireActiveAdminApiAccess() para bloquear APIs /api/admin/*
     quando a administradora estiver inativa.

   ETAPA 45.5 — FILTROS SERVER-SIDE E PAGINAÇÃO INICIAL
   - GET passa a aceitar ?condominio=ID.
   - GET passa a aceitar ?page=1&limit=50.
   - Mantém retorno em array quando page/limit não são enviados,
     preservando compatibilidade com telas existentes.
   - Quando page/limit são enviados, retorna objeto paginado:
     { items, pagination }.
   - Mantido isolamento por administradora ativa e activeAccess.
   - Removidos tipos any.
   - Mantidas regras de permissão por perfil ativo.

   Objetivo consolidado:
   - A rota /admin opera somente com perfil ativo ADMINISTRADORA.
   - SUPER_ADMIN não opera pela área /admin; deve usar rotas
     próprias da área /elogest.
   - Todas as regras de carteira consideram o contexto ativo.
   - Criação de chamado grava createdByAccessId quando o perfil
     ativo vem de UserAccess real.
   - Logs gravam accessId, actorRole e actorLabel com base no
     perfil ativo.
   ========================================================= */



/* =========================================================
   INCLUDE PADRÃO DOS CHAMADOS ADMINISTRATIVOS
   ========================================================= */

const ticketInclude = {
  condominium: true,
  unit: true,
  resident: true,
  createdByUser: true,
  createdByAccess: true,
  assignedToUser: true,

  logs: {
    include: {
      user: true,
      access: true,
    },
    orderBy: {
      createdAt: "desc" as const,
    },
  },

  attachments: {
    include: {
      uploadedByUser: true,
    },
    orderBy: {
      createdAt: "desc" as const,
    },
  },

  rating: {
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
  },
};



/* =========================================================
   TIPOS LOCAIS
   ========================================================= */

type AdminContextUser = Omit<AuthUser, "activeAccess"> & {
  role: string | null;
  administratorId: string | null;
  condominiumId: string | null;
  unitId: string | null;
  residentId: string | null;
  activeAccess: ActiveUserAccess | null;
};



type RequestBody = Record<string, unknown>;



type AssignedValidationResult = {
  assignedToUserId: string | null;
  assignedUser: {
    id: string;
    name: string | null;
    email: string | null;
    role: Role;
  } | null;
  error: string | null;
  status: number;
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
   HELPERS
   ========================================================= */

function normalizeText(value: unknown) {
  return String(value || "").trim();
}



function normalizeNullableText(value: unknown) {
  const text = normalizeText(value);

  return text ? text : null;
}



function normalizeQueryId(value: string | null) {
  const text = normalizeText(value);

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

  const page = parsePositiveInteger(pageParam, 1);
  const rawLimit = parsePositiveInteger(limitParam, 50);

  const limit = Math.min(Math.max(rawLimit, 1), 200);
  const skip = (page - 1) * limit;

  return {
    page,
    limit,
    skip,
    shouldPaginate,
  };
}



function getPriority(value: unknown): TicketPriority {
  const priority = normalizeText(value).toUpperCase();

  if (priority === TicketPriority.LOW) return TicketPriority.LOW;
  if (priority === TicketPriority.HIGH) return TicketPriority.HIGH;
  if (priority === TicketPriority.URGENT) return TicketPriority.URGENT;

  return TicketPriority.MEDIUM;
}



function getDatabaseAccessId(access?: ActiveUserAccess | null) {
  return access?.source === "USER_ACCESS" ? access.accessId : null;
}



/* =========================================================
   USUÁRIO COM CONTEXTO ATIVO

   A sessão base identifica quem está logado.
   O contexto ativo define com qual perfil/carteira ele está
   operando naquele momento.

   Etapa 43:
   Para /admin, o perfil ativo precisa ser ADMINISTRADORA.
   SUPER_ADMIN fica reservado para /elogest.
   ========================================================= */

async function getAdminContextUser(): Promise<AdminContextUser> {
  const sessionUser = await getAuthUser();

  if (!sessionUser?.id) {
    throw new Error("UNAUTHORIZED");
  }

  const activeAccess = await getActiveUserAccessFromCookies({
    userId: sessionUser.id,
  });

  if (!activeAccess) {
    return {
      ...sessionUser,
      role: sessionUser.role || null,
      administratorId: sessionUser.administratorId || null,
      condominiumId: sessionUser.condominiumId || null,
      unitId: sessionUser.unitId || null,
      residentId: sessionUser.residentId || null,
      activeAccess: null,
    };
  }

  return {
    ...sessionUser,

    role: activeAccess.role || sessionUser.role || null,

    administratorId:
      activeAccess.administratorId !== undefined
        ? activeAccess.administratorId
        : sessionUser.administratorId || null,

    condominiumId:
      activeAccess.condominiumId !== undefined
        ? activeAccess.condominiumId
        : sessionUser.condominiumId || null,

    unitId:
      activeAccess.unitId !== undefined
        ? activeAccess.unitId
        : sessionUser.unitId || null,

    residentId:
      activeAccess.residentId !== undefined
        ? activeAccess.residentId
        : sessionUser.residentId || null,

    activeAccess,
  };
}



/* =========================================================
   VALIDA PERFIL ADMINISTRATIVO

   Etapa 43:
   /admin é área operacional da administradora cliente.
   SUPER_ADMIN não deve operar por aqui, evitando mistura entre
   visão global EloGest e operação de carteira.
   ========================================================= */

function isAdminContext(user: AdminContextUser) {
  return !!user.activeAccess && isAdministradoraAccess(user.activeAccess);
}



/* =========================================================
   FILTRO DE CARTEIRA ADMINISTRATIVA

   ETAPA 45.5:
   - Sempre prende a consulta ao administratorId do activeAccess.
   - Se condominio=ID for enviado, também filtra por condomínio.
   ========================================================= */

function getAdminTicketWhere({
  user,
  condominiumId,
}: {
  user: AdminContextUser;
  condominiumId?: string | null;
}): Prisma.TicketWhereInput {
  if (isAdminContext(user) && user.administratorId) {
    return {
      ...(condominiumId ? { condominiumId } : {}),

      condominium: {
        administratorId: user.administratorId,
      },
    };
  }

  return {
    id: "__NO_ACCESS__",
  };
}



/* =========================================================
   VALIDA ADMINISTRADORA ATIVA / CONTEXTO
   ========================================================= */

function validateAdministratorContext(
  user: AdminContextUser
): ContextValidationResult {
  if (!isAdminContext(user)) {
    return {
      ok: false,
      status: 403,
      message:
        "Este contexto não possui acesso à área administrativa de chamados.",
    };
  }

  if (!user.administratorId) {
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
   VALIDA RESPONSÁVEL ATRIBUÍDO
   ========================================================= */

async function validateAssignedUser({
  currentUser,
  assignedToUserId,
  targetAdministratorId,
  targetCondominiumId,
}: {
  currentUser: AdminContextUser;
  assignedToUserId?: string | null;
  targetAdministratorId: string | null;
  targetCondominiumId: string;
}): Promise<AssignedValidationResult> {
  if (!assignedToUserId) {
    return {
      assignedToUserId: null,
      assignedUser: null,
      error: null,
      status: 200,
    };
  }

  if (!canAssignTicket(currentUser.activeAccess || currentUser)) {
    return {
      assignedToUserId: null,
      assignedUser: null,
      error: "Usuário sem permissão para atribuir responsável.",
      status: 403,
    };
  }

  const assignedUser = await db.user.findFirst({
    where: {
      id: assignedToUserId,
      isActive: true,
      OR: [
        {
          role: Role.ADMINISTRADORA,
          administratorId: targetAdministratorId || undefined,
        },
        {
          role: Role.SINDICO,
          condominiumId: targetCondominiumId,
        },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });

  if (!assignedUser) {
    return {
      assignedToUserId: null,
      assignedUser: null,
      error:
        "Responsável não encontrado, fora da carteira ou sem permissão para receber este chamado.",
      status: 403,
    };
  }

  return {
    assignedToUserId: assignedUser.id,
    assignedUser,
    error: null,
    status: 200,
  };
}



/* =========================================================
   RESPOSTA PAGINADA
   ========================================================= */

function buildPaginatedResponse({
  items,
  total,
  pagination,
}: {
  items: Ticket[];
  total: number;
  pagination: PaginationParams;
}) {
  return {
    items,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / pagination.limit)),
      hasNextPage: pagination.page * pagination.limit < total,
      hasPreviousPage: pagination.page > 1,
    },
  };
}



/* =========================================================
   GET - LISTAR CHAMADOS ADMINISTRATIVOS
   ========================================================= */

export async function GET(req: Request) {
  try {
    const adminApiAccess = await requireActiveAdminApiAccess();

    if ("error" in adminApiAccess) {
      return adminApiAccess.error;
    }

    const user = await getAdminContextUser();

    const contextValidation = validateAdministratorContext(user);

    if (!contextValidation.ok) {
      return NextResponse.json(
        { error: contextValidation.message },
        { status: contextValidation.status }
      );
    }

    if (!canViewAdminTickets(user.activeAccess || user)) {
      return NextResponse.json(
        { error: "Usuário sem permissão para listar chamados administrativos." },
        { status: 403 }
      );
    }

    const administratorId = user.administratorId;

    if (!administratorId) {
      return NextResponse.json(
        { error: "Contexto de administradora sem vínculo com administradora." },
        { status: 403 }
      );
    }

    await requireModuleAccess({
      administratorId,
      moduleSlug: MODULE_SLUGS.CHAMADOS,
    });

    const url = new URL(req.url);
    const condominiumId = normalizeQueryId(url.searchParams.get("condominio"));
    const pagination = getPaginationParams(url);

    const where = getAdminTicketWhere({
      user,
      condominiumId,
    });



    /* =========================================================
       PAGINAÇÃO OPCIONAL

       Compatibilidade:
       - Sem page/limit: retorna array puro.
       - Com page/limit: retorna { items, pagination }.
       ========================================================= */

    const chamados = await db.ticket.findMany({
      where,
      include: ticketInclude,
      orderBy: {
        createdAt: "desc",
      },
      ...(pagination.shouldPaginate
        ? {
            skip: pagination.skip,
            take: pagination.limit,
          }
        : {}),
    });

    if (!pagination.shouldPaginate) {
      return NextResponse.json(chamados);
    }

    const total = await db.ticket.count({
      where,
    });

    return NextResponse.json(
      buildPaginatedResponse({
        items: chamados,
        total,
        pagination,
      })
    );
  } catch (error: unknown) {
    console.error("ERRO AO LISTAR CHAMADOS:", error);

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
      { error: "Erro ao listar chamados." },
      { status: 500 }
    );
  }
}



/* =========================================================
   POST - CRIAR CHAMADO ADMINISTRATIVO
   ========================================================= */

export async function POST(req: Request) {
  try {
    const adminApiAccess = await requireActiveAdminApiAccess();

    if ("error" in adminApiAccess) {
      return adminApiAccess.error;
    }

    const user = await getAdminContextUser();
    const body = (await req.json()) as RequestBody;

    const contextValidation = validateAdministratorContext(user);

    if (!contextValidation.ok) {
      return NextResponse.json(
        { error: contextValidation.message },
        { status: contextValidation.status }
      );
    }

    if (!canCreateAdminTicket(user.activeAccess || user)) {
      return NextResponse.json(
        { error: "Usuário sem permissão para criar chamado administrativo." },
        { status: 403 }
      );
    }

    const administratorId = user.administratorId;

    if (!administratorId) {
      return NextResponse.json(
        { error: "Contexto de administradora sem vínculo com administradora." },
        { status: 403 }
      );
    }

    await requireCanCreateTicket(administratorId);

    const scope = body.scope === "CONDOMINIUM" ? "CONDOMINIUM" : "UNIT";

    const title = normalizeText(body.title);
    const description = normalizeText(body.description);

    if (!title || !description) {
      return NextResponse.json(
        { error: "Título e descrição são obrigatórios." },
        { status: 400 }
      );
    }

    const dbAccessId = getDatabaseAccessId(user.activeAccess);

    const logActorData = {
      userId: user.id,
      accessId: dbAccessId,
      actorRole: buildActorRole(user.activeAccess),
      actorLabel: buildActorLabel(user.activeAccess),
    };



    /* =========================================================
       CHAMADO GERAL DO CONDOMÍNIO / ÁREA COMUM
       ========================================================= */

    if (scope === "CONDOMINIUM") {
      const condominiumId = normalizeText(body.condominiumId);

      if (!condominiumId) {
        return NextResponse.json(
          { error: "Condomínio é obrigatório para chamado geral." },
          { status: 400 }
        );
      }

      const condominio = await db.condominium.findFirst({
        where: {
          id: condominiumId,
          status: Status.ACTIVE,
          administratorId,
          administrator: {
            status: Status.ACTIVE,
          },
        },
      });

      if (!condominio) {
        return NextResponse.json(
          {
            error:
              "Condomínio não encontrado, inativo ou fora da carteira ativa.",
          },
          { status: 403 }
        );
      }



      /* =======================================================
         RESPONSÁVEL OPCIONAL
         ======================================================= */

      const assignedValidation = await validateAssignedUser({
        currentUser: user,
        assignedToUserId: normalizeNullableText(body.assignedToUserId),
        targetAdministratorId: condominio.administratorId || null,
        targetCondominiumId: condominio.id,
      });

      if (assignedValidation.error) {
        return NextResponse.json(
          { error: assignedValidation.error },
          { status: assignedValidation.status }
        );
      }

      const assignedToUserId = assignedValidation.assignedToUserId;
      const assignedUser = assignedValidation.assignedUser;



      const chamado = await db.ticket.create({
        data: {
          scope: "CONDOMINIUM",
          condominiumId: condominio.id,
          unitId: null,
          residentId: null,
          title,
          description,
          category: normalizeNullableText(body.category),
          priority: getPriority(body.priority),
          createdByUserId: user.id,
          createdByAccessId: dbAccessId,
          assignedToUserId,
        },
        include: ticketInclude,
      });

      await db.ticketLog.create({
        data: {
          ticketId: chamado.id,
          ...logActorData,
          action: "CREATED",
          fromValue: null,
          toValue: "OPEN",
          comment: "Chamado geral do condomínio criado pela administradora.",
        },
      });

      if (assignedUser) {
        await db.ticketLog.create({
          data: {
            ticketId: chamado.id,
            ...logActorData,
            action: "ASSIGNED",
            fromValue: null,
            toValue: assignedUser.name,
          },
        });

        await sendNotification({
          channel: "SYSTEM",
          userId: assignedUser.id,
          to: assignedUser.email,
          toName: assignedUser.name,
          ticketId: chamado.id,
          type: "TICKET_ASSIGNED",
          title: "Novo chamado atribuído",
          message: `Você foi designado para o chamado "${chamado.title}" no condomínio ${
            condominio.name || "-"
          }.`,
        });
      }

      const updated = await db.ticket.findUnique({
        where: {
          id: chamado.id,
        },
        include: ticketInclude,
      });

      return NextResponse.json(updated || chamado);
    }



    /* =========================================================
       CHAMADO DE UNIDADE
       ========================================================= */

    const unitId = normalizeText(body.unitId);

    if (!unitId) {
      return NextResponse.json(
        { error: "Unidade é obrigatória para chamado de unidade." },
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
        condominium: {
          include: {
            administrator: true,
          },
        },
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
       RESPONSÁVEL OPCIONAL
       ========================================================= */

    const assignedValidation = await validateAssignedUser({
      currentUser: user,
      assignedToUserId: normalizeNullableText(body.assignedToUserId),
      targetAdministratorId: unidade.condominium?.administratorId || null,
      targetCondominiumId: unidade.condominiumId,
    });

    if (assignedValidation.error) {
      return NextResponse.json(
        { error: assignedValidation.error },
        { status: assignedValidation.status }
      );
    }

    const assignedToUserId = assignedValidation.assignedToUserId;
    const assignedUser = assignedValidation.assignedUser;



    /* =========================================================
       MORADOR OPCIONAL
       ========================================================= */

    let residentId: string | null = null;
    let residentNameForLog: string | null = null;

    const requestedResidentId = normalizeNullableText(body.residentId);

    if (requestedResidentId) {
      const morador = await db.resident.findFirst({
        where: {
          id: requestedResidentId,
          unitId: unidade.id,
          condominiumId: unidade.condominiumId,
          status: Status.ACTIVE,
        },
      });

      if (!morador) {
        return NextResponse.json(
          {
            error:
              "Morador não encontrado, inativo ou não pertence à unidade selecionada.",
          },
          { status: 403 }
        );
      }

      residentId = morador.id;
      residentNameForLog = morador.name;
    }

    const chamado = await db.ticket.create({
      data: {
        scope: "UNIT",
        condominiumId: unidade.condominiumId,
        unitId: unidade.id,
        residentId,
        title,
        description,
        category: normalizeNullableText(body.category),
        priority: getPriority(body.priority),
        createdByUserId: user.id,
        createdByAccessId: dbAccessId,
        assignedToUserId,
      },
      include: ticketInclude,
    });

    await db.ticketLog.create({
      data: {
        ticketId: chamado.id,
        ...logActorData,
        action: "CREATED",
        fromValue: null,
        toValue: "OPEN",
        comment: residentNameForLog
          ? `Chamado de unidade criado pela administradora para o morador ${residentNameForLog}.`
          : "Chamado de unidade criado pela administradora, sem morador específico vinculado.",
      },
    });

    if (assignedUser) {
      await db.ticketLog.create({
        data: {
          ticketId: chamado.id,
          ...logActorData,
          action: "ASSIGNED",
          fromValue: null,
          toValue: assignedUser.name,
        },
      });

      await sendNotification({
        channel: "SYSTEM",
        userId: assignedUser.id,
        to: assignedUser.email,
        toName: assignedUser.name,
        ticketId: chamado.id,
        type: "TICKET_ASSIGNED",
        title: "Novo chamado atribuído",
        message: `Você foi designado para o chamado "${chamado.title}" no condomínio ${
          unidade.condominium?.name || "-"
        }.`,
      });
    }

    const updated = await db.ticket.findUnique({
      where: {
        id: chamado.id,
      },
      include: ticketInclude,
    });

    return NextResponse.json(updated || chamado);
  } catch (error: unknown) {
    console.error("ERRO AO CRIAR CHAMADO:", error);

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
      { error: "Erro ao criar chamado." },
      { status: 500 }
    );
  }
}