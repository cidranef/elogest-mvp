"use client";

import { useState } from "react";

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

type OperationalAiResponse = {
  ok: boolean;
  moduleEnabled?: boolean;
  aiEnabled?: boolean;
  provider?: string;
  generatedAt?: string;
  period?: {
    label: string;
    from: string;
    to: string;
  };
  summary?: string;
  fallbackUsed?: boolean;
  fallbackReason?: string | null;
  metrics?: OperationalMetric[];
  insights?: OperationalInsight[];
  notice?: string;
  message?: string;
};

function insightClass(tone: OperationalInsight["tone"]) {
  if (tone === "success") {
    return "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]";
  }

  if (tone === "warning") {
    return "border-yellow-200 bg-yellow-50 text-yellow-800";
  }

  if (tone === "danger") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  return "border-[#DDE5DF] bg-white text-[#17211B]";
}

function formatDateTime(value?: string) {
  if (!value) {
    return "-";
  }

  try {
    return new Date(value).toLocaleString("pt-BR");
  } catch {
    return "-";
  }
}

export default function OperationalAiSummaryCard() {
  const [data, setData] = useState<OperationalAiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadSummary() {
    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/admin/ia/resumo-operacional", {
        method: "GET",
        cache: "no-store",
      });

      const payload = (await response.json()) as OperationalAiResponse;

      if (!response.ok) {
        setData(payload);
        setErrorMessage(
          payload.message ||
            "Não foi possível gerar a análise operacional neste momento."
        );
        return;
      }

      setData(payload);
    } catch {
      setErrorMessage(
        "Não foi possível consultar a IA Operacional neste momento."
      );
    } finally {
      setLoading(false);
    }
  }

  const metrics = data?.metrics || [];
  const insights = data?.insights || [];

  return (
    <div className="overflow-hidden rounded-[32px] border border-[#CFE6D4] bg-[linear-gradient(135deg,#FFFFFF_0%,#F9FBFA_58%,#EAF7EE_135%)] shadow-sm">
      <div className="border-b border-[#DDE5DF] p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#256D3C]">
              IA Operacional
            </p>

            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#17211B] md:text-3xl">
              Leitura Inteligente da Operação
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5E6B63]">
              Gere uma análise assistiva com base nos chamados recentes,
              prioridades, prazos, responsáveis e concentração por condomínio.
            </p>
          </div>

          <button
            type="button"
            onClick={loadSummary}
            disabled={loading}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1E5A31] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Analisando..." : data ? "Atualizar Análise" : "Gerar Análise"}
          </button>
        </div>
      </div>

      <div className="p-6">
        {!data && !errorMessage && (
          <div className="rounded-2xl border border-[#DDE5DF] bg-white p-5 text-sm leading-6 text-[#5E6B63]">
            Clique em <strong className="text-[#17211B]">Gerar Análise</strong>{" "}
            para consultar a IA Operacional. A análise não executa ações e não
            substitui a validação da administradora.
          </div>
        )}

        {errorMessage && (
          <div className="mb-5 rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm leading-6 text-yellow-800">
            {errorMessage}
          </div>
        )}

        {data?.summary && (
          <div className="rounded-2xl border border-[#DDE5DF] bg-white p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Análise Executiva
                </p>

                <p className="mt-3 text-sm leading-7 text-[#17211B]">
                  {data.summary}
                </p>
              </div>

              <div className="shrink-0 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 py-3 text-xs text-[#5E6B63] md:max-w-[260px]">
                <p>
                  <strong className="text-[#17211B]">Período:</strong>{" "}
                  {data.period?.label || "Últimos dados disponíveis"}
                </p>

                <p className="mt-1">
                  <strong className="text-[#17211B]">Gerado em:</strong>{" "}
                  {formatDateTime(data.generatedAt)}
                </p>

                <p className="mt-1">
                  <strong className="text-[#17211B]">Modo:</strong>{" "}
                  {data.aiEnabled ? "IA configurada" : "Leitura automática"}
                </p>
              </div>
            </div>

            {data.fallbackUsed && data.fallbackReason && (
              <div className="mt-4 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-3 text-xs leading-5 text-[#5E6B63]">
                {data.fallbackReason}
              </div>
            )}
          </div>
        )}

        {metrics.length > 0 && (
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-2xl border border-[#DDE5DF] bg-white p-4"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
                  {metric.label}
                </p>

                <strong className="mt-2 block text-3xl font-semibold text-[#17211B]">
                  {metric.value}
                </strong>

                <p className="mt-2 text-xs leading-5 text-[#5E6B63]">
                  {metric.description}
                </p>
              </div>
            ))}
          </div>
        )}

        {insights.length > 0 && (
          <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {insights.map((insight) => (
              <div
                key={`${insight.title}-${insight.description}`}
                className={`rounded-2xl border p-4 ${insightClass(insight.tone)}`}
              >
                <p className="font-semibold">
                  {insight.title}
                </p>

                <p className="mt-2 text-sm leading-6 opacity-85">
                  {insight.description}
                </p>
              </div>
            ))}
          </div>
        )}

        {data?.notice && (
          <p className="mt-5 text-xs leading-5 text-[#7A877F]">
            {data.notice}
          </p>
        )}
      </div>
    </div>
  );
}
