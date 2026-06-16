"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AdminContextGuard from "@/components/AdminContextGuard";
import AdminShell from "@/components/AdminShell";
import ResponsiveSection from "@/components/ui/ResponsiveSection";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";

/* =========================================================
   ETAPA 54.7 — RELATÓRIO DE FORNECEDORES

   Página:
   /admin/relatorios/fornecedores

   Objetivo:
   - Consolidar fornecedores cadastrados, homologados, bloqueados
     e vinculados a condomínios.
   - Exibir categorias, disponibilidade para chamados e vínculos.
   - Permitir filtros gerenciais e exportação CSV.
   ========================================================= */

type ProviderReportEntry = {
  id: string;
  providerId: string;
  name: string;
  document: string;
  category: string;
  status: string;
  homologationStatus: string;
  city: string;
  state: string;
  condominiumCount: number;
  condominiumNames: string[];
  availableForTickets: boolean;
  approvedAt: string | null;
  blockedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
};

type ProviderReportResponse = {
  generatedAt: string;
  filters: {
    condominiumId: string;
    period: string;
    status: string;
    homologationStatus: string;
    category: string;
    ticketAvailability: string;
  };
  summary: {
    total: number;
    approved: number;
    pending: number;
    blocked: number;
    inactive: number;
    active: number;
    availableForTickets: number;
    linkedToCondominiums: number;
    condominiumLinks: number;
    categories: number;
  };
  entries: ProviderReportEntry[];
};

type PeriodFilter = "7D" | "30D" | "90D" | "ALL";

const emptyReport: ProviderReportResponse = {
  generatedAt: new Date().toISOString(),
  filters: {
    condominiumId: "ALL",
    period: "30D",
    status: "ALL",
    homologationStatus: "ALL",
    category: "ALL",
    ticketAvailability: "ALL",
  },
  summary: {
    total: 0,
    approved: 0,
    pending: 0,
    blocked: 0,
    inactive: 0,
    active: 0,
    availableForTickets: 0,
    linkedToCondominiums: 0,
    condominiumLinks: 0,
    categories: 0,
  },
  entries: [],
};

function formatDate(value?: string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleDateString("pt-BR");
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleString("pt-BR");
}

function statusLabel(status: string) {
  return (
    {
      ALL: "Todos",
      ACTIVE: "Ativo",
      INACTIVE: "Inativo",
      BLOCKED: "Bloqueado",
      PENDING: "Pendente",
    }[status] || status || "Não informado"
  );
}

function homologationStatusLabel(status: string) {
  return (
    {
      ALL: "Todos",
      APPROVED: "Homologado",
      PENDING: "Pendente",
      BLOCKED: "Bloqueado",
      INACTIVE: "Inativo",
      REJECTED: "Rejeitado",
    }[status] || status || "Não informado"
  );
}

