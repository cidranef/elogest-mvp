"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type WebhookStatus =
  | "RECEIVED"
  | "PROCESSING"
  | "PROCESSED"
  | "IGNORED"
  | "FAILED";

type WebhookEvent = {
  id: string;
  provider: string;
  externalEventId: string;
  eventType: string;
  status: WebhookStatus;
  normalizedData: unknown;
  receivedAt: string;
  processingAt: string | null;
  processedAt: string | null;
  failedAt: string | null;
  errorMessage: string | null;
  attemptCount: number;
  updatedAt: string;
};

type Summary = {
  total: number;
  received: number;
  processing: number;
  processed: number;
  ignored: number;
  failed: number;
};

type DetailEvent = WebhookEvent & {
  payload: unknown;
};

const STATUS_LABEL: Record<WebhookStatus, string> = {
  RECEIVED: "Recebido",
  PROCESSING: "Processando",
  PROCESSED: "Processado",
  IGNORED: "Ignorado",
  FAILED: "Falhou",
};

function formatDate(value: string | null) {
  if (!value) return "Não Registrado";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

function formatCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return (Number(digits) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function badgeClass(status: WebhookStatus) {
  if (status === "PROCESSED") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (status === "FAILED") {
    return "border-red-200 bg-red-50 text-red-800";
  }
  if (status === "IGNORED") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (status === "PROCESSING") {
    return "border-blue-200 bg-blue-50 text-blue-800";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export function BillingWebhooksClient() {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [summary, setSummary] = useState<Summary>({
    total: 0,
    received: 0,
    processing: 0,
    processed: 0,
    ignored: 0,
    failed: 0,
  });
  const [statusFilter, setStatusFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<DetailEvent | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [mockType, setMockType] = useState("CHARGE_PAID");
  const [mockChargeId, setMockChargeId] = useState("");
  const [mockPaymentId, setMockPaymentId] = useState("");
  const [mockAmount, setMockAmount] = useState("150,00");
  const [simulating, setSimulating] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (providerFilter) params.set("provider", providerFilter);
    params.set("take", "100");
    return params.toString();
  }, [providerFilter, statusFilter]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/elogest/configuracoes/cobranca/webhooks?${query}`,
        { cache: "no-store" },
      );
      const data = (await response.json()) as {
        events?: WebhookEvent[];
        summary?: Summary;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível carregar os webhooks.");
      }

      setEvents(data.events ?? []);
      if (data.summary) setSummary(data.summary);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível carregar os webhooks.",
      );
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  async function openDetail(id: string) {
    setWorkingId(id);
    setError(null);

    try {
      const response = await fetch(
        `/api/elogest/configuracoes/cobranca/webhooks/${id}`,
        { cache: "no-store" },
      );
      const data = (await response.json()) as {
        event?: DetailEvent;
        error?: string;
      };

      if (!response.ok || !data.event) {
        throw new Error(data.error || "Evento não encontrado.");
      }

      setSelected(data.event);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Não foi possível abrir o evento.",
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function reprocess(id: string) {
    setWorkingId(id);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(
        `/api/elogest/configuracoes/cobranca/webhooks/${id}/reprocessar`,
        { method: "POST" },
      );
      const data = (await response.json()) as {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível reprocessar o evento.");
      }

      setMessage(data.message || "Evento processado.");
      setSelected(null);
      await loadEvents();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível reprocessar o evento.",
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function simulate() {
    setSimulating(true);
    setMessage(null);
    setError(null);

    try {
      const amountDigits = mockAmount.replace(/\D/g, "");
      const amountCents = amountDigits ? Number(amountDigits) : undefined;

      const response = await fetch(
        "/api/elogest/configuracoes/cobranca/webhooks/simular",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type: mockType,
            externalChargeId: mockChargeId || undefined,
            externalPaymentId: mockPaymentId || undefined,
            amountCents,
          }),
        },
      );

      const data = (await response.json()) as {
        duplicate?: boolean;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível simular o webhook.");
      }

      setMessage(
        data.duplicate
          ? "O evento simulado já estava registrado."
          : "Evento Mock recebido e armazenado com sucesso.",
      );
      await loadEvents();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível simular o webhook.",
      );
    } finally {
      setSimulating(false);
    }
  }

  const cards = [
    ["Total", summary.total],
    ["Recebidos", summary.received],
    ["Processando", summary.processing],
    ["Processados", summary.processed],
    ["Ignorados", summary.ignored],
    ["Falhas", summary.failed],
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#256D3C]">
              Etapa 58 — Cobrança E Assinatura
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#17211B]">
              Auditoria De Webhooks
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5E6B63]">
              Simule eventos em Sandbox, acompanhe o recebimento e execute o
              processamento manual sem alterar assinaturas, cobranças ou pagamentos.
            </p>
          </div>

          <Link
            href="/elogest/configuracoes/cobranca"
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#CAD7CE] bg-white px-4 text-sm font-bold text-[#256D3C] transition hover:bg-[#EAF7EE]"
          >
            Voltar À Configuração
          </Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {cards.map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-2xl border border-[#DDE5DF] bg-white p-4 shadow-sm"
          >
            <p className="text-xs font-semibold text-[#7A877F]">{label}</p>
            <p className="mt-2 text-2xl font-bold text-[#17211B]">{value}</p>
          </div>
        ))}
      </section>

      {message && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {message}
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {error}
        </div>
      )}

      <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-[#17211B]">Simular Evento Mock</h2>
        <p className="mt-1 text-sm text-[#66736B]">
          Exige provider Simulado e ambiente Sandbox na configuração de cobrança.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-2">
            <span className="text-sm font-bold text-[#334139]">Tipo Do Evento</span>
            <select
              value={mockType}
              onChange={(event) => setMockType(event.target.value)}
              className="h-12 w-full rounded-2xl border border-[#CAD7CE] bg-white px-4 text-sm font-semibold outline-none focus:border-[#256D3C]"
            >
              <option value="CHARGE_CREATED">Cobrança Criada</option>
              <option value="CHARGE_PAID">Cobrança Paga</option>
              <option value="CHARGE_OVERDUE">Cobrança Vencida</option>
              <option value="CHARGE_CANCELED">Cobrança Cancelada</option>
              <option value="PAYMENT_CONFIRMED">Pagamento Confirmado</option>
              <option value="PAYMENT_REFUNDED">Pagamento Devolvido</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-bold text-[#334139]">
              ID Externo Da Cobrança
            </span>
            <input
              value={mockChargeId}
              onChange={(event) => setMockChargeId(event.target.value)}
              placeholder="Gerado automaticamente"
              className="h-12 w-full rounded-2xl border border-[#CAD7CE] px-4 text-sm outline-none focus:border-[#256D3C]"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-bold text-[#334139]">
              ID Externo Do Pagamento
            </span>
            <input
              value={mockPaymentId}
              onChange={(event) => setMockPaymentId(event.target.value)}
              placeholder="Opcional"
              className="h-12 w-full rounded-2xl border border-[#CAD7CE] px-4 text-sm outline-none focus:border-[#256D3C]"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-bold text-[#334139]">Valor</span>
            <input
              value={mockAmount}
              onChange={(event) =>
                setMockAmount(formatCurrencyInput(event.target.value))
              }
              inputMode="numeric"
              className="h-12 w-full rounded-2xl border border-[#CAD7CE] px-4 text-sm outline-none focus:border-[#256D3C]"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => void simulate()}
          disabled={simulating}
          className="mt-5 inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-bold text-white transition hover:bg-[#1D5831] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {simulating ? "Gerando Evento..." : "Gerar Evento Simulado"}
        </button>
      </section>

      <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-bold text-[#17211B]">
              Eventos Recebidos
            </h2>
            <p className="mt-1 text-sm text-[#66736B]">
              Reprocessamentos são auditáveis pelo contador de tentativas.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <select
              value={providerFilter}
              onChange={(event) => setProviderFilter(event.target.value)}
              className="h-11 rounded-2xl border border-[#CAD7CE] bg-white px-4 text-sm font-semibold"
            >
              <option value="">Todos Os Providers</option>
              <option value="MOCK">Simulado</option>
              <option value="MANUAL">Manual</option>
              <option value="ASAAS">Asaas</option>
              <option value="MERCADO_PAGO">Mercado Pago</option>
              <option value="PAGARME">Pagar.me</option>
              <option value="STRIPE">Stripe</option>
            </select>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-11 rounded-2xl border border-[#CAD7CE] bg-white px-4 text-sm font-semibold"
            >
              <option value="">Todos Os Status</option>
              <option value="RECEIVED">Recebidos</option>
              <option value="PROCESSING">Processando</option>
              <option value="PROCESSED">Processados</option>
              <option value="IGNORED">Ignorados</option>
              <option value="FAILED">Falhas</option>
            </select>

            <button
              type="button"
              onClick={() => void loadEvents()}
              className="h-11 rounded-2xl border border-[#CAD7CE] bg-white px-4 text-sm font-bold text-[#256D3C] hover:bg-[#EAF7EE]"
            >
              Atualizar
            </button>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-[#718078]">
                <th className="border-b border-[#DDE5DF] px-3 py-3">Recebido Em</th>
                <th className="border-b border-[#DDE5DF] px-3 py-3">Provider</th>
                <th className="border-b border-[#DDE5DF] px-3 py-3">Evento</th>
                <th className="border-b border-[#DDE5DF] px-3 py-3">Status</th>
                <th className="border-b border-[#DDE5DF] px-3 py-3">Tentativas</th>
                <th className="border-b border-[#DDE5DF] px-3 py-3 text-right">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="align-top">
                  <td className="border-b border-[#EDF1EE] px-3 py-4 font-medium text-[#334139]">
                    {formatDate(event.receivedAt)}
                  </td>
                  <td className="border-b border-[#EDF1EE] px-3 py-4 font-bold text-[#17211B]">
                    {event.provider}
                  </td>
                  <td className="border-b border-[#EDF1EE] px-3 py-4">
                    <p className="font-bold text-[#17211B]">{event.eventType}</p>
                    <p className="mt-1 max-w-[300px] truncate text-xs text-[#7A877F]">
                      {event.externalEventId}
                    </p>
                  </td>
                  <td className="border-b border-[#EDF1EE] px-3 py-4">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${badgeClass(event.status)}`}
                    >
                      {STATUS_LABEL[event.status]}
                    </span>
                    {event.errorMessage && (
                      <p className="mt-2 max-w-[280px] text-xs leading-5 text-red-700">
                        {event.errorMessage}
                      </p>
                    )}
                  </td>
                  <td className="border-b border-[#EDF1EE] px-3 py-4 font-bold text-[#334139]">
                    {event.attemptCount}
                  </td>
                  <td className="border-b border-[#EDF1EE] px-3 py-4">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => void openDetail(event.id)}
                        disabled={workingId === event.id}
                        className="rounded-xl border border-[#CAD7CE] px-3 py-2 text-xs font-bold text-[#334139] hover:bg-[#F4F7F5]"
                      >
                        Ver Detalhes
                      </button>
                      <button
                        type="button"
                        onClick={() => void reprocess(event.id)}
                        disabled={
                          workingId === event.id || event.status === "PROCESSING"
                        }
                        className="rounded-xl bg-[#256D3C] px-3 py-2 text-xs font-bold text-white hover:bg-[#1D5831] disabled:opacity-50"
                      >
                        Reprocessar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && events.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-12 text-center text-sm font-semibold text-[#7A877F]"
                  >
                    Nenhum webhook encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {loading && (
            <p className="py-10 text-center text-sm font-semibold text-[#7A877F]">
              Carregando eventos...
            </p>
          )}
        </div>
      </section>

      {selected && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#17211B]/65 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#256D3C]">
                  Evento De Webhook
                </p>
                <h3 className="mt-2 text-2xl font-bold text-[#17211B]">
                  {selected.eventType}
                </h3>
                <p className="mt-1 break-all text-sm text-[#66736B]">
                  {selected.externalEventId}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="h-10 rounded-xl border border-[#CAD7CE] px-4 text-sm font-bold"
              >
                Fechar
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl bg-[#F4F7F5] p-4">
                <p className="text-xs text-[#718078]">Provider</p>
                <p className="mt-1 font-bold">{selected.provider}</p>
              </div>
              <div className="rounded-2xl bg-[#F4F7F5] p-4">
                <p className="text-xs text-[#718078]">Status</p>
                <p className="mt-1 font-bold">{STATUS_LABEL[selected.status]}</p>
              </div>
              <div className="rounded-2xl bg-[#F4F7F5] p-4">
                <p className="text-xs text-[#718078]">Recebido Em</p>
                <p className="mt-1 font-bold">{formatDate(selected.receivedAt)}</p>
              </div>
              <div className="rounded-2xl bg-[#F4F7F5] p-4">
                <p className="text-xs text-[#718078]">Tentativas</p>
                <p className="mt-1 font-bold">{selected.attemptCount}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div>
                <h4 className="mb-2 text-sm font-bold text-[#334139]">
                  Dados Normalizados
                </h4>
                <pre className="max-h-80 overflow-auto rounded-2xl bg-[#17211B] p-4 text-xs leading-5 text-white">
                  {JSON.stringify(selected.normalizedData, null, 2)}
                </pre>
              </div>
              <div>
                <h4 className="mb-2 text-sm font-bold text-[#334139]">
                  Payload Recebido
                </h4>
                <pre className="max-h-80 overflow-auto rounded-2xl bg-[#17211B] p-4 text-xs leading-5 text-white">
                  {JSON.stringify(selected.payload, null, 2)}
                </pre>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => void reprocess(selected.id)}
                disabled={workingId === selected.id}
                className="h-11 rounded-2xl bg-[#256D3C] px-5 text-sm font-bold text-white disabled:opacity-50"
              >
                Reprocessar Evento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
