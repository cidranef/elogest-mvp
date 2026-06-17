import { NextResponse } from "next/server";

import {
  getOperationalAiStatus,
  logOperationalAiUsage,
} from "@/lib/ai/operational-ai";
import { requireActiveAdminApiAccess } from "@/lib/admin-api-guard";
import { db } from "@/lib/db";

const MODULE_SLUG = "ia_operacional";
const PROMPT_VERSION = "etapa55_2_resumo_operacional_v1";

type OperationalMetric = {
  label: string;
  value: number | string;
  description: string;
};

type OperationalInsight = {
  title: string;
  description: string;
  tone: "neutral" | "success" | "warning" | "danger";
};

type TicketForAnalysis = {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  createdAt: Date;
  condominiumId: string;
  assignedToUserId: string | null;
  condominium: {
    id: string;
    name: string;
  } | null;
};

function isActiveTicket(status: string) {
  return status === "OPEN" || status === "IN_PROGRESS";
}

function getSlaLimitHours(priority?: string | null) {
  if (priority === "URGENT") return 4;
  if (priority === "HIGH") return 24;
  if (priority === "MEDIUM") return 48;
  return 72;
}

function isTicketOverdue(ticket: {
  status: string;
  priority?: string | null;
  createdAt: Date;
}) {
  if (!isActiveTicket(ticket.status)) {
    return false;
  }

  const createdAt = new Date(ticket.createdAt).getTime();
  const elapsedHours = Math.floor((Date.now() - createdAt) / (1000 * 60 * 60));
  const remainingHours = getSlaLimitHours(ticket.priority) - elapsedHours;

  return remainingHours <= 0;
}

function dateDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

