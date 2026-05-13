import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import { NextResponse } from "next/server";
import {
  notifyAdministradoraUsers,
  notifySingleUser,
} from "@/lib/notifications";
import {
  isMorador,
  isProprietario,
  isSindico,
} from "@/lib/access-control";
import {
  buildActorLabel,
  buildActorRole,
  getActiveUserAccessFromCookies,
  isPortalAccess,
  type ActiveUserAccess,
} from "@/lib/user-access";
import {
  Prisma,
  Status,
  TicketRatingTargetType,
  TicketScope,
} from "@prisma/client";



/* =========================================================
   PORTAL - AVALIAÇÃO DO ATENDIMENTO

   Rota:
   POST /api/portal/chamados/[id]/avaliacao

   ETAPA 40.7.4 — REGRA FINAL DE PERMISSÃO PARA AVALIAR

   Regra consolidada:

   1. Chamado aberto pelo MORADOR / PROPRIETÁRIO:
      - quem avalia é o próprio perfil residencial que abriu o chamado;
      - se estiver atribuído ao SÍNDICO, avalia o SÍNDICO;
      - se estiver atribuído à ADMINISTRADORA ou sem responsável,
        avalia a ADMINISTRADORA.

   2. Chamado aberto pelo SÍNDICO:
      - quem avalia é o próprio SÍNDICO que abriu o chamado;
      - avaliação sempre direcionada à ADMINISTRADORA.

   3. Usuário com múltiplos perfis:
      - não pode avaliar o mesmo chamado em outro perfil só porque
        possui o mesmo userId;
      - o perfil ativo precisa ser compatível com o perfil usado
        na abertura do chamado.

   4. Chamado já avaliado:
      - continua bloqueado por ticketId unique.

   Regras mantidas:
   - chamado precisa estar RESOLVED;
   - usuário inativo não avalia;
   - registros inativos bloqueiam nova avaliação;
   - contexto ativo é respeitado;
   - accessId sintético não é salvo como FK em TicketLog.accessId.
   ========================================================= */



type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};



type RatingTargetResolution = {
  ratedTargetType: TicketRatingTargetType;
  ratedUserId: string | null;
  ratedAdministratorId: string | null;
  ratedCondominiumId: string | null;
  ratedProviderId: string | null;
  ratedLabel: string;
  ratedMetadata: any;
  targetUser?: {
    id: string;
    name?: string | null;
    email?: string | null;
    role?: string | null;
    isActive?: boolean | null;
  } | null;
};



/* =========================================================
   INCLUDE DO CHAMADO PARA AVALIAÇÃO
   ========================================================= */

const ratingTicketInclude = {
  condominium: {
    select: {
      id: true,
      name: true,
      administratorId: true,
      status: true,
      administrator: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
    },
  },

  unit: true,
  resident: true,

  createdByUser: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
    },
  },

  assignedToUser: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
    },
  },

  logs: {
    where: {
      action: "CREATED",
    },
    select: {
      id: true,
      userId: true,
      actorRole: true,
      actorLabel: true,
      createdAt: true,
      access: {
        select: {
          id: true,
          role: true,
          label: true,
        },
      },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc" as const,
    },
    take: 1,
  },

  rating: true,
} satisfies Prisma.TicketInclude;



/* =========================================================
   HELPERS
   ========================================================= */

function cleanText(value: unknown) {
  return String(value || "").trim();
}



function normalizeRole(role?: string | null) {
  return String(role || "").trim().toUpperCase();
}



function isResidentialRoleValue(role?: string | null) {
  const normalized = normalizeRole(role);

  return normalized === "MORADOR" || normalized === "PROPRIETARIO";
}



function isSindicoRoleValue(role?: string | null) {
  return normalizeRole(role) === "SINDICO";
}



function isResidentialPortalAccess(access?: ActiveUserAccess | null) {
  return isMorador(access) || isProprietario(access);
}



function isSindicoPortalAccess(access?: ActiveUserAccess | null) {
  return isSindico(access);
}



function getDatabaseAccessId(access: ActiveUserAccess) {
  return access.source === "USER_ACCESS" ? access.accessId : null;
}



