"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";

type CycleSubscription = {
  id: string;
  status: string;
  billingInterval: string;
  isComplimentary: boolean;
  startedAt: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextBillingAt: string | null;
  cancelAtPeriodEnd: boolean;
  cancellationScheduledAt: string | null;
  administrator: {
    id: string;
    name: string;
    isDemo: boolean;
  };
};

function toDateInput(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function toIsoDate(value: string) {
  return new Date(`${value}T12:00:00`).toISOString();
}

function suggestedEndDate(
  startValue: string,
  billingInterval: string,
) {
  if (!startValue) return "";

  const date = new Date(`${startValue}T12:00:00`);

  if (billingInterval === "ANNUAL") {
    date.setFullYear(date.getFullYear() + 1);
  } else {
    date.setMonth(date.getMonth() + 1);
  }

  return date.toISOString().slice(0, 10);
}

export function AssinaturaCycleDatesClient({
  subscriptionId,
}: {
  subscriptionId: string;
}) {
  const [subscription, setSubscription] =
    useState<CycleSubscription | null>(null);
  const [currentPeriodStart, setCurrentPeriodStart] =
    useState("");
  const [currentPeriodEnd, setCurrentPeriodEnd] =
    useState("");
  const [nextBillingAt, setNextBillingAt] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(
    null,
  );
  const [success, setSuccess] = useState<string | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/elogest/assinaturas/${subscriptionId}/datas-ciclo`,
        {
          cache: "no-store",
        },
      );

      const data = (await response.json()) as {
        subscription?: CycleSubscription;
        error?: string;
      };

      if (!response.ok || !data.subscription) {
        throw new Error(
          data.error ||
            "Não foi possível carregar as datas do ciclo.",
        );
      }

      const loaded = data.subscription;

      setSubscription(loaded);

      const start =
        toDateInput(loaded.currentPeriodStart) ||
        toDateInput(loaded.startedAt);

      const end =
        toDateInput(loaded.currentPeriodEnd) ||
        suggestedEndDate(
          start,
          loaded.billingInterval,
        );

      setCurrentPeriodStart(start);
      setCurrentPeriodEnd(end);
      setNextBillingAt(
        loaded.isComplimentary
          ? ""
          : toDateInput(loaded.nextBillingAt) || end,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível carregar as datas do ciclo.",
      );
    } finally {
      setLoading(false);
    }
  }, [subscriptionId]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleStartChange(value: string) {
    setCurrentPeriodStart(value);

    if (!subscription) return;

    const suggested = suggestedEndDate(
      value,
      subscription.billingInterval,
    );

    setCurrentPeriodEnd(suggested);

    if (!subscription.isComplimentary) {
      setNextBillingAt(suggested);
    }
  }

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !currentPeriodStart ||
      !currentPeriodEnd ||
      !reason.trim()
    ) {
      setError(
        "Informe início, fim do ciclo e justificativa.",
      );
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(
        `/api/elogest/assinaturas/${subscriptionId}/datas-ciclo`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            currentPeriodStart: toIsoDate(
              currentPeriodStart,
            ),
            currentPeriodEnd: toIsoDate(
              currentPeriodEnd,
            ),
            nextBillingAt:
              subscription?.isComplimentary ||
              !nextBillingAt
                ? undefined
                : toIsoDate(nextBillingAt),
            reason,
          }),
        },
      );

      const data = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Não foi possível atualizar as datas.",
        );
      }

      setSuccess(
        "Datas do ciclo atualizadas com sucesso.",
      );
      setReason("");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível atualizar as datas.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading && !subscription) {
    return (
      <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 text-sm font-semibold text-[#718078] shadow-sm">
        Carregando datas do ciclo...
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

  return (
    <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.17em] text-[#256D3C]">
          Período Contratual
        </p>
        <h2 className="mt-2 text-2xl font-bold text-[#17211B]">
          Datas Do Ciclo Atual
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#66736B]">
          Defina o período vigente e a próxima cobrança.
          O fim do ciclo é obrigatório para permitir
          cancelamento ao final do período.
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
        className="mt-5 grid gap-4 lg:grid-cols-3"
      >
        <label className="space-y-2">
          <span className="text-sm font-bold text-[#334139]">
            Início Do Ciclo
          </span>
          <input
            type="date"
            value={currentPeriodStart}
            onChange={(event) =>
              handleStartChange(event.target.value)
            }
            className="h-12 w-full rounded-2xl border border-[#CAD7CE] bg-white px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-bold text-[#334139]">
            Fim Do Ciclo
          </span>
          <input
            type="date"
            value={currentPeriodEnd}
            onChange={(event) =>
              setCurrentPeriodEnd(event.target.value)
            }
            className="h-12 w-full rounded-2xl border border-[#CAD7CE] bg-white px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-bold text-[#334139]">
            Próxima Cobrança
          </span>
          <input
            type="date"
            value={nextBillingAt}
            disabled={subscription.isComplimentary}
            onChange={(event) =>
              setNextBillingAt(event.target.value)
            }
            className="h-12 w-full rounded-2xl border border-[#CAD7CE] bg-white px-4 text-sm font-semibold outline-none focus:border-[#256D3C] disabled:bg-[#F2F5F3] disabled:text-[#9AA7A0]"
          />
        </label>

        <label className="space-y-2 lg:col-span-3">
          <span className="text-sm font-bold text-[#334139]">
            Justificativa
          </span>
          <textarea
            value={reason}
            onChange={(event) =>
              setReason(event.target.value)
            }
            rows={3}
            placeholder="Ex.: regularização inicial do ciclo da assinatura migrada."
            className="w-full rounded-2xl border border-[#CAD7CE] bg-white px-4 py-3 text-sm outline-none focus:border-[#256D3C]"
          />
        </label>

        <div className="lg:col-span-3">
          <button
            type="submit"
            disabled={saving}
            className="h-11 rounded-2xl bg-[#256D3C] px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving
              ? "Salvando Datas..."
              : "Salvar Datas Do Ciclo"}
          </button>
        </div>
      </form>
    </section>
  );
}
