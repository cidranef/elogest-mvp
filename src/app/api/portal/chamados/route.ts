import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import { NextResponse } from "next/server";
import {
  notifyAdministradoraUsers,
  notifyCondominiumSyndics,
} from "@/lib/notifications";
import { Role, Status, TicketPriority } from "@prisma/client";
import {
  canCreatePortalTicket,
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



/* =========================================================
   PORTAL DE CHAMADOS - LISTAR E CRIAR

   ETAPA 35.6 — REVISÃO DO PORTAL DE CHAMADOS

   MORADOR / PROPRIETÁRIO:
   - vê chamados do contexto ativo selecionado;
   - cria chamado para a unidade do contexto ativo;
   - só cria se condomínio, administradora, unidade e morador
     estiverem ativos.

   SÍNDICO:
   - vê chamados do condomínio do contexto ativo;
   - pode criar chamado geral do condomínio / área comum;
   - pode criar chamado de outra unidade ativa do condomínio;
   - NÃO pode abrir chamado da própria unidade usando contexto SÍNDICO;
   - só cria se condomínio e administradora estiverem ativos.

   Correção TypeScript:
   - Validação direta de user null no GET e POST.
   - Após if (!user) return, o TypeScript entende que user existe.

   ETAPA 40.2 — AUDITORIA DE PERMISSÕES E CONTEXTO ATIVO NAS APIs

   Ajustes desta revisão:
   - Permissões passam a consultar a matriz central access-control.
   - GET valida permissão de visualização conforme perfil ativo.
   - POST valida permissão CREATE_PORTAL_TICKET.
   - Normalização defensiva de textos, scope, target, unitId e residentId.
   - Mantida a preservação de histórico na listagem.
   - Mantidas regras de criação apenas com registros ativos.
   - Mantida regra de síndico não abrir chamado da própria unidade
     usando contexto SÍNDICO.
   ========================================================= */



const PORTAL_VISIBLE_LOG_ACTIONS = [
  "CREATED",
  "STATUS_CHANGED",
  "COMMENT_PUBLIC",
  "ATTACHMENT_ADDED",
];



/* =========================================================
   HELPERS
   ========================================================= */

function normalizePriority(priority: unknown): TicketPriority {
  const value = String(priority || "MEDIUM").trim().toUpperCase();

  if (value === TicketPriority.LOW) return TicketPriority.LOW;
  if (value === TicketPriority.HIGH) return TicketPriority.HIGH;
  if (value === TicketPriority.URGENT) return TicketPriority.URGENT;

  return TicketPriority.MEDIUM;
}



function cleanText(value: unknown) {
  return String(value || "").trim();
}



function cleanNullableText(value: unknown) {
  const text = cleanText(value);

  return text ? text : null;
}



function normalizeScope(value: unknown) {
  return cleanText(value).toUpperCase() === "CONDOMINIUM"
    ? "CONDOMINIUM"
    : "UNIT";
}



function normalizeTarget(value: unknown) {
  return cleanText(value).toUpperCase();
}



function getDatabaseAccessId(access: ActiveUserAccess) {
  return access.source === "USER_ACCESS" ? access.accessId : null;
}



function isResidentialPortalAccess(access?: ActiveUserAccess | null) {
  return isMorador(access) || isProprietario(access);
}



function isSindicoPortalAccess(access?: ActiveUserAccess | null) {
  return isSindico(access);
}



/* =========================================================
   INCLUDE PADRÃO DO PORTAL
   ========================================================= */

const ticketInclude = {
  condominium: true,
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
    },
  },
};



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
   VALIDA CONDOMÍNIO OPERACIONAL

   Histórico pode ser listado, mas criação de novo chamado exige:
   - condomínio ativo;
   - administradora ativa.
   ========================================================= */