function getRatingLabel(rating: number) {
  if (rating === 1) return "1 estrela";

  return `${rating} estrelas`;
}



function getCommentPreview(comment?: string | null) {
  const value = cleanText(comment);

  if (!value) return null;

  return value.substring(0, 180);
}



function getUnitLabel(unit?: any) {
  if (!unit) return null;

  return `${unit.block ? unit.block + " - " : ""}${unit.unitNumber}`;
}



/* =========================================================
   BUSCA USUÁRIO COM CONTEXTO LEGADO
   ========================================================= */

async function getPortalUser(authUserId: string) {
  return db.user.findUnique({
    where: {
      id: authUserId,
    },
    include: {
      resident: {
        include: {
          unit: true,
          condominium: {
            include: {
              administrator: true,
            },
          },
        },
      },
      condominium: {
        include: {
          administrator: true,
        },
      },
    },
  });
}



/* =========================================================
   VALIDA PERFIL DE AVALIAÇÃO

   Permitidos:
   - MORADOR
   - PROPRIETÁRIO
   - SÍNDICO
   ========================================================= */

function canRateFromPortal(access: ActiveUserAccess) {
  if (isResidentialPortalAccess(access)) {
    return !!access.condominiumId && !!access.unitId;
  }

  if (isSindicoPortalAccess(access)) {
    return !!access.condominiumId;
  }

  return false;
}



/* =========================================================
   PERFIL QUE ABRIU O CHAMADO

   Preferência:
   1. TicketLog CREATED.actorRole
   2. TicketLog CREATED.access.role
   3. fallback pelo scope quando não houver log antigo

   Observação:
   - Para chamados antigos sem actorRole, o fallback por scope
     evita travar completamente a avaliação.
   - Para chamados novos, actorRole deve estar preenchido.
   ========================================================= */

function getTicketOpeningRole(chamado: any) {
  const createdLog = Array.isArray(chamado?.logs) ? chamado.logs[0] : null;

  const roleFromLog = normalizeRole(
    createdLog?.actorRole || createdLog?.access?.role || null
  );

  if (roleFromLog) {
    return roleFromLog;
  }

  if (chamado?.scope === TicketScope.CONDOMINIUM) {
    return "SINDICO";
  }

  if (chamado?.scope === TicketScope.UNIT) {
    return "MORADOR";
  }

  return "";
}



/* =========================================================
   VALIDA SE O PERFIL ATIVO PODE AVALIAR ESTE CHAMADO

   Regra:
   - quem avalia é o perfil que abriu o chamado;
   - o mesmo userId em outro perfil não herda permissão;
   - síndico só avalia chamado que ele abriu como síndico;
   - morador/proprietário só avalia chamado que abriu como perfil
     residencial.
   ========================================================= */

function validateRatingSubmitter({
  user,
  access,
  chamado,
}: {
  user: any;
  access: ActiveUserAccess;
  chamado: any;
}) {
  const activeRole = normalizeRole(access.role);
  const openingRole = getTicketOpeningRole(chamado);

  if (!openingRole) {
    return {
      ok: false,
      status: 403,
      message:
        "Não foi possível identificar o perfil que abriu este chamado. A avaliação foi bloqueada por segurança.",
      openingRole,
    };
  }

  if (chamado.createdByUserId !== user.id) {
    return {
      ok: false,
      status: 403,
      message:
        "Somente o usuário que abriu o chamado pode registrar a avaliação do atendimento.",
      openingRole,
    };
  }

  if (isSindicoRoleValue(openingRole)) {
    if (activeRole !== "SINDICO") {
      return {
        ok: false,
        status: 403,
        message:
          "Este chamado foi aberto no perfil de síndico. A avaliação só pode ser registrada nesse perfil.",
        openingRole,
      };
    }

    return {
      ok: true,
      status: 200,
      message: "",
      openingRole,
    };
  }

  if (isResidentialRoleValue(openingRole)) {
    if (activeRole !== openingRole) {
      return {
        ok: false,
        status: 403,
        message:
          openingRole === "PROPRIETARIO"
            ? "Este chamado foi aberto no perfil de proprietário. A avaliação só pode ser registrada nesse perfil."
            : "Este chamado foi aberto no perfil de morador. A avaliação só pode ser registrada nesse perfil.",
        openingRole,
      };
    }

    return {
      ok: true,
      status: 200,
      message: "",
      openingRole,
    };
  }

  return {
    ok: false,
    status: 403,
    message:
      "Este chamado não foi aberto por um perfil do portal habilitado para avaliação.",
    openingRole,
  };
}



