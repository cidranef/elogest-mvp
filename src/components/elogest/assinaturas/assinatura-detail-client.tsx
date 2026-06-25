"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import {
  centsFromCurrencyInput,
  formatCurrency,
  formatDate,
  formatDateTime,
  toDateInput,
} from "./formatters";
import { StatusBadge } from "./status-badge";

type Payment = {
  id: string;
  status: string;
  method: string;
  amountCents: number;
  paidAt: string;
  confirmedAt: string | null;
  payerName: string | null;
  referenceCode: string | null;
};

type Charge = {
  id: string;
  status: string;
  description: string;
  amountCents: number;
  paidAmountCents: number;
  dueAt: string;
  referenceMonth: number | null;
  referenceYear: number | null;
  payments: Payment[];
};

type EventItem = {
  id: string;
  type: string;
  description: string | null;
  createdAt: string;
};

type Subscription = {
  id: string;
  status: string;
  billingInterval: string;
  origin: string;
  currency: string;
  basePriceCents: number;
  discountCents: number;
  finalPriceCents: number;
  implementationFeeCents: number;
  isComplimentary: boolean;
  manualBillingOnly: boolean;
  startedAt: string;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextBillingAt: string | null;
  canceledAt: string | null;
  cancellationReason: string | null;
  notes: string | null;
  administrator: { id: string; name: string; isDemo: boolean; status: string };
  plan: { id: string; name: string; slug: string; monthlyPriceCents: number | null; annualPriceCents: number | null };
  commercialProposal: { id: string; title: string; status: string } | null;
  charges: Charge[];
  events: EventItem[];
};

type Props = {
  subscriptionId: string;
  commercialConfiguration?: ReactNode;
};

const SUBSCRIPTION_UPDATED_EVENT = "elogest:subscription-updated";

