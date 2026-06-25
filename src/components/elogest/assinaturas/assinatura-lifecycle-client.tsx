"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Plan = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  monthlyPriceCents: number | null;
  annualPriceCents: number | null;
  maxCondominiums: number | null;
  maxUsers: number | null;
  maxProviders: number | null;
};

type Subscription = {
  id: string;
  status: string;
  billingInterval: string;
  finalPriceCents: number;
  currentPeriodEnd: string | null;
  nextBillingAt: string | null;
  cancelAtPeriodEnd: boolean;
  cancellationScheduledAt: string | null;
  cancellationReason: string | null;
  administrator: {
    id: string;
    name: string;
    isDemo: boolean;
  };
  plan: {
    id: string;
    name: string;
  };
};

type Assessment = {
  allowed: boolean;
  isDowngrade: boolean;
  usage: {
    condominiums: number;
    users: number;
    providers: number;
  };
  violations: Array<{
    key: string;
    label: string;
    used: number;
    limit: number;
  }>;
};

function formatMoney(value: number | null) {
  if (value === null) return "Personalizado";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value / 100);
}

const SUBSCRIPTION_UPDATED_EVENT = "elogest:subscription-updated";

function dateInput(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

export function AssinaturaLifecycleClient({
  subscriptionId,
}: {
  subscriptionId: string;
}) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [reason, setReason] = useState("");
  const [nextBillingAt, setNextBillingAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [subscriptionResponse, plansResponse] = await Promise.all([
        fetch(`/api/elogest/assinaturas/${subscriptionId}`, {
          cache: "no-store",
        }),
        fetch(`/api/elogest/assinaturas/${subscriptionId}/ciclo`, {
          cache: "no-store",
        }),
      ]);

      const subscriptionData = (await subscriptionResponse.json()) as {
        subscription?: Subscription;
        error?: string;
      };
      const plansData = (await plansResponse.json()) as {
        plans?: Plan[];
        error?: string;
      };

      if (!subscriptionResponse.ok || !subscriptionData.subscription) {
        throw new Error(
          subscriptionData.error || "Não foi possível carregar a assinatura.",
        );
      }

      if (!plansResponse.ok) {
        throw new Error(
          plansData.error || "Não foi possível carregar os planos.",
        );
      }

      setSubscription(subscriptionData.subscription);
      setPlans(plansData.plans ?? []);
      setSelectedPlanId(subscriptionData.subscription.plan.id);
      setNextBillingAt(dateInput(subscriptionData.subscription.nextBillingAt));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível carregar o ciclo da assinatura.",
      );
    } finally {
      setLoading(false);
    }
  }, [subscriptionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedPlanId || selectedPlanId === subscription?.plan.id) {
      setAssessment(null);
      return;
    }

    const controller = new AbortController();

    async function assess() {
      try {
        const response = await fetch(
          `/api/elogest/assinaturas/${subscriptionId}/ciclo?newPlanId=${encodeURIComponent(selectedPlanId)}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );
        const data = (await response.json()) as {
          assessment?: Assessment;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(
            data.error || "Não foi possível validar o plano de destino.",
          );
        }

        setAssessment(data.assessment ?? null);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }

        setError(
          caught instanceof Error
            ? caught.message
            : "Não foi possível validar o plano de destino.",
        );
      }
    }

    void assess();

    return () => controller.abort();
  }, [selectedPlanId, subscription?.plan.id, subscriptionId]);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) ?? null,
    [plans, selectedPlanId],
  );

  type ActionResponse = {
    error?: string;
    assessment?: {
      isDowngrade?: boolean;
    };
  };

  async function runAction(
    body: Record<string, unknown>,
    successMessage:
      | string
      | ((data: ActionResponse) => string),
  ) {
    setWorking(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `/api/elogest/assinaturas/${subscriptionId}/ciclo`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );

      const data = (await response.json()) as ActionResponse;

      if (!response.ok) {
        throw new Error(
          data.error || "Não foi possível concluir a operação.",
        );
      }

      const resolvedMessage =
        typeof successMessage === "function"
          ? successMessage(data)
          : successMessage;

      setSuccess(resolvedMessage);
      setReason("");
      await load();

      window.dispatchEvent(
        new CustomEvent(SUBSCRIPTION_UPDATED_EVENT, {
          detail: { subscriptionId },
        }),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível concluir a operação.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function changePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedPlanId || selectedPlanId === subscription?.plan.id) {
      setError("Selecione um plano diferente do atual.");
      return;
    }

    if (!reason.trim()) {
      setError("Informe o motivo da alteração do plano.");
      return;
    }

    await runAction(
      {
        action: "change_plan",
        newPlanId: selectedPlanId,
        billingInterval: subscription?.billingInterval,
        reason,
      },
      (data) =>
        data.assessment?.isDowngrade === true
          ? "Downgrade realizado com sucesso."
          : "Upgrade realizado com sucesso.",
    );
  }

  if (loading && !subscription) {
    return (
      <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 text-sm font-semibold text-[#718078] shadow-sm">
        Carregando ciclo comercial...
      </section>
    );
  }

  if (!subscription) {
    return (
      <section className="rounded-[28px] border border-red-200 bg-red-50 p-6 text-sm font-semibold text-red-800">
        {error || "Assinatura não encontrada."}
      </section>
    );
  }

  const canReactivate = [
    "CANCELED",
    "EXPIRED",
    "SUSPENDED",
    "PAST_DUE",
  ].includes(subscription.status);

  return (
    <section className="space-y-5 rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.17em] text-[#256D3C]">
          Gestão Do Ciclo
        </p>
        <h2 className="mt-2 text-2xl font-bold text-[#17211B]">
          Upgrade, Downgrade E Cancelamento
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#66736B]">
          Todas as operações exigem justificativa e são registradas no histórico
          da assinatura.
        </p>
      </div>

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

      {subscription.cancelAtPeriodEnd && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
          <p className="font-bold">Cancelamento Agendado</p>
          <p className="mt-1">
            A assinatura será encerrada ao final do ciclo atual.
          </p>
          {subscription.cancellationReason && (
            <p className="mt-2">
              <strong>Motivo:</strong> {subscription.cancellationReason}
            </p>
          )}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <form
          onSubmit={changePlan}
          className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-5"
        >
          <h3 className="text-lg font-bold text-[#17211B]">
            Alterar Plano
          </h3>
          <p className="mt-1 text-sm text-[#718078]">
            Plano atual: <strong>{subscription.plan.name}</strong>
          </p>

          <label className="mt-4 block space-y-2">
            <span className="text-sm font-bold text-[#334139]">
              Plano De Destino
            </span>
            <select
              value={selectedPlanId}
              onChange={(event) => setSelectedPlanId(event.target.value)}
              className="h-12 w-full rounded-2xl border border-[#CAD7CE] bg-white px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
            >
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} — {formatMoney(plan.monthlyPriceCents)}/mês
                </option>
              ))}
            </select>
          </label>

          {selectedPlan &&
            selectedPlan.id !== subscription.plan.id &&
            assessment && (
              <div
                className={[
                  "mt-4 rounded-2xl border px-4 py-3 text-sm",
                  assessment.allowed
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-red-200 bg-red-50 text-red-900",
                ].join(" ")}
              >
                <p className="font-bold">
                  {assessment.isDowngrade ? "Downgrade" : "Upgrade"} Detectado
                </p>
                <p className="mt-1">
                  Uso atual: {assessment.usage.condominiums} condomínios,{" "}
                  {assessment.usage.users} usuários e{" "}
                  {assessment.usage.providers} fornecedores.
                </p>

                {assessment.violations.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {assessment.violations.map((violation) => (
                      <p key={violation.key}>
                        {violation.label}: {violation.used} em uso para limite{" "}
                        {violation.limit}.
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

          <label className="mt-4 block space-y-2">
            <span className="text-sm font-bold text-[#334139]">
              Motivo
            </span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              className="w-full rounded-2xl border border-[#CAD7CE] bg-white px-4 py-3 text-sm outline-none focus:border-[#256D3C]"
              placeholder="Descreva o motivo da alteração."
            />
          </label>

          <button
            type="submit"
            disabled={
              working ||
              selectedPlanId === subscription.plan.id ||
              assessment?.allowed === false
            }
            className="mt-4 h-11 rounded-2xl bg-[#256D3C] px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Confirmar Alteração
          </button>
        </form>

        <div className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-5">
          <h3 className="text-lg font-bold text-[#17211B]">
            Cancelamento E Reativação
          </h3>

          <label className="mt-4 block space-y-2">
            <span className="text-sm font-bold text-[#334139]">
              Justificativa
            </span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              className="w-full rounded-2xl border border-[#CAD7CE] bg-white px-4 py-3 text-sm outline-none focus:border-[#256D3C]"
              placeholder="Motivo obrigatório para a operação."
            />
          </label>

          {canReactivate && (
            <label className="mt-4 block space-y-2">
              <span className="text-sm font-bold text-[#334139]">
                Próxima Cobrança
              </span>
              <input
                type="date"
                value={nextBillingAt}
                onChange={(event) => setNextBillingAt(event.target.value)}
                className="h-12 w-full rounded-2xl border border-[#CAD7CE] bg-white px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
              />
            </label>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            {!canReactivate && !subscription.cancelAtPeriodEnd && (
              <button
                type="button"
                disabled={working || subscription.administrator.isDemo}
                onClick={() =>
                  void runAction(
                    {
                      action: "schedule_cancel",
                      reason,
                    },
                    "Cancelamento agendado para o final do ciclo.",
                  )
                }
                className="h-11 rounded-2xl border border-amber-300 bg-amber-50 px-4 text-sm font-bold text-amber-900 disabled:opacity-50"
              >
                Cancelar Ao Final Do Ciclo
              </button>
            )}

            {subscription.cancelAtPeriodEnd && (
              <button
                type="button"
                disabled={working}
                onClick={() =>
                  void runAction(
                    {
                      action: "reverse_cancel",
                      reason,
                    },
                    "Cancelamento agendado revertido.",
                  )
                }
                className="h-11 rounded-2xl border border-[#CAD7CE] bg-white px-4 text-sm font-bold text-[#256D3C] disabled:opacity-50"
              >
                Reverter Cancelamento
              </button>
            )}

            {!canReactivate && (
              <button
                type="button"
                disabled={working || subscription.administrator.isDemo}
                onClick={() => {
                  if (
                    window.confirm(
                      "Confirma o cancelamento imediato? O acesso comercial será encerrado agora.",
                    )
                  ) {
                    void runAction(
                      {
                        action: "cancel_now",
                        reason,
                      },
                      "Assinatura cancelada imediatamente.",
                    );
                  }
                }}
                className="h-11 rounded-2xl bg-red-700 px-4 text-sm font-bold text-white disabled:opacity-50"
              >
                Cancelar Agora
              </button>
            )}

            {canReactivate && (
              <button
                type="button"
                disabled={working}
                onClick={() =>
                  void runAction(
                    {
                      action: "reactivate",
                      reason,
                      nextBillingAt: nextBillingAt
                        ? new Date(
                            `${nextBillingAt}T12:00:00`,
                          ).toISOString()
                        : undefined,
                    },
                    "Assinatura reativada.",
                  )
                }
                className="h-11 rounded-2xl bg-[#256D3C] px-4 text-sm font-bold text-white disabled:opacity-50"
              >
                Reativar Assinatura
              </button>
            )}
          </div>

          {subscription.administrator.isDemo && (
            <p className="mt-4 text-sm font-semibold text-amber-800">
              A administradora Demo não pode ser cancelada por este fluxo.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