/* =========================================================
   FILTRO DE ACESSO PARA AVALIAÇÃO

   MORADOR / PROPRIETÁRIO:
   - acessa chamados da própria unidade;
   - não acessa chamado geral de condomínio.

   SÍNDICO:
   - acessa chamados do condomínio ativo.

   A permissão final para avaliar é reforçada depois por:
   validateRatingSubmitter().
   ========================================================= */

function getRatingTicketWhere({
  user,
  access,
  ticketId,
}: {
  user: any;
  access: ActiveUserAccess;
  ticketId: string;
}): Prisma.TicketWhereInput {
  if (isResidentialPortalAccess(access)) {
    if (!access.condominiumId || !access.unitId) {
      return {
        id: "__NO_ACCESS__",
      };
    }

    const ownershipConditions: Prisma.TicketWhereInput[] = [
      {
        createdByUserId: user.id,
      },
    ];

    if (access.residentId) {
      ownershipConditions.push({
        residentId: access.residentId,
      });
    }

    return {
      id: ticketId,
      condominiumId: access.condominiumId,
      unitId: access.unitId,
      scope: TicketScope.UNIT,
      OR: ownershipConditions,
    };
  }

  if (isSindicoPortalAccess(access)) {
    if (!access.condominiumId) {
      return {
        id: "__NO_ACCESS__",
      };
    }

    return {
      id: ticketId,
      condominiumId: access.condominiumId,
    };
  }

  return {
    id: "__NO_ACCESS__",
  };
}



/* =========================================================
   VALIDA REGISTROS ATIVOS PARA AVALIAÇÃO
   ========================================================= */

async function validateRatingOperationContext({
  access,
  chamado,
}: {
  access: ActiveUserAccess;
  chamado: any;
}) {
  if (
    chamado.condominium?.status !== Status.ACTIVE ||
    chamado.condominium?.administrator?.status !== Status.ACTIVE
  ) {
    return {
      ok: false,
      status: 400,
      message:
        "O condomínio ou a administradora deste chamado está inativo. Não é possível registrar avaliação.",
    };
  }

  if (isSindicoPortalAccess(access)) {
    if (!access.condominiumId) {
      return {
        ok: false,
        status: 403,
        message:
          "Para avaliar o atendimento, selecione um contexto de síndico vinculado a um condomínio.",
      };
    }

    return {
      ok: true,
      status: 200,
      message: "",
    };
  }

  if (!access.condominiumId || !access.unitId) {
    return {
      ok: false,
      status: 403,
      message:
        "Para avaliar o atendimento, selecione um contexto vinculado a uma unidade.",
    };
  }

  const unidade = await db.unit.findFirst({
    where: {
      id: access.unitId,
      condominiumId: access.condominiumId,
      status: Status.ACTIVE,
    },
    select: {
      id: true,
    },
  });

  if (!unidade) {
    return {
      ok: false,
      status: 403,
      message:
        "Unidade não encontrada ou inativa. Não é possível registrar avaliação.",
    };
  }

  if (access.residentId) {
    const morador = await db.resident.findFirst({
      where: {
        id: access.residentId,
        condominiumId: access.condominiumId,
        unitId: access.unitId,
        status: Status.ACTIVE,
      },
      select: {
        id: true,
      },
    });

    if (!morador) {
      return {
        ok: false,
        status: 403,
        message:
          "Morador não encontrado, inativo ou fora da unidade do contexto.",
      };
    }
  }

  return {
    ok: true,
    status: 200,
    message: "",
  };
}



/* =========================================================
   RESOLVE QUEM SERÁ AVALIADO
   ========================================================= */

