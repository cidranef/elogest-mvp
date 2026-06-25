"use client";

import { useEffect, useMemo, useState } from "react";

import AdminContextGuard from "@/components/AdminContextGuard";
import AdminShell from "@/components/AdminShell";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";
import { SubscriptionRequestsClient } from "@/components/admin/assinatura/subscription-requests-client";

type Payment = {
  id: string;
  status: string;
  method: string;
  amountCents: number;
  paidAt: string | null;
  confirmedAt: string | null;
  referenceCode: string | null;
  createdAt: string;
};

type Charge = {
  id: string;
  description: string;
  status: string;
  amountCents: number;
  paidAmountCents: number;
  dueAt: string;
  referenceMonth: number | null;
  referenceYear: number | null;
  paidAt: string | null;
  createdAt: string;
  payments: Payment[];
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
  cancelAtPeriodEnd: boolean;
  cancellationScheduledAt: string | null;
  cancellationReason: string | null;
  canceledAt: string | null;
  endedAt: string | null;
  plan: {
    id: string;
    name: string;
    slug: string;
    monthlyPriceCents: number | null;
    annualPriceCents: number | null;
    maxCondominiums: number | null;
    maxUsers: number | null;
    maxProviders: number | null;
  };
  charges: Charge[];
};

type ViewData = {
  administrator: {
    id: string;
    name: string;
    status: string;
    isDemo: boolean;
    planId: string | null;
    planStatus: string;
    planStartedAt: string | null;
    planExpiresAt: string | null;
  };
  subscription: Subscription | null;
  usage: {
    condominiums: number;
    users: number;
    providers: number;
  };
  summary: {
    totalCharges: number;
    pendingCharges: number;
    overdueCharges: number;
    paidCharges: number;
    totalPaidCents: number;
  };
  cycleStatus: {
    isOverdue: boolean;
    daysOverdue: number;
    gracePeriodDays: number;
    daysUntilSuspension: number | null;
    isSuspended: boolean;
  };
  requests: Array<{
    id: string;
    type: string;
    status: string;
    reason: string;
    reviewNotes: string | null;
    createdAt: string;
  }>;
};

const STATUS_LABELS: Record<string, string> = {
  TRIALING: "Em Trial",
  ACTIVE: "Ativa",
  PAST_DUE: "Inadimplente",
  SUSPENDED: "Suspensa",
  CANCELED: "Cancelada",
  EXPIRED: "Expirada",
  PENDING: "Pendente",
  OVERDUE: "Vencida",
  PAID: "Paga",
  WAIVED: "Isenta",
  CANCELED_CHARGE: "Cancelada",
  REFUNDED: "Devolvida",
  CONFIRMED: "Confirmado",
  FAILED: "Falhou",
};

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value / 100);
}

function contractedValueLabel(subscription: Subscription) {
  if (subscription.isComplimentary) {
    return "Cortesia";
  }

  if (subscription.finalPriceCents <= 0) {
    return "A definir";
  }

  return money(subscription.finalPriceCents);
}

function date(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
  }).format(new Date(value));
}

