import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth-guard";
import { NextResponse } from "next/server";



/* =========================================================
   DASHBOARD GERAL ADMINISTRATIVO - API

   ETAPA 14:
   Visão executiva da carteira da administradora.

   Retorna:
   - total de condomínios
   - total de unidades
   - total de moradores
   - chamados por status
   - chamados sem responsável
   - chamados vencidos por SLA
   - últimos chamados
   - condomínios com maior volume de chamados

   ETAPA 20:
   Inclui indicadores de avaliação do atendimento:
   - avaliação média
   - chamados avaliados
   - resolvidos sem avaliação
   - taxa de avaliação
   - últimas avaliações recebidas

   ETAPA 36.1:
   Refino gerencial da API do dashboard:
   - filtro por período
   - chamados urgentes
   - chamados de alta prioridade
   - chamados próximos do vencimento
   - SLA enriquecido
   - chamados sem responsável apenas ativos
   - agrupamento por categoria
   - agrupamento por prioridade
   - evolução temporal dos chamados
   - lista de chamados críticos
   ========================================================= */



type DashboardPeriod =
  | "all"
  | "7d"
  | "15d"
  | "30d"
  | "90d"
  | "month"
  | "year"
  | "custom";



const ACTIVE_TICKET_STATUSES = ["OPEN", "IN_PROGRESS"];



function getSlaLimitHours(priority?: string | null) {
  if (priority === "URGENT") return 4;
  if (priority === "HIGH") return 24;
  if (priority === "MEDIUM") return 48;
  return 72;
}



function getTicketSlaInfo(ticket: {
  status: string;
  priority?: string | null;
  createdAt: Date;
}) {
  const limitHours = getSlaLimitHours(ticket.priority);

  if (ticket.status === "RESOLVED" || ticket.status === "CANCELED") {
    return {
      limitHours,
      elapsedHours: 0,
      remainingHours: limitHours,
      consumedPercent: 0,
      isOverdue: false,
      isNearDue: false,
    };
  }

  const createdAt = new Date(ticket.createdAt).getTime();
  const elapsedHours = Math.max(
    0,
    Math.floor((Date.now() - createdAt) / (1000 * 60 * 60))
  );

  const remainingHours = limitHours - elapsedHours;

  const consumedPercent =
    limitHours > 0
      ? Math.min(100, Math.round((elapsedHours / limitHours) * 100))
      : 100;

  const isOverdue = remainingHours <= 0;

  /*
     Próximo do vencimento:
     - ainda não venceu
     - faltam no máximo 25% do SLA
     - mínimo prático de alerta: 2 horas
  */
  const nearDueThreshold = Math.max(2, Math.ceil(limitHours * 0.25));

  const isNearDue = !isOverdue && remainingHours <= nearDueThreshold;

  return {
    limitHours,
    elapsedHours,
    remainingHours,
    consumedPercent,
    isOverdue,
    isNearDue,
  };
}



function isTicketOverdue(ticket: {
  status: string;
  priority?: string | null;
  createdAt: Date;
}) {
  return getTicketSlaInfo(ticket).isOverdue;
}



function isTicketNearDue(ticket: {
  status: string;
  priority?: string | null;
  createdAt: Date;
}) {
  return getTicketSlaInfo(ticket).isNearDue;
}



function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}



function endOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}



function parseDateParam(value: string | null) {
  if (!value) return null;

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}



function getDashboardDateRange(searchParams: URLSearchParams) {
  const period = (searchParams.get("period") || "all") as DashboardPeriod;

  const now = new Date();

  if (period === "7d") {
    const from = new Date(now);
    from.setDate(from.getDate() - 6);

    return {
      period,
      from: startOfDay(from),
      to: endOfDay(now),
    };
  }

  if (period === "15d") {
    const from = new Date(now);
    from.setDate(from.getDate() - 14);

    return {
      period,
      from: startOfDay(from),
      to: endOfDay(now),
    };
  }

  if (period === "30d") {
    const from = new Date(now);
    from.setDate(from.getDate() - 29);

    return {
      period,
      from: startOfDay(from),
      to: endOfDay(now),
    };
  }

  if (period === "90d") {
    const from = new Date(now);
    from.setDate(from.getDate() - 89);

    return {
      period,
      from: startOfDay(from),
      to: endOfDay(now),
    };
  }

  if (period === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);

    return {
      period,
      from: startOfDay(from),
      to: endOfDay(now),
    };
  }

  if (period === "year") {
    const from = new Date(now.getFullYear(), 0, 1);

    return {
      period,
      from: startOfDay(from),
      to: endOfDay(now),
    };
  }

  if (period === "custom") {
    const fromParam = parseDateParam(searchParams.get("from"));
    const toParam = parseDateParam(searchParams.get("to"));

    if (!fromParam && !toParam) {
      return {
        period: "all" as DashboardPeriod,
        from: null,
        to: null,
      };
    }

    return {
      period,
      from: fromParam ? startOfDay(fromParam) : null,
      to: toParam ? endOfDay(toParam) : null,
    };
  }

  return {
    period: "all" as DashboardPeriod,
    from: null,
    to: null,
  };
}



