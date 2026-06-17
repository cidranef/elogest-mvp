import { NextResponse } from "next/server";

import { requireActiveAdminApiAccess } from "@/lib/admin-api-guard";
import {
  getOperationalAiStatus,
  logOperationalAiUsage,
} from "@/lib/ai/operational-ai";
import { db } from "@/lib/db";

const MODULE_SLUG = "ia_operacional";
const PROMPT_VERSION = "ticket-operational-ai-v1";

export type TicketAiActionType = "summary" | "suggested_response" | "next_action";

type TicketAiActionConfig = {
  actionType: TicketAiActionType;
  logAction: string;
  title: string;
};

type TicketContext = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority?: string | null;
  category?: string | null;
  scope?: string | null;
  createdAt: Date | string;
  firstResponseAt?: Date | string | null;
  resolvedAt?: Date | string | null;
  closedAt?: Date | string | null;
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
    residentType?: string | null;
  } | null;
  assignedToUser?: {
    name?: string | null;
  } | null;
  createdByUser?: {
    name?: string | null;
  } | null;
  logs?: Array<{
    action: string;
    fromValue?: string | null;
    toValue?: string | null;
    comment?: string | null;
    createdAt: Date | string;
    user?: {
      name?: string | null;
      role?: string | null;
    } | null;
  }>;
  attachments?: Array<{
    originalName: string;
    mimeType: string;
    createdAt: Date | string;
  }>;
  rating?: {
    rating: number;
    comment?: string | null;
    createdAt: Date | string;
  } | null;
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

function isFinalized(status?: string | null) {
  return status === "RESOLVED" || status === "CANCELED";
}

function getElapsedHours(createdAt: Date | string) {
  const createdAtTime = new Date(createdAt).getTime();

  if (Number.isNaN(createdAtTime)) {
    return 0;
  }

  return Math.max(0, Math.floor((Date.now() - createdAtTime) / (1000 * 60 * 60)));
}

function getSlaText(ticket: TicketContext) {
  if (isFinalized(ticket.status)) {
    return "Prazo encerrado";
  }

  const elapsedHours = getElapsedHours(ticket.createdAt);
  const remainingHours = getSlaLimitHours(ticket.priority) - elapsedHours;

  if (remainingHours <= 0) {
    return `Prazo vencido há ${Math.abs(remainingHours)}h`;
  }

  return `${remainingHours}h restantes`;
}

function getLocationText(ticket: TicketContext) {
  if (ticket.scope === "CONDOMINIUM") {
    return "Condomínio / Área comum";
  }

  if (ticket.unit?.unitNumber) {
    return `Unidade ${ticket.unit.block ? `${ticket.unit.block} - ` : ""}${ticket.unit.unitNumber}`;
  }

  return "Condomínio / Área comum";
}

function getRecommendedAction(ticket: TicketContext) {
  const elapsedHours = getElapsedHours(ticket.createdAt);
  const remainingHours = getSlaLimitHours(ticket.priority) - elapsedHours;

  if (ticket.status === "RESOLVED") {
    return "Chamado resolvido. Revise a avaliação do morador e o histórico apenas se houver solicitação de reabertura.";
  }

  if (ticket.status === "CANCELED") {
    return "Chamado cancelado. Nenhuma ação operacional pendente.";
  }

  if (!ticket.assignedToUser?.name) {
    return "Definir ou assumir um responsável para iniciar a triagem do chamado.";
  }

  if (remainingHours <= 0) {
    return "Priorizar atendimento, registrar atualização pública e acompanhar até a resolução.";
  }

  if (remainingHours <= Math.max(2, Math.ceil(getSlaLimitHours(ticket.priority) * 0.25))) {
    return "Acompanhar de perto para evitar vencimento do prazo e registrar avanço no chamado.";
  }

  if (ticket.status === "OPEN") {
    return "Iniciar atendimento ou validar se a ocorrência já deve ser encaminhada ao responsável.";
  }

  if (ticket.status === "IN_PROGRESS") {
    return "Registrar avanço público quando houver retorno e finalizar somente com mensagem de resolução.";
  }

  return "Acompanhar conforme a movimentação do chamado.";
}

function formatDateTime(value?: Date | string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("pt-BR");
}