async function validateActiveCondominiumForOperation(
  condominiumId?: string | null
) {
  if (!condominiumId) {
    return {
      ok: false,
      condominium: null as any,
      status: 403,
      message: "Contexto sem condomínio vinculado.",
    };
  }

  const condominium = await db.condominium.findFirst({
    where: {
      id: condominiumId,
    },
    include: {
      administrator: true,
    },
  });

  if (!condominium) {
    return {
      ok: false,
      condominium: null,
      status: 404,
      message: "Condomínio não encontrado.",
    };
  }

  if (
    condominium.status !== Status.ACTIVE ||
    condominium.administrator?.status !== Status.ACTIVE
  ) {
    return {
      ok: false,
      condominium,
      status: 400,
      message:
        "O condomínio ou a administradora está inativo. Não é possível abrir novo chamado.",
    };
  }

  return {
    ok: true,
    condominium,
    status: 200,
    message: "",
  };
}



/* =========================================================
   IDENTIFICAR UNIDADE PESSOAL DO SÍNDICO

   Usado para:
   - remover a unidade pessoal do select de "Outra unidade";
   - bloquear no backend caso alguém force a própria unitId.

   O schema atual não usa userId direto em Resident.
   A busca usa:
   - relação user: { id: user.id };
   - ou e-mail do usuário.
   ========================================================= */

async function getPersonalResidentialContextForSindico({
  user,
  condominiumId,
}: {
  user: any;
  condominiumId: string;
}) {
  if (!user?.id || !condominiumId) {
    return {
      resident: null as any,
      unit: null as any,
    };
  }

  if (
    user.resident?.id &&
    user.resident?.unitId &&
    user.resident?.condominiumId === condominiumId &&
    user.resident?.status === Status.ACTIVE
  ) {
    return {
      resident: user.resident,
      unit: user.resident.unit || null,
    };
  }

  const resident: any = await db.resident.findFirst({
    where: {
      condominiumId,
      status: Status.ACTIVE,
      OR: [
        {
          user: {
            id: user.id,
          },
        },
        {
          email: user.email,
        },
      ],
    },
    include: {
      unit: true,
      condominium: true,
      user: true,
    },
  });

  if (!resident) {
    return {
      resident: null,
      unit: null,
    };
  }

  return {
    resident,
    unit: resident.unit || null,
  };
}



function buildPortalUserPayload(user: any, access: ActiveUserAccess) {
  return {
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
  };
}



function buildActiveAccessPayload(access: ActiveUserAccess) {
  return {
    accessId: access.accessId,
    role: access.role,
    label: access.label,
    condominiumId: access.condominiumId,
    unitId: access.unitId,
    residentId: access.residentId,
    source: access.source,
  };
}



/* =========================================================
   NOTIFICAÇÃO - NOVO CHAMADO ABERTO PELO PORTAL

   Regras:
   - sempre notifica administradora da carteira;
   - se aberto por MORADOR / PROPRIETÁRIO, também notifica
     síndicos ativos do condomínio;
   - se o próprio autor também for síndico, ele recebe essa
     notificação operacional para enxergar no contexto SÍNDICO.
   ========================================================= */

