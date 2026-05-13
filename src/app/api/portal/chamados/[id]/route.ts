import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import { NextResponse } from "next/server";
import {
  notifyAdministradoraUsers,
  notifySingleUser,
} from "@/lib/notifications";
import {
  canCommentPublic,
  canViewCondominiumTickets,
  canViewOwnTickets,
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
import { Role, Status, TicketRatingTargetType } from "@prisma/client";



/* =========================================================
   PORTAL DE CHAMADOS - DETALHE E COMENTÁRIO

   ETAPA 40.7.3 — PRIVACIDADE DA AVALIAÇÃO NO PORTAL

   Regra consolidada:
   - Avaliação só aparece no portal para quem avaliou, desde que
     esteja no mesmo perfil em que avaliou.
   - Avaliação recebida por SÍNDICO aparece para o síndico avaliado,
     quando o perfil ativo for SÍNDICO.
   - Morador/proprietário não vê avaliação feita pelo síndico
     para a administradora.
   - Síndico não vê avaliação feita por terceiro para a administradora,
     salvo se ele próprio foi quem avaliou naquele perfil.
   - Usuário com múltiplos perfis não vê a mesma avaliação em todos
     os contextos apenas por ter o mesmo userId.
   - Avaliações antigas sem metadata de perfil não são exibidas em
     contexto ambíguo.
   ========================================================= */



type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};



/* =========================================================
   LOGS VISÍVEIS NO PORTAL
   ========================================================= */

const PORTAL_VISIBLE_LOG_ACTIONS = [
  "CREATED",
  "STATUS_CHANGED",
  "ASSIGNED",
  "COMMENT_PUBLIC",
  "ATTACHMENT_ADDED",
  "ATTACHMENT_REMOVED",
];



function cleanText(value: unknown) {
  return String(value || "").trim();
}



function normalizeRole(role?: string | null) {
  return String(role || "").trim().toUpperCase();
}



function isResidentialPortalAccess(access?: ActiveUserAccess | null) {
  return isMorador(access) || isProprietario(access);
}



function isSindicoPortalAccess(access?: ActiveUserAccess | null) {
  return isSindico(access);
}



function canViewPortalTicket(access: ActiveUserAccess) {
  if (isSindicoPortalAccess(access)) {
    return canViewCondominiumTickets(access);
  }

  if (isResidentialPortalAccess(access)) {
    return canViewOwnTickets(access);
  }

  return false;
}



/* =========================================================
   ACCESS ID SEGURO PARA BANCO
   ========================================================= */

function getDatabaseAccessId(access: ActiveUserAccess) {
  return access.source === "USER_ACCESS" ? access.accessId : null;
}



/* =========================================================
   PRIVACIDADE E ELEGIBILIDADE DA AVALIAÇÃO NO PORTAL

   Regra consolidada:
   1. Quem pode avaliar é quem abriu o chamado no perfil correto.
   2. Chamado aberto por MORADOR / PROPRIETÁRIO:
      - avaliado pelo próprio perfil residencial que abriu;
      - se atribuído ao SÍNDICO, a nota vai para o SÍNDICO;
      - se atribuído à ADMINISTRADORA ou sem responsável, a nota vai
        para a ADMINISTRADORA.
   3. Chamado aberto por SÍNDICO:
      - avaliado pelo próprio SÍNDICO;
      - a nota vai para a ADMINISTRADORA.
   4. Usuário com múltiplos perfis não pode avaliar/ver a mesma
      avaliação em todos os contextos apenas por possuir o mesmo userId.
   5. Avaliações antigas sem metadata usam o perfil de abertura do
      chamado como fallback.
   ========================================================= */

function getRatingEvaluatorRole(rating?: any) {
  const metadata = rating?.ratedMetadata || {};

  return normalizeRole(
    metadata.evaluatorRole ||
      metadata.actorRole ||
      metadata.createdByUserRole ||
      null
  );
}



function getTicketCreatedLog(ticket?: any) {
  const logs = Array.isArray(ticket?.logs) ? ticket.logs : [];

  return logs.find((log: any) => log?.action === "CREATED") || null;
}



