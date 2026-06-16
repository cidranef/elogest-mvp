"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AdminContextGuard from "@/components/AdminContextGuard";
import AdminShell from "@/components/AdminShell";
import ResponsiveSection from "@/components/ui/ResponsiveSection";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";

/* =========================================================
   ETAPA 54.3 — RELATÓRIO FINANCEIRO GERENCIAL

   Página:
   /admin/relatorios/financeiro

   Objetivo:
   - Criar relatório financeiro consolidado após a Etapa 53.
   - Exibir receitas, despesas, saldo, pendências e vencidos.
   - Permitir filtros administrativos e exportação CSV.
   ========================================================= */

type FinancialKind = "REVENUE" | "EXPENSE" | "OTHER";

type FinancialStatus =
  | "PAID"
  | "OPEN"
  | "OVERDUE"
  | "CANCELED"
  | "REVERSED"
  | "OTHER";

type FinancialReportEntry = {
  id: string;
  type: FinancialKind;
  status: FinancialStatus;
  title: string;
  condominiumName: string;
  unitLabel: string;
  categoryName: string;
  competence: string;
  dueDate: string | null;
  paidAt: string | null;
  createdAt: string | null;
  amount: number;
  paidAmount: number;
  openAmount: number;
  source: string;
};

type FinancialReportResponse = {
  generatedAt: string;
  filters: {
    condominiumId: string;
    period: string;
    competence: string;
    status: string;
    category: string;
    type: string;
  };
  summary: {
    totalRevenue: number;
    paidRevenue: number;
    openRevenue: number;
    overdueRevenue: number;
    totalExpense: number;
    paidExpense: number;
    openExpense: number;
    overdueExpense: number;
    balance: number;
    totalEntries: number;
    paidEntries: number;
    openEntries: number;
    overdueEntries: number;
    reversedEntries: number;
  };
  entries: FinancialReportEntry[];
};

type PeriodFilter = "7D" | "30D" | "90D" | "ALL";
type TypeFilter = "ALL" | FinancialKind;
type StatusFilter = "ALL" | FinancialStatus;

const emptyReport: FinancialReportResponse = {
  generatedAt: new Date().toISOString(),
  filters: {
    condominiumId: "ALL",
    period: "30D",
    competence: "ALL",
    status: "ALL",
    category: "ALL",
    type: "ALL",
  },
  summary: {
    totalRevenue: 0,
    paidRevenue: 0,
    openRevenue: 0,
    overdueRevenue: 0,
    totalExpense: 0,
    paidExpense: 0,
    openExpense: 0,
    overdueExpense: 0,
    balance: 0,
    totalEntries: 0,
    paidEntries: 0,
    openEntries: 0,
    overdueEntries: 0,
    reversedEntries: 0,
  },
  entries: [],
};

function currency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(value) ? value : 0);
}

function formatDate(value?: string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleDateString("pt-BR");
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleString("pt-BR");
}

function typeLabel(type: FinancialKind | TypeFilter) {
  return (
    {
      ALL: "Todos",
      REVENUE: "Receita",
      EXPENSE: "Despesa",
      OTHER: "Outro",
    }[type] || "Outro"
  );
}

function statusLabel(status: FinancialStatus | StatusFilter) {
  return (
    {
      ALL: "Todos",
      PAID: "Pago",
      OPEN: "Em aberto",
      OVERDUE: "Vencido",
      CANCELED: "Cancelado",
      REVERSED: "Estornado",
      OTHER: "Outro",
    }[status] || "Outro"
  );
}

function statusBadgeClass(status: FinancialStatus) {
  return (
    {
      PAID: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
      OPEN: "border-[#DDE5DF] bg-white text-[#5E6B63]",
      OVERDUE: "border-red-200 bg-red-50 text-red-700",
      CANCELED: "border-[#DDE5DF] bg-[#F6F8F7] text-[#7A877F]",
      REVERSED: "border-yellow-200 bg-yellow-50 text-yellow-700",
      OTHER: "border-[#DDE5DF] bg-[#F6F8F7] text-[#7A877F]",
    }[status] || "border-[#DDE5DF] bg-[#F6F8F7] text-[#7A877F]"
  );
}

