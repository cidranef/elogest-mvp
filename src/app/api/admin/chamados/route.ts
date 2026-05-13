import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import { sendNotification } from "@/lib/notifications";
import {
  canAssignTicket,
  canCreateAdminTicket,
  canViewAdminTickets,
  isAdministradora,
  isSuperAdmin,
} from "@/lib/access-control";
import { getActiveUserAccessFromCookies } from "@/lib/user-access";
import { NextResponse } from "next/server";
import { Role, Status, TicketPriority } from "@prisma/client";



/* =========================================================
   API ADMIN - CHAMADOS

   ETAPA 28.6:
   Auditoria final do contexto ativo nas APIs.

   ETAPA 31.1:
   Revisão final de segurança por contexto nas ações críticas.

   ETAPA 35.5:
   Filtros de registros ativos nos fluxos operacionais.

   ETAPA 40.2 — AUDITORIA DE PERMISSÕES E CONTEXTO ATIVO NAS APIs

   CORREÇÃO TYPESCRIPT:
   - getPriority agora retorna TicketPriority, não string.
   - Mensagens de notificação usam condominio.name e
     unidade.condominium?.name, evitando erro de tipagem em
     chamado.condominium após create.
   ========================================================= */



/* =========================================================
   INCLUDE PADRÃO DOS CHAMADOS ADMINISTRATIVOS
   ========================================================= */