function getTicketOpeningRole(ticket?: any) {
  const createdLog = getTicketCreatedLog(ticket);

  const roleFromLog = normalizeRole(
    createdLog?.actorRole || createdLog?.access?.role || createdLog?.user?.role
  );

  if (roleFromLog) {
    return roleFromLog;
  }

  const roleFromCreatedByAccess = normalizeRole(ticket?.createdByAccess?.role);

  if (roleFromCreatedByAccess) {
    return roleFromCreatedByAccess;
  }

  const roleFromMetadata = normalizeRole(ticket?.metadata?.createdByUserRole);

  if (roleFromMetadata) {
    return roleFromMetadata;
  }

  if (ticket?.scope === "CONDOMINIUM") {
    return "SINDICO";
  }

  if (ticket?.scope === "UNIT") {
    return "MORADOR";
  }

  return "";
}



function isResidentialRole(role?: string | null) {
  const value = normalizeRole(role);

  return value === "MORADOR" || value === "PROPRIETARIO";
}



function isSameResidentialContext({
  ticket,
  access,
}: {
  ticket: any;
  access: ActiveUserAccess;
}) {
  return (
    !!access.condominiumId &&
    !!access.unitId &&
    ticket?.condominiumId === access.condominiumId &&
    ticket?.unitId === access.unitId
  );
}



function isUserTicketCreator({
  ticket,
  user,
}: {
  ticket: any;
  user: any;
}) {
  if (!ticket || !user?.id) {
    return false;
  }

  return ticket.createdByUserId === user.id || ticket.createdByUser?.id === user.id;
}



function canCurrentProfileSubmitRating({
  ticket,
  user,
  access,
}: {
  ticket: any;
  user: any;
  access: ActiveUserAccess;
}) {
  if (!ticket || !user?.id) {
    return false;
  }

  if (ticket.status !== "RESOLVED") {
    return false;
  }

  if (ticket.rating) {
    return false;
  }

  const activeRole = normalizeRole(access.role);
  const openingRole = getTicketOpeningRole(ticket);

  if (!isUserTicketCreator({ ticket, user })) {
    return false;
  }

  if (openingRole === "SINDICO") {
    return activeRole === "SINDICO" && ticket.condominiumId === access.condominiumId;
  }

  if (isResidentialRole(openingRole)) {
    return isResidentialRole(activeRole) && isSameResidentialContext({ ticket, access });
  }

  return false;
}



function canViewTicketRating({
  rating,
  ticket,
  user,
  access,
}: {
  rating?: any;
  ticket: any;
  user: any;
  access: ActiveUserAccess;
}) {
  if (!rating || !user?.id) {
    return false;
  }

  const activeRole = normalizeRole(access.role);
  const evaluatorRole = getRatingEvaluatorRole(rating) || getTicketOpeningRole(ticket);

  /* =========================================================
     1. QUEM AVALIOU

     Só vê a avaliação no mesmo perfil/contexto em que avaliou.
     Avaliações antigas sem metadata usam o perfil de abertura do
     chamado como fallback.
     ========================================================= */

  if (rating.userId === user.id) {
    if (!evaluatorRole) {
      return false;
    }

    if (evaluatorRole === "SINDICO") {
      return activeRole === "SINDICO";
    }

    if (isResidentialRole(evaluatorRole)) {
      return isResidentialRole(activeRole) && isSameResidentialContext({ ticket, access });
    }

    return evaluatorRole === activeRole;
  }



  /* =========================================================
     2. SÍNDICO AVALIADO

     Quando o morador/proprietário avalia o síndico, o síndico
     avaliado pode ver a avaliação recebida no perfil SÍNDICO.
     ========================================================= */

  if (
    rating.ratedTargetType === TicketRatingTargetType.SINDICO &&
    rating.ratedUserId === user.id &&
    activeRole === "SINDICO"
  ) {
    return true;
  }

  return false;
}