function typeBadgeClass(type: FinancialKind) {
  if (type === "REVENUE") return "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]";
  if (type === "EXPENSE") return "border-red-200 bg-red-50 text-red-700";

  return "border-[#DDE5DF] bg-[#F6F8F7] text-[#7A877F]";
}

function periodLabel(period: PeriodFilter) {
  return (
    {
      "7D": "Últimos 7 dias",
      "30D": "Últimos 30 dias",
      "90D": "Últimos 90 dias",
      ALL: "Todo o período",
    }[period] || "Período selecionado"
  );
}

function csvEscape(value: unknown) {
  const text = String(value ?? "")
    .replace(/\r?\n|\r/g, " ")
    .replace(/"/g, '""');

  return `"${text}"`;
}

function getCurrentDateForFilename() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export default function RelatorioFinanceiroGerencialPage() {
  const [report, setReport] = useState<FinancialReportResponse>(emptyReport);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [period, setPeriod] = useState<PeriodFilter>("30D");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [competenceFilter, setCompetenceFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");

  async function loadReport() {
    try {
      const params = new URLSearchParams({
        period,
        type: typeFilter,
        status: statusFilter,
        category: categoryFilter,
        competence: competenceFilter,
      });

      const res = await fetch(`/api/admin/relatorios/financeiro?${params}`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Erro ao carregar relatório financeiro.");
        setReport(emptyReport);
        return;
      }

      setError("");
      setReport({
        ...emptyReport,
        ...data,
        summary: {
          ...emptyReport.summary,
          ...(data?.summary || {}),
        },
        entries: Array.isArray(data?.entries) ? data.entries : [],
      });
    } catch (err) {
      console.error(err);
      setError("Erro ao carregar relatório financeiro.");
      setReport(emptyReport);
    } finally {
      setLoading(false);
    }
  }

  function clearFilters() {
    setPeriod("30D");
    setTypeFilter("ALL");
    setStatusFilter("ALL");
    setCategoryFilter("ALL");
    setCompetenceFilter("ALL");
    setSearchTerm("");
  }

  useEffect(() => {
    let isMounted = true;

    void Promise.resolve().then(async () => {
      if (!isMounted) return;

      await loadReport();
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const categoryOptions = useMemo(() => {
    const categories = report.entries
      .map((entry) => entry.categoryName?.trim())
      .filter((category): category is string => !!category && category !== "-");

    return Array.from(new Set(categories)).sort((a, b) =>
      a.localeCompare(b, "pt-BR")
    );
  }, [report.entries]);

  const competenceOptions = useMemo(() => {
    const competences = report.entries
      .map((entry) => entry.competence?.trim())
      .filter(
        (competence): competence is string => !!competence && competence !== "-"
      );

    return Array.from(new Set(competences)).sort((a, b) =>
      b.localeCompare(a, "pt-BR")
    );
  }, [report.entries]);

  const filteredEntries = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase("pt-BR");

    if (!term) return report.entries;

    return report.entries.filter((entry) => {
      const searchableText = [
        entry.title,
        entry.condominiumName,
        entry.unitLabel,
        entry.categoryName,
        entry.competence,
        entry.source,
        typeLabel(entry.type),
        statusLabel(entry.status),
      ]
        .join(" ")
        .toLocaleLowerCase("pt-BR");

      return searchableText.includes(term);
    });
  }, [report.entries, searchTerm]);

  const searchSummary = useMemo(() => {
    const revenues = filteredEntries.filter((entry) => entry.type === "REVENUE");
    const expenses = filteredEntries.filter((entry) => entry.type === "EXPENSE");

    return {
      revenue: revenues.reduce((sum, entry) => sum + entry.amount, 0),
      expense: expenses.reduce((sum, entry) => sum + entry.amount, 0),
      open: filteredEntries.reduce((sum, entry) => sum + entry.openAmount, 0),
      overdue: filteredEntries
        .filter((entry) => entry.status === "OVERDUE")
        .reduce((sum, entry) => sum + entry.openAmount, 0),
    };
  }, [filteredEntries]);

  const hasAnyFilter =
    period !== "30D" ||
    typeFilter !== "ALL" ||
    statusFilter !== "ALL" ||
    categoryFilter !== "ALL" ||
    competenceFilter !== "ALL" ||
    searchTerm.trim() !== "";

  const activeFilterSummary = useMemo(() => {
    const items: string[] = [];

    if (period !== "30D") items.push(`Período: ${periodLabel(period)}`);
    if (typeFilter !== "ALL") items.push(`Tipo: ${typeLabel(typeFilter)}`);
    if (statusFilter !== "ALL") {
      items.push(`Status: ${statusLabel(statusFilter)}`);
    }
    if (categoryFilter !== "ALL") items.push(`Categoria: ${categoryFilter}`);
    if (competenceFilter !== "ALL") {
      items.push(`Competência: ${competenceFilter}`);
    }
    if (searchTerm.trim()) items.push(`Busca: "${searchTerm.trim()}"`);

    return items;
  }, [
    period,
    typeFilter,
    statusFilter,
    categoryFilter,
    competenceFilter,
    searchTerm,
  ]);

  const executiveSummary =
    filteredEntries.length === 0
      ? "Nenhum lançamento financeiro encontrado para os filtros aplicados."
      : `O relatório atual contém ${filteredEntries.length} registro(s), com ${currency(
          searchSummary.revenue
        )} em receitas, ${currency(searchSummary.expense)} em despesas, ${currency(
          searchSummary.open
        )} em aberto e ${currency(searchSummary.overdue)} vencido(s).`;

  const recommendedAction =
    report.summary.overdueRevenue > 0
      ? "Priorize a análise das receitas vencidas e das mensalidades pendentes."
      : report.summary.openRevenue > 0
        ? "Revise as receitas em aberto para acompanhar a previsão de recebimento."
        : report.summary.openExpense > 0
          ? "Acompanhe as despesas em aberto para evitar atraso de pagamento."
          : filteredEntries.length === 0
            ? "Ajuste ou limpe os filtros para gerar um relatório com dados."
            : "Relatório sem alerta financeiro crítico evidente para os filtros atuais.";

  function exportCsv() {
    const headers = [
      "ID",
      "Tipo",
      "Status",
      "Título",
      "Condomínio",
      "Unidade",
      "Categoria",
      "Competência",
      "Vencimento",
      "Baixa / pagamento",
      "Criado em",
      "Valor",
      "Valor baixado",
      "Valor em aberto",
      "Origem",
    ];

    const rows = filteredEntries.map((entry) => [
      entry.id,
      typeLabel(entry.type),
      statusLabel(entry.status),
      entry.title,
      entry.condominiumName,
      entry.unitLabel,
      entry.categoryName,
      entry.competence,
      formatDate(entry.dueDate),
      formatDate(entry.paidAt),
      formatDate(entry.createdAt),
      currency(entry.amount),
      currency(entry.paidAmount),
      currency(entry.openAmount),
      entry.source,
    ]);

    const csvContent = [
      headers.map(csvEscape).join(";"),
      ...rows.map((row) => row.map(csvEscape).join(";")),
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `relatorio-financeiro-${getCurrentDateForFilename()}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando relatório financeiro..."
        description="Aguarde enquanto consolidamos receitas, despesas e mensalidades da administradora."
      />
    );
  }

  return (
    <AdminContextGuard
      fallbackTitle="Relatório financeiro indisponível neste perfil de acesso"
      fallbackDescription="Os relatórios financeiros são exclusivos para a administradora. Para acompanhar informações como síndico, morador, proprietário ou conselheiro, acesse o portal."
    >
      <AdminShell
        current="relatorios"
        title="Relatório Financeiro"
        description="Consulte receitas, despesas, saldo, pendências e vencimentos."
      >
        <div className="space-y-6">
          <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#256D3C]">
                Relatórios Gerenciais
              </p>

              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17211B] md:text-4xl">
                Relatório Financeiro
              </h1>

              <p className="mt-2 max-w-4xl text-sm leading-6 text-[#5E6B63]">
                Consolide receitas, despesas, mensalidades, baixas e pendências
                financeiras da carteira administrativa.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/admin/relatorios"
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#17211B] shadow-sm transition hover:border-[#256D3C] hover:text-[#256D3C]"
              >
                Voltar Aos Relatórios
              </Link>

              <button
                type="button"
                onClick={loadReport}
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#17211B] shadow-sm transition hover:border-[#256D3C] hover:text-[#256D3C]"
              >
                Atualizar
              </button>

              <button
                type="button"
                onClick={exportCsv}
                disabled={filteredEntries.length === 0}
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
              >
                Exportar CSV
              </button>
            </div>
          </header>

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          <section className="rounded-[32px] border border-[#DDE5DF] bg-white shadow-sm">
            <div className="border-b border-[#DDE5DF] bg-[linear-gradient(135deg,#FFFFFF_0%,#F8FAF9_62%,#EAF7EE_135%)] p-6">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-[#17211B] md:text-3xl">
                    Visão Financeira
                  </h2>

                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5E6B63]">
                    Os indicadores abaixo consideram os registros financeiros
                    carregados para os filtros atuais.
                  </p>

                  <p className="mt-2 text-xs text-[#7A877F]">
                    Atualizado em {formatDateTime(report.generatedAt)}.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:min-w-[620px] xl:grid-cols-4">
                  <ReportMetricBox
                    title="Receitas"
                    value={currency(report.summary.totalRevenue)}
                    description="Total previsto."
                    highlighted
                  />

                  <ReportMetricBox
                    title="Despesas"
                    value={currency(report.summary.totalExpense)}
                    description="Total previsto."
                  />

                  <ReportMetricBox
                    title="Saldo"
                    value={currency(report.summary.balance)}
                    description="Recebido menos pago."
                    highlighted={report.summary.balance >= 0}
                  />

                  <ReportMetricBox
                    title="Em Aberto"
                    value={currency(
                      report.summary.openRevenue + report.summary.openExpense
                    )}
                    description="Pendências atuais."
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-0 divide-y divide-[#DDE5DF] md:grid-cols-3 md:divide-x md:divide-y-0">
              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Receitas Vencidas
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  {report.summary.overdueRevenue > 0
                    ? `${currency(
                        report.summary.overdueRevenue
                      )} em receitas vencidas.`
                    : "Nenhuma receita vencida nos filtros atuais."}
                </p>
              </div>

              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Despesas Em Aberto
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  {report.summary.openExpense > 0
                    ? `${currency(report.summary.openExpense)} em despesas em aberto.`
                    : "Nenhuma despesa em aberto nos filtros atuais."}
                </p>
              </div>

              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Exportação
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  CSV disponível com os dados filtrados e ordenados do mais recente
                  para o mais antigo.
                </p>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm xl:col-span-2">
              <h2 className="text-xl font-semibold text-[#17211B]">
                Resumo Executivo Do Relatório
              </h2>

              <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                {executiveSummary}
              </p>

              <p className="mt-2 text-sm leading-6 text-[#7A877F]">
                Os indicadores e a exportação consideram exatamente os filtros
                aplicados abaixo.
              </p>
            </div>

            <div className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-[#17211B]">
                Ação Recomendada
              </h2>

              <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                {recommendedAction}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {report.summary.overdueRevenue > 0 && (
                  <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                    Receita vencida
                  </span>
                )}

                {report.summary.openRevenue > 0 && (
                  <span className="rounded-full border border-yellow-200 bg-yellow-50 px-2 py-1 text-xs font-semibold text-yellow-700">
                    Receita em aberto
                  </span>
                )}

                {report.summary.openExpense > 0 && (
                  <span className="rounded-full border border-[#DDE5DF] bg-white px-2 py-1 text-xs font-semibold text-[#5E6B63]">
                    Despesa em aberto
                  </span>
                )}

                {report.summary.overdueRevenue === 0 &&
                  report.summary.openRevenue === 0 &&
                  report.summary.openExpense === 0 &&
                  filteredEntries.length > 0 && (
                    <span className="rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-2 py-1 text-xs font-semibold text-[#256D3C]">
                      Sem alerta crítico
                    </span>
                  )}
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <InfoSummaryCard
              title="Receitas Baixadas"
              value={currency(report.summary.paidRevenue)}
              description="Receitas com baixa financeira."
              tone="green"
            />

            <InfoSummaryCard
              title="Receitas Em Aberto"
              value={currency(report.summary.openRevenue)}
              description="Receitas ainda pendentes."
            />

            <InfoSummaryCard
              title="Despesas Pagas"
              value={currency(report.summary.paidExpense)}
              description="Despesas com pagamento registrado."
            />

            <InfoSummaryCard
              title="Estornos"
              value={report.summary.reversedEntries}
              description="Registros marcados como estornados."
              tone="red"
            />
          </section>

          <ResponsiveSection
            title="Filtros Do Relatório"
            description="Refine os dados antes de consultar a tabela ou exportar o CSV."
            defaultOpenMobile
          >
            <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-sm">
              <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-[#17211B]">
                    Filtros Do Relatório
                  </h2>

                  <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
                    Refine os dados antes de consultar a tabela ou exportar o CSV.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={clearFilters}
                    disabled={!hasAnyFilter}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:cursor-not-allowed disabled:bg-[#F6F8F7] disabled:text-[#9AA7A0]"
                  >
                    Limpar Filtros
                  </button>

                  <button
                    onClick={loadReport}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
                  >
                    Aplicar Filtros
                  </button>

                  <button
                    onClick={exportCsv}
                    disabled={filteredEntries.length === 0}
                    className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
                  >
                    Exportar CSV
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
                <FormField label="Buscar">
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="form-input"
                    placeholder="Título, condomínio, unidade, categoria..."
                  />
                </FormField>

                <FormField label="Período">
                  <select
                    value={period}
                    onChange={(event) => setPeriod(event.target.value as PeriodFilter)}
                    className="form-input"
                  >
                    <option value="7D">Últimos 7 dias</option>
                    <option value="30D">Últimos 30 dias</option>
                    <option value="90D">Últimos 90 dias</option>
                    <option value="ALL">Todo o período</option>
                  </select>
                </FormField>

                <FormField label="Tipo">
                  <select
                    value={typeFilter}
                    onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
                    className="form-input"
                  >
                    <option value="ALL">Todos</option>
                    <option value="REVENUE">Receita</option>
                    <option value="EXPENSE">Despesa</option>
                    <option value="OTHER">Outro</option>
                  </select>
                </FormField>

                <FormField label="Status">
                  <select
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(event.target.value as StatusFilter)
                    }
                    className="form-input"
                  >
                    <option value="ALL">Todos</option>
                    <option value="PAID">Pago</option>
                    <option value="OPEN">Em aberto</option>
                    <option value="OVERDUE">Vencido</option>
                    <option value="REVERSED">Estornado</option>
                    <option value="CANCELED">Cancelado</option>
                    <option value="OTHER">Outro</option>
                  </select>
                </FormField>

                <FormField label="Competência">
                  <select
                    value={competenceFilter}
                    onChange={(event) => setCompetenceFilter(event.target.value)}
                    className="form-input"
                  >
                    <option value="ALL">Todas</option>

                    {competenceOptions.map((competence) => (
                      <option key={competence} value={competence}>
                        {competence}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Categoria">
                  <select
                    value={categoryFilter}
                    onChange={(event) => setCategoryFilter(event.target.value)}
                    className="form-input"
                  >
                    <option value="ALL">Todas</option>

                    {categoryOptions.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>

              <div className="mt-4 flex flex-col gap-3 text-sm text-[#5E6B63] md:flex-row md:items-start md:justify-between">
                <div>
                  <p>
                    Exibindo{" "}
                    <strong className="text-[#17211B]">
                      {filteredEntries.length}
                    </strong>{" "}
                    registro(s) financeiro(s).
                  </p>

                  {activeFilterSummary.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {activeFilterSummary.map((item) => (
                        <span
                          key={item}
                          className="inline-flex rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-2 py-1 text-xs font-semibold text-[#256D3C]"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <p
                  className={
                    hasAnyFilter
                      ? "font-semibold text-[#256D3C]"
                      : "text-[#7A877F]"
                  }
                >
                  {hasAnyFilter
                    ? "O relatório está filtrado."
                    : "O relatório está usando o padrão dos últimos 30 dias."}
                </p>
              </div>
            </section>
          </ResponsiveSection>

          <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-[#17211B]">
                  Resultado Do Relatório
                </h2>

                <p className="mt-1 text-sm text-[#5E6B63]">
                  Lista dos registros financeiros conforme filtros aplicados.
                </p>
              </div>

              <button
                onClick={exportCsv}
                disabled={filteredEntries.length === 0}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
              >
                Exportar CSV
              </button>
            </div>

            {filteredEntries.length === 0 ? (
              <div className="rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-6 text-sm leading-6 text-[#5E6B63]">
                Nenhum registro financeiro encontrado para os filtros aplicados.
                Ajuste os filtros ou clique em “Limpar Filtros” para ampliar o
                resultado.
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-[#DDE5DF]">
                <table className="w-full table-fixed text-sm">
                  <thead>
                    <tr className="border-b border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]">
                      <th className="hidden w-[120px] px-3 py-3 text-left font-semibold lg:table-cell">
                        Vencimento
                      </th>

                      <th className="px-3 py-3 text-left font-semibold">
                        Registro
                      </th>

                      <th className="hidden w-[110px] px-3 py-3 text-left font-semibold md:table-cell">
                        Tipo
                      </th>

                      <th className="hidden w-[120px] px-3 py-3 text-left font-semibold md:table-cell">
                        Status
                      </th>

                      <th className="hidden w-[150px] px-3 py-3 text-left font-semibold xl:table-cell">
                        Categoria
                      </th>

                      <th className="w-[132px] px-3 py-3 text-right font-semibold">
                        Valor
                      </th>

                      <th className="hidden w-[132px] px-3 py-3 text-right font-semibold lg:table-cell">
                        Em aberto
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredEntries.map((entry) => (
                      <tr
                        key={`${entry.source}-${entry.id}`}
                        className="border-b border-[#EEF2EF] align-top transition hover:bg-[#F9FBFA] last:border-b-0"
                      >
                        <td className="hidden px-3 py-4 text-[#5E6B63] lg:table-cell">
                          {formatDate(entry.dueDate)}
                        </td>

                        <td className="px-3 py-4">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-[#17211B]">
                              {entry.title}
                            </p>

                            <p className="mt-1 truncate text-xs text-[#7A877F]">
                              {entry.condominiumName} • {entry.unitLabel}
                            </p>

                            <p className="mt-1 truncate text-xs text-[#7A877F]">
                              {entry.competence !== "-"
                                ? `Competência: ${entry.competence}`
                                : entry.source}
                            </p>

                            <div className="mt-2 flex flex-wrap gap-1 md:hidden">
                              <span
                                className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${typeBadgeClass(
                                  entry.type
                                )}`}
                              >
                                {typeLabel(entry.type)}
                              </span>

                              <span
                                className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${statusBadgeClass(
                                  entry.status
                                )}`}
                              >
                                {statusLabel(entry.status)}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="hidden px-3 py-4 md:table-cell">
                          <span
                            className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${typeBadgeClass(
                              entry.type
                            )}`}
                          >
                            {typeLabel(entry.type)}
                          </span>
                        </td>

                        <td className="hidden px-3 py-4 md:table-cell">
                          <span
                            className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusBadgeClass(
                              entry.status
                            )}`}
                          >
                            {statusLabel(entry.status)}
                          </span>
                        </td>

                        <td className="hidden px-3 py-4 text-[#5E6B63] xl:table-cell">
                          <span className="line-clamp-2">
                            {entry.categoryName}
                          </span>
                        </td>

                        <td className="px-3 py-4 text-right font-semibold text-[#17211B]">
                          {currency(entry.amount)}
                        </td>

                        <td className="hidden px-3 py-4 text-right font-semibold text-[#5E6B63] lg:table-cell">
                          {currency(entry.openAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <style jsx global>{`
          .form-input {
            width: 100%;
            border-radius: 1rem;
            border: 1px solid #dde5df;
            background: #f9fbfa;
            padding: 0.75rem 1rem;
            font-size: 0.875rem;
            color: #17211b;
            outline: none;
            transition: border-color 0.15s ease, box-shadow 0.15s ease,
              background-color 0.15s ease;
          }

          .form-input:focus {
            border-color: #256d3c;
            background: #ffffff;
            box-shadow: 0 0 0 4px rgba(37, 109, 60, 0.1);
          }

          .form-input::placeholder {
            color: #9aa7a0;
          }
        `}</style>
      </AdminShell>
    </AdminContextGuard>
  );
}

function ReportMetricBox({
  title,
  value,
  description,
  highlighted = false,
}: {
  title: string;
  value: number | string;
  description?: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={[
        "h-full rounded-2xl border bg-white p-4 text-left shadow-sm",
        highlighted ? "border-[#CFE6D4]" : "border-[#DDE5DF]",
      ].join(" ")}
    >
      <p
        className={[
          "text-xs font-semibold uppercase tracking-[0.12em]",
          highlighted ? "text-[#256D3C]" : "text-[#7A877F]",
        ].join(" ")}
      >
        {title}
      </p>

      <strong
        className={[
          "mt-2 block text-2xl font-semibold",
          highlighted ? "text-[#256D3C]" : "text-[#17211B]",
        ].join(" ")}
      >
        {value}
      </strong>

      {description && (
        <p className="mt-1 text-xs text-[#5E6B63]">{description}</p>
      )}
    </div>
  );
}

function InfoSummaryCard({
  title,
  value,
  description,
  tone = "default",
}: {
  title: string;
  value: string | number;
  description?: string;
  tone?: "default" | "green" | "red";
}) {
  const valueClass =
    tone === "green"
      ? "text-[#256D3C]"
      : tone === "red"
        ? "text-red-700"
        : "text-[#17211B]";

  return (
    <div className="rounded-[24px] border border-[#DDE5DF] bg-white p-5 shadow-sm">
      <p className="text-sm text-[#5E6B63]">{title}</p>

      <strong className={`mt-1 block text-2xl font-semibold ${valueClass}`}>
        {value}
      </strong>

      {description && (
        <p className="mt-2 text-xs leading-relaxed text-[#7A877F]">
          {description}
        </p>
      )}
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-sm font-semibold text-[#17211B]">{label}</label>

      <div className="mt-1">{children}</div>
    </div>
  );
}
