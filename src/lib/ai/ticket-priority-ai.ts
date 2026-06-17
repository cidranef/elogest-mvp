import { TicketStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireActiveAdminApiAccess } from "@/lib/admin-api-guard";
import {
  getOperationalAiStatus,
  logOperationalAiUsage,
} from "@/lib/ai/operational-ai";
import { db } from "@/lib/db";

/* =========================================================
   ETAPA 55.4 — IA PARA PRIORIZAÇÃO OPERACIONAL

   Regras:
   - A IA sugere prioridade operacional da fila.
   - A IA não altera prioridade salva no banco.
   - A IA não atribui responsável.
   - A IA não altera status.
   - A IA não executa ação crítica.
   ========================================================= */

const MODULE_SLUG = "ia_operacional";
const PROMPT_VERSION = "ticket-priority-ai-v1";

const ACTIVE_STATUSES: TicketStatus[] = [
  TicketStatus.OPEN,
  TicketStatus.IN_PROGRESS,
];

type PriorityLevel = "BAIXA" | "MEDIA" | "ALTA" | "CRITICA";

type TicketPriorityContext = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority?: string | null;
  category?: string | null;
  scope?: string | null;
  createdAt: Date | string;
  firstResponseAt?: Date | string | null;
  condominium?: {
    id?: string;
    name?: string | null;
  } | null;
  unit?: {
    block?: string | null;
    unitNumber?: string | null;
  } | null;
  resident?: {
    name?: string | null;
  } | null;
  assignedToUser?: {
    name?: string | null;
  } | null;
  createdByUser?: {
    name?: string | null;
  } | null;
  logs?: Array<{
    action: string;
    createdAt: Date | string;
    comment?: string | null;
  }>;
};

type RankedTicket = {
  ticketId: string;
  title: string;
  condominiumName: string;
  location: string;
  status: string;
  currentPriority: string;
  suggestedPriority: PriorityLevel;
  score: number;
  reasons: string[];
  nextAction: string;
  createdAt: string;
  assignedTo: string;
};

function statusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    OPEN: "Aberto",
    IN_PROGRESS: "Em andamento",
    RESOLVED: "Resolvido",
    CANCELED: "Cancelado",
  };

  return labels[status || ""] || status || "-";
}

function priorityLabel(priority?: string | null) {
  const labels: Record<string, string> = {
    LOW: "Baixa",
    MEDIUM: "Média",
    HIGH: "Alta",
    URGENT: "Urgente",
  };

  return labels[priority || ""] || priority || "-";
}

function getSlaLimitHours(priority?: string | null) {
  if (priority === "URGENT") return 4;
  if (priority === "HIGH") return 24;
  if (priority === "MEDIUM") return 48;

  return 72;
}

function getElapsedHours(createdAt: Date | string) {
  const createdAtTime = new Date(createdAt).getTime();

  if (Number.isNaN(createdAtTime)) {
    return 0;
  }

  return Math.max(0, Math.floor((Date.now() - createdAtTime) / (1000 * 60 * 60)));
}

function getLastMovementHours(ticket: TicketPriorityContext) {
  const logs = ticket.logs || [];

  if (logs.length === 0) {
    return getElapsedHours(ticket.createdAt);
  }

  const latestLog = [...logs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0];

  return getElapsedHours(latestLog.createdAt);
}

function getRemainingHours(ticket: TicketPriorityContext) {
  return getSlaLimitHours(ticket.priority) - getElapsedHours(ticket.createdAt);
}

function formatDateTime(value?: Date | string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("pt-BR");
}

function getLocationText(ticket: TicketPriorityContext) {
  if (ticket.scope === "CONDOMINIUM") {
    return "Condomínio / Área comum";
  }

  if (ticket.unit?.unitNumber) {
    return `Unidade ${ticket.unit.block ? `${ticket.unit.block} - ` : ""}${ticket.unit.unitNumber}`;
  }

  return "Condomínio / Área comum";
}

function getCategoryKey(ticket: TicketPriorityContext) {
  return `${ticket.condominium?.id || "sem-condominio"}::${ticket.category || "sem-categoria"}`;
}

