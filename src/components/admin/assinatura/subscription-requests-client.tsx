"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Plan = {
  id: string;
  name: string;
  slug: string;
  monthlyPriceCents: number | null;
};

type CommercialRequest = {
  id: string;
  type: string;
  status: string;
  reason: string;
  reviewNotes: string | null;
  createdAt: string;
  reviewedAt: string | null;
  targetPlan: Plan | null;
};

const TYPE_LABELS: Record<string, string> = {
  UPGRADE: "Upgrade",
  DOWNGRADE: "Downgrade",
  CANCELLATION: "Cancelamento",
  CYCLE_REVIEW: "Revisão Do Ciclo",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Aguardando Análise",
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

function money(value: number | null) {
  if (value === null || value <= 0) {
    return "Valor a definir";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value / 100);
}

export function SubscriptionRequestsClient({
  currentPlanId,
  cycleOverdue,
}: {
  currentPlanId: string;
  cycleOverdue: boolean;
}) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [requests, setRequests] = useState<CommercialRequest[]>([]);
  const [action, setAction] = useState("PLAN_CHANGE");
  const [targetPlanId, setTargetPlanId] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        "/api/admin/assinatura/solicitacoes",
        { cache: "no-store" },
      );
      const data = (await response.json()) as {
        plans?: Plan[];
        requests?: CommercialRequest[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error || "Não foi possível carregar as solicitações.",
        );
      }

      setPlans(data.plans ?? []);
      setRequests(data.requests ?? []);
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

  const availablePlans = useMemo(
    () => plans.filter((plan) => plan.id !== currentPlanId),
    [currentPlanId, plans],
  );

  useEffect(() => {
    if (
      action === "PLAN_CHANGE" &&
      !availablePlans.some((plan) => plan.id === targetPlanId)
    ) {
      setTargetPlanId(availablePlans[0]?.id ?? "");
    }
  }, [action, availablePlans, targetPlanId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        "/api/admin/assinatura/solicitacoes",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            action,
            targetPlanId:
              action === "PLAN_CHANGE" ? targetPlanId : undefined,
            reason,
          }),
        },
      );

      const data = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error || "Não foi possível enviar a solicitação.",
        );
      }

      setReason("");
      setSuccess("Solicitação enviada para análise do EloGest.");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível enviar a solicitação.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function withdraw(id: string) {
    setWorkingId(id);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `/api/admin/assinatura/solicitacoes/${id}/retirar`,
        { method: "POST" },
      );
      const data = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error || "Não foi possível retirar a solicitação.",
        );
      }

      setSuccess("Solicitação retirada.");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível retirar a solicitação.",
      );
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#256D3C]">
          Atendimento Comercial
        </p>
        <h2 className="mt-2 text-2xl font-bold text-[#17211B]">
          Solicitações Da Assinatura
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#66736B]">
          Solicite alteração de plano, cancelamento ou revisão do ciclo.
          Nenhuma mudança será aplicada sem análise do EloGest.
        </p>
      </div>

      {success && (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {success}
        </div>
      )}

      {error && (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {error}
        </div>
      )}

      <form
        onSubmit={submit}
        className="mt-5 grid gap-4 rounded-2xl bg-[#F7FAF8] p-5 lg:grid-cols-2"
      >
        <label className="space-y-2">
          <span className="text-sm font-bold text-[#334139]">
            Tipo Da Solicitação
          </span>
          <select
            value={action}
            onChange={(event) => setAction(event.target.value)}
            className="h-12 w-full rounded-2xl border border-[#CAD7CE] bg-white px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
          >
            <option value="PLAN_CHANGE">Alteração De Plano</option>
            <option value="CANCELLATION">Cancelamento</option>
            <option value="CYCLE_REVIEW">
              Revisão Das Datas Do Ciclo
            </option>
          </select>
        </label>

        {action === "PLAN_CHANGE" && (
          <label className="space-y-2">
            <span className="text-sm font-bold text-[#334139]">
              Plano Desejado
            </span>
            <select
              value={targetPlanId}
              onChange={(event) => setTargetPlanId(event.target.value)}
              className="h-12 w-full rounded-2xl border border-[#CAD7CE] bg-white px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
            >
              {availablePlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} — {money(plan.monthlyPriceCents)}
                </option>
              ))}
            </select>
          </label>
        )}

        {action === "CYCLE_REVIEW" && !cycleOverdue && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            O ciclo não está vencido, mas a solicitação pode ser enviada
            para conferência das datas.
          </div>
        )}

        <label className="space-y-2 lg:col-span-2">
          <span className="text-sm font-bold text-[#334139]">
            Justificativa
          </span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={4}
            placeholder="Explique o motivo da solicitação."
            className="w-full rounded-2xl border border-[#CAD7CE] bg-white px-4 py-3 text-sm outline-none focus:border-[#256D3C]"
          />
        </label>

        <div className="lg:col-span-2">
          <button
            type="submit"
            disabled={
              saving ||
              (action === "PLAN_CHANGE" && !targetPlanId)
            }
            className="h-11 rounded-2xl bg-[#256D3C] px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Enviando..." : "Enviar Solicitação"}
          </button>
        </div>
      </form>

      <div className="mt-6">
        <h3 className="text-lg font-bold text-[#17211B]">
          Histórico De Solicitações
        </h3>

        <div className="mt-3 space-y-3">
          {requests.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-[#DDE5DF] px-4 py-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-bold text-[#17211B]">
                    {TYPE_LABELS[item.type] ?? item.type}
                    {item.targetPlan
                      ? ` — ${item.targetPlan.name}`
                      : ""}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[#718078]">
                    {STATUS_LABELS[item.status] ?? item.status} •{" "}
                    {date(item.createdAt)}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-[#526158]">
                    {item.reason}
                  </p>
                  {item.reviewNotes && (
                    <p className="mt-3 rounded-xl bg-[#F4F7F5] px-3 py-2 text-sm text-[#334139]">
                      <strong>Retorno EloGest:</strong>{" "}
                      {item.reviewNotes}
                    </p>
                  )}
                </div>

                {item.status === "PENDING" && (
                  <button
                    type="button"
                    disabled={workingId === item.id}
                    onClick={() => void withdraw(item.id)}
                    className="h-10 rounded-xl border border-red-200 bg-red-50 px-4 text-xs font-bold text-red-700 disabled:opacity-50"
                  >
                    Retirar Solicitação
                  </button>
                )}
              </div>
            </div>
          ))}

          {!loading && requests.length === 0 && (
            <p className="rounded-2xl bg-[#F4F7F5] px-4 py-6 text-center text-sm font-semibold text-[#718078]">
              Nenhuma solicitação registrada.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
