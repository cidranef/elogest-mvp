import { NextResponse } from "next/server";

import { requireActiveAdminApiAccess } from "@/lib/admin-api-guard";
import {
  getOperationalAiModuleAccess,
  getOperationalAiStatus,
  logOperationalAiUsage,
} from "@/lib/ai/operational-ai";

/* =========================================================
   ETAPA 55.7 — IA PARA RELATÓRIOS GERENCIAIS

   Regras:
   - A IA gera leitura executiva assistiva da central de relatórios.
   - A IA não altera dados, não exporta arquivos e não executa ações.
   - A administradora deve revisar a análise antes de qualquer decisão.
   ========================================================= */

const MODULE_SLUG = "ia_operacional";
const PROMPT_VERSION = "reports-operational-ai-v1";

type ReportsAiSummary = {
  generatedAt?: unknown;
  chamados?: Record<string, unknown>;
  financeiro?: Record<string, unknown>;
  comunicados?: Record<string, unknown>;
  assembleias?: Record<string, unknown>;
  enquetes?: Record<string, unknown>;
  fornecedores?: Record<string, unknown>;
};

type ReportsAiCard = {
  id?: unknown;
  title?: unknown;
  status?: unknown;
  metricLabel?: unknown;
  metricValue?: unknown;
  highlights?: unknown;
};

type ReportsAiInput = {
  summary?: ReportsAiSummary;
  reports?: ReportsAiCard[];
  indicators?: {
    availableReports?: unknown;
    totalReports?: unknown;
    totalRegisters?: unknown;
  };
};

