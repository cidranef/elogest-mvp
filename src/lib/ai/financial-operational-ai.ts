import { NextResponse } from "next/server";

import { requireActiveAdminApiAccess } from "@/lib/admin-api-guard";
import {
  getOperationalAiStatus,
  logOperationalAiUsage,
} from "@/lib/ai/operational-ai";

/* =========================================================
   ETAPA 55.6 — IA PARA FINANCEIRO

   Regras:
   - A IA gera leitura gerencial assistiva.
   - A IA não altera lançamentos, baixas, comprovantes, valores ou categorias.
   - A administradora deve revisar a análise antes de qualquer decisão.
   ========================================================= */

const MODULE_SLUG = "ia_operacional";
const PROMPT_VERSION = "financial-operational-ai-v1";

type FinancialAiKpis = {
  revenuePlannedCents?: unknown;
  revenueReceivedCents?: unknown;
  expensePlannedCents?: unknown;
  expensePaidCents?: unknown;
  plannedBalanceCents?: unknown;
  realizedBalanceCents?: unknown;
  openCents?: unknown;
  overdueCents?: unknown;
  totalEntries?: unknown;
  openEntries?: unknown;
  overdueEntries?: unknown;
  paidEntries?: unknown;
  partiallyPaidEntries?: unknown;
  canceledEntries?: unknown;
};

type FinancialAiCondominium = {
  condominiumId?: unknown;
  condominiumName?: unknown;
  revenuePlannedCents?: unknown;
  revenueReceivedCents?: unknown;
  expensePlannedCents?: unknown;
  expensePaidCents?: unknown;
  plannedBalanceCents?: unknown;
  realizedBalanceCents?: unknown;
  openCents?: unknown;
  overdueCents?: unknown;
  entriesCount?: unknown;
};

type FinancialAiInput = {
  kpis?: FinancialAiKpis;
  byCondominium?: FinancialAiCondominium[];
  filters?: Record<string, unknown>;
};

type FinancialAiOutput = {
  summary: string;
  highlights: string[];
  risks: string[];
  recommendedActions: string[];
};