function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}



function formatMonthKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}



function buildTicketsEvolution(tickets: any[], period: DashboardPeriod) {
  const useMonth =
    period === "all" ||
    period === "year" ||
    tickets.length > 120;

  const map = new Map<
    string,
    {
      label: string;
      total: number;
      open: number;
      inProgress: number;
      resolved: number;
      canceled: number;
    }
  >();

  tickets.forEach((ticket) => {
    const date = new Date(ticket.createdAt);
    const key = useMonth ? formatMonthKey(date) : formatDateKey(date);

    const current =
      map.get(key) || {
        label: key,
        total: 0,
        open: 0,
        inProgress: 0,
        resolved: 0,
        canceled: 0,
      };

    current.total += 1;

    if (ticket.status === "OPEN") {
      current.open += 1;
    }

    if (ticket.status === "IN_PROGRESS") {
      current.inProgress += 1;
    }

    if (ticket.status === "RESOLVED") {
      current.resolved += 1;
    }

    if (ticket.status === "CANCELED") {
      current.canceled += 1;
    }

    map.set(key, current);
  });

  return Array.from(map.values()).sort((a, b) =>
    a.label.localeCompare(b.label)
  );
}



function buildMapRanking(
  tickets: any[],
  getKey: (ticket: any) => string | null,
  getLabel: (ticket: any) => string
) {
  const map = new Map<
    string,
    {
      key: string;
      label: string;
      total: number;
      open: number;
      inProgress: number;
      resolved: number;
      canceled: number;
      overdue: number;
    }
  >();

  tickets.forEach((ticket) => {
    const key = getKey(ticket);

    if (!key) return;

    const current =
      map.get(key) || {
        key,
        label: getLabel(ticket),
        total: 0,
        open: 0,
        inProgress: 0,
        resolved: 0,
        canceled: 0,
        overdue: 0,
      };

    current.total += 1;

    if (ticket.status === "OPEN") {
      current.open += 1;
    }

    if (ticket.status === "IN_PROGRESS") {
      current.inProgress += 1;
    }

    if (ticket.status === "RESOLVED") {
      current.resolved += 1;
    }

    if (ticket.status === "CANCELED") {
      current.canceled += 1;
    }

    if (
      isTicketOverdue({
        status: ticket.status,
        priority: ticket.priority,
        createdAt: ticket.createdAt,
      })
    ) {
      current.overdue += 1;
    }

    map.set(key, current);
  });

  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}



function serializeTicketWithSla(ticket: any) {
  return {
    ...ticket,
    sla: getTicketSlaInfo({
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.createdAt,
    }),
  };
}



