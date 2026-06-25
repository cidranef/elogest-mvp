"use client";

import { useCallback, useEffect, useState } from "react";

type StatusData = {
  generatedAt: string;
  configuration: {
    gracePeriodDays: number;
    automaticBillingEnabled: boolean;
    provider: string;
    environment: string;
  };
  counters: {
    pendingExpired: number;
    overdueCharges: number;
    pastDueSubscriptions: number;
    suspendedSubscriptions: number;
  };
  lastProcessingEvent: {
    type: string;
    createdAt: string;
    description: string | null;
  } | null;
  cron: {
    endpoint: string;
    authentication: string;
    recommendedFrequency: string;
  };
};

type ProcessingResult = {
  chargesMarkedOverdue: number;
  subscriptionsMarkedPastDue: number;
  subscriptionsSuspended: number;
  subscriptionsReactivated: number;
  notificationsCreated: number;
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

export function DelinquencyControlClient() {
  const [data, setData] = useState<StatusData | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
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
        "/api/elogest/assinaturas/inadimplencia/status",
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
            : "Não foi possível consultar a inadimplência.",
        );
      }

      setData(body as StatusData);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível consultar a inadimplência.",
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
        "/api/elogest/assinaturas/inadimplencia/processar",
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
            "Não foi possível processar a inadimplência.",
        );
      }

      setMessage(
        [
          `${body.result.chargesMarkedOverdue} cobrança(s) vencida(s)`,
          `${body.result.subscriptionsMarkedPastDue} assinatura(s) inadimplente(s)`,
          `${body.result.subscriptionsSuspended} assinatura(s) suspensa(s)`,
          `${body.result.subscriptionsReactivated} assinatura(s) reativada(s)`,
          `${body.result.notificationsCreated} notificação(ões) criada(s)`,
        ].join(" • "),
      );

      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível processar a inadimplência.",
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
            Automação De Inadimplência
          </p>
          <h2 className="mt-2 text-2xl font-black text-[#17211B]">
            Processamento E Monitoramento
          </h2>
          <p className="mt-2 max-w-3xl leading-7 text-[#5C6B62]">
            A rotina identifica cobranças vencidas, aplica o
            período de tolerância, suspende os módulos e
            reativa a assinatura após a quitação total.
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
            : "Processar Agora"}
        </button>
      </div>

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
          Carregando situação da inadimplência...
        </p>
      ) : data ? (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-2xl bg-[#F4F7F5] p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-[#647168]">
                Pendentes Já Vencidas
              </p>
              <p className="mt-2 text-2xl font-black text-[#17211B]">
                {data.counters.pendingExpired}
              </p>
            </article>

            <article className="rounded-2xl bg-[#F4F7F5] p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-[#647168]">
                Cobranças Vencidas
              </p>
              <p className="mt-2 text-2xl font-black text-[#17211B]">
                {data.counters.overdueCharges}
              </p>
            </article>

            <article className="rounded-2xl bg-[#F4F7F5] p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-[#647168]">
                Inadimplentes
              </p>
              <p className="mt-2 text-2xl font-black text-[#17211B]">
                {data.counters.pastDueSubscriptions}
              </p>
            </article>

            <article className="rounded-2xl bg-[#F4F7F5] p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-[#647168]">
                Suspensas
              </p>
              <p className="mt-2 text-2xl font-black text-[#17211B]">
                {data.counters.suspendedSubscriptions}
              </p>
            </article>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-[#DCE6DF] p-5">
              <h3 className="font-black text-[#17211B]">
                Regra Atual
              </h3>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-[#647168]">
                    Período De Tolerância
                  </dt>
                  <dd className="font-bold text-[#17211B]">
                    {data.configuration.gracePeriodDays} dia(s)
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[#647168]">
                    Gateway
                  </dt>
                  <dd className="font-bold text-[#17211B]">
                    {data.configuration.provider}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[#647168]">
                    Ambiente
                  </dt>
                  <dd className="font-bold text-[#17211B]">
                    {data.configuration.environment}
                  </dd>
                </div>
              </dl>
            </article>

            <article className="rounded-2xl border border-[#DCE6DF] p-5">
              <h3 className="font-black text-[#17211B]">
                Execução Automática
              </h3>
              <p className="mt-3 text-sm leading-6 text-[#647168]">
                Frequência recomendada: uma vez por dia.
              </p>
              <p className="mt-2 break-all rounded-xl bg-[#F4F7F5] px-3 py-2 font-mono text-xs text-[#354239]">
                {data.cron.endpoint}
              </p>
              <p className="mt-3 text-xs text-[#647168]">
                Último evento automático:{" "}
                <strong className="text-[#17211B]">
                  {formatDateTime(
                    data.lastProcessingEvent?.createdAt,
                  )}
                </strong>
              </p>
            </article>
          </div>
        </>
      ) : null}
    </section>
  );
}
