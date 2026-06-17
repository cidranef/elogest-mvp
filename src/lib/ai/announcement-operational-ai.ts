import { NextResponse } from "next/server";

import { requireActiveAdminApiAccess } from "@/lib/admin-api-guard";
import {
  getOperationalAiStatus,
  logOperationalAiUsage,
} from "@/lib/ai/operational-ai";
import { db } from "@/lib/db";

/* =========================================================
   ETAPA 55.5 — IA PARA COMUNICADOS

   Regras:
   - A IA apoia redação, resumo e lembrete.
   - A IA não publica comunicado.
   - A IA não agenda comunicado.
   - A IA não envia lembrete automaticamente.
   - A administradora deve revisar antes de salvar/publicar/enviar.
   ========================================================= */

const MODULE_SLUG = "ia_operacional";
const PROMPT_VERSION = "announcement-operational-ai-v1";

type AnnouncementAiAction = "IMPROVE" | "SUMMARY" | "REMINDER";

type AnnouncementAiInput = {
  title?: unknown;
  content?: unknown;
  type?: unknown;
  priority?: unknown;
  targetScope?: unknown;
  condominiumName?: unknown;
  eventStartAt?: unknown;
  eventEndAt?: unknown;
  expiresAt?: unknown;
  requireReadingConfirmation?: unknown;
};

type AnnouncementAiOutput = {
  title?: string | null;
  content?: string | null;
  output?: string | null;
};

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asBoolean(value: unknown) {
  return value === true;
}

function normalizeInput(input: AnnouncementAiInput) {
  return {
    title: asText(input.title),
    content: asText(input.content),
    type: asText(input.type) || "GENERAL",
    priority: asText(input.priority) || "NORMAL",
    targetScope: asText(input.targetScope) || "CONDOMINIUM",
    condominiumName: asText(input.condominiumName) || null,
    eventStartAt: asText(input.eventStartAt) || null,
    eventEndAt: asText(input.eventEndAt) || null,
    expiresAt: asText(input.expiresAt) || null,
    requireReadingConfirmation: asBoolean(input.requireReadingConfirmation),
  };
}

function typeLabel(type?: string | null) {
  const labels: Record<string, string> = {
    GENERAL: "Geral",
    MAINTENANCE: "Manutenção",
    ASSEMBLY: "Assembleia",
    FINANCIAL: "Financeiro",
    SECURITY: "Segurança",
    EMERGENCY: "Emergência",
    GOVERNANCE: "Governança",
  };

  return labels[type || ""] || type || "Geral";
}

function priorityLabel(priority?: string | null) {
  const labels: Record<string, string> = {
    LOW: "Baixa",
    NORMAL: "Normal",
    HIGH: "Alta",
    URGENT: "Urgente",
  };

  return labels[priority || ""] || priority || "Normal";
}

function targetScopeLabel(scope?: string | null) {
  const labels: Record<string, string> = {
    ALL_ADMINISTRATOR: "Toda a carteira",
    CONDOMINIUM: "Condomínio",
    BLOCK: "Bloco",
    UNIT: "Unidade",
    ROLE: "Perfil de acesso",
    LINK_TYPE: "Tipo de vínculo",
    CUSTOM: "Personalizado",
  };

  return labels[scope || ""] || scope || "Condomínio";
}

function formatDateTime(value?: string | null) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("pt-BR");
}

function buildContextText(input: ReturnType<typeof normalizeInput>) {
  const lines = [
    `Título atual: ${input.title || "Não informado"}`,
    `Conteúdo atual: ${input.content || "Não informado"}`,
    `Tipo: ${typeLabel(input.type)}`,
    `Prioridade: ${priorityLabel(input.priority)}`,
    `Público-alvo: ${targetScopeLabel(input.targetScope)}`,
    `Condomínio: ${input.condominiumName || "Não especificado"}`,
    `Início previsto: ${formatDateTime(input.eventStartAt) || "Não informado"}`,
    `Término previsto: ${formatDateTime(input.eventEndAt) || "Não informado"}`,
    `Expiração: ${formatDateTime(input.expiresAt) || "Não informada"}`,
    `Exige confirmação de leitura: ${input.requireReadingConfirmation ? "Sim" : "Não"}`,
  ];

  return lines.join("\n");
}

function buildPrompt(action: AnnouncementAiAction, input: ReturnType<typeof normalizeInput>) {
  const baseRules = [
    "Você é o assistente de redação operacional do EloGest.",
    "Use somente os dados enviados no contexto.",
    "Não invente datas, horários, valores, responsáveis, serviços, fornecedores ou promessas.",
    "Não diga que algo foi aprovado, executado, pago, resolvido ou confirmado se isso não estiver no contexto.",
    "Não publique, não agende e não envie nada. Apenas gere texto para revisão humana.",
    "Escreva em português do Brasil, com tom profissional, claro, cordial e objetivo.",
    "Evite termos técnicos visíveis ao morador.",
    "Preserve dados objetivos informados pelo usuário.",
  ];

  const taskByAction: Record<AnnouncementAiAction, string[]> = {
    IMPROVE: [
      "Tarefa: melhorar o comunicado.",
      "Retorne um JSON válido com as chaves title e content.",
      "O title deve ter até 90 caracteres.",
      "O content deve ser claro, organizado e pronto para revisão da administradora.",
    ],
    SUMMARY: [
      "Tarefa: gerar uma versão resumida do comunicado.",
      "Retorne um JSON válido com as chaves title e content.",
      "O title deve ser curto e objetivo.",
      "O content deve ter no máximo 5 frases curtas.",
    ],
    REMINDER: [
      "Tarefa: gerar um lembrete cordial para destinatários que ainda não confirmaram leitura.",
      "Retorne um JSON válido com a chave content.",
      "Não afirme que a pessoa recebeu, leu ou ignorou o comunicado; diga apenas que a confirmação ainda está pendente.",
      "O texto deve convidar à leitura e confirmação pelo portal.",
    ],
  };

  return [
    ...baseRules,
    ...taskByAction[action],
    "",
    "Contexto:",
    buildContextText(input),
  ].join("\n");
}

