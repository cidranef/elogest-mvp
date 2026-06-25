"use client";

import { useCallback, useEffect, useState } from "react";

type SubscriptionItem = {
  id: string;
  administrator: {
    id: string;
    name: string;
    isDemo: boolean;
  };
  plan: {
    id: string;
    name: string;
  };
  status: string;
  billingInterval: string;
  finalPriceCents: number;
  isComplimentary: boolean;
  manualBillingOnly: boolean;
  recurringEnabled: boolean;
  nextBillingAt: string | null;
  configurationEligible: boolean;
  dueNow: boolean;
  reasons: string[];
};

type StatusData = {
  configuration: {
    automaticBillingEnabled: boolean;
    provider: string;
    environment: string;
  };
  counters: {
    subscriptions: number;
    recurringEnabled: number;
    eligible: number;
    dueNow: number;
    generatedCharges: number;
  };
  subscriptions: SubscriptionItem[];
  cron: {
    endpoint: string;
    recommendedFrequency: string;
  };
};

type ProcessingResult = {
  subscriptionsExamined: number;
  subscriptionsEligible: number;
  chargesCreated: number;
  duplicateCyclesSkipped: number;
  notificationsCreated: number;
  automaticBillingEnabled: boolean;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value / 100);
}

function formatDate(value?: string | null) {
  if (!value) {
    return "Não Definida";
  }

  return new Intl.DateTimeFormat("pt-BR").format(
    new Date(value),
  );
}


function formatSubscriptionStatus(status: string) {
  const labels: Record<string, string> = {
    ACTIVE: "Ativa",
    TRIALING: "Em Trial",
    EXPIRING_SOON: "Expira Em Breve",
    PAST_DUE: "Inadimplente",
    SUSPENDED: "Suspensa",
    CANCELED: "Cancelada",
    EXPIRED: "Expirada",
  };

  return labels[status] ?? status;
}