const ticketInclude = {
  condominium: true,
  unit: true,
  resident: true,
  createdByUser: true,
  assignedToUser: true,

  logs: {
    include: {
      user: true,
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
   HELPERS
   ========================================================= */

function normalizeText(value: unknown) {
  return String(value || "").trim();
}



function normalizeNullableText(value: unknown) {
  const text = normalizeText(value);

  return text ? text : null;
}



function getPriority(value: unknown): TicketPriority {
  const priority = normalizeText(value).toUpperCase();

  if (priority === TicketPriority.LOW) return TicketPriority.LOW;
  if (priority === TicketPriority.HIGH) return TicketPriority.HIGH;
  if (priority === TicketPriority.URGENT) return TicketPriority.URGENT;

  return TicketPriority.MEDIUM;
}



/* =========================================================
   USUÁRIO COM CONTEXTO ATIVO

   A sessão base identifica quem está logado.
   O contexto ativo define com qual papel/carteira ele está
   operando naquele momento.
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
   VALIDA PERFIL ADMINISTRATIVO
   ========================================================= */

function isAdminContext(user: any) {
  return isSuperAdmin(user) || isAdministradora(user);
}



/* =========================================================
   FILTRO DE CARTEIRA ADMINISTRATIVA
   ========================================================= */

function getAdminTicketWhere(user: any) {
  if (isSuperAdmin(user)) {
    return {};
  }

  if (isAdministradora(user) && user.administratorId) {
    return {
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
   VALIDA ADMINISTRADORA ATIVA
   ========================================================= */

function validateAdministratorContext(user: any) {
  if (isAdministradora(user) && !user.administratorId) {
    return false;
  }

  return true;
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
  currentUser: any;
  assignedToUserId?: string | null;
  targetAdministratorId: string | null;
  targetCondominiumId: string;
}) {
  if (!assignedToUserId) {
    return {
      assignedToUserId: null as string | null,
      assignedUser: null as any,
      error: null as string | null,
      status: 200,
    };
  }

  if (!canAssignTicket(currentUser)) {
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
   GET - LISTAR CHAMADOS ADMINISTRATIVOS
   ========================================================= */

export async function GET() {
  try {
    const user: any = await getAdminContextUser();

    if (!isAdminContext(user)) {
      return NextResponse.json(
        {
          error:
            "Este contexto não possui acesso à área administrativa de chamados.",
        },
        { status: 403 }
      );
    }

    if (!canViewAdminTickets(user)) {
      return NextResponse.json(
        { error: "Usuário sem permissão para listar chamados administrativos." },
        { status: 403 }
      );
    }

    if (!validateAdministratorContext(user)) {
      return NextResponse.json(
        { error: "Contexto de administradora sem vínculo com administradora." },
        { status: 403 }
      );
    }

    const chamados = await db.ticket.findMany({
      where: getAdminTicketWhere(user),
      include: ticketInclude,
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(chamados);
  } catch (error: any) {
    console.error("ERRO AO LISTAR CHAMADOS:", error);

    if (error.message === "UNAUTHORIZED") {
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
    const user: any = await getAdminContextUser();
    const body = await req.json();

    if (!isAdminContext(user)) {
      return NextResponse.json(
        {
          error:
            "Este contexto não possui acesso para criar chamados administrativos.",
        },
        { status: 403 }
      );
    }

    if (!canCreateAdminTicket(user)) {
      return NextResponse.json(
        { error: "Usuário sem permissão para criar chamado administrativo." },
        { status: 403 }
      );
    }

    if (!validateAdministratorContext(user)) {
      return NextResponse.json(
        { error: "Contexto de administradora sem vínculo com administradora." },
        { status: 403 }
      );
    }

    const scope = body.scope === "CONDOMINIUM" ? "CONDOMINIUM" : "UNIT";

    const title = normalizeText(body.title);
    const description = normalizeText(body.description);

    if (!title || !description) {
      return NextResponse.json(
        { error: "Título e descrição são obrigatórios." },
        { status: 400 }
      );
    }



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
          administrator: {
            status: Status.ACTIVE,
          },
          ...(isSuperAdmin(user)
            ? {}
            : {
                administratorId: user.administratorId,
              }),
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
          assignedToUserId,
        },
        include: ticketInclude,
      });

      await db.ticketLog.create({
        data: {
          ticketId: chamado.id,
          userId: user.id,
          action: "CREATED",
          fromValue: null,
          toValue: "OPEN",
          actorRole: user.activeAccess?.role || user.role || null,
          actorLabel: user.activeAccess?.label || null,
          comment: "Chamado geral do condomínio criado pela administradora.",
        },
      });

      if (assignedUser) {
        await db.ticketLog.create({
          data: {
            ticketId: chamado.id,
            userId: user.id,
            action: "ASSIGNED",
            fromValue: null,
            toValue: assignedUser.name,
            actorRole: user.activeAccess?.role || user.role || null,
            actorLabel: user.activeAccess?.label || null,
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
        ...(isSuperAdmin(user)
          ? {}
          : {
              condominium: {
                administratorId: user.administratorId,
              },
            }),
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
        { error: "Unidade não encontrada ou acesso negado." },
        { status: 403 }
      );
    }

    if (
      unidade.condominium?.status !== Status.ACTIVE ||
      unidade.condominium?.administrator?.status !== Status.ACTIVE
    ) {
      return NextResponse.json(
        {
          error:
            "O condomínio desta unidade está inativo. Reative o condomínio antes de abrir novo chamado.",
        },
        { status: 400 }
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
        assignedToUserId,
      },
      include: ticketInclude,
    });

    await db.ticketLog.create({
      data: {
        ticketId: chamado.id,
        userId: user.id,
        action: "CREATED",
        fromValue: null,
        toValue: "OPEN",
        actorRole: user.activeAccess?.role || user.role || null,
        actorLabel: user.activeAccess?.label || null,
        comment: residentNameForLog
          ? `Chamado de unidade criado pela administradora para o morador ${residentNameForLog}.`
          : "Chamado de unidade criado pela administradora, sem morador específico vinculado.",
      },
    });

    if (assignedUser) {
      await db.ticketLog.create({
        data: {
          ticketId: chamado.id,
          userId: user.id,
          action: "ASSIGNED",
          fromValue: null,
          toValue: assignedUser.name,
          actorRole: user.activeAccess?.role || user.role || null,
          actorLabel: user.activeAccess?.label || null,
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
  } catch (error: any) {
    console.error("ERRO AO CRIAR CHAMADO:", error);

    if (error.message === "UNAUTHORIZED") {
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