function statusClass(status: string) {
  if (status === "ACTIVE" || status === "PAID") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (
    status === "PAST_DUE" ||
    status === "OVERDUE" ||
    status === "SUSPENDED"
  ) {
    return "border-red-200 bg-red-50 text-red-800";
  }

  if (status === "TRIALING" || status === "PENDING") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function limitText(value: number | null) {
  return value === null ? "Ilimitado" : String(value);
}

export default function AdminAssinaturaPage() {
  const [data, setData] = useState<ViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/assinatura", {
        cache: "no-store",
      });

      const payload = (await response.json()) as
        | ViewData
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Não foi possível carregar a assinatura.",
        );
      }

      setData(payload as ViewData);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Não foi possível carregar a assinatura.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const charges = useMemo(
    () => data?.subscription?.charges ?? [],
    [data],
  );

  if (loading) {
    return (
      <AdminContextGuard>
        <EloGestLoadingScreen />
      </AdminContextGuard>
    );
  }

  return (
    <AdminContextGuard>
      <AdminShell
        current="assinatura"
        title="Minha Assinatura"
        description="Consulte o plano contratado, o ciclo atual, os limites e o histórico de cobranças da administradora."
      >
        <div className="space-y-6">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
              {error}
            </div>
          )}

          {!error && data && !data.subscription && (
            <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-8 shadow-sm">
              <h1 className="text-2xl font-bold text-[#17211B]">
                Nenhuma Assinatura Encontrada
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#66736B]">
                A administradora ainda não possui uma assinatura comercial registrada.
                Entre em contato com o suporte EloGest para regularizar a contratação.
              </p>
            </section>
          )}

          {!error && data?.subscription && (
            <>
              <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#256D3C]">
                      Contratação EloGest
                    </p>
                    <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#17211B]">
                      {data.subscription.plan.name}
                    </h1>
                    <p className="mt-2 text-sm text-[#66736B]">
                      Administradora: {data.administrator.name}
                    </p>
                  </div>

                  <span
                    className={[
                      "inline-flex rounded-full border px-3 py-1.5 text-xs font-bold",
                      statusClass(data.subscription.status),
                    ].join(" ")}
                  >
                    {STATUS_LABELS[data.subscription.status] ??
                      data.subscription.status}
                  </span>
                </div>

                {data.subscription.cancelAtPeriodEnd && (
                  <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                    <p className="font-bold">
                      Cancelamento Agendado
                    </p>
                    <p className="mt-1">
                      A assinatura será encerrada ao final do ciclo atual.
                    </p>
                    {data.subscription.cancellationReason && (
                      <p className="mt-2">
                        Motivo: {data.subscription.cancellationReason}
                      </p>
                    )}
                  </div>
                )}
              </section>

              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-[#DDE5DF] bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold text-[#718078]">
                    Valor Contratado
                  </p>
                  <p className="mt-2 text-2xl font-bold text-[#17211B]">
                    {contractedValueLabel(data.subscription)}
                  </p>
                </div>

                <div className="rounded-2xl border border-[#DDE5DF] bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold text-[#718078]">
                    Próxima Cobrança
                  </p>
                  <p className="mt-2 text-2xl font-bold text-[#17211B]">
                    {date(data.subscription.nextBillingAt)}
                  </p>
                </div>

                <div className="rounded-2xl border border-[#DDE5DF] bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold text-[#718078]">
                    Cobranças Pendentes
                  </p>
                  <p className="mt-2 text-2xl font-bold text-[#17211B]">
                    {data.summary.pendingCharges}
                  </p>
                </div>

                <div className="rounded-2xl border border-[#DDE5DF] bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold text-[#718078]">
                    Total Confirmado
                  </p>
                  <p className="mt-2 text-2xl font-bold text-[#17211B]">
                    {money(data.summary.totalPaidCents)}
                  </p>
                </div>
              </section>

              {!data.subscription.isComplimentary &&
                data.subscription.finalPriceCents <= 0 && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                    <p className="font-bold">Valor Comercial Ainda Não Definido</p>
                    <p className="mt-1 leading-6">
                      O plano está ativo, mas o valor contratado ainda não foi
                      formalizado na assinatura. A definição deverá ser feita
                      pelo EloGest antes da primeira cobrança.
                    </p>
                  </div>
                )}

              {data.cycleStatus.isSuspended && (
                <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-4 text-sm text-red-900">
                  <p className="font-bold">Assinatura Suspensa</p>
                  <p className="mt-1 leading-6">
                    O período de tolerância terminou. A área Minha
                    Assinatura permanece disponível para consulta e
                    regularização. Os módulos operacionais serão tratados
                    no próximo pacote de regras de acesso.
                  </p>
                </div>
              )}

              {data.cycleStatus.isOverdue &&
                !data.cycleStatus.isSuspended && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                    <p className="font-bold">Cobrança Vencida</p>
                    <p className="mt-1 leading-6">
                      A cobrança está vencida há{" "}
                      {data.cycleStatus.daysOverdue} dia(s). O período de
                      tolerância é de{" "}
                      {data.cycleStatus.gracePeriodDays} dia(s).
                      {data.cycleStatus.daysUntilSuspension !== null &&
                        data.cycleStatus.daysUntilSuspension > 0
                        ? ` Restam ${data.cycleStatus.daysUntilSuspension} dia(s) antes da suspensão.`
                        : " A assinatura está sujeita à suspensão no próximo processamento."}
                    </p>
                  </div>
                )}

              <section className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-bold text-[#17211B]">
                    Ciclo Atual
                  </h2>

                  <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs font-semibold text-[#718078]">
                        Início
                      </dt>
                      <dd className="mt-1 font-bold text-[#17211B]">
                        {date(data.subscription.currentPeriodStart)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-[#718078]">
                        Fim
                      </dt>
                      <dd className="mt-1 font-bold text-[#17211B]">
                        {date(data.subscription.currentPeriodEnd)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-[#718078]">
                        Periodicidade
                      </dt>
                      <dd className="mt-1 font-bold text-[#17211B]">
                        {data.subscription.billingInterval === "ANNUAL"
                          ? "Anual"
                          : "Mensal"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-[#718078]">
                        Cobrança
                      </dt>
                      <dd className="mt-1 font-bold text-[#17211B]">
                        {data.subscription.manualBillingOnly
                          ? "Manual"
                          : "Automática"}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-bold text-[#17211B]">
                    Uso E Limites
                  </h2>

                  <div className="mt-5 space-y-4">
                    {[
                      [
                        "Condomínios",
                        data.usage.condominiums,
                        data.subscription.plan.maxCondominiums,
                      ],
                      [
                        "Usuários",
                        data.usage.users,
                        data.subscription.plan.maxUsers,
                      ],
                      [
                        "Fornecedores",
                        data.usage.providers,
                        data.subscription.plan.maxProviders,
                      ],
                    ].map(([label, used, limit]) => (
                      <div
                        key={String(label)}
                        className="flex items-center justify-between rounded-2xl bg-[#F4F7F5] px-4 py-3"
                      >
                        <span className="text-sm font-semibold text-[#334139]">
                          {label}
                        </span>
                        <span className="text-sm font-bold text-[#17211B]">
                          {Number(used)} de {limitText(limit as number | null)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-[#17211B]">
                      Cobranças E Pagamentos
                    </h2>
                    <p className="mt-1 text-sm text-[#66736B]">
                      Histórico comercial da assinatura EloGest.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void load()}
                    className="h-10 rounded-xl border border-[#CAD7CE] bg-white px-4 text-sm font-bold text-[#256D3C] hover:bg-[#EAF7EE]"
                  >
                    Atualizar
                  </button>
                </div>

                <div className="mt-5 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-[#DDE5DF] text-xs uppercase tracking-wide text-[#718078]">
                        <th className="px-3 py-3">Descrição</th>
                        <th className="px-3 py-3">Vencimento</th>
                        <th className="px-3 py-3">Status</th>
                        <th className="px-3 py-3">Valor</th>
                        <th className="px-3 py-3">Pago</th>
                      </tr>
                    </thead>
                    <tbody>
                      {charges.map((charge) => (
                        <tr
                          key={charge.id}
                          className="border-b border-[#EDF1EE]"
                        >
                          <td className="px-3 py-4 font-semibold text-[#17211B]">
                            {charge.description}
                          </td>
                          <td className="px-3 py-4 text-[#334139]">
                            {date(charge.dueAt)}
                          </td>
                          <td className="px-3 py-4">
                            <span
                              className={[
                                "inline-flex rounded-full border px-2.5 py-1 text-xs font-bold",
                                statusClass(charge.status),
                              ].join(" ")}
                            >
                              {STATUS_LABELS[charge.status] ??
                                charge.status}
                            </span>
                          </td>
                          <td className="px-3 py-4 font-bold text-[#17211B]">
                            {money(charge.amountCents)}
                          </td>
                          <td className="px-3 py-4 font-bold text-[#17211B]">
                            {money(charge.paidAmountCents)}
                          </td>
                        </tr>
                      ))}

                      {charges.length === 0 && (
                        <tr>
                          <td
                            colSpan={5}
                            className="px-4 py-10 text-center text-sm font-semibold text-[#718078]"
                          >
                            Nenhuma cobrança registrada.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <SubscriptionRequestsClient
                currentPlanId={data.subscription.plan.id}
                cycleOverdue={data.cycleStatus.isOverdue}
              />
            </>
          )}
        </div>
      </AdminShell>
    </AdminContextGuard>
  );
}
