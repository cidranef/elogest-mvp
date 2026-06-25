"use client";

import { useEffect, useState } from "react";

import EloGestShell from "@/components/EloGestShell";

type RequestItem = {
  id: string;
  type: string;
  status: string;
  reason: string;
  reviewNotes: string | null;
  createdAt: string;
  administrator: {
    id: string;
    name: string;
    isDemo: boolean;
  };
  subscription: {
    id: string;
    status: string;
    billingInterval: string;
    currentPeriodEnd: string | null;
    nextBillingAt: string | null;
    plan: {
      id: string;
      name: string;
      slug: string;
    };
  };
  targetPlan: {
    id: string;
    name: string;
    slug: string;
  } | null;
};

const TYPE_LABELS: Record<string, string> = {
  UPGRADE: "Upgrade",
  DOWNGRADE: "Downgrade",
  CANCELLATION: "Cancelamento",
  CYCLE_REVIEW: "Revisão Do Ciclo",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  APPROVED: "Aprovada",
  REJECTED: "Recusada",
  WITHDRAWN: "Retirada",
};

function date(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function EloGestSubscriptionRequestsPage() {
  const [items, setItems] = useState<RequestItem[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        "/api/elogest/assinaturas/solicitacoes",
        { cache: "no-store" },
      );
      const data = (await response.json()) as {
        requests?: RequestItem[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error || "Não foi possível carregar as solicitações.",
        );
      }

      setItems(data.requests ?? []);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível carregar as solicitações.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function review(
    id: string,
    decision: "APPROVE" | "REJECT",
  ) {
    setWorkingId(id);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `/api/elogest/assinaturas/solicitacoes/${id}/analisar`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            decision,
            reviewNotes: notes[id] ?? "",
          }),
        },
      );

      const data = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error || "Não foi possível analisar a solicitação.",
        );
      }

      setSuccess(
        decision === "APPROVE"
          ? "Solicitação aprovada e operação aplicada."
          : "Solicitação recusada.",
      );
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível analisar a solicitação.",
      );
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <EloGestShell current="assinaturas">
      <div className="space-y-6">
        <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#256D3C]">
            Etapa 58 — Cobrança E Assinatura
          </p>
          <h1 className="mt-2 text-3xl font-bold text-[#17211B]">
            Solicitações Comerciais
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#66736B]">
            Analise pedidos de mudança de plano, cancelamento e revisão
            de ciclo enviados pelas administradoras.
          </p>
        </section>

        {success && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            {success}
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            {error}
          </div>
        )}

        <section className="space-y-4">
          {items.map((item) => (
            <article
              key={item.id}
              className="rounded-[24px] border border-[#DDE5DF] bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#256D3C]">
                    {TYPE_LABELS[item.type] ?? item.type}
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-[#17211B]">
                    {item.administrator.name}
                  </h2>
                  <p className="mt-1 text-sm text-[#66736B]">
                    Plano atual: {item.subscription.plan.name}
                    {item.targetPlan
                      ? ` • Destino: ${item.targetPlan.name}`
                      : ""}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[#7A877F]">
                    {STATUS_LABELS[item.status] ?? item.status} •{" "}
                    {date(item.createdAt)}
                  </p>
                </div>

                <span className="rounded-full border border-[#DDE5DF] bg-[#F4F7F5] px-3 py-1 text-xs font-bold text-[#334139]">
                  {STATUS_LABELS[item.status] ?? item.status}
                </span>
              </div>

              <div className="mt-4 rounded-2xl bg-[#F7FAF8] px-4 py-3 text-sm leading-6 text-[#334139]">
                {item.reason}
              </div>

              {item.status === "PENDING" && (
                <div className="mt-4">
                  <textarea
                    value={notes[item.id] ?? ""}
                    onChange={(event) =>
                      setNotes((current) => ({
                        ...current,
                        [item.id]: event.target.value,
                      }))
                    }
                    rows={3}
                    placeholder="Justificativa obrigatória para aprovação ou recusa."
                    className="w-full rounded-2xl border border-[#CAD7CE] px-4 py-3 text-sm outline-none focus:border-[#256D3C]"
                  />

                  <div className="mt-3 flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={workingId === item.id}
                      onClick={() => void review(item.id, "APPROVE")}
                      className="h-11 rounded-2xl bg-[#256D3C] px-5 text-sm font-bold text-white disabled:opacity-50"
                    >
                      Aprovar E Aplicar
                    </button>
                    <button
                      type="button"
                      disabled={workingId === item.id}
                      onClick={() => void review(item.id, "REJECT")}
                      className="h-11 rounded-2xl border border-red-200 bg-red-50 px-5 text-sm font-bold text-red-700 disabled:opacity-50"
                    >
                      Recusar
                    </button>
                  </div>
                </div>
              )}

              {item.reviewNotes && (
                <p className="mt-4 text-sm text-[#526158]">
                  <strong>Análise:</strong> {item.reviewNotes}
                </p>
              )}
            </article>
          ))}

          {!loading && items.length === 0 && (
            <div className="rounded-[24px] border border-[#DDE5DF] bg-white px-6 py-12 text-center text-sm font-semibold text-[#718078] shadow-sm">
              Nenhuma solicitação comercial registrada.
            </div>
          )}

          {loading && (
            <div className="rounded-[24px] border border-[#DDE5DF] bg-white px-6 py-12 text-center text-sm font-semibold text-[#718078] shadow-sm">
              Carregando solicitações...
            </div>
          )}
        </section>
      </div>
    </EloGestShell>
  );
}
