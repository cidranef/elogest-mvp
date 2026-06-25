"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

type StatusData = {
  generatedAt: string;
  readiness: {
    ready: boolean;
    cronSecretConfigured: boolean;
    automaticBillingEnabled: boolean;
    provider: string;
    environment: string;
    gracePeriodDays: number;
  };
  counters: {
    dueRecurringSubscriptions: number;
    pendingExpiredCharges: number;
    overdueCharges: number;
    suspendedSubscriptions: number;
  };
  lastRecurringCharge: {
    id: string;
    description: string;
    amountCents: number;
    dueAt: string;
    createdAt: string;
    administrator: {
      name: string;
    };
  } | null;
  lastDelinquencyEvent: {
    type: string;
    description: string | null;
    createdAt: string;
  } | null;
  cron: {
    endpoint: string;
    method: string;
    authentication: string;
    recommendedFrequency: string;
    recommendedTime: string;
    executionOrder: string[];
  };
};

type DailyResult = {
  delinquency: {
    chargesMarkedOverdue: number;
    subscriptionsMarkedPastDue: number;
    subscriptionsSuspended: number;
    subscriptionsReactivated: number;
    notificationsCreated: number;
  };
  recurringBilling: {
    chargesCreated: number;
    subscriptionsEligible: number;
    duplicateCyclesSkipped: number;
    notificationsCreated: number;
  };
};

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Ainda não registrado";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value / 100);
}

export function BillingAutomationControlClient() {
  const [data, setData] =
    useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] =
    useState(false);
  const [message, setMessage] =
    useState<string | null>(null);
  const [error, setError] =
    useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        "/api/elogest/assinaturas/automacao/status",
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
            : "Não foi possível consultar a automação.",
        );
      }

      setData(body as StatusData);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível consultar a automação.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function processNow() {
    setProcessing(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(
        "/api/elogest/assinaturas/automacao/processar",
        {
          method: "POST",
        },
      );

      const body = (await response.json()) as {
        error?: string;
        result?: DailyResult;
      };

      if (!response.ok || !body.result) {
        throw new Error(
          body.error ??
            "Não foi possível executar o ciclo diário.",
        );
      }

      const { delinquency, recurringBilling } =
        body.result;

      setMessage(
        [
          `${delinquency.chargesMarkedOverdue} cobrança(s) vencida(s)`,
          `${delinquency.subscriptionsSuspended} assinatura(s) suspensa(s)`,
          `${delinquency.subscriptionsReactivated} assinatura(s) reativada(s)`,
          `${recurringBilling.chargesCreated} cobrança(s) recorrente(s) criada(s)`,
          `${delinquency.notificationsCreated + recurringBilling.notificationsCreated} notificação(ões) criada(s)`,
        ].join(" • "),
      );

      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível executar o ciclo diário.",
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
            Fechamento Da Automação
          </p>
          <h2 className="mt-2 text-2xl font-black text-[#17211B]">
            Ciclo Diário De Cobrança
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-[#5C6B62]">
            Executa inadimplência primeiro e geração
            recorrente depois. Essa ordem evita que uma
            cobrança criada no próprio dia seja marcada
            como vencida na mesma rotina.
          </p>
        </div>

        <button
          type="button"
          onClick={processNow}
          disabled={processing || loading}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-[#256D3C] px-5 text-sm font-bold text-white transition hover:bg-[#1F5A33] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {processing
            ? "Executando..."
            : "Executar Ciclo Diário"}
        </button>
      </div>

      {message ? (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="mt-6 text-sm text-[#5C6B62]">
          Verificando a prontidão da automação...
        </p>
      ) : data ? (
        <>
          <div
            className={
              data.readiness.ready
                ? "mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"
                : "mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5"
            }
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-black text-[#17211B]">
                  {data.readiness.ready
                    ? "Automação Pronta Para Publicação"
                    : "Automação Ainda Não Está Pronta"}
                </p>
                <p className="mt-1 text-sm text-[#5C6B62]">
                  CRON_SECRET:{" "}
                  <strong>
                    {data.readiness.cronSecretConfigured
                      ? "Configurado"
                      : "Não Configurado"}
                  </strong>
                  {" • "}
                  Cobrança Automática:{" "}
                  <strong>
                    {data.readiness.automaticBillingEnabled
                      ? "Habilitada"
                      : "Desabilitada"}
                  </strong>
                </p>
              </div>

              <span
                className={
                  data.readiness.ready
                    ? "inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800"
                    : "inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800"
                }
              >
                {data.readiness.ready
                  ? "Pronta"
                  : "Pendente"}
              </span>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [
                "Recorrências Para Gerar",
                data.counters.dueRecurringSubscriptions,
              ],
              [
                "Pendentes Já Vencidas",
                data.counters.pendingExpiredCharges,
              ],
              [
                "Cobranças Vencidas",
                data.counters.overdueCharges,
              ],
              [
                "Assinaturas Suspensas",
                data.counters.suspendedSubscriptions,
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

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-[#DCE6DF] p-5">
              <h3 className="font-black text-[#17211B]">
                Agendamento Railway
              </h3>

              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-[#647168]">
                    Frequência
                  </dt>
                  <dd className="font-bold text-[#17211B]">
                    Uma vez por dia
                  </dd>
                </div>

                <div className="flex justify-between gap-4">
                  <dt className="text-[#647168]">
                    Horário Recomendado
                  </dt>
                  <dd className="font-bold text-[#17211B]">
                    06:00
                  </dd>
                </div>

                <div className="flex justify-between gap-4">
                  <dt className="text-[#647168]">
                    Ordem
                  </dt>
                  <dd className="text-right font-bold text-[#17211B]">
                    Inadimplência → Recorrência
                  </dd>
                </div>
              </dl>

              <p className="mt-4 break-all rounded-xl bg-[#F4F7F5] px-3 py-2 font-mono text-xs text-[#354239]">
                {data.cron.endpoint}
              </p>
            </article>

            <article className="rounded-2xl border border-[#DCE6DF] p-5">
              <h3 className="font-black text-[#17211B]">
                Últimas Evidências
              </h3>

              <div className="mt-4 space-y-4 text-sm">
                <div>
                  <p className="font-bold text-[#354239]">
                    Última Cobrança Recorrente
                  </p>
                  {data.lastRecurringCharge ? (
                    <p className="mt-1 leading-6 text-[#647168]">
                      {
                        data.lastRecurringCharge
                          .administrator.name
                      }
                      {" • "}
                      {
                        data.lastRecurringCharge
                          .description
                      }
                      {" • "}
                      {formatCurrency(
                        data.lastRecurringCharge
                          .amountCents,
                      )}
                      {" • "}
                      {formatDateTime(
                        data.lastRecurringCharge
                          .createdAt,
                      )}
                    </p>
                  ) : (
                    <p className="mt-1 text-[#647168]">
                      Ainda não registrada.
                    </p>
                  )}
                </div>

                <div>
                  <p className="font-bold text-[#354239]">
                    Último Evento De Inadimplência
                  </p>
                  <p className="mt-1 leading-6 text-[#647168]">
                    {data.lastDelinquencyEvent
                      ? `${data.lastDelinquencyEvent.type} • ${formatDateTime(data.lastDelinquencyEvent.createdAt)}`
                      : "Ainda não registrado."}
                  </p>
                </div>
              </div>
            </article>
          </div>
        </>
      ) : null}
    </section>
  );
}