function sanitizeTicketForPortal({
  ticket,
  user,
  access,
}: {
  ticket: any;
  user: any;
  access: ActiveUserAccess;
}) {
  if (!ticket) {
    return ticket;
  }

  const hasRating = !!ticket.rating;

  const canViewRating = canViewTicketRating({
    rating: ticket.rating,
    ticket,
    user,
    access,
  });

  const canSubmitRating = canCurrentProfileSubmitRating({
    ticket,
    user,
    access,
  });

  const canAccessRatingArea = canViewRating || canSubmitRating;

  return {
    ...ticket,

    /*
      Privacidade:
      - rating traz o conteúdo somente quando o perfil pode visualizar.
      - ratingStatus informa se já existe avaliação e se o perfil atual
        pode interagir com a área de avaliação.
      - Perfis que não abriram o chamado no contexto correto não veem
        a área de avaliação apenas porque acessam o chamado.
    */
    rating: canViewRating ? ticket.rating : null,
    ratingStatus: {
      hasRating,
      canViewRating,
      canSubmitRating,
      canAccessRatingArea,
      hiddenByPrivacy: hasRating && !canViewRating && canAccessRatingArea,
      openingRole: getTicketOpeningRole(ticket),
      message:
        hasRating && !canViewRating && canAccessRatingArea
          ? "Este chamado já possui avaliação registrada, mas ela não está disponível para este perfil de acesso."
          : null,
    },
  };
}



/* =========================================================
   INCLUDE PADRÃO DO CHAMADO NO PORTAL
   ========================================================= */

const ticketInclude = {
  condominium: {
    include: {
      administrator: true,
    },
  },

  unit: true,
  resident: true,
  createdByUser: true,
  assignedToUser: true,

  logs: {
    where: {
      action: {
        in: PORTAL_VISIBLE_LOG_ACTIONS,
      },
    },
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
  },
};



/* =========================================================
   INCLUDE COMPLETO PARA NOTIFICAÇÕES
   ========================================================= */

const ticketIncludeForNotification = {
  condominium: {
    include: {
      administrator: true,
    },
  },

  unit: true,

  resident: {
    include: {
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
  },

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
      action: {
        in: PORTAL_VISIBLE_LOG_ACTIONS,
      },
    },
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
  },
};



/* =========================================================
   BUSCA USUÁRIO LEGADO COM CONTEXTO
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
   MONTA FILTRO DE ACESSO DO PORTAL

   Usa o contexto ativo em vez do role legado do User.
   ========================================================= */