async function getOperationalAiModuleAccess(administratorId: string) {
  const administrator = await db.administrator.findUnique({
    where: {
      id: administratorId,
    },
    select: {
      id: true,
      planId: true,
      plan: {
        select: {
          id: true,
          modules: {
            where: {
              module: {
                slug: MODULE_SLUG,
              },
            },
            select: {
              enabled: true,
              module: {
                select: {
                  id: true,
                  slug: true,
                  name: true,
                  status: true,
                },
              },
            },
          },
        },
      },
      moduleOverrides: {
        where: {
          module: {
            slug: MODULE_SLUG,
          },
        },
        select: {
          enabled: true,
          module: {
            select: {
              id: true,
              slug: true,
              name: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!administrator) {
    return {
      allowed: false,
      source: "none" as const,
    };
  }

  const override = administrator.moduleOverrides[0];

  if (override) {
    return {
      allowed: override.enabled && override.module.status === "ACTIVE",
      source: "override" as const,
    };
  }

  const planModule = administrator.plan?.modules[0];

  if (!planModule) {
    return {
      allowed: false,
      source: "plan" as const,
    };
  }

  return {
    allowed: planModule.enabled && planModule.module.status === "ACTIVE",
    source: "plan" as const,
  };
}

function buildCondominiumRanking(tickets: TicketForAnalysis[]) {
  const map = new Map<
    string,
    {
      id: string;
      name: string;
      total: number;
      active: number;
      overdue: number;
    }
  >();

  tickets.forEach((ticket) => {
    const key = ticket.condominiumId;
    const current =
      map.get(key) ||
      {
        id: key,
        name: ticket.condominium?.name || "Condomínio",
        total: 0,
        active: 0,
        overdue: 0,
      };

    current.total += 1;

    if (isActiveTicket(ticket.status)) {
      current.active += 1;
    }

    if (isTicketOverdue(ticket)) {
      current.overdue += 1;
    }

    map.set(key, current);
  });

  return Array.from(map.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
}

function buildRuleBasedInsights(input: {
  totalTickets: number;
  activeTickets: number;
  openTickets: number;
  inProgressTickets: number;
  overdueTickets: number;
  unassignedTickets: number;
  ticketsLast7Days: number;
  condominiumRanking: ReturnType<typeof buildCondominiumRanking>;
}) {
  const insights: OperationalInsight[] = [];

  if (input.overdueTickets > 0) {
    insights.push({
      title: "Priorizar chamados com prazo vencido",
      description: `${input.overdueTickets} chamado(s) ativo(s) já ultrapassaram o prazo operacional esperado. Recomenda-se revisar primeiro os casos urgentes e sem responsável.`,
      tone: "danger",
    });
  }

  if (input.unassignedTickets > 0) {
    insights.push({
      title: "Atribuir responsáveis",
      description: `${input.unassignedTickets} chamado(s) ativo(s) ainda estão sem responsável definido. A atribuição reduz risco de atraso e melhora a rastreabilidade.`,
      tone: "warning",
    });
  }

  if (input.openTickets > 0) {
    insights.push({
      title: "Realizar triagem dos novos chamados",
      description: `${input.openTickets} chamado(s) ainda aguardam triagem inicial. A primeira análise ajuda a separar urgências, recorrências e demandas simples.`,
      tone: "warning",
    });
  }

  const mainCondominium = input.condominiumRanking[0];

  if (mainCondominium) {
    insights.push({
      title: "Acompanhar condomínio com maior demanda",
      description: `${mainCondominium.name} concentra ${mainCondominium.total} chamado(s) no período analisado, sendo ${mainCondominium.active} ativo(s) e ${mainCondominium.overdue} com prazo vencido.`,
      tone: mainCondominium.overdue > 0 ? "warning" : "neutral",
    });
  }

  if (input.ticketsLast7Days > 0) {
    insights.push({
      title: "Monitorar entradas recentes",
      description: `${input.ticketsLast7Days} chamado(s) foram abertos nos últimos 7 dias. Acompanhe se há concentração por condomínio ou tipo de ocorrência.`,
      tone: "neutral",
    });
  }

  if (insights.length === 0) {
    insights.push({
      title: "Operação sem alertas críticos",
      description:
        "Não foram identificados chamados ativos vencidos, sem responsável ou aguardando triagem neste momento.",
      tone: "success",
    });
  }

  return insights.slice(0, 5);
}

function buildExecutiveSummary(input: {
  activeTickets: number;
  overdueTickets: number;
  unassignedTickets: number;
  condominiumRanking: ReturnType<typeof buildCondominiumRanking>;
}) {
  const mainCondominium = input.condominiumRanking[0];

  if (input.activeTickets === 0) {
    return "A carteira não possui chamados ativos no momento. A operação está sem fila aberta para acompanhamento imediato.";
  }

  const parts = [
    `A carteira possui ${input.activeTickets} chamado(s) ativo(s).`,
  ];

  if (input.overdueTickets > 0) {
    parts.push(`${input.overdueTickets} estão com prazo vencido.`);
  }

  if (input.unassignedTickets > 0) {
    parts.push(`${input.unassignedTickets} ainda não têm responsável definido.`);
  }

  if (mainCondominium) {
    parts.push(`${mainCondominium.name} aparece como principal ponto de demanda no período analisado.`);
  }

  return parts.join(" ");
}

function buildPayloadForAi(input: {
  administratorName: string;
  metrics: OperationalMetric[];
  insights: OperationalInsight[];
  condominiumRanking: ReturnType<typeof buildCondominiumRanking>;
}) {
  return {
    administratorName: input.administratorName,
    metrics: input.metrics,
    condominiumRanking: input.condominiumRanking,
    detectedInsights: input.insights,
    instruction:
      "Gere uma análise operacional curta, objetiva e segura. Não invente dados. Use apenas os números enviados. Não afirme que uma ação foi executada. Trate tudo como sugestão gerencial.",
  };
}

async function tryGenerateAiSummary(payload: ReturnType<typeof buildPayloadForAi>) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return null;
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Você é o assistente operacional do EloGest. Responda em português do Brasil, com linguagem clara, profissional e prudente. Não invente dados e não execute ações.",
        },
        {
          role: "user",
          content: JSON.stringify(payload),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Falha ao consultar provedor de IA: ${response.status}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const content = data.choices?.[0]?.message?.content?.trim();

  return content || null;
}

export async function GET() {
  const access = await requireActiveAdminApiAccess();

  if ("error" in access) {
    return access.error;
  }

  const { administrator } = access;

  const moduleAccess = await getOperationalAiModuleAccess(administrator.id);

  if (!moduleAccess.allowed) {
    await logOperationalAiUsage({
      administratorId: administrator.id,
      userId: null,
      module: MODULE_SLUG,
      action: "DASHBOARD_OPERATIONAL_SUMMARY",
      promptVersion: PROMPT_VERSION,
      status: "SKIPPED",
      output: "O módulo IA Operacional não está disponível no plano atual.",
    });

    return NextResponse.json(
      {
        ok: false,
        moduleEnabled: false,
        aiEnabled: false,
        message: "O módulo IA Operacional não está disponível no plano atual.",
      },
      {
        status: 403,
      },
    );
  }

  const since7Days = dateDaysAgo(7);
  const since30Days = dateDaysAgo(30);

  const [administratorRecord, tickets] = await Promise.all([
    db.administrator.findUnique({
      where: {
        id: administrator.id,
      },
      select: {
        id: true,
        name: true,
      },
    }),

    db.ticket.findMany({
      where: {
        condominium: {
          administratorId: administrator.id,
        },
        createdAt: {
          gte: since30Days,
        },
      },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        createdAt: true,
        condominiumId: true,
        assignedToUserId: true,
        condominium: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 500,
    }),
  ]);

  const typedTickets = tickets as TicketForAnalysis[];

  const totalTickets = typedTickets.length;
  const activeTickets = typedTickets.filter((ticket) =>
    isActiveTicket(ticket.status)
  ).length;
  const openTickets = typedTickets.filter(
    (ticket) => ticket.status === "OPEN"
  ).length;
  const inProgressTickets = typedTickets.filter(
    (ticket) => ticket.status === "IN_PROGRESS"
  ).length;
  const resolvedTickets = typedTickets.filter(
    (ticket) => ticket.status === "RESOLVED"
  ).length;
  const overdueTickets = typedTickets.filter((ticket) =>
    isTicketOverdue(ticket)
  ).length;
  const unassignedTickets = typedTickets.filter((ticket) => {
    return isActiveTicket(ticket.status) && !ticket.assignedToUserId;
  }).length;
  const ticketsLast7Days = typedTickets.filter((ticket) => {
    return new Date(ticket.createdAt).getTime() >= since7Days.getTime();
  }).length;

  const condominiumRanking = buildCondominiumRanking(typedTickets);

  const metrics: OperationalMetric[] = [
    {
      label: "Chamados Ativos",
      value: activeTickets,
      description: "Abertos ou em atendimento nos últimos 30 dias.",
    },
    {
      label: "Prazo Vencido",
      value: overdueTickets,
      description: "Chamados ativos fora do prazo operacional esperado.",
    },
    {
      label: "Sem Responsável",
      value: unassignedTickets,
      description: "Chamados ativos ainda sem atribuição.",
    },
    {
      label: "Novos Em 7 Dias",
      value: ticketsLast7Days,
      description: "Chamados criados na última semana.",
    },
  ];

  const insights = buildRuleBasedInsights({
    totalTickets,
    activeTickets,
    openTickets,
    inProgressTickets,
    overdueTickets,
    unassignedTickets,
    ticketsLast7Days,
    condominiumRanking,
  });

  const executiveSummary = buildExecutiveSummary({
    activeTickets,
    overdueTickets,
    unassignedTickets,
    condominiumRanking,
  });

  const aiStatus = getOperationalAiStatus();

  const payloadForAi = buildPayloadForAi({
    administratorName: administratorRecord?.name || "Administradora",
    metrics,
    insights,
    condominiumRanking,
  });

  let aiText: string | null = null;
  let aiErrorMessage: string | null = null;

  if (aiStatus.enabled) {
    try {
      aiText = await tryGenerateAiSummary(payloadForAi);
    } catch (error) {
      aiErrorMessage =
        error instanceof Error
          ? error.message
          : "Erro desconhecido ao gerar análise com IA.";
    }
  }

  const finalSummary = aiText || executiveSummary;
  const logStatus = aiText ? "SUCCESS" : aiErrorMessage ? "ERROR" : "SKIPPED";

  await logOperationalAiUsage({
    administratorId: administrator.id,
    userId: null,
    module: MODULE_SLUG,
    action: "DASHBOARD_OPERATIONAL_SUMMARY",
    promptVersion: PROMPT_VERSION,
    status: logStatus,
    input: payloadForAi,
    output: finalSummary,
    errorMessage: aiErrorMessage,
  });

  return NextResponse.json({
    ok: true,
    moduleEnabled: true,
    aiEnabled: Boolean(aiText),
    provider: aiText ? aiStatus.provider : "none",
    generatedAt: new Date().toISOString(),
    period: {
      label: "Últimos 30 dias",
      from: since30Days.toISOString(),
      to: new Date().toISOString(),
    },
    summary: finalSummary,
    fallbackUsed: !aiText,
    fallbackReason: aiText
      ? null
      : aiErrorMessage || aiStatus.reason || "Análise operacional automática gerada sem provedor de IA.",
    metrics,
    insights,
    condominiumRanking,
    totals: {
      totalTickets,
      activeTickets,
      openTickets,
      inProgressTickets,
      resolvedTickets,
      overdueTickets,
      unassignedTickets,
      ticketsLast7Days,
    },
    notice:
      "Análise assistiva baseada nos dados disponíveis. Revise as informações antes de tomar decisões operacionais.",
  });
}