export function RecurringBillingControlClient() {
  const [data, setData] = useState<StatusData | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [updatingId, setUpdatingId] =
    useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        "/api/elogest/assinaturas/recorrencia/status",
        {
          cache: "no-store",
        },
      );

      const body = (await response.json()) as
        | StatusData
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in body && body.error
            ? body.error
            : "Não foi possível consultar a cobrança recorrente.",
        );
      }

      setData(body as StatusData);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível consultar a cobrança recorrente.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleRecurring(
    item: SubscriptionItem,
  ) {
    setUpdatingId(item.id);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(
        `/api/elogest/assinaturas/${item.id}/recorrencia`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            enabled: !item.recurringEnabled,
          }),
        },
      );

      const body = (await response.json()) as {
        error?: string;
        recurringEnabled?: boolean;
      };

      if (!response.ok) {
        throw new Error(
          body.error ??
            "Não foi possível atualizar a recorrência.",
        );
      }

      setMessage(
        body.recurringEnabled
          ? "Cobrança recorrente habilitada."
          : "Cobrança recorrente desabilitada.",
      );

      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível atualizar a recorrência.",
      );
    } finally {
      setUpdatingId(null);
    }
  }

  async function processNow() {
    setProcessing(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(
        "/api/elogest/assinaturas/recorrencia/processar",
        {
          method: "POST",
        },
      );

      const body = (await response.json()) as {
        error?: string;
        result?: ProcessingResult;
      };

      if (!response.ok || !body.result) {
        throw new Error(
          body.error ??
            "Não foi possível processar as cobranças recorrentes.",
        );
      }

      if (!body.result.automaticBillingEnabled) {
        setError(
          "A cobrança automática global está desabilitada. Habilite-a na configuração do gateway antes de processar.",
        );
      } else {
        setMessage(
          [
            `${body.result.chargesCreated} cobrança(s) criada(s)`,
            `${body.result.subscriptionsEligible} assinatura(s) elegível(is)`,
            `${body.result.duplicateCyclesSkipped} ciclo(s) já existente(s)`,
            `${body.result.notificationsCreated} notificação(ões) criada(s)`,
          ].join(" • "),
        );
      }

      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível processar as cobranças recorrentes.",
      );
    } finally {
      setProcessing(false);
    }
  }

  return (
    <section className="rounded-[28px] border border-[#DCE6DF] bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#256D3C]">
            Cobrança Recorrente
          </p>
          <h2 className="mt-2 text-2xl font-black text-[#17211B]">
            Geração Automática De Mensalidades
          </h2>
          <p className="mt-2 max-w-3xl leading-7 text-[#5C6B62]">
            Habilite a recorrência individualmente. Somente
            assinaturas com valor definido, próxima cobrança
            configurada e sem cortesia poderão gerar cobranças.
          </p>
        </div>

        <button
          type="button"
          onClick={processNow}
          disabled={processing || loading}
          className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-bold text-white transition hover:bg-[#1F5A33] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {processing
            ? "Processando..."
            : "Gerar Cobranças Agora"}
        </button>
      </div>

      {data && !data.configuration.automaticBillingEnabled && (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          A cobrança automática global está desabilitada. As
          assinaturas podem ser preparadas, mas nenhuma cobrança
          será gerada até a ativação na configuração acima.
        </div>
      )}

      {message && (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}
        </div>
      )}

      {error && (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-[#5C6B62]">
          Carregando assinaturas...
        </p>
      ) : data ? (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Assinaturas", data.counters.subscriptions],
              ["Preparadas", data.counters.recurringEnabled],
              ["Elegíveis", data.counters.eligible],
              ["Vencendo Agora", data.counters.dueNow],
              [
                "Cobranças Geradas",
                data.counters.generatedCharges,
              ],
            ].map(([label, value]) => (
              <article
                key={String(label)}
                className="rounded-2xl bg-[#F4F7F5] p-4"
              >
                <p className="text-xs font-bold uppercase tracking-wide text-[#647168]">
                  {label}
                </p>
                <p className="mt-2 text-2xl font-black text-[#17211B]">
                  {value}
                </p>
              </article>
            ))}
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-[#DCE6DF]">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#F4F7F5] text-xs font-bold uppercase tracking-wide text-[#647168]">
                  <tr>
                    <th className="px-4 py-3">
                      Administradora
                    </th>
                    <th className="px-4 py-3">
                      Plano
                    </th>
                    <th className="px-4 py-3">
                      Valor
                    </th>
                    <th className="px-4 py-3">
                      Próxima Cobrança
                    </th>
                    <th className="px-4 py-3">
                      Situação
                    </th>
                    <th className="px-4 py-3 text-right">
                      Recorrência
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#E6ECE8]">
                  {data.subscriptions.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-4">
                        <p className="font-bold text-[#17211B]">
                          {item.administrator.name}
                        </p>
                        <p className="mt-1 text-xs text-[#647168]">
                          {formatSubscriptionStatus(item.status)}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-[#354239]">
                        {item.plan.name}
                      </td>
                      <td className="px-4 py-4 font-bold text-[#17211B]">
                        {formatCurrency(
                          item.finalPriceCents,
                        )}
                      </td>
                      <td className="px-4 py-4 text-[#354239]">
                        {formatDate(item.nextBillingAt)}
                      </td>
                      <td className="px-4 py-4">
                        {item.configurationEligible ? (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800">
                            {item.dueNow
                              ? "Pronta Para Gerar"
                              : "Preparada"}
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-amber-800">
                            {item.reasons.join(", ") ||
                              "Não Elegível"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            void toggleRecurring(item)
                          }
                          disabled={
                            updatingId === item.id ||
                            (!item.recurringEnabled &&
                              !item.configurationEligible)
                          }
                          className={
                            item.recurringEnabled
                              ? "rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                              : "rounded-xl bg-[#256D3C] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#1F5A33] disabled:cursor-not-allowed disabled:bg-[#AAB7AF]"
                          }
                        >
                          {updatingId === item.id
                            ? "Salvando..."
                            : item.recurringEnabled
                              ? "Desabilitar"
                              : "Habilitar"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="mt-4 text-xs leading-5 text-[#647168]">
            Cron recomendado: uma vez por dia em{" "}
            <code className="rounded bg-[#F4F7F5] px-1.5 py-1">
              {data.cron.endpoint}
            </code>
            .
          </p>
        </>
      ) : null}
    </section>
  );
}