function getPortalTicketWhere({
  user,
  access,
  ticketId,
}: {
  user: any;
  access: ActiveUserAccess;
  ticketId: string;
}) {
  if (isResidentialPortalAccess(access)) {
    if (!access.condominiumId || !access.unitId) {
      return {
        id: "__NO_ACCESS__",
      };
    }

    const ownershipConditions: any[] = [
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
   VALIDA REGISTROS ATIVOS PARA NOVA MENSAGEM
   ========================================================= */

async function validatePortalOperationContext({
  access,
  ticket,
}: {
  access: ActiveUserAccess;
  ticket: any;
}) {
  if (
    ticket.condominium?.status !== Status.ACTIVE ||
    ticket.condominium?.administrator?.status !== Status.ACTIVE
  ) {
    return {
      ok: false,
      status: 400,
      message:
        "O condomínio ou a administradora deste chamado está inativo. Não é possível adicionar nova mensagem.",
    };
  }

  if (isResidentialPortalAccess(access)) {
    if (!access.unitId) {
      return {
        ok: false,
        status: 403,
        message: "Contexto de unidade incompleto.",
      };
    }

    const unidade = await db.unit.findFirst({
      where: {
        id: access.unitId,
        condominiumId: access.condominiumId || undefined,
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
          "Unidade não encontrada ou inativa. Não é possível adicionar nova mensagem.",
      };
    }

    if (access.residentId) {
      const morador = await db.resident.findFirst({
        where: {
          id: access.residentId,
          condominiumId: access.condominiumId || undefined,
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
  }

  if (isSindicoPortalAccess(access)) {
    if (!access.condominiumId) {
      return {
        ok: false,
        status: 403,
        message: "Contexto de síndico sem condomínio vinculado.",
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
   MONTA RESPOSTA PADRÃO DO PORTAL
   ========================================================= */

function buildPortalResponse(user: any, access: ActiveUserAccess, ticket: any) {
  const safeTicket = sanitizeTicketForPortal({
    ticket,
    user,
    access,
  });

  return {
    role: access.role,

    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: access.role,
      residentId: access.residentId,
      condominiumId: access.condominiumId,
      unitId: access.unitId,
      accessId: access.accessId,
      accessLabel: access.label,
      accessSource: access.source,
    },

    activeAccess: {
      accessId: access.accessId,
      role: access.role,
      label: access.label,
      condominiumId: access.condominiumId,
      unitId: access.unitId,
      residentId: access.residentId,
      source: access.source,
    },

    ticket: safeTicket,
  };
}



/* =========================================================
   GET - BUSCAR CHAMADO INDIVIDUAL
   ========================================================= */

export async function GET(req: Request, context: RouteContext) {
  try {
    const authUser: any = await getAuthUser();
    const { id } = await context.params;
    const ticketId = cleanText(id);

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
        { error: "Usuário inativo. Não é possível acessar o portal." },
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

    if (!canViewPortalTicket(activeAccess)) {
      return NextResponse.json(
        { error: "Usuário sem permissão para visualizar este chamado." },
        { status: 403 }
      );
    }

    const chamado = await db.ticket.findFirst({
      where: getPortalTicketWhere({
        user,
        access: activeAccess,
        ticketId,
      }),
      include: ticketInclude,
    });

    if (!chamado) {
      return NextResponse.json(
        { error: "Chamado não encontrado ou acesso negado." },
        { status: 404 }
      );
    }

    return NextResponse.json(buildPortalResponse(user, activeAccess, chamado));
  } catch (error: any) {
    console.error("ERRO AO BUSCAR CHAMADO DO PORTAL:", error);

    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao buscar chamado." },
      { status: 500 }
    );
  }
}



/* =========================================================
   PATCH - ENVIAR MENSAGEM NO CHAMADO

   O portal só cria comentário público.
   Comentário interno é exclusivo das rotas administrativas.
   ========================================================= */

export async function PATCH(req: Request, context: RouteContext) {
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
        { error: "Usuário inativo. Não é possível acessar o portal." },
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

    if (!canViewPortalTicket(activeAccess)) {
      return NextResponse.json(
        { error: "Usuário sem permissão para acessar este chamado." },
        { status: 403 }
      );
    }

    if (!canCommentPublic(activeAccess)) {
      return NextResponse.json(
        { error: "Usuário sem permissão para comentar neste chamado." },
        { status: 403 }
      );
    }

    const chamado = await db.ticket.findFirst({
      where: getPortalTicketWhere({
        user,
        access: activeAccess,
        ticketId,
      }),
      include: ticketIncludeForNotification,
    });

    if (!chamado) {
      return NextResponse.json(
        { error: "Chamado não encontrado ou acesso negado." },
        { status: 404 }
      );
    }

    const comment = cleanText(body?.comment);

    if (!comment) {
      return NextResponse.json(buildPortalResponse(user, activeAccess, chamado));
    }

    if (chamado.status === "RESOLVED" || chamado.status === "CANCELED") {
      return NextResponse.json(
        {
          error:
            "Este chamado está finalizado. Não é possível adicionar mensagens.",
        },
        { status: 400 }
      );
    }



    /* =========================================================
       BLOQUEIO OPERACIONAL POR REGISTROS INATIVOS
       ========================================================= */

    const operationValidation = await validatePortalOperationContext({
      access: activeAccess,
      ticket: chamado,
    });

    if (!operationValidation.ok) {
      return NextResponse.json(
        { error: operationValidation.message },
        { status: operationValidation.status }
      );
    }



    const dbAccessId = getDatabaseAccessId(activeAccess);



    /* =========================================================
       CRIA MENSAGEM PÚBLICA COM CONTEXTO ATIVO
       ========================================================= */

    await db.ticketLog.create({
      data: {
        ticketId: chamado.id,
        userId: user.id,
        accessId: dbAccessId,
        actorRole: buildActorRole(activeAccess),
        actorLabel: buildActorLabel(activeAccess),
        action: "COMMENT_PUBLIC",
        comment,
      },
    });



    /* =========================================================
       NOTIFICAÇÕES DA MENSAGEM DO PORTAL
       ========================================================= */

    try {
      const notifiedUserIds = new Set<string>();

      const actorUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: activeAccess.role,
      };

      const notificationMetadata = {
        ticketTitle: chamado.title,
        condominiumName: chamado.condominium?.name || null,
        commentPreview: comment.substring(0, 180),
        action: "COMMENT_PUBLIC",
        source: "PORTAL",

        accessId: activeAccess.accessId,
        accessSource: activeAccess.source,
        actorRole: buildActorRole(activeAccess),
        actorLabel: buildActorLabel(activeAccess),

        createdByUserId: user.id,
        createdByUserName: user.name,
        createdByUserRole: activeAccess.role,
      };



      /* =========================================================
         1. NOTIFICA ADMINISTRADORA DA CARTEIRA
         ========================================================= */

      await notifyAdministradoraUsers({
        administratorId: chamado.condominium?.administratorId || null,
        actorUser,
        notifiedUserIds,
        ticketId: chamado.id,
        type: "TICKET_PUBLIC_COMMENT",
        title: "Nova mensagem no chamado",
        message: `${user.name} enviou uma nova mensagem no chamado "${chamado.title}".`,
        metadata: notificationMetadata,
      });



      /* =========================================================
         2. NOTIFICA RESPONSÁVEL ATRIBUÍDO
       ========================================================= */

      if (
        chamado.assignedToUser &&
        chamado.assignedToUser.isActive !== false &&
        ![Role.MORADOR, "PROPRIETARIO"].includes(
          String(chamado.assignedToUser.role || "")
        )
      ) {
        await notifySingleUser({
          targetUser: chamado.assignedToUser,
          actorUser,
          notifiedUserIds,
          ticketId: chamado.id,
          type: "TICKET_PUBLIC_COMMENT",
          title: "Nova mensagem no chamado",
          message: `${user.name} enviou uma nova mensagem no chamado "${chamado.title}".`,
          metadata: {
            ...notificationMetadata,
            assignedToUserId: chamado.assignedToUser.id,
            assignedToUserName: chamado.assignedToUser.name || null,
          },
        });
      }



      /* =========================================================
         3. SE SÍNDICO RESPONDEU, NOTIFICA MORADOR/CRIADOR
       ========================================================= */

      if (isSindicoPortalAccess(activeAccess)) {
        const publicTargets = [
          chamado.createdByUser || null,
          chamado.resident?.user || null,
        ].filter(Boolean);

        for (const targetUser of publicTargets) {
          if (!targetUser?.id) continue;
          if (targetUser.isActive === false) continue;

          await notifySingleUser({
            targetUser,
            actorUser,
            notifiedUserIds,
            ticketId: chamado.id,
            type: "TICKET_PUBLIC_COMMENT",
            title: "Nova mensagem no chamado",
            message: `${user.name} enviou uma nova mensagem no chamado "${chamado.title}".`,
            metadata: notificationMetadata,
          });
        }
      }
    } catch (notificationError) {
      console.error(
        "ERRO AO NOTIFICAR COMENTÁRIO DO PORTAL:",
        notificationError
      );
    }



    /* =========================================================
       RECARREGA CHAMADO ATUALIZADO
       ========================================================= */

    const updated = await db.ticket.findUnique({
      where: {
        id: chamado.id,
      },
      include: ticketInclude,
    });

    if (!updated) {
      return NextResponse.json(
        {
          error:
            "Chamado atualizado, mas não foi possível recarregar os dados.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(buildPortalResponse(user, activeAccess, updated));
  } catch (error: any) {
    console.error("ERRO AO COMENTAR CHAMADO DO PORTAL:", error);

    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao comentar chamado." },
      { status: 500 }
    );
  }
}