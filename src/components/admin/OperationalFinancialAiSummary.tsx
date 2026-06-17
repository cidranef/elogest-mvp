"use client";

import { useMemo, useState } from "react";

type FinancialAiKpis = {
  revenuePlannedCents?: number;
  revenueReceivedCents?: number;
  expensePlannedCents?: number;
  expensePaidCents?: number;
  plannedBalanceCents?: number;
  realizedBalanceCents?: number;
  openCents?: number;
  overdueCents?: number;
  totalEntries?: number;
  openEntries?: number;
  overdueEntries?: number;
  paidEntries?: number;
  partiallyPaidEntries?: number;
  canceledEntries?: number;
};

type FinancialAiCondominium = {
  condominiumId: string;
  condominiumName: string;
  revenuePlannedCents: number;
  revenueReceivedCents: number;
  expensePlannedCents: number;
  expensePaidCents: number;
  plannedBalanceCents: number;
  realizedBalanceCents: number;
  openCents: number;
  overdueCents: number;
  entriesCount: number;
};

type FinancialAiFilters = {
  condominiumId?: string;
  status?: string;
  competenceFrom?: string;
  competenceTo?: string;
  dueFrom?: string;
  dueTo?: string;
};

type FinancialAiResponse = {
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
  result: FinancialAiResponse | null;
};

function moneyTextFromCents(value?: number | null) {
  const cents = Number(value || 0);

  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

async function readApiJson(res: Response) {
  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return res.json();
  }

  const text = await res.text();

  throw new Error(
    `Resposta inesperada da API. HTTP ${res.status}. ${text.slice(0, 180)}`,
  );
}

export default function OperationalFinancialAiSummary({
  kpis,
  byCondominium,
  filters,
}: {
  kpis: FinancialAiKpis;
  byCondominium: FinancialAiCondominium[];
  filters: FinancialAiFilters;
}) {
  const [state, setState] = useState<AssistantState>({
    loading: false,
    error: "",
    result: null,
  });

  const hasFinancialData = useMemo(() => {
    return (
      Number(kpis.totalEntries || 0) > 0 ||
      Number(kpis.revenuePlannedCents || 0) > 0 ||
      Number(kpis.expensePlannedCents || 0) > 0 ||
      byCondominium.length > 0
    );
  }, [byCondominium.length, kpis]);

  async function generateSummary() {
    try {
      setState({ loading: true, error: "", result: null });

      const res = await fetch("/api/admin/financeiro/ia/resumo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          kpis,
          byCondominium,
          filters,
        }),
      });

      const data = (await readApiJson(res)) as FinancialAiResponse;

      if (!res.ok) {
        setState({
          loading: false,
          error: data?.message || "Não foi possível gerar a análise financeira com IA.",
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
        error: "Erro ao gerar a análise financeira com IA.",
        result: null,
      });
    }
  }

  async function copyResult() {
    const result = state.result;

    if (!result) return;

    const text = [
      result.summary,
      result.highlights?.length ? `\nDestaques:\n- ${result.highlights.join("\n- ")}` : "",
      result.risks?.length ? `\nPontos De Atenção:\n- ${result.risks.join("\n- ")}` : "",
      result.recommendedActions?.length
        ? `\nAções Recomendadas:\n- ${result.recommendedActions.join("\n- ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    await navigator.clipboard.writeText(text);
  }

  return (
    <section className="rounded-[28px] border border-[#CFE6D4] bg-[linear-gradient(135deg,#FFFFFF_0%,#F8FAF9_62%,#EAF7EE_135%)] p-5 shadow-[0_18px_50px_rgba(23,33,27,0.05)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#256D3C]">
            IA Operacional
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-[#17211B]">
            IA Financeira Gerencial
          </h2>
          <p className="mt-2 max-w-4xl text-sm font-medium leading-6 text-[#5E6B63]">
            Gere uma leitura assistiva dos indicadores financeiros filtrados, com destaques,
            pontos de atenção e ações recomendadas para revisão humana.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void generateSummary()}
          disabled={state.loading || !hasFinancialData}
          className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-bold text-white transition hover:bg-[#174B2A] disabled:cursor-not-allowed disabled:bg-[#9AA7A0]"
        >
          {state.loading ? "Analisando..." : "Gerar Análise Com IA"}
        </button>
      </div>

      {!hasFinancialData && (
        <div className="mt-4 rounded-2xl border border-[#DDE5DF] bg-white/80 p-4 text-sm font-semibold text-[#5E6B63]">
          Ainda não há indicadores financeiros suficientes nos filtros atuais para gerar uma análise.
        </div>
      )}

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-[#DDE5DF] bg-white/85 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">Saldo Realizado</p>
          <p className="mt-2 text-lg font-bold text-[#17211B]">{moneyTextFromCents(kpis.realizedBalanceCents)}</p>
        </div>
        <div className="rounded-2xl border border-[#DDE5DF] bg-white/85 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">Em Aberto</p>
          <p className="mt-2 text-lg font-bold text-[#17211B]">{moneyTextFromCents(kpis.openCents)}</p>
        </div>
        <div className="rounded-2xl border border-red-100 bg-white/85 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">Atrasado</p>
          <p className="mt-2 text-lg font-bold text-red-700">{moneyTextFromCents(kpis.overdueCents)}</p>
        </div>
        <div className="rounded-2xl border border-[#DDE5DF] bg-white/85 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#7A877F]">Condomínios</p>
          <p className="mt-2 text-lg font-bold text-[#17211B]">{byCondominium.length}</p>
        </div>
      </div>

      {state.error && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {state.error}
        </div>
      )}

      {state.result && (
        <div className="mt-5 rounded-[24px] border border-[#DDE5DF] bg-white p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">
                Análise Gerada
              </p>
              <p className="mt-2 whitespace-pre-line text-sm font-medium leading-7 text-[#17211B]">
                {state.result.summary}
              </p>
              {!state.result.aiEnabled && state.result.message && (
                <p className="mt-2 text-xs font-semibold text-[#7A877F]">
                  {state.result.message}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => void copyResult()}
              className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-xs font-bold text-[#5E6B63] transition hover:border-[#256D3C] hover:text-[#256D3C]"
            >
              Copiar
            </button>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <ResultList title="Destaques" items={state.result.highlights || []} />
            <ResultList title="Pontos De Atenção" items={state.result.risks || []} />
            <ResultList title="Ações Recomendadas" items={state.result.recommendedActions || []} />
          </div>
        </div>
      )}
    </section>
  );
}

function ResultList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
      <p className="text-sm font-bold text-[#17211B]">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm font-medium text-[#7A877F]">Nenhum item destacado.</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm font-medium leading-6 text-[#5E6B63]">
          {items.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