function getSuggestedPriority(score: number): PriorityLevel {
  if (score >= 85) return "CRITICA";
  if (score >= 60) return "ALTA";
  if (score >= 35) return "MEDIA";
  return "BAIXA";
}

function getNextAction(ticket: TicketPriorityContext, reasons: string[]) {
  const remainingHours = getRemainingHours(ticket);

  if (!ticket.assignedToUser?.name) {
    return "Definir ou assumir responsável antes de qualquer nova movimentação.";
  }

  if (remainingHours <= 0) {
    return "Priorizar atendimento, registrar atualização pública e acompanhar até a resolução.";
  }

  if (ticket.status === "OPEN") {
    return "Iniciar atendimento ou validar encaminhamento com o responsável.";
  }

  if (reasons.some((reason) => reason.toLowerCase().includes("sem movimentação"))) {
    return "Registrar atualização no chamado para reduzir risco de paralisação operacional.";
  }

  return "Manter acompanhamento e registrar nova atualização quando houver avanço.";
}

function rankTickets(tickets: TicketPriorityContext[]): RankedTicket[] {
  const categoryVolumeMap = new Map<string, number>();

  tickets.forEach((ticket) => {
    const key = getCategoryKey(ticket);
    categoryVolumeMap.set(key, (categoryVolumeMap.get(key) || 0) + 1);
  });

  return tickets
    .map((ticket) => {
      const reasons: string[] = [];
      let score = 0;

      const elapsedHours = getElapsedHours(ticket.createdAt);
      const remainingHours = getRemainingHours(ticket);
      const lastMovementHours = getLastMovementHours(ticket);
      const categoryVolume = categoryVolumeMap.get(getCategoryKey(ticket)) || 0;

      if (ticket.priority === "URGENT") {
        score += 30;
        reasons.push("Prioridade atual marcada como urgente.");
      } else if (ticket.priority === "HIGH") {
        score += 20;
        reasons.push("Prioridade atual marcada como alta.");
      } else if (ticket.priority === "MEDIUM") {
        score += 10;
      }

      if (remainingHours <= 0) {
        score += 35;
        reasons.push(`Prazo operacional vencido há ${Math.abs(remainingHours)}h.`);
      } else if (remainingHours <= Math.max(2, Math.ceil(getSlaLimitHours(ticket.priority) * 0.25))) {
        score += 20;
        reasons.push(`Prazo próximo do limite: ${remainingHours}h restantes.`);
      }

      if (!ticket.assignedToUser?.name) {
        score += 25;
        reasons.push("Chamado ativo sem responsável definido.");
      }

      if (ticket.status === "OPEN") {
        score += 12;
        reasons.push("Chamado ainda aguardando início do atendimento.");
      }

      if (lastMovementHours >= 48) {
        score += 18;
        reasons.push(`Sem movimentação relevante há ${lastMovementHours}h.`);
      } else if (lastMovementHours >= 24) {
        score += 10;
        reasons.push(`Sem movimentação relevante há ${lastMovementHours}h.`);
      }

      if (elapsedHours >= 96) {
        score += 12;
        reasons.push(`Chamado aberto há ${elapsedHours}h.`);
      }

      if (categoryVolume >= 3 && ticket.category) {
        score += 10;
        reasons.push(`Há ${categoryVolume} chamado(s) ativos da mesma categoria neste condomínio.`);
      }

      if (ticket.scope === "CONDOMINIUM") {
        score += 8;
        reasons.push("Ocorrência vinculada ao condomínio ou área comum.");
      }

      if (reasons.length === 0) {
        reasons.push("Chamado ativo sem alerta crítico identificado.");
      }

      const normalizedScore = Math.min(100, score);
      const suggestedPriority = getSuggestedPriority(normalizedScore);

      return {
        ticketId: ticket.id,
        title: ticket.title,
        condominiumName: ticket.condominium?.name || "Condomínio não informado",
        location: getLocationText(ticket),
        status: statusLabel(ticket.status),
        currentPriority: priorityLabel(ticket.priority),
        suggestedPriority,
        score: normalizedScore,
        reasons,
        nextAction: getNextAction(ticket, reasons),
        createdAt: formatDateTime(ticket.createdAt),
        assignedTo: ticket.assignedToUser?.name || "Não atribuído",
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

function buildFallbackAnalysis(items: RankedTicket[]) {
  if (items.length === 0) {
    return "Não há chamados ativos suficientes para uma priorização operacional neste momento.";
  }

  const critical = items.filter((item) => item.suggestedPriority === "CRITICA").length;
  const high = items.filter((item) => item.suggestedPriority === "ALTA").length;
  const unassigned = items.filter((item) => item.assignedTo === "Não atribuído").length;

  const lines = [
    `Foram identificados ${items.length} chamado(s) com maior necessidade de acompanhamento na fila ativa.`,
  ];

  if (critical > 0) {
    lines.push(`${critical} chamado(s) aparecem como prioridade crítica pela combinação de prazo, idade, responsabilidade ou risco operacional.`);
  }

  if (high > 0) {
    lines.push(`${high} chamado(s) aparecem como prioridade alta e devem ser acompanhados pela equipe.`);
  }

  if (unassigned > 0) {
    lines.push(`${unassigned} chamado(s) priorizado(s) ainda estão sem responsável definido.`);
  }

  lines.push("A análise é assistiva e não substitui a avaliação da administradora.");

  return lines.join("\n");
}

function buildAiInput(items: RankedTicket[]) {
  return items.map((item) => ({
    ticketId: item.ticketId,
    title: item.title,
    condominiumName: item.condominiumName,
    location: item.location,
    status: item.status,
    currentPriority: item.currentPriority,
    suggestedPriority: item.suggestedPriority,
    score: item.score,
    reasons: item.reasons,
    nextAction: item.nextAction,
    assignedTo: item.assignedTo,
    createdAt: item.createdAt,
  }));
}

function buildPrompt(items: RankedTicket[]) {
  return [
    "Você é o assistente operacional do EloGest.",
    "Use somente os dados enviados no contexto.",
    "Não invente fatos, prazos, fornecedores, visitas ou soluções.",
    "Não execute ações. Apenas gere uma leitura executiva para revisão humana.",
    "Não altere a prioridade oficial do chamado. A prioridade sugerida é apenas operacional.",
    "Escreva em português do Brasil, com tom profissional, claro e objetivo.",
    "Gere uma leitura executiva em até 5 frases curtas sobre a priorização da fila.",
    "Destaque riscos, chamados sem responsável e pontos que merecem ação da administradora.",
    "",
    "Contexto da priorização:",
    JSON.stringify(buildAiInput(items), null, 2),
  ].join("\n");
}

async function callOpenAiForPriority(items: RankedTicket[]) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey || items.length === 0) {
    return null;
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      input: buildPrompt(items),
      temperature: 0.2,
      max_output_tokens: 700,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Falha ao chamar o provedor de IA. HTTP ${response.status}: ${errorText.slice(0, 300)}`,
    );
  }

  const data = (await response.json()) as {
    output_text?: unknown;
    output?: Array<{
      content?: Array<{
        text?: unknown;
      }>;
    }>;
  };

  const directOutput = typeof data.output_text === "string" ? data.output_text : "";

  const nestedOutput = Array.isArray(data.output)
    ? data.output
        .flatMap((item) => item.content || [])
        .map((content) => (typeof content.text === "string" ? content.text : ""))
        .filter(Boolean)
        .join("\n")
    : "";

  const output = (directOutput || nestedOutput || "").trim();

  if (!output) {
    throw new Error("O provedor de IA não retornou texto.");
  }

  return output;
}

async function getOperationalAiModuleAccess(administratorId: string) {
  const administrator = await db.administrator.findUnique({
    where: {
      id: administratorId,
    },
    select: {
      id: true,
      plan: {
        select: {
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
              status: true,
            },
          },
        },
      },
    },
  });

  if (!administrator) {
    return false;
  }

  const override = administrator.moduleOverrides[0];

  if (override) {
    return override.enabled && override.module.status === "ACTIVE";
  }

  const planModule = administrator.plan?.modules[0];

  if (!planModule) {
    return false;
  }

  return planModule.enabled && planModule.module.status === "ACTIVE";
}

async function loadActiveTickets(administratorId: string, condominiumId?: string | null) {
  return db.ticket.findMany({
    where: {
      status: {
        in: ACTIVE_STATUSES,
      },
      condominium: {
        administratorId,
        ...(condominiumId
          ? {
              id: condominiumId,
            }
          : {}),
      },
    },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      category: true,
      scope: true,
      createdAt: true,
      firstResponseAt: true,
      condominium: {
        select: {
          id: true,
          name: true,
        },
      },
      unit: {
        select: {
          block: true,
          unitNumber: true,
        },
      },
      resident: {
        select: {
          name: true,
        },
      },
      assignedToUser: {
        select: {
          name: true,
        },
      },
      createdByUser: {
        select: {
          name: true,
        },
      },
      logs: {
        orderBy: {
          createdAt: "desc",
        },
        take: 10,
        select: {
          action: true,
          comment: true,
          createdAt: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
    take: 100,
  });
}

export async function handleTicketPriorityAiRequest(request: Request) {
  const access = await requireActiveAdminApiAccess();

  if ("error" in access) {
    return access.error;
  }

  const { administrator } = access;
  const url = new URL(request.url);
  const condominiumId = url.searchParams.get("condominiumId");

  const moduleAllowed = await getOperationalAiModuleAccess(administrator.id);

  if (!moduleAllowed) {
    await logOperationalAiUsage({
      administratorId: administrator.id,
      userId: null,
      module: MODULE_SLUG,
      action: "TICKET_PRIORITY_ANALYSIS",
      entityType: "Ticket",
      entityId: condominiumId || null,
      promptVersion: PROMPT_VERSION,
      status: "SKIPPED",
      output: "O módulo IA Operacional não está disponível no plano atual.",
    });

    return NextResponse.json(
      {
        ok: false,
        moduleEnabled: false,
        aiEnabled: false,
        provider: "none",
        message: "O módulo IA Operacional não está disponível no plano atual.",
        items: [],
      },
      {
        status: 403,
      },
    );
  }

  const tickets = await loadActiveTickets(administrator.id, condominiumId);
  const rankedTickets = rankTickets(tickets);
  const status = getOperationalAiStatus();
  const input = buildAiInput(rankedTickets);

  try {
    const aiAnalysis = status.enabled
      ? await callOpenAiForPriority(rankedTickets)
      : null;

    const analysis = aiAnalysis || buildFallbackAnalysis(rankedTickets);

    await logOperationalAiUsage({
      administratorId: administrator.id,
      userId: null,
      module: MODULE_SLUG,
      action: "TICKET_PRIORITY_ANALYSIS",
      entityType: "Ticket",
      entityId: condominiumId || null,
      promptVersion: PROMPT_VERSION,
      status: aiAnalysis ? "SUCCESS" : "SKIPPED",
      input,
      output: analysis,
    });

    return NextResponse.json({
      ok: true,
      moduleEnabled: true,
      aiEnabled: status.enabled,
      provider: status.provider,
      message: aiAnalysis
        ? "Priorização gerada pela IA Operacional."
        : status.reason ?? "IA não configurada no ambiente.",
      analysis,
      items: rankedTickets,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Erro desconhecido ao gerar priorização.";

    const analysis = buildFallbackAnalysis(rankedTickets);

    await logOperationalAiUsage({
      administratorId: administrator.id,
      userId: null,
      module: MODULE_SLUG,
      action: "TICKET_PRIORITY_ANALYSIS",
      entityType: "Ticket",
      entityId: condominiumId || null,
      promptVersion: PROMPT_VERSION,
      status: "ERROR",
      input,
      output: analysis,
      errorMessage,
    });

    return NextResponse.json({
      ok: true,
      moduleEnabled: true,
      aiEnabled: false,
      provider: "none",
      message:
        "Não foi possível usar o provedor de IA. Uma priorização segura foi gerada com base nos dados da fila.",
      analysis,
      items: rankedTickets,
    });
  }
}