async function notifyNewPortalTicket({
  chamado,
  user,
  access,
  sourceLabel,
}: {
  chamado: any;
  user: any;
  access: ActiveUserAccess;
  sourceLabel: string;
}) {
  try {
    const administratorId = chamado?.condominium?.administratorId || null;
    const condominiumId =
      chamado?.condominiumId || chamado?.condominium?.id || null;

    if (!administratorId) {
      console.warn("Novo chamado sem administratorId para notificação.", {
        ticketId: chamado?.id || null,
        title: chamado?.title || null,
        condominiumId,
      });

      return;
    }

    const actorUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: access.role,
    };

    const notifiedUserIds = new Set<string>();

    const notificationMetadata = {
      ticketTitle: chamado.title,
      condominiumName: chamado.condominium?.name || null,
      unitLabel: chamado.unit
        ? `${chamado.unit.block ? chamado.unit.block + " - " : ""}${
            chamado.unit.unitNumber
          }`
        : null,
      residentName: chamado.resident?.name || null,
      source: "PORTAL",
      sourceLabel,

      accessId: access.accessId,
      accessSource: access.source,
      actorRole: buildActorRole(access),
      actorLabel: buildActorLabel(access),

      createdByUserId: user.id,
      createdByUserName: user.name,
      createdByUserRole: access.role,
    };



    /* =========================================================
       1. NOTIFICA ADMINISTRADORA / SUPER_ADMIN
       ========================================================= */

    await notifyAdministradoraUsers({
      administratorId,
      actorUser,
      notifiedUserIds,
      ticketId: chamado.id,
      type: "TICKET_CREATED",
      title: "Novo chamado aberto",
      message: `${user.name} abriu um novo chamado pelo portal: "${chamado.title}".`,
      metadata: {
        ...notificationMetadata,
        notificationReason: "Novo chamado aberto pelo portal.",
      },
    });



    /* =========================================================
       2. NOTIFICA SÍNDICOS DO CONDOMÍNIO

       Somente quando o chamado foi aberto por MORADOR /
       PROPRIETÁRIO.

       Aqui NÃO passamos actorUser como bloqueio, porque se o mesmo
       usuário for Morador + Síndico, queremos que ele receba a
       notificação operacional para o contexto SÍNDICO.
       ========================================================= */

    if (isResidentialPortalAccess(access)) {
      await notifyCondominiumSyndics({
        condominiumId,
        actorUser: null,
        notifiedUserIds,
        ticketId: chamado.id,
        type: "TICKET_CREATED",
        title: "Novo chamado no condomínio",
        message: `${user.name} abriu um novo chamado no condomínio: "${chamado.title}".`,
        metadata: {
          ...notificationMetadata,
          notificationReason:
            "Novo chamado aberto por morador/proprietário no condomínio.",
          notificationAudience: "SINDICO",
        },
      });
    }
  } catch (error) {
    console.error("ERRO AO NOTIFICAR NOVO CHAMADO DO PORTAL:", error);
  }
}



/* =========================================================
   GET - LISTAR CHAMADOS DO PORTAL

   Importante:
   - A listagem preserva histórico.
   - Mesmo que condomínio/unidade/morador fiquem inativos depois,
     chamados antigos continuam visíveis conforme o contexto.
   - Os filtros de ativos entram nos fluxos de criação e nos selects.
   ========================================================= */