function resolveRatingTarget({
  access,
  chamado,
}: {
  access: ActiveUserAccess;
  chamado: any;
}): RatingTargetResolution {
  const administratorId = chamado.condominium?.administratorId || null;
  const administratorName = chamado.condominium?.administrator?.name || null;
  const condominiumId = chamado.condominium?.id || chamado.condominiumId || null;
  const condominiumName = chamado.condominium?.name || null;

  const assignedUser = chamado.assignedToUser || null;
  const assignedRole = normalizeRole(assignedUser?.role);

  if (isSindicoPortalAccess(access)) {
    return {
      ratedTargetType: TicketRatingTargetType.ADMINISTRADORA,
      ratedUserId: null,
      ratedAdministratorId: administratorId,
      ratedCondominiumId: condominiumId,
      ratedProviderId: null,
      ratedLabel: administratorName
        ? `Administradora ${administratorName}`
        : "Administradora",
      ratedMetadata: {
        reason:
          "Síndico avalia a administradora quando ele próprio abriu o chamado pelo perfil de síndico.",
        evaluatorRole: access.role,
        ticketOpeningRole: getTicketOpeningRole(chamado),
        ticketCreatedByUserId: chamado.createdByUserId,
        condominiumId,
        condominiumName,
        administratorId,
        administratorName,
        assignedToUserId: assignedUser?.id || null,
        assignedToUserName: assignedUser?.name || null,
        assignedToUserRole: assignedUser?.role || null,
      },
      targetUser: null,
    };
  }

  if (isResidentialPortalAccess(access) && assignedRole === "SINDICO") {
    return {
      ratedTargetType: TicketRatingTargetType.SINDICO,
      ratedUserId: assignedUser?.id || null,
      ratedAdministratorId: null,
      ratedCondominiumId: condominiumId,
      ratedProviderId: null,
      ratedLabel: assignedUser?.name
        ? `Síndico ${assignedUser.name}`
        : "Síndico",
      ratedMetadata: {
        reason:
          "Morador/proprietário avalia o síndico quando o chamado aberto pelo perfil residencial está atribuído ao síndico.",
        evaluatorRole: access.role,
        ticketOpeningRole: getTicketOpeningRole(chamado),
        ticketCreatedByUserId: chamado.createdByUserId,
        condominiumId,
        condominiumName,
        assignedToUserId: assignedUser?.id || null,
        assignedToUserName: assignedUser?.name || null,
        assignedToUserRole: assignedUser?.role || null,
      },
      targetUser: assignedUser,
    };
  }

  return {
    ratedTargetType: TicketRatingTargetType.ADMINISTRADORA,
    ratedUserId: null,
    ratedAdministratorId: administratorId,
    ratedCondominiumId: condominiumId,
    ratedProviderId: null,
    ratedLabel: administratorName
      ? `Administradora ${administratorName}`
      : "Administradora",
    ratedMetadata: {
      reason:
        assignedUser && assignedRole
          ? "Morador/proprietário avalia a administradora quando o responsável é administrativo."
          : "Morador/proprietário avalia a administradora quando o chamado não possui responsável definido.",
      evaluatorRole: access.role,
      ticketOpeningRole: getTicketOpeningRole(chamado),
      ticketCreatedByUserId: chamado.createdByUserId,
      condominiumId,
      condominiumName,
      administratorId,
      administratorName,
      assignedToUserId: assignedUser?.id || null,
      assignedToUserName: assignedUser?.name || null,
      assignedToUserRole: assignedUser?.role || null,
    },
    targetUser: null,
  };
}



/* =========================================================
   POST - CRIAR AVALIAÇÃO
   ========================================================= */