function buildTicketInput(ticket: TicketContext) {
  const latestLogs = [...(ticket.logs || [])]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, 12)
    .map((log) => ({
      action: log.action,
      fromValue: log.fromValue,
      toValue: log.toValue,
      comment: log.comment,
      createdAt: formatDateTime(log.createdAt),
      user: log.user?.name || null,
      userRole: log.user?.role || null,
    }));

  return {
    id: ticket.id,
    title: ticket.title,
    description: ticket.description,
    status: statusLabel(ticket.status),
    priority: priorityLabel(ticket.priority),
    category: ticket.category || "-",
    scope: ticket.scope === "CONDOMINIUM" ? "Condomínio" : "Unidade",
    condominium: ticket.condominium?.name || "-",
    location: getLocationText(ticket),
    requester: ticket.resident?.name || ticket.createdByUser?.name || "-",
    assignedTo: ticket.assignedToUser?.name || "Não atribuído",
    createdAt: formatDateTime(ticket.createdAt),
    firstResponseAt: formatDateTime(ticket.firstResponseAt),
    resolvedAt: formatDateTime(ticket.resolvedAt),
    closedAt: formatDateTime(ticket.closedAt),
    sla: getSlaText(ticket),
    attachmentsCount: ticket.attachments?.length || 0,
    rating: ticket.rating
      ? {
          rating: ticket.rating.rating,
          comment: ticket.rating.comment || null,
          createdAt: formatDateTime(ticket.rating.createdAt),
        }
      : null,
    latestLogs,
  };
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

async function loadTicketContext(ticketId: string, administratorId: string) {
  return db.ticket.findFirst({
    where: {
      id: ticketId,
      condominium: {
        administratorId,
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
      resolvedAt: true,
      closedAt: true,
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
          residentType: true,
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
        take: 30,
        select: {
          action: true,
          fromValue: true,
          toValue: true,
          comment: true,
          createdAt: true,
          user: {
            select: {
              name: true,
              role: true,
            },
          },
        },
      },
      attachments: {
        orderBy: {
          createdAt: "desc",
        },
        select: {
          originalName: true,
          mimeType: true,
          createdAt: true,
        },
      },
      rating: {
        select: {
          rating: true,
          comment: true,
          createdAt: true,
        },
      },
    },
  });
}

function buildSafeFallback(actionType: TicketAiActionType, ticket: TicketContext) {
  const input = buildTicketInput(ticket);
  const nextAction = getRecommendedAction(ticket);

  if (actionType === "summary") {
    return [
      `Resumo do chamado: ${input.title}.`,
      `Condomínio: ${input.condominium}. Local: ${input.location}.`,
      `Status atual: ${input.status}. Prioridade: ${input.priority}. Prazo: ${input.sla}.`,
      `Responsável: ${input.assignedTo}.`,
      `Solicitante: ${input.requester}.`,
      `Descrição informada: ${input.description || "Sem descrição informada."}`,
      input.latestLogs.length > 0
        ? `Última movimentação: ${input.latestLogs[0].action} em ${input.latestLogs[0].createdAt}.`
        : "Ainda não há movimentações relevantes além da abertura.",
      `Próxima ação sugerida: ${nextAction}`,
    ].join("\n\n");
  }

  if (actionType === "suggested_response") {
    const greetingName = input.requester && input.requester !== "-" ? input.requester : "tudo bem";

    if (ticket.status === "RESOLVED") {
      return [
        `Olá, ${greetingName}.`,
        "Seu chamado consta como resolvido em nosso sistema.",
        "Caso a situação ainda precise de acompanhamento, por favor nos informe para que possamos reavaliar o atendimento.",
      ].join("\n\n");
    }

    if (!ticket.assignedToUser?.name) {
      return [
        `Olá, ${greetingName}.`,
        "Recebemos sua solicitação e ela está em análise pela administradora.",
        "A equipe irá direcionar o chamado para o responsável adequado e registrará novas atualizações por aqui.",
      ].join("\n\n");
    }

    return [
      `Olá, ${greetingName}.`,
      "Recebemos sua solicitação e o chamado está em acompanhamento.",
      `No momento, o atendimento está com status ${input.status.toLowerCase()} e responsável definido.`,
      "Assim que houver nova atualização ou providência concluída, registraremos a informação neste canal.",
    ].join("\n\n");
  }

  return [
    `Próxima ação sugerida: ${nextAction}`,
    `Motivo: o chamado está com status ${input.status}, prioridade ${input.priority}, prazo ${input.sla} e responsável ${input.assignedTo}.`,
    "Antes de executar qualquer ação, revise o histórico e confirme se há informação recente que ainda não foi registrada no chamado.",
  ].join("\n\n");
}