function parseAiJsonOutput(output: string): AnnouncementAiOutput {
  const normalized = output.trim();

  try {
    const parsed = JSON.parse(normalized) as AnnouncementAiOutput;

    return {
      title: typeof parsed.title === "string" ? parsed.title.trim() : null,
      content: typeof parsed.content === "string" ? parsed.content.trim() : null,
      output: typeof parsed.output === "string" ? parsed.output.trim() : null,
    };
  } catch {
    return {
      output: normalized,
    };
  }
}

function buildFallbackOutput(action: AnnouncementAiAction, input: ReturnType<typeof normalizeInput>): AnnouncementAiOutput {
  const condominiumText = input.condominiumName ? ` do ${input.condominiumName}` : "";
  const eventStart = formatDateTime(input.eventStartAt);
  const eventEnd = formatDateTime(input.eventEndAt);
  const eventLine = eventStart
    ? eventEnd
      ? `\n\nPeríodo previsto: ${eventStart} a ${eventEnd}.`
      : `\n\nInício previsto: ${eventStart}.`
    : "";

  if (action === "REMINDER") {
    return {
      content: [
        `Prezados, lembramos que há um comunicado${condominiumText} aguardando confirmação de leitura no portal.`,
        "Pedimos a gentileza de acessar o EloGest, ler as informações e registrar a ciência.",
        "Esta confirmação ajuda a administradora a manter a comunicação oficial organizada e rastreável.",
      ].join("\n\n"),
    };
  }

  const title = input.title || `${typeLabel(input.type)}${condominiumText}`;

  if (action === "SUMMARY") {
    return {
      title,
      content: [
        input.content || `Comunicado ${typeLabel(input.type).toLowerCase()}${condominiumText}.`,
        eventLine ? eventLine.trim() : "",
        input.requireReadingConfirmation ? "A confirmação de leitura pelo portal é solicitada." : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    };
  }

  return {
    title,
    content: [
      `Prezados, comunicamos ${input.content ? "as informações abaixo" : `uma orientação ${typeLabel(input.type).toLowerCase()}${condominiumText}`}.`,
      input.content || "A administradora solicita atenção às orientações deste comunicado.",
      eventLine.trim(),
      input.requireReadingConfirmation
        ? "Pedimos que, após a leitura, a confirmação de ciência seja registrada no portal."
        : "Permanecemos à disposição para esclarecimentos pelos canais oficiais da administradora.",
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

async function callOpenAiForAnnouncement(action: AnnouncementAiAction, input: ReturnType<typeof normalizeInput>) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
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
      input: buildPrompt(action, input),
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

  return parseAiJsonOutput(output);
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

function actionLabel(action: AnnouncementAiAction) {
  if (action === "IMPROVE") return "Melhoria de comunicado";
  if (action === "SUMMARY") return "Resumo de comunicado";
  return "Lembrete de leitura";
}

export async function handleAnnouncementAiRequest(request: Request, action: AnnouncementAiAction) {
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
      action: `ANNOUNCEMENT_${action}`,
      entityType: "Announcement",
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

  const rawInput = (await request.json().catch(() => ({}))) as AnnouncementAiInput;
  const input = normalizeInput(rawInput);

  if (!input.title && !input.content) {
    return NextResponse.json(
      {
        ok: false,
        moduleEnabled: true,
        aiEnabled: false,
        provider: "none",
        message: "Informe pelo menos título ou conteúdo para gerar uma sugestão.",
      },
      {
        status: 400,
      },
    );
  }

  const status = getOperationalAiStatus();

  try {
    const aiOutput = status.enabled ? await callOpenAiForAnnouncement(action, input) : null;
    const output = aiOutput || buildFallbackOutput(action, input);
    const outputText = [output.title, output.content || output.output].filter(Boolean).join("\n\n");

    await logOperationalAiUsage({
      administratorId: administrator.id,
      userId: null,
      module: MODULE_SLUG,
      action: `ANNOUNCEMENT_${action}`,
      entityType: "Announcement",
      promptVersion: PROMPT_VERSION,
      status: aiOutput ? "SUCCESS" : "SKIPPED",
      input,
      output: outputText,
    });

    return NextResponse.json({
      ok: true,
      moduleEnabled: true,
      aiEnabled: status.enabled,
      provider: status.provider,
      message: aiOutput
        ? `${actionLabel(action)} gerada pela IA Operacional.`
        : status.reason ?? "IA não configurada no ambiente. Foi gerada uma sugestão segura com fallback local.",
      title: output.title || null,
      content: output.content || null,
      output: output.output || null,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Erro desconhecido ao gerar sugestão de comunicado.";

    const output = buildFallbackOutput(action, input);
    const outputText = [output.title, output.content || output.output].filter(Boolean).join("\n\n");

    await logOperationalAiUsage({
      administratorId: administrator.id,
      userId: null,
      module: MODULE_SLUG,
      action: `ANNOUNCEMENT_${action}`,
      entityType: "Announcement",
      promptVersion: PROMPT_VERSION,
      status: "ERROR",
      input,
      output: outputText,
      errorMessage,
    });

    return NextResponse.json({
      ok: true,
      moduleEnabled: true,
      aiEnabled: false,
      provider: "none",
      message:
        "Não foi possível usar o provedor de IA. Foi gerada uma sugestão segura com base nos dados informados.",
      title: output.title || null,
      content: output.content || null,
      output: output.output || null,
    });
  }
}