export function AssinaturaDetailClient({
  subscriptionId,
  commercialConfiguration,
}: Props) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [newStatus, setNewStatus] = useState("ACTIVE");
  const [statusReason, setStatusReason] = useState("");
  const [chargeDescription, setChargeDescription] = useState("");
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeDueAt, setChargeDueAt] = useState("");
  const [paymentChargeId, setPaymentChargeId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(toDateInput(new Date().toISOString()));
  const [paymentMethod, setPaymentMethod] = useState("PIX");
  const [paymentReference, setPaymentReference] = useState("");
  const [confirmImmediately, setConfirmImmediately] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const loadSubscription = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/elogest/assinaturas/${subscriptionId}`, { cache: "no-store" });
      const data = (await response.json()) as { subscription?: Subscription; error?: string };
      if (!response.ok || !data.subscription) throw new Error(data.error ?? "Assinatura não encontrada.");
      setSubscription(data.subscription);
      setNewStatus(data.subscription.status);
      setChargeAmount(String((data.subscription.finalPriceCents / 100).toFixed(2)).replace(".", ","));
      setPaymentChargeId(data.subscription.charges.find((charge) => ["PENDING", "PARTIALLY_PAID", "OVERDUE"].includes(charge.status))?.id ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ocorreu um erro inesperado.");
    } finally {
      setLoading(false);
    }
  }, [subscriptionId]);

  useEffect(() => {
    void loadSubscription();
  }, [loadSubscription]);

  useEffect(() => {
    function handleSubscriptionUpdated(event: Event) {
      const customEvent = event as CustomEvent<{ subscriptionId?: string }>;

      if (
        customEvent.detail?.subscriptionId &&
        customEvent.detail.subscriptionId !== subscriptionId
      ) {
        return;
      }

      void loadSubscription();
    }

    window.addEventListener(
      SUBSCRIPTION_UPDATED_EVENT,
      handleSubscriptionUpdated,
    );

    return () => {
      window.removeEventListener(
        SUBSCRIPTION_UPDATED_EVENT,
        handleSubscriptionUpdated,
      );
    };
  }, [loadSubscription, subscriptionId]);

  const selectedCharge = useMemo(
    () => subscription?.charges.find((charge) => charge.id === paymentChargeId) ?? null,
    [paymentChargeId, subscription],
  );

  useEffect(() => {
    if (selectedCharge) {
      const outstanding = Math.max(0, selectedCharge.amountCents - selectedCharge.paidAmountCents);
      setPaymentAmount(String((outstanding / 100).toFixed(2)).replace(".", ","));
    }
  }, [selectedCharge]);

  async function request(url: string, init: RequestInit, successMessage: string) {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(url, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível concluir a operação.");
      setSuccess(successMessage);
      await loadSubscription();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ocorreu um erro inesperado.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await request(
      `/api/elogest/assinaturas/${subscriptionId}`,
      { method: "PATCH", body: JSON.stringify({ action: "set_status", status: newStatus, reason: statusReason || undefined }) },
      "Status da assinatura atualizado.",
    );
  }

  async function handleCharge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountCents = centsFromCurrencyInput(chargeAmount);
    if (amountCents === null || !chargeDueAt) {
      setError("Informe um valor e uma data de vencimento válidos.");
      return;
    }
    const dueDate = new Date(`${chargeDueAt}T12:00:00`);
    await request(
      `/api/elogest/assinaturas/${subscriptionId}/cobrancas`,
      {
        method: "POST",
        body: JSON.stringify({
          description: chargeDescription || "Mensalidade EloGest",
          amountCents,
          dueAt: dueDate.toISOString(),
          referenceMonth: dueDate.getMonth() + 1,
          referenceYear: dueDate.getFullYear(),
        }),
      },
      "Cobrança criada com sucesso.",
    );
    setChargeDescription("");
  }

  async function handlePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountCents = centsFromCurrencyInput(paymentAmount);
    if (!paymentChargeId || amountCents === null || !paymentDate) {
      setError("Selecione a cobrança e informe valor e data válidos.");
      return;
    }
    await request(
      `/api/elogest/cobrancas/${paymentChargeId}/pagamentos`,
      {
        method: "POST",
        body: JSON.stringify({
          amountCents,
          paidAt: new Date(`${paymentDate}T12:00:00`).toISOString(),
          method: paymentMethod,
          referenceCode: paymentReference || undefined,
          confirmImmediately,
        }),
      },
      confirmImmediately ? "Pagamento registrado e confirmado." : "Pagamento registrado para conferência.",
    );
    setPaymentReference("");
  }

  async function confirmPayment(paymentId: string) {
    await request(
      `/api/elogest/pagamentos/${paymentId}/confirmar`,
      { method: "POST", body: JSON.stringify({}) },
      "Pagamento confirmado.",
    );
  }

  if (loading && !subscription) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Carregando assinatura...</div>;
  }

  if (!subscription) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error ?? "Assinatura não encontrada."}</div>;
  }

  const openCharges = subscription.charges.filter((charge) =>
    ["PENDING", "PARTIALLY_PAID", "OVERDUE"].includes(charge.status),
  );

  const visibleEvents = historyExpanded
    ? subscription.events
    : subscription.events.slice(0, 5);

  const hasMoreEvents = subscription.events.length > 5;

  return (
    <main className="space-y-6">
      <header>
        <Link href="/elogest/assinaturas" className="text-sm font-bold text-[#256D3C] transition hover:text-[#1F5A33]">← Voltar Para Assinaturas</Link>
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#256D3C]">Assinatura Comercial</p>
            <h1 className="mt-1 text-3xl font-bold text-slate-950">{subscription.administrator.name}</h1>
            <p className="mt-2 text-sm text-slate-600">Plano {subscription.plan.name} · início em {formatDate(subscription.startedAt)}</p>
          </div>
          <StatusBadge status={subscription.status} />
        </div>
      </header>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{success}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Valor Contratado", subscription.isComplimentary ? "Cortesia" : formatCurrency(subscription.finalPriceCents)],
          ["Periodicidade", subscription.billingInterval === "ANNUAL" ? "Anual" : subscription.billingInterval === "MONTHLY" ? "Mensal" : "Personalizada"],
          ["Próxima Cobrança", formatDate(subscription.nextBillingAt)],
          ["Cobranças Em Aberto", String(openCharges.length)],
        ].map(([label, value]) => (
          <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-xl font-bold text-slate-950">{value}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
          <h2 className="text-lg font-bold text-slate-950">Dados Da Assinatura</h2>
          <dl className="mt-5 grid gap-5 sm:grid-cols-2">
            {[
              ["Plano", subscription.plan.name],
              ["Preço Base", formatCurrency(subscription.basePriceCents)],
              ["Desconto", formatCurrency(subscription.discountCents)],
              ["Taxa De Implantação", formatCurrency(subscription.implementationFeeCents)],
              ["Trial Até", formatDate(subscription.trialEndsAt)],
              ["Fim Do Ciclo", formatDate(subscription.currentPeriodEnd)],
              ["Origem", subscription.origin],
              ["Cobrança", subscription.manualBillingOnly ? "Manual" : "Automática"],
            ].map(([term, value]) => (
              <div key={term}>
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{term}</dt>
                <dd className="mt-1 text-sm font-medium text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
        </article>

        <form onSubmit={handleStatus} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Alterar Situação</h2>
          <label className="mt-4 block text-sm font-medium text-slate-700">Novo status</label>
          <select value={newStatus} onChange={(event) => setNewStatus(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="ACTIVE">Ativa</option>
            <option value="TRIALING">Em Trial</option>
            <option value="EXPIRING_SOON">Expira Em Breve</option>
            <option value="PAST_DUE">Inadimplente</option>
            <option value="SUSPENDED">Suspensa</option>
            <option value="CANCELED">Cancelada</option>
            <option value="EXPIRED">Expirada</option>
          </select>
          <label className="mt-4 block text-sm font-medium text-slate-700">Justificativa</label>
          <textarea value={statusReason} onChange={(event) => setStatusReason(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button disabled={submitting} className="mt-4 w-full rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Salvar Situação</button>
        </form>
      </section>

      {commercialConfiguration}

      <section className="grid gap-6 xl:grid-cols-2">
        <form onSubmit={handleCharge} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Gerar Cobrança Manual</h2>
          {subscription.administrator.isDemo ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">A administradora Demo é protegida e não pode receber cobranças comerciais.</p> : null}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-sm font-medium text-slate-700">Descrição</label>
              <input value={chargeDescription} onChange={(event) => setChargeDescription(event.target.value)} placeholder="Mensalidade EloGest" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Valor Em Reais</label>
              <input value={chargeAmount} onChange={(event) => setChargeAmount(event.target.value)} inputMode="decimal" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Vencimento</label>
              <input type="date" value={chargeDueAt} onChange={(event) => setChargeDueAt(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <button disabled={submitting || subscription.administrator.isDemo} className="mt-4 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Gerar Cobrança</button>
        </form>

        <form onSubmit={handlePayment} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Registrar Pagamento</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-sm font-medium text-slate-700">Cobrança</label>
              <select value={paymentChargeId} onChange={(event) => setPaymentChargeId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">Selecione</option>
                {openCharges.map((charge) => <option key={charge.id} value={charge.id}>{charge.description} — {formatCurrency(charge.amountCents - charge.paidAmountCents)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Valor Em Reais</label>
              <input value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} inputMode="decimal" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Data</label>
              <input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Forma</label>
              <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="PIX">Pix</option><option value="BANK_TRANSFER">Transferência</option><option value="BOLETO">Boleto</option><option value="CREDIT_CARD">Cartão</option><option value="CASH">Dinheiro</option><option value="OTHER">Outro</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Referência</label>
              <input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={confirmImmediately} onChange={(event) => setConfirmImmediately(event.target.checked)} /> Confirmar pagamento imediatamente
          </label>
          <button disabled={submitting || !openCharges.length} className="mt-4 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Registrar Pagamento</button>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5"><h2 className="text-lg font-bold text-slate-950">Cobranças E Pagamentos</h2></div>
        <div className="divide-y divide-slate-200">
          {subscription.charges.length === 0 ? <p className="p-5 text-sm text-slate-500">Nenhuma cobrança registrada.</p> : subscription.charges.map((charge) => (
            <article key={charge.id} className="p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-semibold text-slate-950">{charge.description}</h3>
                  <p className="mt-1 text-sm text-slate-500">Vencimento: {formatDate(charge.dueAt)} · Valor: {formatCurrency(charge.amountCents)} · Pago: {formatCurrency(charge.paidAmountCents)}</p>
                </div>
                <StatusBadge status={charge.status} />
              </div>
              {charge.payments.length ? (
                <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-2">Data</th><th className="px-4 py-2">Forma</th><th className="px-4 py-2">Valor</th><th className="px-4 py-2">Status</th><th className="px-4 py-2 text-right">Ação</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">{charge.payments.map((payment) => (
                      <tr key={payment.id}>
                        <td className="px-4 py-3">{formatDate(payment.paidAt)}</td><td className="px-4 py-3">{payment.method}</td><td className="px-4 py-3">{formatCurrency(payment.amountCents)}</td><td className="px-4 py-3"><StatusBadge status={payment.status} /></td>
                        <td className="px-4 py-3 text-right">{payment.status === "PENDING_CONFIRMATION" ? <button type="button" disabled={submitting} onClick={() => void confirmPayment(payment.id)} className="font-semibold text-blue-700 disabled:opacity-50">Confirmar</button> : "—"}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>


      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Histórico Da Assinatura
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {subscription.events.length === 0
                ? "Nenhum evento registrado."
                : historyExpanded
                  ? `${subscription.events.length} registro(s) exibido(s).`
                  : `Últimos ${Math.min(5, subscription.events.length)} de ${subscription.events.length} registro(s).`}
            </p>
          </div>

          {hasMoreEvents ? (
            <button
              type="button"
              onClick={() =>
                setHistoryExpanded((current) => !current)
              }
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              {historyExpanded
                ? "Recolher Histórico"
                : "Ver Histórico Completo"}
            </button>
          ) : null}
        </div>

        {subscription.events.length === 0 ? null : (
          <div className="mt-5 space-y-4">
            {visibleEvents.map((item) => (
              <div
                key={item.id}
                className="border-l-2 border-blue-200 pl-4"
              >
                <p className="text-sm font-semibold text-slate-900">
                  {item.type}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {item.description ??
                    "Evento registrado na assinatura."}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {formatDateTime(item.createdAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