export async function GET(request: Request) {
  try {
    const user: any = await getAuthUser();

    if (user.role !== "SUPER_ADMIN" && !user.administratorId) {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }



    /* =========================================================
       FILTRO DE PERÍODO

       Exemplos de uso no frontend:

       /api/admin/dashboard?period=all
       /api/admin/dashboard?period=7d
       /api/admin/dashboard?period=30d
       /api/admin/dashboard?period=90d
       /api/admin/dashboard?period=month
       /api/admin/dashboard?period=year
       /api/admin/dashboard?period=custom&from=2026-05-01&to=2026-05-31
       ========================================================= */

    const { searchParams } = new URL(request.url);
    const dateRange = getDashboardDateRange(searchParams);



    /* =========================================================
       FILTROS POR PERFIL

       SUPER_ADMIN:
       visualiza tudo.

       ADMINISTRADORA:
       visualiza apenas dados da sua administradora.
       ========================================================= */

    const condominiumWhere: any =
      user.role === "SUPER_ADMIN"
        ? {}
        : {
            administratorId: user.administratorId,
          };

    const unitWhere: any =
      user.role === "SUPER_ADMIN"
        ? {}
        : {
            condominium: {
              administratorId: user.administratorId,
            },
          };

    const residentWhere: any =
      user.role === "SUPER_ADMIN"
        ? {}
        : {
            condominium: {
              administratorId: user.administratorId,
            },
          };

    const baseTicketWhere: any =
      user.role === "SUPER_ADMIN"
        ? {}
        : {
            condominium: {
              administratorId: user.administratorId,
            },
          };

    const createdAtWhere: any = {};

    if (dateRange.from) {
      createdAtWhere.gte = dateRange.from;
    }

    if (dateRange.to) {
      createdAtWhere.lte = dateRange.to;
    }

    const ticketWhere: any =
      Object.keys(createdAtWhere).length > 0
        ? {
            ...baseTicketWhere,
            createdAt: createdAtWhere,
          }
        : baseTicketWhere;



    /* =========================================================
       CONSULTAS PRINCIPAIS

       ETAPA 36.1:
       Os totais estruturais de condomínios, unidades e moradores
       permanecem globais da carteira.

       Os indicadores de chamados respeitam o filtro de período.
       ========================================================= */

    const [
      condominiumsCount,
      unitsCount,
      residentsCount,
      tickets,
      latestTickets,
      condominiums,
    ] = await Promise.all([
      db.condominium.count({
        where: condominiumWhere,
      }),

      db.unit.count({
        where: unitWhere,
      }),

      db.resident.count({
        where: residentWhere,
      }),

      db.ticket.findMany({
        where: ticketWhere,
        include: {
          condominium: true,
          unit: true,
          resident: true,
          assignedToUser: true,
          createdByUser: true,

          // =====================================================
          // ETAPA 20 - AVALIAÇÃO DO ATENDIMENTO
          // =====================================================
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
        },
        orderBy: {
          createdAt: "desc",
        },
      }),

      db.ticket.findMany({
        where: ticketWhere,
        take: 8,
        include: {
          condominium: true,
          unit: true,
          resident: true,
          assignedToUser: true,
          createdByUser: true,

          // =====================================================
          // ETAPA 20 - AVALIAÇÃO DO ATENDIMENTO
          // =====================================================
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
        },
        orderBy: {
          createdAt: "desc",
        },
      }),

      db.condominium.findMany({
        where: condominiumWhere,
        select: {
          id: true,
          name: true,
        },
        orderBy: {
          name: "asc",
        },
      }),
    ]);



    /* =========================================================
       MÉTRICAS DE CHAMADOS
       ========================================================= */

    const openTickets = tickets.filter((ticket) => ticket.status === "OPEN");

    const inProgressTickets = tickets.filter(
      (ticket) => ticket.status === "IN_PROGRESS"
    );

    const resolvedTickets = tickets.filter(
      (ticket) => ticket.status === "RESOLVED"
    );

    const canceledTickets = tickets.filter(
      (ticket) => ticket.status === "CANCELED"
    );

    const activeTickets = tickets.filter((ticket) =>
      ACTIVE_TICKET_STATUSES.includes(ticket.status)
    );

    /*
       ETAPA 36.1:
       Chamados sem responsável passam a considerar somente chamados ativos.
       Um chamado resolvido/cancelado sem responsável não representa pendência operacional.
    */
    const unassignedTickets = activeTickets.filter(
      (ticket) => !ticket.assignedToUserId
    );

    const overdueTickets = activeTickets.filter((ticket) =>
      isTicketOverdue({
        status: ticket.status,
        priority: ticket.priority,
        createdAt: ticket.createdAt,
      })
    );

    const nearDueTickets = activeTickets.filter((ticket) =>
      isTicketNearDue({
        status: ticket.status,
        priority: ticket.priority,
        createdAt: ticket.createdAt,
      })
    );

    const urgentTickets = activeTickets.filter(
      (ticket) => ticket.priority === "URGENT"
    );

    const highPriorityTickets = activeTickets.filter(
      (ticket) => ticket.priority === "HIGH"
    );

    const mediumPriorityTickets = activeTickets.filter(
      (ticket) => ticket.priority === "MEDIUM"
    );

    const lowPriorityTickets = activeTickets.filter(
      (ticket) => ticket.priority === "LOW"
    );



    /* =========================================================
       CHAMADOS CRÍTICOS PARA AÇÃO RÁPIDA

       Critério:
       - vencidos
       - urgentes
       - próximos do vencimento
       - sem responsável
       ========================================================= */

    const criticalTickets = activeTickets
      .filter((ticket) => {
        const sla = getTicketSlaInfo({
          status: ticket.status,
          priority: ticket.priority,
          createdAt: ticket.createdAt,
        });

        return (
          sla.isOverdue ||
          sla.isNearDue ||
          ticket.priority === "URGENT" ||
          !ticket.assignedToUserId
        );
      })
      .sort((a, b) => {
        const slaA = getTicketSlaInfo({
          status: a.status,
          priority: a.priority,
          createdAt: a.createdAt,
        });

        const slaB = getTicketSlaInfo({
          status: b.status,
          priority: b.priority,
          createdAt: b.createdAt,
        });

        if (slaA.isOverdue && !slaB.isOverdue) return -1;
        if (!slaA.isOverdue && slaB.isOverdue) return 1;

        if (a.priority === "URGENT" && b.priority !== "URGENT") return -1;
        if (a.priority !== "URGENT" && b.priority === "URGENT") return 1;

        if (slaA.isNearDue && !slaB.isNearDue) return -1;
        if (!slaA.isNearDue && slaB.isNearDue) return 1;

        return (
          new Date(a.createdAt).getTime() -
          new Date(b.createdAt).getTime()
        );
      })
      .slice(0, 8);



    /* =========================================================
       ETAPA 20 - MÉTRICAS DE AVALIAÇÃO DO ATENDIMENTO
       ========================================================= */

    const ratedTickets = tickets.filter((ticket) => ticket.rating);

    const resolvedWithoutRatingTickets = tickets.filter(
      (ticket) => ticket.status === "RESOLVED" && !ticket.rating
    );

    const ratingSum = ratedTickets.reduce((total, ticket) => {
      return total + (ticket.rating?.rating || 0);
    }, 0);

    const ratingAverage =
      ratedTickets.length > 0 ? ratingSum / ratedTickets.length : 0;

    const ratingRate =
      resolvedTickets.length > 0
        ? Math.round((ratedTickets.length / resolvedTickets.length) * 100)
        : 0;

    const latestRatings = ratedTickets
      .sort((a, b) => {
        const dateA = a.rating?.createdAt
          ? new Date(a.rating.createdAt).getTime()
          : 0;

        const dateB = b.rating?.createdAt
          ? new Date(b.rating.createdAt).getTime()
          : 0;

        return dateB - dateA;
      })
      .slice(0, 5);



    /* =========================================================
       TEMPO MÉDIO DE RESOLUÇÃO

       Observação:
       Usa resolvedAt quando disponível.
       Se algum chamado antigo não tiver resolvedAt preenchido,
       ele é ignorado no cálculo para não distorcer o indicador.
       ========================================================= */

    const resolvedTicketsWithResolvedAt = resolvedTickets.filter(
      (ticket: any) => ticket.resolvedAt
    );

    const resolutionHoursSum = resolvedTicketsWithResolvedAt.reduce(
      (total: number, ticket: any) => {
        const createdAt = new Date(ticket.createdAt).getTime();
        const resolvedAt = new Date(ticket.resolvedAt).getTime();

        if (Number.isNaN(createdAt) || Number.isNaN(resolvedAt)) {
          return total;
        }

        const diffHours = Math.max(
          0,
          Math.round((resolvedAt - createdAt) / (1000 * 60 * 60))
        );

        return total + diffHours;
      },
      0
    );

    const averageResolutionHours =
      resolvedTicketsWithResolvedAt.length > 0
        ? Math.round(
            resolutionHoursSum / resolvedTicketsWithResolvedAt.length
          )
        : 0;



    /* =========================================================
       CONDOMÍNIOS COM MAIS CHAMADOS
       ========================================================= */

    const condominiumTicketMap = new Map<
      string,
      {
        id: string;
        name: string;
        total: number;
        open: number;
        inProgress: number;
        resolved: number;
        canceled: number;
        active: number;
        overdue: number;
        nearDue: number;
        urgent: number;
        unassigned: number;
      }
    >();

    condominiums.forEach((condominium) => {
      condominiumTicketMap.set(condominium.id, {
        id: condominium.id,
        name: condominium.name,
        total: 0,
        open: 0,
        inProgress: 0,
        resolved: 0,
        canceled: 0,
        active: 0,
        overdue: 0,
        nearDue: 0,
        urgent: 0,
        unassigned: 0,
      });
    });

    tickets.forEach((ticket) => {
      if (!ticket.condominiumId) return;

      const current =
        condominiumTicketMap.get(ticket.condominiumId) ||
        {
          id: ticket.condominiumId,
          name: ticket.condominium?.name || "Condomínio",
          total: 0,
          open: 0,
          inProgress: 0,
          resolved: 0,
          canceled: 0,
          active: 0,
          overdue: 0,
          nearDue: 0,
          urgent: 0,
          unassigned: 0,
        };

      current.total += 1;

      if (ticket.status === "OPEN") {
        current.open += 1;
      }

      if (ticket.status === "IN_PROGRESS") {
        current.inProgress += 1;
      }

      if (ticket.status === "RESOLVED") {
        current.resolved += 1;
      }

      if (ticket.status === "CANCELED") {
        current.canceled += 1;
      }

      if (ACTIVE_TICKET_STATUSES.includes(ticket.status)) {
        current.active += 1;

        if (!ticket.assignedToUserId) {
          current.unassigned += 1;
        }
      }

      if (
        isTicketOverdue({
          status: ticket.status,
          priority: ticket.priority,
          createdAt: ticket.createdAt,
        })
      ) {
        current.overdue += 1;
      }

      if (
        isTicketNearDue({
          status: ticket.status,
          priority: ticket.priority,
          createdAt: ticket.createdAt,
        })
      ) {
        current.nearDue += 1;
      }

      if (ticket.priority === "URGENT") {
        current.urgent += 1;
      }

      condominiumTicketMap.set(ticket.condominiumId, current);
    });

    const topCondominiumsByTickets = Array.from(
      condominiumTicketMap.values()
    )
      .filter((item) => item.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);



    /* =========================================================
       AGRUPAMENTOS GERENCIAIS
       ========================================================= */

    const ticketsByCategory = buildMapRanking(
      tickets,
      (ticket) => ticket.category || "SEM_CATEGORIA",
      (ticket) => ticket.category || "Sem categoria"
    );

    const ticketsByPriority = buildMapRanking(
      tickets,
      (ticket) => ticket.priority || "LOW",
      (ticket) => {
        if (ticket.priority === "URGENT") return "Urgente";
        if (ticket.priority === "HIGH") return "Alta";
        if (ticket.priority === "MEDIUM") return "Média";
        if (ticket.priority === "LOW") return "Baixa";
        return "Baixa";
      }
    );

    const ticketsEvolution = buildTicketsEvolution(tickets, dateRange.period);



    /* =========================================================
       RETORNO
       ========================================================= */

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },

      filters: {
        period: dateRange.period,
        from: dateRange.from,
        to: dateRange.to,
      },

      metrics: {
        condominiums: condominiumsCount,
        units: unitsCount,
        residents: residentsCount,

        ticketsTotal: tickets.length,
        ticketsOpen: openTickets.length,
        ticketsInProgress: inProgressTickets.length,
        ticketsResolved: resolvedTickets.length,
        ticketsCanceled: canceledTickets.length,

        ticketsActive: activeTickets.length,
        ticketsUnassigned: unassignedTickets.length,
        ticketsOverdue: overdueTickets.length,

        // =====================================================
        // ETAPA 36.1 - NOVOS INDICADORES GERENCIAIS
        // =====================================================
        ticketsNearDue: nearDueTickets.length,
        ticketsUrgent: urgentTickets.length,
        ticketsHighPriority: highPriorityTickets.length,
        ticketsMediumPriority: mediumPriorityTickets.length,
        ticketsLowPriority: lowPriorityTickets.length,
        averageResolutionHours,

        // =====================================================
        // ETAPA 20 - INDICADORES DE AVALIAÇÃO
        // =====================================================
        ticketsRated: ratedTickets.length,
        ticketsResolvedWithoutRating: resolvedWithoutRatingTickets.length,
        ratingAverage: Number(ratingAverage.toFixed(1)),
        ratingRate,
      },

      latestTickets: latestTickets.map(serializeTicketWithSla),

      // =======================================================
      // ETAPA 36.1 - CHAMADOS CRÍTICOS
      // =======================================================
      criticalTickets: criticalTickets.map(serializeTicketWithSla),

      // =======================================================
      // ETAPA 20 - ÚLTIMAS AVALIAÇÕES RECEBIDAS
      // =======================================================
      latestRatings,

      topCondominiumsByTickets,

      // =======================================================
      // ETAPA 36.1 - DADOS PARA GRÁFICOS E ANÁLISES
      // =======================================================
      charts: {
        ticketsByCategory,
        ticketsByPriority,
        ticketsEvolution,
      },
    });
  } catch (error: any) {
    console.error("ERRO AO CARREGAR DASHBOARD ADMIN:", error);

    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "Não autorizado." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Erro ao carregar dashboard administrativo." },
      { status: 500 }
    );
  }
}