export async function POST(req: Request, context: RouteContext) {
  try {
    const authUser: any = await getAuthUser();
    const { id } = await context.params;
    const ticketId = cleanText(id);
    const body = await req.json();

    if (!authUser?.id) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    if (!ticketId) {
      return NextResponse.json(
        { error: "ID do chamado não informado." },
        { status: 400 }
      );
    }

    const [user, activeAccess] = await Promise.all([
      getPortalUser(authUser.id),
      getActiveUserAccessFromCookies({
        userId: authUser.id,
      }),
    ]);

    if (!user) {
      return NextResponse.json(
        { error: "Usuário não encontrado." },
        { status: 404 }
      );
    }

    if (user.isActive === false) {
      return NextResponse.json(
        { error: "Usuário inativo. Não é possível avaliar atendimento." },
        { status: 403 }
      );
    }

    if (!activeAccess || !isPortalAccess(activeAccess)) {
      return NextResponse.json(
        {
          error:
            "Este portal é destinado a síndicos, proprietários e moradores.",
        },
        { status: 403 }
      );
    }

    if (!canRateFromPortal(activeAccess)) {
      return NextResponse.json(
        {
          error:
            "Somente morador, proprietário ou síndico vinculado a um condomínio pode avaliar o atendimento.",
        },
        { status: 403 }
      );
    }



    /* =========================================================
       VALIDAÇÃO DA NOTA
       ========================================================= */

    const rating = Number(body?.rating);
    const comment = cleanText(body?.comment);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "Informe uma nota válida entre 1 e 5." },
        { status: 400 }
      );
    }



    /* =========================================================
       BUSCA DO CHAMADO
       ========================================================= */

    const chamado = await db.ticket.findFirst({
      where: getRatingTicketWhere({
        user,
        access: activeAccess,
        ticketId,
      }),
      include: ratingTicketInclude,
    });

    if (!chamado) {
      return NextResponse.json(
        {
          error:
            "Chamado não encontrado, acesso negado ou chamado não vinculado ao contexto selecionado.",
        },
        { status: 404 }
      );
    }



    /* =========================================================
       REGRAS DO CHAMADO
       ========================================================= */

    if (chamado.status !== "RESOLVED") {
      return NextResponse.json(
        { error: "Somente chamados resolvidos podem ser avaliados." },
        { status: 400 }
      );
    }

    if (chamado.rating) {
      return NextResponse.json(
        { error: "Este chamado já foi avaliado." },
        { status: 400 }
      );
    }



    /* =========================================================
       VALIDA SE O PERFIL ATIVO É O PERFIL QUE DEVE AVALIAR
       ========================================================= */

    const submitterValidation = validateRatingSubmitter({
      user,
      access: activeAccess,
      chamado,
    });

    if (!submitterValidation.ok) {
      return NextResponse.json(
        { error: submitterValidation.message },
        { status: submitterValidation.status }
      );
    }



    /* =========================================================
       BLOQUEIO OPERACIONAL POR REGISTROS INATIVOS
       ========================================================= */

    const operationValidation = await validateRatingOperationContext({
      access: activeAccess,
      chamado,
    });

    if (!operationValidation.ok) {
      return NextResponse.json(
        { error: operationValidation.message },
        { status: operationValidation.status }
      );
    }



    /* =========================================================
       DEFINE QUEM ESTÁ SENDO AVALIADO
       ========================================================= */

    const ratingTarget = resolveRatingTarget({
      access: activeAccess,
      chamado,
    });



    /* =========================================================
       CRIA A AVALIAÇÃO E REGISTRA LOG PÚBLICO
       ========================================================= */

    const dbAccessId = getDatabaseAccessId(activeAccess);

    const result = await db.$transaction(async (tx) => {
      const createdRating = await tx.ticketRating.create({
        data: {
          ticketId: chamado.id,
          userId: user.id,
          rating,
          comment: comment || null,

          ratedTargetType: ratingTarget.ratedTargetType,
          ratedUserId: ratingTarget.ratedUserId,
          ratedAdministratorId: ratingTarget.ratedAdministratorId,
          ratedCondominiumId: ratingTarget.ratedCondominiumId,
          ratedProviderId: ratingTarget.ratedProviderId,
          ratedLabel: ratingTarget.ratedLabel,
          ratedMetadata: {
            ...ratingTarget.ratedMetadata,
            validatedOpeningRole: submitterValidation.openingRole,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          ratedUser: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          ratedAdministrator: {
            select: {
              id: true,
              name: true,
            },
          },
          ratedCondominium: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      await tx.ticketLog.create({
        data: {
          ticketId: chamado.id,
          userId: user.id,
          accessId: dbAccessId,
          actorRole: buildActorRole(activeAccess),
          actorLabel: buildActorLabel(activeAccess),
          action: "COMMENT_PUBLIC",
          comment: comment
            ? `Avaliação do atendimento: ${rating} estrela(s). Avaliado: ${ratingTarget.ratedLabel}. Comentário: ${comment}`
            : `Avaliação do atendimento: ${rating} estrela(s). Avaliado: ${ratingTarget.ratedLabel}.`,
        },
      });

      return createdRating;
    });



    /* =========================================================
       NOTIFICAÇÕES
       ========================================================= */

    const notifiedUserIds = new Set<string>();

    const actorUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: activeAccess.role,
    };

    const ratingLabel = getRatingLabel(rating);
    const commentPreview = getCommentPreview(comment);

    const notificationMetadata = {
      ticketTitle: chamado.title,
      condominiumName: chamado.condominium?.name || null,
      unitLabel: getUnitLabel(chamado.unit),
      residentName: chamado.resident?.name || null,
      rating,
      ratingLabel,
      commentPreview,
      source: "PORTAL",

      ratedTargetType: ratingTarget.ratedTargetType,
      ratedUserId: ratingTarget.ratedUserId,
      ratedAdministratorId: ratingTarget.ratedAdministratorId,
      ratedCondominiumId: ratingTarget.ratedCondominiumId,
      ratedProviderId: ratingTarget.ratedProviderId,
      ratedLabel: ratingTarget.ratedLabel,
      ratedMetadata: {
        ...ratingTarget.ratedMetadata,
        validatedOpeningRole: submitterValidation.openingRole,
      },

      accessId: activeAccess.accessId,
      accessSource: activeAccess.source,
      actorRole: buildActorRole(activeAccess),
      actorLabel: buildActorLabel(activeAccess),

      createdByUserId: user.id,
      createdByUserName: user.name,
      createdByUserRole: activeAccess.role,
    };

    await notifyAdministradoraUsers({
      administratorId: chamado.condominium?.administratorId || null,
      actorUser,
      notifiedUserIds,
      ticketId: chamado.id,
      type: "TICKET_RATED",
      title: "Chamado avaliado",
      message: `${user.name} avaliou o chamado "${chamado.title}" com ${ratingLabel}. Avaliação referente a: ${ratingTarget.ratedLabel}.`,
      metadata: notificationMetadata,
    });



    /* =========================================================
       NOTIFICAR SÍNDICO AVALIADO
       ========================================================= */

    if (
      ratingTarget.ratedTargetType === TicketRatingTargetType.SINDICO &&
      ratingTarget.targetUser &&
      ratingTarget.targetUser.isActive !== false
    ) {
      await notifySingleUser({
        targetUser: ratingTarget.targetUser,
        actorUser,
        notifiedUserIds,
        ticketId: chamado.id,
        type: "TICKET_RATED",
        title: "Você recebeu uma avaliação",
        message: `${user.name} avaliou o atendimento do chamado "${chamado.title}" com ${ratingLabel}.`,
        metadata: {
          ...notificationMetadata,
          notificationScope: "RATED_SYNDIC",
        },
      });
    }



    /* =========================================================
       RETORNO
       ========================================================= */

    return NextResponse.json({
      success: true,
      message: "Avaliação registrada com sucesso.",
      rating: result,
      ratedTarget: {
        type: ratingTarget.ratedTargetType,
        label: ratingTarget.ratedLabel,
        userId: ratingTarget.ratedUserId,
        administratorId: ratingTarget.ratedAdministratorId,
        condominiumId: ratingTarget.ratedCondominiumId,
        providerId: ratingTarget.ratedProviderId,
      },
    });
  } catch (error: any) {
    console.error("ERRO AO AVALIAR CHAMADO:", error);

    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "Este chamado já foi avaliado." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao registrar avaliação." },
      { status: 500 }
    );
  }
}