function buildPrompt(actionType: TicketAiActionType, ticket: TicketContext) {
  const input = buildTicketInput(ticket);

  const instruction =
    actionType === "summary"
      ? "Gere um resumo operacional claro do chamado em até 6 blocos curtos. Destaque status, responsável, prazo, histórico relevante e pontos de atenção."
      : actionType === "suggested_response"
        ? "Gere uma sugestão de resposta pública ao morador em linguagem cordial, objetiva e profissional. Não prometa prazo, aprovação, execução ou solução que não esteja comprovada no contexto."
        : "Gere a próxima ação operacional recomendada em linguagem objetiva. Explique o motivo e deixe claro que a decisão final é humana.";

  return [
    "Você é o assistente operacional do EloGest.",
    "Use somente os dados enviados no contexto.",
    "Não invente fatos, prazos, pagamentos, aprovações, fornecedores, visitas ou soluções.",
    "Não execute ações. Apenas sugira texto ou orientação para revisão humana.",
    "Não exponha dados de outra administradora.",
    "",
    instruction,
    "",
    "Contexto do chamado:",
    JSON.stringify(input, null, 2),
  ].join("\n");
}

async function callOpenAiForTicket(actionType: TicketAiActionType, ticket: TicketContext) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return null;
  }

  const prompt = buildPrompt(actionType, ticket);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      input: prompt,
      temperature: 0.2,
      max_output_tokens: 900,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Falha ao chamar o provedor de IA. HTTP ${response.status}: ${errorText.slice(0, 300)}`,
    );
  }

  const data = (await response.json()) as any;

  const directOutput = typeof data.output_text === "string" ? data.output_text : "";

  const nestedOutput = Array.isArray(data.output)
    ? data.output
        .flatMap((item: any) => item?.content || [])
        .map((content: any) => content?.text || "")
        .filter(Boolean)
        .join("\n")
    : "";

  const output = (directOutput || nestedOutput || "").trim();

  if (!output) {
    throw new Error("O provedor de IA não retornou texto.");
  }

  return output;
}

export async function handleTicketOperationalAiRequest(
  ticketId: string,
  config: TicketAiActionConfig,
) {
  const access = await requireActiveAdminApiAccess();

  if ("error" in access) {
    return access.error;
  }

  const { administrator } = access;

  const moduleAllowed = await getOperationalAiModuleAccess(administrator.id);

  if (!moduleAllowed) {
    await logOperationalAiUsage({
      administratorId: administrator.id,
      userId: null,
      module: MODULE_SLUG,
      action: config.logAction,
      entityType: "Ticket",
      entityId: ticketId,
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
      },
      {
        status: 403,
      },
    );
  }

  const ticket = await loadTicketContext(ticketId, administrator.id);

  if (!ticket) {
    return NextResponse.json(
      {
        ok: false,
        message: "Chamado não encontrado para a administradora ativa.",
      },
      {
        status: 404,
      },
    );
  }

  const status = getOperationalAiStatus();
  const input = buildTicketInput(ticket);

  try {
    const aiOutput = status.enabled
      ? await callOpenAiForTicket(config.actionType, ticket)
      : null;

    const output = aiOutput || buildSafeFallback(config.actionType, ticket);

    await logOperationalAiUsage({
      administratorId: administrator.id,
      userId: null,
      module: MODULE_SLUG,
      action: config.logAction,
      entityType: "Ticket",
      entityId: ticket.id,
      promptVersion: PROMPT_VERSION,
      status: aiOutput ? "SUCCESS" : "SKIPPED",
      input,
      output,
    });

    return NextResponse.json({
      ok: true,
      moduleEnabled: true,
      aiEnabled: status.enabled,
      provider: status.provider,
      actionType: config.actionType,
      title: config.title,
      content: output,
      message: aiOutput
        ? "Análise gerada pela IA Operacional."
        : status.reason ?? "IA não configurada no ambiente.",
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Erro desconhecido ao gerar análise.";

    const fallbackOutput = buildSafeFallback(config.actionType, ticket);

    await logOperationalAiUsage({
      administratorId: administrator.id,
      userId: null,
      module: MODULE_SLUG,
      action: config.logAction,
      entityType: "Ticket",
      entityId: ticket.id,
      promptVersion: PROMPT_VERSION,
      status: "ERROR",
      input,
      output: fallbackOutput,
      errorMessage,
    });

    return NextResponse.json({
      ok: true,
      moduleEnabled: true,
      aiEnabled: false,
      provider: "none",
      actionType: config.actionType,
      title: config.title,
      content: fallbackOutput,
      message:
        "Não foi possível usar o provedor de IA. Uma leitura operacional segura foi gerada com base nos dados do chamado.",
    });
  }
}