export async function GET() {
  try {
    const authUser: any = await getAuthUser();

    if (!authUser?.id) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    const [user, activeAccess] = await Promise.all([
      getPortalUser(authUser.id),
      getActiveUserAccessFromCookies({
        userId: authUser.id,
      }),
    ]);



    /* =========================================================
       CORREÇÃO TYPESCRIPT

       Validação direta do user.
       Depois deste bloco, o TypeScript entende que user não é null.
       ========================================================= */

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



    /* =========================================================
       MORADOR / PROPRIETÁRIO
       ========================================================= */

    if (isResidentialPortalAccess(activeAccess)) {
      if (!canViewOwnTickets(activeAccess)) {
        return NextResponse.json(
          { error: "Usuário sem permissão para visualizar seus chamados." },
          { status: 403 }
        );
      }

      if (!activeAccess.condominiumId || !activeAccess.unitId) {
        return NextResponse.json(
          { error: "Contexto de unidade incompleto." },
          { status: 403 }
        );
      }

      const ownershipConditions: any[] = [
        {
          createdByUserId: user.id,
        },
      ];

      if (activeAccess.residentId) {
        ownershipConditions.push({
          residentId: activeAccess.residentId,
        });
      }

      const tickets = await db.ticket.findMany({
        where: {
          condominiumId: activeAccess.condominiumId,
          unitId: activeAccess.unitId,
          OR: ownershipConditions,
        },
        include: ticketInclude,
        orderBy: {
          createdAt: "desc",
        },
      });

      const personalUnit = await db.unit.findFirst({
        where: {
          id: activeAccess.unitId,
          condominiumId: activeAccess.condominiumId,
        },
        include: {
          condominium: true,
        },
      });

      const condominium = await db.condominium.findUnique({
        where: {
          id: activeAccess.condominiumId,
        },
      });

      const resident = activeAccess.residentId
        ? await db.resident.findUnique({
            where: {
              id: activeAccess.residentId,
            },
            include: {
              unit: true,
              condominium: true,
            },
          })
        : null;

      return NextResponse.json({
        role: activeAccess.role,

        user: buildPortalUserPayload(user, activeAccess),

        activeAccess: buildActiveAccessPayload(activeAccess),

        resident,
        condominium,
        unit: personalUnit,

        hasPersonalUnit: !!personalUnit,
        personalUnit,

        units: [],
        tickets,
      });
    }



    /* =========================================================
       SÍNDICO
       ========================================================= */

    if (isSindicoPortalAccess(activeAccess)) {
      if (!canViewCondominiumTickets(activeAccess)) {
        return NextResponse.json(
          {
            error:
              "Usuário sem permissão para visualizar chamados do condomínio.",
          },
          { status: 403 }
        );
      }

      if (!activeAccess.condominiumId) {
        return NextResponse.json(
          { error: "Contexto de síndico sem condomínio vinculado." },
          { status: 403 }
        );
      }

      const [tickets, allUnits, condominium, personalContext] =
        await Promise.all([
          db.ticket.findMany({
            where: {
              condominiumId: activeAccess.condominiumId,
            },
            include: ticketInclude,
            orderBy: {
              createdAt: "desc",
            },
          }),

          db.unit.findMany({
            where: {
              condominiumId: activeAccess.condominiumId,
              status: Status.ACTIVE,
            },
            include: {
              condominium: true,
              residents: {
                where: {
                  status: Status.ACTIVE,
                },
                orderBy: {
                  name: "asc",
                },
              },
            },
            orderBy: [
              {
                block: "asc",
              },
              {
                unitNumber: "asc",
              },
            ],
          }),

          db.condominium.findUnique({
            where: {
              id: activeAccess.condominiumId,
            },
            include: {
              administrator: true,
            },
          }),

          getPersonalResidentialContextForSindico({
            user,
            condominiumId: activeAccess.condominiumId,
          }),
        ]);

      const personalUnitId = personalContext.unit?.id || null;

      const units = personalUnitId
        ? allUnits.filter((unit) => unit.id !== personalUnitId)
        : allUnits;

      return NextResponse.json({
        role: activeAccess.role,

        user: buildPortalUserPayload(user, activeAccess),

        activeAccess: buildActiveAccessPayload(activeAccess),

        resident: personalContext.resident || null,
        condominium,
        unit: null,

        hasPersonalUnit: !!personalContext.unit,
        personalUnit: personalContext.unit || null,

        units,
        tickets,
      });
    }



    return NextResponse.json(
      {
        error:
          "Este portal é destinado a síndicos, proprietários e moradores.",
      },
      { status: 403 }
    );
  } catch (error: any) {
    console.error("ERRO AO LISTAR CHAMADOS DO PORTAL:", error);

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
   POST - CRIAR CHAMADO PELO PORTAL
   ========================================================= */

export async function POST(req: Request) {
  try {
    const authUser: any = await getAuthUser();
    const body = await req.json();

    if (!authUser?.id) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    const [user, activeAccess] = await Promise.all([
      getPortalUser(authUser.id),
      getActiveUserAccessFromCookies({
        userId: authUser.id,
      }),
    ]);



    /* =========================================================
       CORREÇÃO TYPESCRIPT

       Validação direta do user.
       Depois deste bloco, o TypeScript entende que user não é null.
       ========================================================= */

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

    if (!canCreatePortalTicket(activeAccess)) {
      return NextResponse.json(
        { error: "Usuário sem permissão para criar chamado pelo portal." },
        { status: 403 }
      );
    }

    const title = cleanText(body.title);
    const description = cleanText(body.description);
    const category = cleanNullableText(body.category);
    const priority = normalizePriority(body.priority);

    if (!title || !description) {
      return NextResponse.json(
        { error: "Título e descrição são obrigatórios." },
        { status: 400 }
      );
    }

    const dbAccessId = getDatabaseAccessId(activeAccess);



    /* =========================================================
       MORADOR / PROPRIETÁRIO

       Criação exige:
       - condomínio ativo;
       - administradora ativa;
       - unidade ativa;
       - morador ativo, se houver residentId no contexto.
       ========================================================= */

    if (isResidentialPortalAccess(activeAccess)) {
      if (!activeAccess.condominiumId || !activeAccess.unitId) {
        return NextResponse.json(
          { error: "Contexto de unidade incompleto." },
          { status: 403 }
        );
      }

      const condominiumValidation = await validateActiveCondominiumForOperation(
        activeAccess.condominiumId
      );

      if (!condominiumValidation.ok) {
        return NextResponse.json(
          { error: condominiumValidation.message },
          { status: condominiumValidation.status }
        );
      }

      const unidade = await db.unit.findFirst({
        where: {
          id: activeAccess.unitId,
          condominiumId: activeAccess.condominiumId,
          status: Status.ACTIVE,
        },
      });

      if (!unidade) {
        return NextResponse.json(
          {
            error:
              "Unidade não encontrada ou inativa. Não é possível abrir chamado.",
          },
          { status: 403 }
        );
      }

      let residentId: string | null = activeAccess.residentId || null;

      if (residentId) {
        const morador = await db.resident.findFirst({
          where: {
            id: residentId,
            unitId: unidade.id,
            condominiumId: activeAccess.condominiumId,
            status: Status.ACTIVE,
          },
        });

        if (!morador) {
          return NextResponse.json(
            {
              error:
                "Morador não encontrado, inativo ou fora da unidade do contexto.",
            },
            { status: 403 }
          );
        }

        residentId = morador.id;
      }

      const chamado = await db.ticket.create({
        data: {
          scope: "UNIT",
          condominiumId: activeAccess.condominiumId,
          unitId: unidade.id,
          residentId,
          title,
          description,
          category,
          priority,
          createdByUserId: user.id,
          createdByAccessId: dbAccessId,
        },
        include: ticketInclude,
      });

      await db.ticketLog.create({
        data: {
          ticketId: chamado.id,
          userId: user.id,
          accessId: dbAccessId,
          actorRole: buildActorRole(activeAccess),
          actorLabel: buildActorLabel(activeAccess),
          action: "CREATED",
          fromValue: null,
          toValue: "OPEN",
          comment:
            activeAccess.role === "PROPRIETARIO"
              ? "Chamado aberto pelo proprietário."
              : "Chamado aberto pelo morador.",
        },
      });

      const updated = await db.ticket.findUnique({
        where: {
          id: chamado.id,
        },
        include: ticketInclude,
      });

      if (updated) {
        await notifyNewPortalTicket({
          chamado: updated,
          user,
          access: activeAccess,
          sourceLabel:
            activeAccess.role === "PROPRIETARIO"
              ? "Chamado aberto pelo proprietário."
              : "Chamado aberto pelo morador.",
        });
      }

      return NextResponse.json(updated);
    }



    /* =========================================================
       SÍNDICO

       Criação exige:
       - condomínio ativo;
       - administradora ativa;
       - unidade ativa, quando chamado for de unidade;
       - morador ativo, quando vinculado;
       - não pode usar a própria unidade no contexto SÍNDICO.
       ========================================================= */

    if (isSindicoPortalAccess(activeAccess)) {
      if (!activeAccess.condominiumId) {
        return NextResponse.json(
          { error: "Contexto de síndico sem condomínio vinculado." },
          { status: 403 }
        );
      }

      const condominiumValidation = await validateActiveCondominiumForOperation(
        activeAccess.condominiumId
      );

      if (!condominiumValidation.ok) {
        return NextResponse.json(
          { error: condominiumValidation.message },
          { status: condominiumValidation.status }
        );
      }

      const target = normalizeTarget(body.target);

      if (target === "MY_UNIT") {
        return NextResponse.json(
          {
            error:
              "Para abrir chamado da sua unidade, troque o contexto para Morador ou Proprietário.",
          },
          { status: 403 }
        );
      }

      const scope = normalizeScope(body.scope);

      if (scope === "CONDOMINIUM") {
        const chamado = await db.ticket.create({
          data: {
            scope: "CONDOMINIUM",
            condominiumId: activeAccess.condominiumId,
            unitId: null,
            residentId: null,
            title,
            description,
            category,
            priority,
            createdByUserId: user.id,
            createdByAccessId: dbAccessId,
          },
          include: ticketInclude,
        });

        await db.ticketLog.create({
          data: {
            ticketId: chamado.id,
            userId: user.id,
            accessId: dbAccessId,
            actorRole: buildActorRole(activeAccess),
            actorLabel: buildActorLabel(activeAccess),
            action: "CREATED",
            fromValue: null,
            toValue: "OPEN",
            comment: "Chamado geral do condomínio aberto pelo síndico.",
          },
        });

        const updated = await db.ticket.findUnique({
          where: {
            id: chamado.id,
          },
          include: ticketInclude,
        });

        if (updated) {
          await notifyNewPortalTicket({
            chamado: updated,
            user,
            access: activeAccess,
            sourceLabel: "Chamado geral do condomínio aberto pelo síndico.",
          });
        }

        return NextResponse.json(updated);
      }

      const requestedUnitId = cleanNullableText(body.unitId);

      if (!requestedUnitId) {
        return NextResponse.json(
          { error: "Selecione uma unidade para chamado de unidade." },
          { status: 400 }
        );
      }

      const unidade = await db.unit.findFirst({
        where: {
          id: requestedUnitId,
          condominiumId: activeAccess.condominiumId,
          status: Status.ACTIVE,
        },
      });

      if (!unidade) {
        return NextResponse.json(
          {
            error:
              "Unidade não encontrada, inativa ou fora deste condomínio.",
          },
          { status: 403 }
        );
      }

      const personalContext = await getPersonalResidentialContextForSindico({
        user,
        condominiumId: activeAccess.condominiumId,
      });

      if (personalContext.unit?.id && unidade.id === personalContext.unit.id) {
        return NextResponse.json(
          {
            error:
              "No contexto de síndico, abra chamados apenas para outras unidades. Para sua unidade, troque para Morador ou Proprietário.",
          },
          { status: 403 }
        );
      }

      let residentId: string | null = null;
      let residentNameForLog: string | null = null;

      const requestedResidentId = cleanNullableText(body.residentId);

      if (requestedResidentId) {
        const morador = await db.resident.findFirst({
          where: {
            id: requestedResidentId,
            unitId: unidade.id,
            condominiumId: activeAccess.condominiumId,
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

        if (
          personalContext.resident?.id &&
          morador.id === personalContext.resident.id
        ) {
          return NextResponse.json(
            {
              error:
                "No contexto de síndico, não vincule sua própria unidade/morador ao chamado. Para sua unidade, troque para Morador ou Proprietário.",
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
          condominiumId: activeAccess.condominiumId,
          unitId: unidade.id,
          residentId,
          title,
          description,
          category,
          priority,
          createdByUserId: user.id,
          createdByAccessId: dbAccessId,
        },
        include: ticketInclude,
      });

      await db.ticketLog.create({
        data: {
          ticketId: chamado.id,
          userId: user.id,
          accessId: dbAccessId,
          actorRole: buildActorRole(activeAccess),
          actorLabel: buildActorLabel(activeAccess),
          action: "CREATED",
          fromValue: null,
          toValue: "OPEN",
          comment: residentNameForLog
            ? `Chamado de unidade aberto pelo síndico para o morador ${residentNameForLog}.`
            : "Chamado de unidade aberto pelo síndico, sem morador específico vinculado.",
        },
      });

      const updated = await db.ticket.findUnique({
        where: {
          id: chamado.id,
        },
        include: ticketInclude,
      });

      if (updated) {
        await notifyNewPortalTicket({
          chamado: updated,
          user,
          access: activeAccess,
          sourceLabel: residentNameForLog
            ? `Chamado de unidade aberto pelo síndico para o morador ${residentNameForLog}.`
            : "Chamado de unidade aberto pelo síndico, sem morador específico vinculado.",
        });
      }

      return NextResponse.json(updated);
    }

    return NextResponse.json(
      {
        error:
          "Este portal é destinado a síndicos, proprietários e moradores.",
      },
      { status: 403 }
    );
  } catch (error: any) {
    console.error("ERRO AO CRIAR CHAMADO DO PORTAL:", error);

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