"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";

type Subscription = {
  id: string;
  status: string;
  billingInterval: string;
  basePriceCents: number;
  discountCents: number;
  finalPriceCents: number;
  implementationFeeCents: number;
  isComplimentary: boolean;
  manualBillingOnly: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextBillingAt: string | null;
  administrator: {
    id: string;
    name: string;
    isDemo: boolean;
  };
};

type Props = {
  subscriptionId: string;
};

const SUBSCRIPTION_UPDATED_EVENT =
  "elogest:subscription-updated";

function toDateInput(value?: string | null) {
  if (!value) {
    return "";
  }

  return value.slice(0, 10);
}

function centsFromCurrencyInput(value: string) {
  const normalized = value
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();

  const amount = Number(normalized);

  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return Math.round(amount * 100);
}

function currencyInputFromCents(value: number) {
  return (value / 100)
    .toFixed(2)
    .replace(".", ",");
}

function dispatchSubscriptionUpdated(
  subscriptionId: string,
) {
  window.dispatchEvent(
    new CustomEvent(SUBSCRIPTION_UPDATED_EVENT, {
      detail: {
        subscriptionId,
      },
    }),
  );
}

export function AssinaturaCommercialConfigurationClient({
  subscriptionId,
}: Props) {
  const [subscription, setSubscription] =
    useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);
  const [success, setSuccess] =
    useState<string | null>(null);

  const [contractedValue, setContractedValue] =
    useState("");
  const [billingInterval, setBillingInterval] =
    useState("MONTHLY");
  const [currentPeriodStart, setCurrentPeriodStart] =
    useState("");
  const [currentPeriodEnd, setCurrentPeriodEnd] =
    useState("");
  const [nextBillingAt, setNextBillingAt] =
    useState("");
  const [recurringEnabled, setRecurringEnabled] =
    useState(false);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/elogest/assinaturas/${subscriptionId}/configuracao-comercial`,
        {
          cache: "no-store",
        },
      );

      const body = (await response.json()) as {
        subscription?: Subscription;
        error?: string;
      };

      if (!response.ok || !body.subscription) {
        throw new Error(
          body.error ??
            "Não foi possível carregar a configuração comercial.",
        );
      }

      const item = body.subscription;

      setSubscription(item);
      setContractedValue(
        currencyInputFromCents(
          item.finalPriceCents,
        ),
      );
      setBillingInterval(
        item.billingInterval === "ANNUAL"
          ? "ANNUAL"
          : "MONTHLY",
      );
      setCurrentPeriodStart(
        toDateInput(item.currentPeriodStart),
      );
      setCurrentPeriodEnd(
        toDateInput(item.currentPeriodEnd),
      );
      setNextBillingAt(
        toDateInput(item.nextBillingAt),
      );
      setRecurringEnabled(
        !item.manualBillingOnly,
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível carregar a configuração comercial.",
      );
    } finally {
      setLoading(false);
    }
  }, [subscriptionId]);

  useEffect(() => {
    void load();
  }, [load]);

  function suggestPeriodEnd(
    start: string,
    interval: string,
  ) {
    if (!start) {
      return;
    }

    const value = new Date(`${start}T12:00:00`);

    if (interval === "ANNUAL") {
      value.setFullYear(value.getFullYear() + 1);
    } else {
      value.setMonth(value.getMonth() + 1);
    }

    const suggested = value
      .toISOString()
      .slice(0, 10);

    setCurrentPeriodEnd(suggested);
    setNextBillingAt(suggested);
  }

  function handleStartChange(value: string) {
    setCurrentPeriodStart(value);
    suggestPeriodEnd(value, billingInterval);
  }

  function handleIntervalChange(value: string) {
    setBillingInterval(value);

    if (currentPeriodStart) {
      suggestPeriodEnd(
        currentPeriodStart,
        value,
      );
    }
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const contractedValueCents =
      centsFromCurrencyInput(contractedValue);

    if (
      contractedValueCents === null ||
      !currentPeriodStart ||
      !currentPeriodEnd
    ) {
      setError(
        "Informe valor, início e fim do ciclo.",
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `/api/elogest/assinaturas/${subscriptionId}/configuracao-comercial`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contractedValueCents,
            billingInterval,
            currentPeriodStart: new Date(
              `${currentPeriodStart}T12:00:00`,
            ).toISOString(),
            currentPeriodEnd: new Date(
              `${currentPeriodEnd}T12:00:00`,
            ).toISOString(),
            nextBillingAt: nextBillingAt
              ? new Date(
                  `${nextBillingAt}T12:00:00`,
                ).toISOString()
              : null,
            recurringEnabled,
            reason,
          }),
        },
      );

      const body = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          body.error ??
            "Não foi possível salvar a configuração comercial.",
        );
      }

      setSuccess(
        "Configuração comercial atualizada.",
      );
      setReason("");

      await load();
      dispatchSubscriptionUpdated(subscriptionId);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível salvar a configuração comercial.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && !subscription) {
    return (
      <section className="rounded-[24px] border border-[#DCE6DF] bg-white p-6 text-sm text-[#5C6B62] shadow-sm">
        Carregando configuração comercial...
      </section>
    );
  }

  if (!subscription) {
    return (
      <section className="rounded-[24px] border border-red-200 bg-red-50 p-5 text-sm text-red-800">
        {error ??
          "Configuração comercial não encontrada."}
      </section>
    );
  }

  const recurringBlocked =
    subscription.isComplimentary ||
    subscription.administrator.isDemo;

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[24px] border border-[#DCE6DF] bg-white p-6 shadow-sm"
    >
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#256D3C]">
          Configuração Comercial
        </p>
        <h2 className="mt-2 text-2xl font-black text-[#17211B]">
          Valor, Ciclo E Recorrência
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5C6B62]">
          Defina os dados usados na cobrança da
          assinatura. Toda alteração exige
          justificativa e será registrada no histórico.
        </p>
      </div>

      {error ? (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {success}
        </div>
      ) : null}

      <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <label className="block">
          <span className="text-sm font-bold text-[#354239]">
            Valor Contratado
          </span>
          <div className="mt-1 flex rounded-xl border border-[#CAD7CE] bg-white">
            <span className="flex items-center border-r border-[#CAD7CE] px-3 text-sm font-bold text-[#5C6B62]">
              R$
            </span>
            <input
              value={contractedValue}
              onChange={(event) =>
                setContractedValue(
                  event.target.value,
                )
              }
              inputMode="decimal"
              placeholder="0,00"
              className="min-w-0 flex-1 rounded-r-xl px-3 py-2.5 text-sm text-[#17211B] outline-none"
            />
          </div>
        </label>

        <label className="block">
          <span className="text-sm font-bold text-[#354239]">
            Periodicidade
          </span>
          <select
            value={billingInterval}
            onChange={(event) =>
              handleIntervalChange(
                event.target.value,
              )
            }
            className="mt-1 w-full rounded-xl border border-[#CAD7CE] bg-white px-3 py-2.5 text-sm text-[#17211B]"
          >
            <option value="MONTHLY">
              Mensal
            </option>
            <option value="ANNUAL">
              Anual
            </option>
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-bold text-[#354239]">
            Tipo De Cobrança
          </span>
          <select
            value={
              recurringEnabled
                ? "RECURRING"
                : "MANUAL"
            }
            onChange={(event) =>
              setRecurringEnabled(
                event.target.value ===
                  "RECURRING",
              )
            }
            disabled={recurringBlocked}
            className="mt-1 w-full rounded-xl border border-[#CAD7CE] bg-white px-3 py-2.5 text-sm text-[#17211B] disabled:bg-[#F4F7F5] disabled:text-[#7A877F]"
          >
            <option value="MANUAL">
              Manual
            </option>
            <option value="RECURRING">
              Recorrente
            </option>
          </select>
          {recurringBlocked ? (
            <span className="mt-1 block text-xs font-medium text-amber-800">
              Demo e cortesia permanecem sem cobrança
              recorrente.
            </span>
          ) : null}
        </label>

        <label className="block">
          <span className="text-sm font-bold text-[#354239]">
            Início Do Ciclo
          </span>
          <input
            type="date"
            value={currentPeriodStart}
            onChange={(event) =>
              handleStartChange(
                event.target.value,
              )
            }
            className="mt-1 w-full rounded-xl border border-[#CAD7CE] bg-white px-3 py-2.5 text-sm text-[#17211B]"
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold text-[#354239]">
            Fim Do Ciclo
          </span>
          <input
            type="date"
            value={currentPeriodEnd}
            onChange={(event) =>
              setCurrentPeriodEnd(
                event.target.value,
              )
            }
            className="mt-1 w-full rounded-xl border border-[#CAD7CE] bg-white px-3 py-2.5 text-sm text-[#17211B]"
          />
        </label>

        <label className="block">
          <span className="text-sm font-bold text-[#354239]">
            Próxima Cobrança
          </span>
          <input
            type="date"
            value={nextBillingAt}
            onChange={(event) =>
              setNextBillingAt(
                event.target.value,
              )
            }
            disabled={
              subscription.isComplimentary
            }
            className="mt-1 w-full rounded-xl border border-[#CAD7CE] bg-white px-3 py-2.5 text-sm text-[#17211B] disabled:bg-[#F4F7F5]"
          />
        </label>
      </div>

      <label className="mt-5 block">
        <span className="text-sm font-bold text-[#354239]">
          Justificativa
        </span>
        <textarea
          value={reason}
          onChange={(event) =>
            setReason(event.target.value)
          }
          rows={3}
          placeholder="Explique o motivo da alteração comercial."
          className="mt-1 w-full rounded-xl border border-[#CAD7CE] bg-white px-3 py-2.5 text-sm text-[#17211B]"
        />
      </label>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-xl bg-[#256D3C] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#1F5A33] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting
            ? "Salvando..."
            : "Salvar Configuração Comercial"}
        </button>

        <button
          type="button"
          onClick={() => void load()}
          disabled={submitting}
          className="rounded-xl border border-[#CAD7CE] bg-white px-5 py-2.5 text-sm font-bold text-[#256D3C] transition hover:border-[#256D3C] hover:bg-[#F4F7F5] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Restaurar Dados
        </button>
      </div>
    </form>
  );
}