function asNumber(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function moneyTextFromCents(value?: number | null) {
  const cents = Number(value || 0);

  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function percentText(value: number, total: number) {
  if (!total || total <= 0) return "0%";

  return `${((value / total) * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function normalizeInput(input: FinancialAiInput) {
  const kpis = input.kpis || {};

  const byCondominium = Array.isArray(input.byCondominium)
    ? input.byCondominium.map((item) => ({
        condominiumId: asText(item.condominiumId),
        condominiumName: asText(item.condominiumName) || "Condomínio",
        revenuePlannedCents: asNumber(item.revenuePlannedCents),
        revenueReceivedCents: asNumber(item.revenueReceivedCents),
        expensePlannedCents: asNumber(item.expensePlannedCents),
        expensePaidCents: asNumber(item.expensePaidCents),
        plannedBalanceCents: asNumber(item.plannedBalanceCents),
        realizedBalanceCents: asNumber(item.realizedBalanceCents),
        openCents: asNumber(item.openCents),
        overdueCents: asNumber(item.overdueCents),
        entriesCount: asNumber(item.entriesCount),
      }))
    : [];

  return {
    kpis: {
      revenuePlannedCents: asNumber(kpis.revenuePlannedCents),
      revenueReceivedCents: asNumber(kpis.revenueReceivedCents),
      expensePlannedCents: asNumber(kpis.expensePlannedCents),
      expensePaidCents: asNumber(kpis.expensePaidCents),
      plannedBalanceCents: asNumber(kpis.plannedBalanceCents),
      realizedBalanceCents: asNumber(kpis.realizedBalanceCents),
      openCents: asNumber(kpis.openCents),
      overdueCents: asNumber(kpis.overdueCents),
      totalEntries: asNumber(kpis.totalEntries),
      openEntries: asNumber(kpis.openEntries),
      overdueEntries: asNumber(kpis.overdueEntries),
      paidEntries: asNumber(kpis.paidEntries),
      partiallyPaidEntries: asNumber(kpis.partiallyPaidEntries),
      canceledEntries: asNumber(kpis.canceledEntries),
    },
    byCondominium,
    filters: input.filters || {},
  };
}

function buildDeterministicFinancialAnalysis(
  input: ReturnType<typeof normalizeInput>,
): FinancialAiOutput {
  const { kpis, byCondominium } = input;
  const collectionRate = percentText(
    kpis.revenueReceivedCents,
    kpis.revenuePlannedCents,
  );
  const paymentRate = percentText(kpis.expensePaidCents, kpis.expensePlannedCents);
  const overdueShare = percentText(kpis.overdueCents, Math.max(kpis.openCents, 1));

  const topOverdue = [...byCondominium]
    .sort((a, b) => b.overdueCents - a.overdueCents)
    .filter((item) => item.overdueCents > 0)
    .slice(0, 3);

  const topOpen = [...byCondominium]
    .sort((a, b) => b.openCents - a.openCents)
    .filter((item) => item.openCents > 0)
    .slice(0, 3);

  const highlights = [
    `Recebimento atual das receitas previstas: ${collectionRate}.`,
    `Pagamento atual das despesas previstas: ${paymentRate}.`,
    `Saldo realizado no filtro atual: ${moneyTextFromCents(kpis.realizedBalanceCents)}.`,
  ];

  if (byCondominium.length > 0) {
    highlights.push(
      `A análise considera ${byCondominium.length} condomínio(s) no resumo filtrado.`,
    );
  }

  const risks: string[] = [];

  if (kpis.overdueCents > 0) {
    risks.push(
      `Há ${moneyTextFromCents(kpis.overdueCents)} em atraso, equivalente a ${overdueShare} dos valores em aberto.`,
    );
  }

  if (kpis.openCents > 0) {
    risks.push(
      `Existem ${moneyTextFromCents(kpis.openCents)} em aberto distribuídos em ${kpis.openEntries || 0} lançamento(s).`,
    );
  }

  topOverdue.forEach((item) => {
    risks.push(
      `${item.condominiumName} concentra ${moneyTextFromCents(item.overdueCents)} em atraso.`,
    );
  });

  if (risks.length === 0) {
    risks.push("Não há atrasos relevantes nos indicadores filtrados.");
  }

  const recommendedActions = [
    "Revisar os lançamentos atrasados antes de qualquer cobrança ou comunicação oficial.",
    "Conferir se as baixas recentes foram registradas corretamente antes de tomar decisão gerencial.",
  ];

  if (topOpen.length > 0) {
    recommendedActions.push(
      `Priorizar acompanhamento de valores em aberto em ${topOpen
        .map((item) => item.condominiumName)
        .join(", ")}.`,
    );
  }

  if (kpis.realizedBalanceCents < 0) {
    recommendedActions.push(
      "Avaliar despesas pagas e receitas ainda não recebidas, pois o saldo realizado está negativo.",
    );
  }

  return {
    summary: [
      `No filtro atual, o financeiro apresenta ${moneyTextFromCents(kpis.revenuePlannedCents)} em receitas previstas e ${moneyTextFromCents(kpis.expensePlannedCents)} em despesas previstas.`,
      `O realizado está em ${moneyTextFromCents(kpis.realizedBalanceCents)}, com ${moneyTextFromCents(kpis.openCents)} ainda em aberto e ${moneyTextFromCents(kpis.overdueCents)} em atraso.`,
      "Esta leitura é assistiva e deve ser revisada pela administradora antes de qualquer ação financeira.",
    ].join(" "),
    highlights,
    risks,
    recommendedActions,
  };
}

function buildPrompt(input: ReturnType<typeof normalizeInput>) {
  const deterministic = buildDeterministicFinancialAnalysis(input);

  return [
    "Você é a IA Operacional do EloGest, apoiando análise financeira condominial.",
    "Não invente valores. Use apenas os dados fornecidos.",
    "Não recomende executar ações automáticas, baixas, estornos, cobranças ou alterações financeiras.",
    "Gere JSON válido com as chaves: summary, highlights, risks, recommendedActions.",
    "Cada lista deve ter no máximo 5 itens.",
    "Dados financeiros consolidados:",
    JSON.stringify(input, null, 2),
    "Análise determinística base para referência:",
    JSON.stringify(deterministic, null, 2),
  ].join("\n\n");
}

function safeParseAiOutput(rawText: string): FinancialAiOutput | null {
  try {
    const parsed = JSON.parse(rawText) as Partial<FinancialAiOutput>;

    if (!parsed || typeof parsed.summary !== "string") {
      return null;
    }

    return {
      summary: parsed.summary,
      highlights: Array.isArray(parsed.highlights)
        ? parsed.highlights.filter((item): item is string => typeof item === "string")
        : [],
      risks: Array.isArray(parsed.risks)
        ? parsed.risks.filter((item): item is string => typeof item === "string")
        : [],
      recommendedActions: Array.isArray(parsed.recommendedActions)
        ? parsed.recommendedActions.filter((item): item is string => typeof item === "string")
        : [],
    };
  } catch {
    return null;
  }
}

async function callOpenAi(prompt: string): Promise<FinancialAiOutput | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) return null;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Você responde apenas JSON válido, sem markdown e sem comentários adicionais.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.2,
      max_tokens: 900,
    }),
  });

  if (!res.ok) {
    return null;
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };

  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    return null;
  }

  return safeParseAiOutput(content);
}

export async function handleFinancialAiSummaryRequest(request: Request) {
  const access = await requireActiveAdminApiAccess();

  if ("error" in access) {
    return access.error;
  }

  const { administrator } = access;
  const administratorId = administrator.id;

  const aiStatus = getOperationalAiStatus();
  const body = (await request.json().catch(() => ({}))) as FinancialAiInput;
  const input = normalizeInput(body);
  const fallbackOutput = buildDeterministicFinancialAnalysis(input);

  const moduleAccess = await import("@/lib/ai/operational-ai").then((mod) =>
    mod.getOperationalAiModuleAccess(administratorId),
  );

  if (!moduleAccess.allowed) {
    await logOperationalAiUsage({
      administratorId,
      userId: null,
      module: MODULE_SLUG,
      action: "FINANCIAL_SUMMARY",
      entityType: "FINANCIAL_DASHBOARD",
      entityId: null,
      promptVersion: PROMPT_VERSION,
      status: "SKIPPED",
      input,
      output: null,
      errorMessage: moduleAccess.reason || "Módulo IA Operacional indisponível.",
    });

    return NextResponse.json(
      {
        ok: false,
        moduleEnabled: false,
        aiEnabled: aiStatus.enabled,
        provider: aiStatus.provider,
        message: moduleAccess.reason || "Módulo IA Operacional indisponível.",
      },
      { status: 403 },
    );
  }

  if (!aiStatus.enabled) {
    await logOperationalAiUsage({
      administratorId,
      userId: null,
      module: MODULE_SLUG,
      action: "FINANCIAL_SUMMARY",
      entityType: "FINANCIAL_DASHBOARD",
      entityId: null,
      promptVersion: PROMPT_VERSION,
      status: "SKIPPED",
      input,
      output: fallbackOutput.summary,
      errorMessage: aiStatus.reason || null,
    });

    return NextResponse.json({
      ok: true,
      moduleEnabled: true,
      aiEnabled: false,
      provider: aiStatus.provider,
      message:
        aiStatus.reason ||
        "IA não configurada no ambiente. Foi gerada uma análise operacional segura por regras internas.",
      ...fallbackOutput,
    });
  }

  try {
    const aiOutput = await callOpenAi(buildPrompt(input));
    const output = aiOutput || fallbackOutput;

    await logOperationalAiUsage({
      administratorId,
      userId: null,
      module: MODULE_SLUG,
      action: "FINANCIAL_SUMMARY",
      entityType: "FINANCIAL_DASHBOARD",
      entityId: null,
      promptVersion: PROMPT_VERSION,
      status: aiOutput ? "SUCCESS" : "SKIPPED",
      input,
      output: JSON.stringify(output),
      errorMessage: aiOutput ? null : "Fallback acionado por resposta inválida da IA.",
    });

    return NextResponse.json({
      ok: true,
      moduleEnabled: true,
      aiEnabled: Boolean(aiOutput),
      provider: aiOutput ? aiStatus.provider : "none",
      message: aiOutput
        ? "Análise gerada com IA. Revise antes de tomar decisões financeiras."
        : "Foi gerada uma análise operacional segura por regras internas.",
      ...output,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Erro inesperado na IA Financeira.";

    await logOperationalAiUsage({
      administratorId,
      userId: null,
      module: MODULE_SLUG,
      action: "FINANCIAL_SUMMARY",
      entityType: "FINANCIAL_DASHBOARD",
      entityId: null,
      promptVersion: PROMPT_VERSION,
      status: "ERROR",
      input,
      output: fallbackOutput.summary,
      errorMessage,
    });

    return NextResponse.json({
      ok: true,
      moduleEnabled: true,
      aiEnabled: false,
      provider: "none",
      message:
        "A IA não respondeu no momento. Foi gerada uma análise operacional segura por regras internas.",
      ...fallbackOutput,
    });
  }
}