type ReportsAiOutput = {
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

function asStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function normalizeMetricMap(value: Record<string, unknown> | undefined) {
  const output: Record<string, number> = {};

  Object.entries(value || {}).forEach(([key, item]) => {
    output[key] = asNumber(item);
  });

  return output;
}

function normalizeInput(input: ReportsAiInput) {
  const reports = Array.isArray(input.reports)
    ? input.reports.map((report) => ({
        id: asText(report.id),
        title: asText(report.title),
        status: asText(report.status),
        metricLabel: asText(report.metricLabel),
        metricValue: asNumber(report.metricValue),
        highlights: asStringList(report.highlights),
      }))
    : [];

  const indicators = input.indicators || {};

  return {
    generatedAt: asText(input.summary?.generatedAt),
    summary: {
      chamados: normalizeMetricMap(input.summary?.chamados),
      financeiro: normalizeMetricMap(input.summary?.financeiro),
      comunicados: normalizeMetricMap(input.summary?.comunicados),
      assembleias: normalizeMetricMap(input.summary?.assembleias),
      enquetes: normalizeMetricMap(input.summary?.enquetes),
      fornecedores: normalizeMetricMap(input.summary?.fornecedores),
    },
    reports,
    indicators: {
      availableReports: asNumber(indicators.availableReports),
      totalReports: asNumber(indicators.totalReports),
      totalRegisters: asNumber(indicators.totalRegisters),
    },
  };
}

function buildDeterministicReportsAnalysis(
  input: ReturnType<typeof normalizeInput>,
): ReportsAiOutput {
  const { reports, indicators, summary } = input;
  const availableReports = indicators.availableReports || reports.filter((item) => item.status === "Disponível").length;
  const totalReports = indicators.totalReports || reports.length;
  const totalRegisters = indicators.totalRegisters || reports.reduce((sum, item) => sum + item.metricValue, 0);

  const risks: string[] = [];

  if (summary.chamados.overdue > 0) {
    risks.push(`${summary.chamados.overdue} chamado(s) aparecem em atraso nos indicadores consolidados.`);
  }

  if (summary.financeiro.pendentes > 0) {
    risks.push(`${summary.financeiro.pendentes} pendência(s) financeira(s) exigem conferência nos relatórios específicos.`);
  }

  if (summary.comunicados.pendingReadings > 0) {
    risks.push(`${summary.comunicados.pendingReadings} pendência(s) de leitura em comunicados devem ser acompanhadas.`);
  }

  if (summary.fornecedores.blocked > 0) {
    risks.push(`${summary.fornecedores.blocked} fornecedor(es) bloqueado(s) aparecem na base gerencial.`);
  }

  if (risks.length === 0) {
    risks.push("Não há pontos críticos evidentes nos indicadores resumidos da central.");
  }

  const highlights = [
    `A central possui ${availableReports} de ${totalReports} relatório(s) disponível(is).`,
    `Os indicadores consolidados somam ${totalRegisters} registro(s) entre os módulos gerenciais.`,
    `Chamados, financeiro, comunicados, assembleias, enquetes e fornecedores estão reunidos em uma única visão executiva.`,
  ];

  const recommendedActions = [
    "Abrir primeiro os relatórios com pendências, atrasos ou bloqueios antes de exportar dados para análise externa.",
    "Validar os números nos relatórios específicos antes de tomar decisões administrativas, financeiras ou operacionais.",
    "Usar a exportação CSV apenas depois de revisar filtros, período e escopo da administradora.",
  ];

  if (summary.chamados.overdue > 0) {
    recommendedActions.push("Priorizar o relatório de chamados para identificar responsáveis, condomínios e prazos vencidos.");
  }

  if (summary.financeiro.pendentes > 0) {
    recommendedActions.push("Priorizar o relatório financeiro para revisar pendências, baixas e vencimentos.");
  }

  return {
    summary: [
      `A central de relatórios apresenta ${availableReports} relatório(s) disponível(is), cobrindo ${totalRegisters} registro(s) consolidados nos indicadores atuais.`,
      "A leitura executiva deve ser usada como apoio para decidir quais relatórios revisar primeiro, sem substituir a conferência humana dos dados.",
    ].join(" "),
    highlights: highlights.slice(0, 5),
    risks: risks.slice(0, 5),
    recommendedActions: recommendedActions.slice(0, 5),
  };
}

function buildPrompt(input: ReturnType<typeof normalizeInput>) {
  const deterministic = buildDeterministicReportsAnalysis(input);

  return [
    "Você é a IA Operacional do EloGest, apoiando leitura executiva de relatórios gerenciais condominiais.",
    "Não invente números. Use apenas os dados fornecidos.",
    "Não recomende executar ações automáticas, alterações, publicações ou exportações sem revisão humana.",
    "Gere JSON válido com as chaves: summary, highlights, risks, recommendedActions.",
    "Cada lista deve ter no máximo 5 itens.",
    "Dados consolidados da central de relatórios:",
    JSON.stringify(input, null, 2),
    "Análise determinística base para referência:",
    JSON.stringify(deterministic, null, 2),
  ].join("\n\n");
}

function safeParseAiOutput(rawText: string): ReportsAiOutput | null {
  try {
    const parsed = JSON.parse(rawText) as Partial<ReportsAiOutput>;

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

async function callOpenAi(prompt: string): Promise<ReportsAiOutput | null> {
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

  if (!content) return null;

  return safeParseAiOutput(content);
}

export async function handleReportsAiSummaryRequest(request: Request) {
  const access = await requireActiveAdminApiAccess();

  if ("error" in access) {
    return access.error;
  }

  const { administrator } = access;
  const administratorId = administrator.id;
  const aiStatus = getOperationalAiStatus();
  const body = (await request.json().catch(() => ({}))) as ReportsAiInput;
  const input = normalizeInput(body);
  const fallbackOutput = buildDeterministicReportsAnalysis(input);
  const moduleAccess = await getOperationalAiModuleAccess(administratorId);

  if (!moduleAccess.allowed) {
    await logOperationalAiUsage({
      administratorId,
      userId: null,
      module: MODULE_SLUG,
      action: "REPORTS_EXECUTIVE_SUMMARY",
      entityType: "REPORTS_CENTER",
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
      action: "REPORTS_EXECUTIVE_SUMMARY",
      entityType: "REPORTS_CENTER",
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
        "IA não configurada no ambiente. Foi gerada uma leitura gerencial segura por regras internas.",
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
      action: "REPORTS_EXECUTIVE_SUMMARY",
      entityType: "REPORTS_CENTER",
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
        ? "Leitura gerencial gerada com IA. Revise antes de tomar decisões."
        : "Foi gerada uma leitura gerencial segura por regras internas.",
      ...output,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Erro inesperado na IA de relatórios.";

    await logOperationalAiUsage({
      administratorId,
      userId: null,
      module: MODULE_SLUG,
      action: "REPORTS_EXECUTIVE_SUMMARY",
      entityType: "REPORTS_CENTER",
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
        "A IA não respondeu no momento. Foi gerada uma leitura gerencial segura por regras internas.",
      ...fallbackOutput,
    });
  }
}