function availabilityLabel(value: string) {
  return (
    {
      ALL: "Todos",
      AVAILABLE: "Liberado para chamados",
      NOT_AVAILABLE: "Não liberado",
    }[value] || "Todos"
  );
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

function statusBadgeClass(status: string) {
  return (
    {
      ACTIVE: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
      INACTIVE: "border-[#DDE5DF] bg-[#F6F8F7] text-[#7A877F]",
      BLOCKED: "border-red-200 bg-red-50 text-red-700",
      PENDING: "border-yellow-200 bg-yellow-50 text-yellow-700",
    }[status] || "border-[#DDE5DF] bg-[#F6F8F7] text-[#7A877F]"
  );
}

function homologationBadgeClass(status: string) {
  return (
    {
      APPROVED: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
      PENDING: "border-yellow-200 bg-yellow-50 text-yellow-700",
      BLOCKED: "border-red-200 bg-red-50 text-red-700",
      INACTIVE: "border-[#DDE5DF] bg-[#F6F8F7] text-[#7A877F]",
      REJECTED: "border-red-200 bg-red-50 text-red-700",
    }[status] || "border-[#DDE5DF] bg-[#F6F8F7] text-[#7A877F]"
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

export default function RelatorioFornecedoresPage() {
  const [report, setReport] = useState<ProviderReportResponse>(emptyReport);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [period, setPeriod] = useState<PeriodFilter>("30D");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [homologationStatusFilter, setHomologationStatusFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [ticketAvailabilityFilter, setTicketAvailabilityFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");

  async function loadReport() {
    try {
      const params = new URLSearchParams({
        period,
        status: statusFilter,
        homologationStatus: homologationStatusFilter,
        category: categoryFilter,
        ticketAvailability: ticketAvailabilityFilter,
      });

      const res = await fetch(`/api/admin/relatorios/fornecedores?${params}`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Erro ao carregar relatório de fornecedores.");
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
      setError("Erro ao carregar relatório de fornecedores.");
      setReport(emptyReport);
    } finally {
      setLoading(false);
    }
  }

  function clearFilters() {
    setPeriod("30D");
    setStatusFilter("ALL");
    setHomologationStatusFilter("ALL");
    setCategoryFilter("ALL");
    setTicketAvailabilityFilter("ALL");
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
      .map((entry) => entry.category)
      .filter((category) => !!category && category !== "-");

    return Array.from(new Set(categories)).sort((a, b) =>
      a.localeCompare(b, "pt-BR")
    );
  }, [report.entries]);

  const filteredEntries = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase("pt-BR");

    if (!term) return report.entries;

    return report.entries.filter((entry) => {
      const searchableText = [
        entry.name,
        entry.document,
        entry.category,
        entry.city,
        entry.state,
        statusLabel(entry.status),
        homologationStatusLabel(entry.homologationStatus),
        entry.condominiumNames.join(" "),
      ]
        .join(" ")
        .toLocaleLowerCase("pt-BR");

      return searchableText.includes(term);
    });
  }, [report.entries, searchTerm]);

  const searchSummary = useMemo(() => {
    return {
      approved: filteredEntries.filter(
        (entry) => entry.homologationStatus === "APPROVED"
      ).length,
      blocked: filteredEntries.filter(
        (entry) =>
          entry.homologationStatus === "BLOCKED" || entry.status === "BLOCKED"
      ).length,
      available: filteredEntries.filter((entry) => entry.availableForTickets)
        .length,
      links: filteredEntries.reduce(
        (sum, entry) => sum + entry.condominiumCount,
        0
      ),
      withoutCondominium: filteredEntries.filter(
        (entry) => entry.condominiumCount === 0
      ).length,
    };
  }, [filteredEntries]);

  const hasAnyFilter =
    period !== "30D" ||
    statusFilter !== "ALL" ||
    homologationStatusFilter !== "ALL" ||
    categoryFilter !== "ALL" ||
    ticketAvailabilityFilter !== "ALL" ||
    searchTerm.trim() !== "";

  const activeFilterSummary = useMemo(() => {
    const items: string[] = [];

    if (period !== "30D") items.push(`Período: ${periodLabel(period)}`);
    if (statusFilter !== "ALL") items.push(`Status: ${statusLabel(statusFilter)}`);
    if (homologationStatusFilter !== "ALL") {
      items.push(
        `Homologação: ${homologationStatusLabel(homologationStatusFilter)}`
      );
    }
    if (categoryFilter !== "ALL") items.push(`Categoria: ${categoryFilter}`);
    if (ticketAvailabilityFilter !== "ALL") {
      items.push(`Chamados: ${availabilityLabel(ticketAvailabilityFilter)}`);
    }
    if (searchTerm.trim()) items.push(`Busca: "${searchTerm.trim()}"`);

    return items;
  }, [
    period,
    statusFilter,
    homologationStatusFilter,
    categoryFilter,
    ticketAvailabilityFilter,
    searchTerm,
  ]);

  const executiveSummary =
    filteredEntries.length === 0
      ? "Nenhum fornecedor encontrado para os filtros aplicados."
      : `O relatório atual contém ${filteredEntries.length} fornecedor(es), com ${searchSummary.approved} homologado(s), ${searchSummary.blocked} bloqueado(s), ${searchSummary.available} liberado(s) para chamados e ${searchSummary.links} vínculo(s) com condomínios.`;

  const recommendedAction =
    searchSummary.blocked > 0
      ? "Revise os fornecedores bloqueados para evitar uso indevido em chamados."
      : searchSummary.withoutCondominium > 0
        ? "Avalie fornecedores sem vínculo com condomínios para melhorar a organização da rede."
        : report.summary.pending > 0
          ? "Analise fornecedores pendentes de homologação para manter a rede atualizada."
          : filteredEntries.length === 0
            ? "Ajuste ou limpe os filtros para gerar um relatório com dados."
            : "Relatório sem alerta crítico evidente para os filtros atuais.";

  function exportCsv() {
    const headers = [
      "ID",
      "Fornecedor",
      "Documento",
      "Categoria",
      "Status",
      "Homologação",
      "Cidade",
      "Estado",
      "Condomínios vinculados",
      "Condomínios",
      "Liberado para chamados",
      "Homologado em",
      "Bloqueado em",
      "Criado em",
      "Atualizado em",
    ];

    const rows = filteredEntries.map((entry) => [
      entry.id,
      entry.name,
      entry.document,
      entry.category,
      statusLabel(entry.status),
      homologationStatusLabel(entry.homologationStatus),
      entry.city,
      entry.state,
      entry.condominiumCount,
      entry.condominiumNames.length > 0
        ? entry.condominiumNames.join(", ")
        : "-",
      entry.availableForTickets ? "Sim" : "Não",
      formatDate(entry.approvedAt),
      formatDate(entry.blockedAt),
      formatDate(entry.createdAt),
      formatDate(entry.updatedAt),
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
    link.download = `relatorio-fornecedores-${getCurrentDateForFilename()}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando relatório de fornecedores..."
        description="Aguarde enquanto consolidamos homologações, vínculos e categorias."
      />
    );
  }

  return (
    <AdminContextGuard
      fallbackTitle="Relatório de fornecedores indisponível neste perfil de acesso"
      fallbackDescription="Os relatórios de fornecedores são exclusivos para a administradora. Para acompanhar informações do condomínio, acesse o portal."
    >
      <AdminShell
        current="relatorios"
        title="Relatório De Fornecedores"
        description="Consulte fornecedores, homologações, bloqueios e vínculos por condomínio."
      >
        <div className="space-y-6">
          <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#256D3C]">
                Relatórios Gerenciais
              </p>

              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17211B] md:text-4xl">
                Relatório De Fornecedores
              </h1>

              <p className="mt-2 max-w-4xl text-sm leading-6 text-[#5E6B63]">
                Acompanhe fornecedores cadastrados, homologados, bloqueados,
                liberados para chamados e vinculados aos condomínios.
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
                    Visão Dos Fornecedores
                  </h2>

                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5E6B63]">
                    Os indicadores abaixo consideram os fornecedores carregados
                    para os filtros atuais.
                  </p>

                  <p className="mt-2 text-xs text-[#7A877F]">
                    Atualizado em {formatDateTime(report.generatedAt)}.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:min-w-[620px] xl:grid-cols-4">
                  <ReportMetricBox
                    title="Fornecedores"
                    value={report.summary.total}
                    description="Total filtrado."
                    highlighted
                  />

                  <ReportMetricBox
                    title="Homologados"
                    value={report.summary.approved}
                    description="Aprovados pela administradora."
                  />

                  <ReportMetricBox
                    title="Vínculos"
                    value={report.summary.condominiumLinks}
                    description="Condomínios atendidos."
                  />

                  <ReportMetricBox
                    title="Bloqueados"
                    value={report.summary.blocked}
                    description="Exigem revisão."
                    highlighted={report.summary.blocked > 0}
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-0 divide-y divide-[#DDE5DF] md:grid-cols-3 md:divide-x md:divide-y-0">
              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Liberados Para Chamados
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  {report.summary.availableForTickets} fornecedor(es) liberado(s)
                  para atendimento de chamados.
                </p>
              </div>

              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Categorias
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  {report.summary.categories} categoria(s) de fornecedor(es)
                  identificada(s) nos filtros atuais.
                </p>
              </div>

              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Pendentes
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  {report.summary.pending > 0
                    ? `${report.summary.pending} fornecedor(es) pendente(s) de homologação.`
                    : "Nenhum fornecedor pendente nos filtros atuais."}
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
                Os indicadores consideram homologação da administradora, vínculos
                com condomínios, disponibilidade para chamados e categoria.
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
                {searchSummary.blocked > 0 && (
                  <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                    Bloqueado
                  </span>
                )}

                {searchSummary.withoutCondominium > 0 && (
                  <span className="rounded-full border border-yellow-200 bg-yellow-50 px-2 py-1 text-xs font-semibold text-yellow-700">
                    Sem condomínio
                  </span>
                )}

                {report.summary.pending > 0 && (
                  <span className="rounded-full border border-[#DDE5DF] bg-white px-2 py-1 text-xs font-semibold text-[#5E6B63]">
                    Pendente
                  </span>
                )}

                {searchSummary.blocked === 0 &&
                  searchSummary.withoutCondominium === 0 &&
                  report.summary.pending === 0 &&
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
              title="Ativos"
              value={report.summary.active}
              description="Fornecedores ativos."
              tone="green"
            />

            <InfoSummaryCard
              title="Inativos"
              value={report.summary.inactive}
              description="Fornecedores inativos."
            />

            <InfoSummaryCard
              title="Com Condomínio"
              value={report.summary.linkedToCondominiums}
              description="Possuem vínculo condominial."
            />

            <InfoSummaryCard
              title="Categorias"
              value={report.summary.categories}
              description="Categorias identificadas."
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
                    placeholder="Fornecedor, documento, categoria..."
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

                <FormField label="Status">
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                    className="form-input"
                  >
                    <option value="ALL">Todos</option>
                    <option value="ACTIVE">Ativo</option>
                    <option value="INACTIVE">Inativo</option>
                    <option value="BLOCKED">Bloqueado</option>
                    <option value="PENDING">Pendente</option>
                  </select>
                </FormField>

                <FormField label="Homologação">
                  <select
                    value={homologationStatusFilter}
                    onChange={(event) =>
                      setHomologationStatusFilter(event.target.value)
                    }
                    className="form-input"
                  >
                    <option value="ALL">Todos</option>
                    <option value="APPROVED">Homologado</option>
                    <option value="PENDING">Pendente</option>
                    <option value="BLOCKED">Bloqueado</option>
                    <option value="INACTIVE">Inativo</option>
                    <option value="REJECTED">Rejeitado</option>
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

                <FormField label="Chamados">
                  <select
                    value={ticketAvailabilityFilter}
                    onChange={(event) =>
                      setTicketAvailabilityFilter(event.target.value)
                    }
                    className="form-input"
                  >
                    <option value="ALL">Todos</option>
                    <option value="AVAILABLE">Liberado para chamados</option>
                    <option value="NOT_AVAILABLE">Não liberado</option>
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
                    fornecedor(es).
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
                  Lista dos fornecedores conforme filtros aplicados.
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
                Nenhum fornecedor encontrado para os filtros aplicados. Ajuste os
                filtros ou clique em “Limpar Filtros” para ampliar o resultado.
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-[#DDE5DF]">
                <table className="w-full table-fixed text-sm">
                  <thead>
                    <tr className="border-b border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]">
                      <th className="px-3 py-3 text-left font-semibold">
                        Fornecedor
                      </th>

                      <th className="hidden w-[150px] px-3 py-3 text-left font-semibold lg:table-cell">
                        Categoria
                      </th>

                      <th className="hidden w-[120px] px-3 py-3 text-left font-semibold md:table-cell">
                        Status
                      </th>

                      <th className="hidden w-[130px] px-3 py-3 text-left font-semibold md:table-cell">
                        Homologação
                      </th>

                      <th className="hidden w-[110px] px-3 py-3 text-right font-semibold lg:table-cell">
                        Vínculos
                      </th>

                      <th className="w-[120px] px-3 py-3 text-right font-semibold">
                        Chamados
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredEntries.map((entry) => (
                      <tr
                        key={entry.id}
                        className="border-b border-[#EEF2EF] align-top transition hover:bg-[#F9FBFA] last:border-b-0"
                      >
                        <td className="px-3 py-4">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-[#17211B]">
                              {entry.name}
                            </p>

                            <p className="mt-1 truncate text-xs text-[#7A877F]">
                              {entry.document} • {entry.city}
                              {entry.state !== "-" ? `/${entry.state}` : ""}
                            </p>

                            <p className="mt-1 truncate text-xs text-[#7A877F]">
                              {entry.condominiumNames.length > 0
                                ? entry.condominiumNames.join(", ")
                                : "Sem condomínio vinculado"}
                            </p>

                            <div className="mt-2 flex flex-wrap gap-1 md:hidden">
                              <span
                                className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${statusBadgeClass(
                                  entry.status
                                )}`}
                              >
                                {statusLabel(entry.status)}
                              </span>

                              <span
                                className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${homologationBadgeClass(
                                  entry.homologationStatus
                                )}`}
                              >
                                {homologationStatusLabel(entry.homologationStatus)}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="hidden px-3 py-4 text-[#5E6B63] lg:table-cell">
                          <span className="line-clamp-2">{entry.category}</span>
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

                        <td className="hidden px-3 py-4 md:table-cell">
                          <span
                            className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${homologationBadgeClass(
                              entry.homologationStatus
                            )}`}
                          >
                            {homologationStatusLabel(entry.homologationStatus)}
                          </span>
                        </td>

                        <td className="hidden px-3 py-4 text-right font-semibold text-[#17211B] lg:table-cell">
                          {entry.condominiumCount}
                        </td>

                        <td className="px-3 py-4 text-right font-semibold">
                          <span
                            className={
                              entry.availableForTickets
                                ? "text-[#256D3C]"
                                : "text-[#7A877F]"
                            }
                          >
                            {entry.availableForTickets ? "Sim" : "Não"}
                          </span>
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
