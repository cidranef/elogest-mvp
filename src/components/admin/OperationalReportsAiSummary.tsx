"use client";

import { useMemo, useState } from "react";

type ReportAiSummary = {
  generatedAt?: string;
  chamados?: Record<string, number | undefined>;
  financeiro?: Record<string, number | undefined>;
  comunicados?: Record<string, number | undefined>;
  assembleias?: Record<string, number | undefined>;
  enquetes?: Record<string, number | undefined>;
  fornecedores?: Record<string, number | undefined>;
};

type ReportAiCard = {
  id: string;
  title: string;
  status: string;
  metricLabel: string;
  metricValue: number | string;
  highlights: string[];
};

type ReportAiResponse = {
  ok?: boolean;
  moduleEnabled?: boolean;
  aiEnabled?: boolean;
  provider?: string;
  message?: string;
  summary?: string;
  highlights?: string[];
  risks?: string[];
  recommendedActions?: string[];
};

type AssistantState = {
  loading: boolean;
  error: string;
  result: ReportAiResponse | null;
};

async function readApiJson(res: Response) {
  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return res.json();
  }

  const text = await res.text();
  throw new Error(
    `Resposta inesperada da API de IA. Código HTTP: ${res.status}. ${text.slice(0, 120)}`,
  );
}

function getTotalFromReports(reports: ReportAiCard[]) {
  return reports.reduce((sum, report) => {
    return sum + (typeof report.metricValue === "number" ? report.metricValue : 0);
  }, 0);
}

function ListBlock({ title, items }: { title: string; items?: string[] }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="rounded-2xl border border-[#DDE5DF] bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
        {title}
      </p>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-[#5E6B63]">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#256D3C]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function OperationalReportsAiSummary({
  summary,
  reports,
}: {
  summary: ReportAiSummary;
  reports: ReportAiCard[];
}) {
  const [state, setState] = useState<AssistantState>({
    loading: false,
    error: "",
    result: null,
  });

  const availableReports = useMemo(() => {
    return reports.filter((report) => report.status === "Disponível").length;
  }, [reports]);

  const totalRegisters = useMemo(() => getTotalFromReports(reports), [reports]);

  async function generateSummary() {
    try {
      setState((prev) => ({ ...prev, loading: true, error: "" }));

      const res = await fetch("/api/admin/relatorios/ia/resumo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary,
          reports,
          indicators: {
            availableReports,
            totalReports: reports.length,
            totalRegisters,
          },
        }),
      });

      const data = (await readApiJson(res)) as ReportAiResponse;

      if (!res.ok) {
        setState({
          loading: false,
          error: data.message || "Erro ao gerar leitura gerencial com IA.",
          result: null,
        });
        return;
      }

      setState({
        loading: false,
        error: "",
        result: data,
      });
    } catch (err) {
      console.error(err);
      setState({
        loading: false,
        error: "Erro ao gerar leitura gerencial com IA.",
        result: null,
      });
    }
  }

  return (
    <section className="overflow-hidden rounded-[32px] border border-[#CFE6D4] bg-white shadow-sm">
      <div className="border-b border-[#CFE6D4] bg-[linear-gradient(135deg,#FFFFFF_0%,#F8FAF9_55%,#EAF7EE_130%)] p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#256D3C]">
              IA Operacional
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#17211B]">
              Leitura Executiva Dos Relatórios
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5E6B63]">
              Gere uma interpretação assistiva da central de relatórios, com pontos de atenção e próximos passos para análise humana da administradora.
            </p>
          </div>

          <button
            type="button"
            onClick={generateSummary}
            disabled={state.loading}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
          >
            {state.loading ? "Gerando análise..." : "Gerar Leitura Com IA"}
          </button>
        </div>
      </div>

      <div className="grid gap-0 divide-y divide-[#DDE5DF] p-0 md:grid-cols-3 md:divide-x md:divide-y-0">
        <div className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
            Cobertura
          </p>
          <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
            {availableReports} de {reports.length} relatório(s) disponíveis para leitura gerencial.
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
            Base Consolidada
          </p>
          <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
            {totalRegisters} registro(s) consolidados nos indicadores da central.
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
            Regra De Segurança
          </p>
          <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
            A IA não exporta, não altera dados e não executa ações. Ela apenas sugere leitura gerencial.
          </p>
        </div>
      </div>

      {state.error && (
        <div className="border-t border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {state.error}
        </div>
      )}

      {state.result && (
        <div className="border-t border-[#DDE5DF] bg-[#F9FBFA] p-5">
          {state.result.message && (
            <div className="mb-4 rounded-2xl border border-[#DDE5DF] bg-white p-4 text-sm font-semibold text-[#5E6B63]">
              {state.result.message}
            </div>
          )}

          <div className="rounded-[24px] border border-[#CFE6D4] bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#256D3C]">
              Resumo Gerencial
            </p>
            <p className="mt-3 whitespace-pre-line text-sm leading-7 text-[#17211B]">
              {state.result.summary || "Sem resumo gerado."}
            </p>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <ListBlock title="Destaques" items={state.result.highlights} />
            <ListBlock title="Pontos De Atenção" items={state.result.risks} />
            <ListBlock title="Ações Sugeridas" items={state.result.recommendedActions} />
          </div>
        </div>
      )}
    </section>
  );
}
