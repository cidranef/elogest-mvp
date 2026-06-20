"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type PlanOption = {
  id: string;
  name: string;
  slug: string;
};

type TrialStatusCardProps = {
  administratorId: string;
  planStatus: string;
  planStartedAt?: string | Date | null;
  planExpiresAt?: string | Date | null;
  currentPlanId?: string | null;
  plans: PlanOption[];
};

function formatDate(value?: string | Date | null) {
  if (!value) {
    return "Não informada";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
  }).format(new Date(value));
}

function getDaysRemaining(value?: string | Date | null) {
  if (!value) {
    return null;
  }

  const expiration = new Date(value);
  const now = new Date();
  const difference = expiration.getTime() - now.getTime();

  return Math.ceil(difference / 86_400_000);
}

export default function TrialStatusCard({
  administratorId,
  planStatus,
  planStartedAt,
  planExpiresAt,
  currentPlanId,
  plans,
}: TrialStatusCardProps) {
  const router = useRouter();
  const [planId, setPlanId] = useState(currentPlanId ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const daysRemaining = useMemo(
    () => getDaysRemaining(planExpiresAt),
    [planExpiresAt],
  );

  const isTrial = planStatus === "TRIALING";
  const isExpired = planStatus === "EXPIRED";
  const canActivate = isTrial || isExpired;

  async function activatePlan() {
    if (!planId) {
      setError("Selecione um plano ativo.");
      return;
    }

    if (
      !window.confirm(
        "Ativar este plano comercial e encerrar o período de trial?",
      )
    ) {
      return;
    }

    try {
      setError(null);
      setLoading(true);

      const response = await fetch(
        `/api/elogest/administradoras/${administratorId}/trial/ativar`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            planId,
          }),
        },
      );

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          payload?.error || "Não foi possível ativar o plano comercial.",
        );
      }

      router.refresh();
      window.location.reload();
    } catch (activationError) {
      setError(
        activationError instanceof Error
          ? activationError.message
          : "Não foi possível ativar o plano comercial.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-3xl border border-[#DDE5DF] bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#256D3C]">
            Situação Comercial
          </p>

          <h2 className="mt-2 text-xl font-bold text-[#17211B]">
            {isExpired
              ? "Trial Expirado"
              : isTrial
                ? "Trial Em Andamento"
                : "Plano Comercial Ativo"}
          </h2>

          <p className="mt-3 text-sm leading-6 text-[#64736A]">
            Início: {formatDate(planStartedAt)}
            <br />
            Expiração: {formatDate(planExpiresAt)}
          </p>

          {isTrial && daysRemaining !== null && (
            <p
              className={[
                "mt-3 inline-flex rounded-full px-3 py-1 text-xs font-bold",
                daysRemaining <= 3
                  ? "bg-amber-100 text-amber-900"
                  : "bg-[#EAF7EE] text-[#256D3C]",
              ].join(" ")}
            >
              {daysRemaining > 0
                ? `${daysRemaining} dia(s) restante(s)`
                : "Expiração pendente de processamento"}
            </p>
          )}

          {isExpired && (
            <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
              O acesso aos módulos do plano está bloqueado até a ativação de um
              plano comercial.
            </p>
          )}
        </div>

        {canActivate && (
          <div className="w-full max-w-md rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
            <label className="block text-sm font-bold text-[#17211B]">
              Plano Para Ativação
            </label>

            <select
              value={planId}
              onChange={(event) => setPlanId(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-[#DDE5DF] bg-white px-4 py-3 text-sm font-semibold text-[#17211B] outline-none focus:border-[#256D3C]"
            >
              <option value="">Selecione um plano</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={activatePlan}
              disabled={loading || !planId}
              className="mt-3 inline-flex w-full items-center justify-center rounded-2xl bg-[#256D3C] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#174B2A] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Ativando..." : "Ativar Plano Comercial"}
            </button>

            {error && (
              <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
