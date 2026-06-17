"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

/* =========================================================
   ETAPA 55.4 — IA PARA PRIORIZAÇÃO OPERACIONAL

   Componente cliente para a fila administrativa de chamados.

   Regras desta entrega:
   - A IA apenas sugere prioridade operacional.
   - A IA não altera prioridade salva no chamado.
   - A IA não atribui responsável.
   - A IA não inicia, resolve ou encerra chamado.
   - Toda ação continua dependendo de decisão humana.
   ========================================================= */

type PriorityLevel = "BAIXA" | "MEDIA" | "ALTA" | "CRITICA";

type PriorityItem = {
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

type PriorityResponse = {
  ok?: boolean;
  moduleEnabled?: boolean;
  aiEnabled?: boolean;
  provider?: string;
  message?: string;
  analysis?: string;
  items?: PriorityItem[];
};

type OperationalTicketPriorityPanelProps = {
  condominiumId?: string | null;
};

function priorityLabel(level: PriorityLevel) {
  if (level === "CRITICA") return "Crítica";
  if (level === "ALTA") return "Alta";
  if (level === "MEDIA") return "Média";
  return "Baixa";
}

function priorityClass(level: PriorityLevel) {
  if (level === "CRITICA") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (level === "ALTA") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  if (level === "MEDIA") {
    return "border-yellow-200 bg-yellow-50 text-yellow-800";
  }

  return "border-[#DDE5DF] bg-white text-[#5E6B63]";
}

function normalizeText(value?: string | null) {
  const text = String(value || "").trim();

  if (!text) return "-";

  return text;
}

export default function OperationalTicketPriorityPanel({
  condominiumId,
}: OperationalTicketPriorityPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [items, setItems] = useState<PriorityItem[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const endpoint = useMemo(() => {
    const params = new URLSearchParams();

    if (condominiumId) {
      params.set("condominiumId", condominiumId);
    }

    const query = params.toString();

    return query
      ? `/api/admin/ia/prioridades?${query}`
      : "/api/admin/ia/prioridades";
  }, [condominiumId]);

  const loadPriorities = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setMessage("");

      const res = await fetch(endpoint, {
        cache: "no-store",
      });

      const contentType = res.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        throw new Error(`Resposta inesperada da API. Código HTTP: ${res.status}.`);
      }

      const data = (await res.json()) as PriorityResponse;

      if (!res.ok) {
        setItems([]);
        setAnalysis("");
        setMessage(data?.message || "Não foi possível carregar a priorização operacional.");
        return;
      }

      setItems(Array.isArray(data.items) ? data.items : []);
      setAnalysis(data.analysis || "");
      setMessage(data.message || "Priorização operacional carregada.");
      setLastUpdatedAt(new Date().toLocaleString("pt-BR"));
    } catch (err) {
      console.error(err);
      setItems([]);
      setAnalysis("");
      setError("Erro ao carregar a priorização operacional.");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void loadPriorities();
  }, [loadPriorities]);

  return (
    <section className="overflow-hidden rounded-[32px] border border-[#DDE5DF] bg-white shadow-sm">
      <div className="border-b border-[#DDE5DF] bg-[linear-gradient(135deg,#FFFFFF_0%,#F8FAF9_62%,#EAF7EE_135%)] p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#256D3C]">
              IA Operacional
            </p>

            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#17211B] md:text-3xl">
              Priorização Inteligente Dos Chamados
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5E6B63]">
              A IA analisa a fila ativa, identifica riscos e sugere quais chamados
              merecem atenção primeiro. As sugestões não alteram os dados do chamado
              e precisam de validação humana.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {lastUpdatedAt && (
              <span className="rounded-full border border-[#DDE5DF] bg-white px-3 py-2 text-xs font-semibold text-[#5E6B63]">
                Atualizado em {lastUpdatedAt}
              </span>
            )}

            <button
              type="button"
              onClick={loadPriorities}
              disabled={loading}
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
            >
              {loading ? "Analisando..." : "Atualizar Análise"}
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        {!error && message && (
          <div className="mb-5 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4 text-sm leading-6 text-[#5E6B63]">
            {message}
          </div>
        )}

        {analysis && (
          <div className="mb-5 rounded-[24px] border border-[#CFE6D4] bg-[#EAF7EE] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#256D3C]">
              Leitura Executiva
            </p>

            <p className="mt-2 whitespace-pre-line text-sm leading-7 text-[#256D3C]">
              {analysis}
            </p>
          </div>
        )}

        {loading && items.length === 0 ? (
          <div className="rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-5 text-sm text-[#5E6B63]">
            Analisando chamados ativos da carteira...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-5 text-sm text-[#5E6B63]">
            Não há chamados ativos suficientes para priorização operacional neste momento.
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item, index) => (
              <article
                key={item.ticketId}
                className="rounded-[24px] border border-[#DDE5DF] bg-[#F9FBFA] p-5 transition hover:border-[#256D3C]/35 hover:bg-white"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[#DDE5DF] bg-white px-3 py-1 text-xs font-semibold text-[#5E6B63]">
                        #{index + 1}
                      </span>

                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${priorityClass(
                          item.suggestedPriority,
                        )}`}
                      >
                        Prioridade sugerida: {priorityLabel(item.suggestedPriority)}
                      </span>

                      <span className="rounded-full border border-[#DDE5DF] bg-white px-3 py-1 text-xs font-semibold text-[#5E6B63]">
                        Pontuação {item.score}
                      </span>
                    </div>

                    <h3 className="break-words text-xl font-semibold tracking-tight text-[#17211B]">
                      {normalizeText(item.title)}
                    </h3>

                    <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                      {normalizeText(item.condominiumName)} • {normalizeText(item.location)} • Responsável: {normalizeText(item.assignedTo)}
                    </p>

                    <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <div className="rounded-2xl border border-[#DDE5DF] bg-white p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
                          Motivos Da Priorização
                        </p>

                        <ul className="mt-2 space-y-1 text-sm leading-6 text-[#5E6B63]">
                          {item.reasons.map((reason) => (
                            <li key={reason}>• {reason}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="rounded-2xl border border-[#DDE5DF] bg-white p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
                          Próxima Ação Sugerida
                        </p>

                        <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                          {item.nextAction}
                        </p>
                      </div>
                    </div>
                  </div>

                  <Link
                    href={`/admin/chamados/${item.ticketId}`}
                    className="inline-flex h-11 shrink-0 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
                  >
                    Ver chamado
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}

        <p className="mt-5 text-xs leading-5 text-[#7A877F]">
          A priorização é uma sugestão gerencial baseada nos dados disponíveis. A decisão final e qualquer ação operacional continuam sob responsabilidade da administradora.
        </p>
      </div>
    </section>
  );
}
