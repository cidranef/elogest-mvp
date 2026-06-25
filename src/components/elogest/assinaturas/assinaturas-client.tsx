"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { formatCurrency, formatDate } from "./formatters";
import { StatusBadge } from "./status-badge";

type SubscriptionListItem = {
  id: string;
  status: string;
  billingInterval: string;
  finalPriceCents: number;
  nextBillingAt: string | null;
  isComplimentary: boolean;
  createdAt: string;
  administrator: {
    id: string;
    name: string;
    isDemo: boolean;
    planStatus: string;
  };
  plan: { id: string; name: string; slug: string };
  _count: { charges: number; events: number };
};

type Summary = {
  total: number;
  active: number;
  trialing: number;
  pastDue: number;
  suspended: number;
  canceled: number;
  monthlyRecurringRevenueCents: number;
  pendingCharges: number;
  pendingAmountCents: number;
  overdueCharges: number;
  overdueAmountCents: number;
  confirmedRevenueCents: number;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const emptyPagination: Pagination = { page: 1, pageSize: 20, total: 0, totalPages: 1 };

export function AssinaturasClient() {
  const [items, setItems] = useState<SubscriptionListItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pagination, setPagination] = useState<Pagination>(emptyPagination);
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (submittedSearch) params.set("search", submittedSearch);
      if (status) params.set("status", status);

      const [listResponse, summaryResponse] = await Promise.all([
        fetch(`/api/elogest/assinaturas?${params.toString()}`, { cache: "no-store" }),
        fetch("/api/elogest/assinaturas/resumo", { cache: "no-store" }),
      ]);

      const listData = (await listResponse.json()) as {
        items?: SubscriptionListItem[];
        pagination?: Pagination;
        error?: string;
      };
      const summaryData = (await summaryResponse.json()) as { summary?: Summary; error?: string };

      if (!listResponse.ok) throw new Error(listData.error ?? "Não foi possível carregar as assinaturas.");
      if (!summaryResponse.ok) throw new Error(summaryData.error ?? "Não foi possível carregar os indicadores.");

      setItems(listData.items ?? []);
      setPagination(listData.pagination ?? emptyPagination);
      setSummary(summaryData.summary ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ocorreu um erro inesperado.");
    } finally {
      setLoading(false);
    }
  }, [page, status, submittedSearch]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSubmittedSearch(search.trim());
  }

  const cards = summary
    ? [
        ["Assinaturas", String(summary.total), "Total registrado"],
        ["Ativas", String(summary.active), `${summary.trialing} em trial`],
        ["MRR Contratado", formatCurrency(summary.monthlyRecurringRevenueCents), "Assinaturas não cortesia"],
        ["Inadimplentes", String(summary.pastDue), `${summary.suspended} suspensas`],
        ["Cobranças Pendentes", String(summary.pendingCharges), formatCurrency(summary.pendingAmountCents)],
        ["Cobranças Vencidas", String(summary.overdueCharges), formatCurrency(summary.overdueAmountCents)],
      ]
    : [];

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#256D3C]">Cobrança EloGest</p>
          <h1 className="mt-2 text-3xl font-black text-[#17211B]">Assinaturas</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5C6B62]">
            Acompanhe contratos, cobranças manuais, pagamentos e situação comercial das administradoras.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          className="rounded-xl border border-[#CAD7CE] bg-white px-4 py-2 text-sm font-bold text-[#256D3C] transition hover:border-[#256D3C] hover:bg-[#F4F7F5]"
        >
          Atualizar Dados
        </button>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(([label, value, detail]) => (
          <article key={label} className="rounded-[24px] border border-[#DCE6DF] bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-[#647168]">{label}</p>
            <p className="mt-2 text-2xl font-black text-[#17211B]">{value}</p>
            <p className="mt-1 text-xs text-[#647168]">{detail}</p>
          </article>
        ))}
      </section>

      <section className="rounded-[24px] border border-[#DCE6DF] bg-white shadow-sm">
        <div className="border-b border-[#E6ECE8] p-5">
          <form onSubmit={handleSearch} className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar administradora ou plano"
              className="rounded-xl border border-[#CAD7CE] bg-white px-3 py-2.5 text-sm text-[#17211B] outline-none transition focus:border-[#256D3C] focus:ring-2 focus:ring-[#256D3C]/10"
            />
            <select
              value={status}
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value);
              }}
              className="rounded-xl border border-[#CAD7CE] bg-white px-3 py-2.5 text-sm text-[#17211B] outline-none transition focus:border-[#256D3C] focus:ring-2 focus:ring-[#256D3C]/10"
            >
              <option value="">Todos os status</option>
              <option value="ACTIVE">Ativas</option>
              <option value="TRIALING">Em Trial</option>
              <option value="EXPIRING_SOON">Expiram Em Breve</option>
              <option value="PAST_DUE">Inadimplentes</option>
              <option value="SUSPENDED">Suspensas</option>
              <option value="CANCELED">Canceladas</option>
              <option value="EXPIRED">Expiradas</option>
            </select>
            <button className="rounded-xl bg-[#256D3C] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#1F5A33]">
              Buscar
            </button>
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[#E6ECE8] text-sm">
            <thead className="bg-[#F4F7F5] text-left text-xs font-bold uppercase tracking-wide text-[#647168]">
              <tr>
                <th className="px-5 py-3">Administradora</th>
                <th className="px-5 py-3">Plano</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Valor</th>
                <th className="px-5 py-3">Próxima Cobrança</th>
                <th className="px-5 py-3">Registros</th>
                <th className="px-5 py-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6ECE8]">
              {loading ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-500">Carregando assinaturas...</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-500">Nenhuma assinatura encontrada.</td></tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="transition hover:bg-[#F8FAF9]">
                    <td className="px-5 py-4">
                      <p className="font-bold text-[#17211B]">{item.administrator.name}</p>
                      <p className="mt-1 text-xs text-[#647168]">{item.administrator.isDemo ? "Ambiente Demo" : "Cliente EloGest"}</p>
                    </td>
                    <td className="px-5 py-4 text-[#354239]">{item.plan.name}</td>
                    <td className="px-5 py-4"><StatusBadge status={item.status} /></td>
                    <td className="px-5 py-4">
                      <p className="font-bold text-[#17211B]">{item.isComplimentary ? "Cortesia" : formatCurrency(item.finalPriceCents)}</p>
                      <p className="mt-1 text-xs text-[#647168]">{item.billingInterval === "ANNUAL" ? "Anual" : item.billingInterval === "MONTHLY" ? "Mensal" : "Personalizada"}</p>
                    </td>
                    <td className="px-5 py-4 text-[#354239]">{formatDate(item.nextBillingAt)}</td>
                    <td className="px-5 py-4 text-[#5C6B62]">{item._count.charges} cobranças</td>
                    <td className="px-5 py-4 text-right">
                      <Link href={`/elogest/assinaturas/${item.id}`} className="font-bold text-[#256D3C] transition hover:text-[#1F5A33]">
                        Ver Detalhes
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <footer className="flex flex-col gap-3 border-t border-[#E6ECE8] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[#647168]">{pagination.total} assinatura(s) encontrada(s)</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="rounded-xl border border-[#CAD7CE] bg-white px-3 py-2 text-sm font-bold text-[#256D3C] transition hover:border-[#256D3C] hover:bg-[#F4F7F5] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="px-2 text-sm text-[#5C6B62]">{pagination.page} de {pagination.totalPages}</span>
            <button
              type="button"
              disabled={page >= pagination.totalPages || loading}
              onClick={() => setPage((current) => current + 1)}
              className="rounded-xl border border-[#CAD7CE] bg-white px-3 py-2 text-sm font-bold text-[#256D3C] transition hover:border-[#256D3C] hover:bg-[#F4F7F5] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        </footer>
      </section>
    </main>
  );
}
