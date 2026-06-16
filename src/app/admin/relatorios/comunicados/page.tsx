"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AdminContextGuard from "@/components/AdminContextGuard";
import AdminShell from "@/components/AdminShell";
import ResponsiveSection from "@/components/ui/ResponsiveSection";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";

/* =========================================================
   ETAPA 54.4 — RELATÓRIO DE COMUNICADOS

   Página:
   /admin/relatorios/comunicados

   Objetivo:
   - Consolidar comunicados criados, publicados e arquivados.
   - Exibir confirmações de leitura e pendências.
   - Permitir filtros gerenciais e exportação CSV.
   ========================================================= */

type AnnouncementReportStatus = "DRAFT" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";
type AnnouncementReportPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

type AnnouncementReportEntry = {
  id: string;
  title: string;
  type: string;
  status: AnnouncementReportStatus;
  priority: AnnouncementReportPriority;
  targetScope: string;
  condominiumName: string;
  blocks: string[];
  targetCount: number;
  readingCount: number;
  pendingCount: number;
  readingRate: number;
  requireReadingConfirmation: boolean;
  publishAt: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  eventStartAt: string | null;
  eventEndAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

type AnnouncementReportResponse = {
  generatedAt: string;
  filters: {
    condominiumId: string;
    period: string;
    status: string;
    block: string;
    type: string;
    priority: string;
  };
  summary: {
    total: number;
    drafts: number;
    scheduled: number;
    published: number;
    archived: number;
    requireConfirmation: number;
    totalTargets: number;
    totalReadings: number;
    totalPending: number;
    readingRate: number;
    urgent: number;
  };
  entries: AnnouncementReportEntry[];
};

type PeriodFilter = "7D" | "30D" | "90D" | "ALL";
type StatusFilter = "ALL" | AnnouncementReportStatus;
type PriorityFilter = "ALL" | AnnouncementReportPriority;

const emptyReport: AnnouncementReportResponse = {
  generatedAt: new Date().toISOString(),
  filters: {
    condominiumId: "ALL",
    period: "30D",
    status: "ALL",
    block: "ALL",
    type: "ALL",
    priority: "ALL",
  },
  summary: {
    total: 0,
    drafts: 0,
    scheduled: 0,
    published: 0,
    archived: 0,
    requireConfirmation: 0,
    totalTargets: 0,
    totalReadings: 0,
    totalPending: 0,
    readingRate: 0,
    urgent: 0,
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

function statusLabel(status: StatusFilter) {
  return (
    {
      ALL: "Todos",
      DRAFT: "Rascunho",
      SCHEDULED: "Agendado",
      PUBLISHED: "Publicado",
      ARCHIVED: "Arquivado",
    }[status] || "Não informado"
  );
}

function priorityLabel(priority: PriorityFilter) {
  return (
    {
      ALL: "Todas",
      LOW: "Baixa",
      NORMAL: "Normal",
      HIGH: "Alta",
      URGENT: "Urgente",
    }[priority] || "Não informado"
  );
}

function typeLabel(type: string) {
  return (
    {
      GENERAL: "Geral",
      MAINTENANCE: "Manutenção",
      ASSEMBLY: "Assembleia",
      FINANCIAL: "Financeiro",
      SECURITY: "Segurança",
      EMERGENCY: "Emergência",
      GOVERNANCE: "Governança",
    }[type] || type || "Não informado"
  );
}

function targetScopeLabel(scope: string) {
  return (
    {
      ALL_ADMINISTRATOR: "Toda a carteira",
      CONDOMINIUM: "Condomínio",
      BLOCK: "Bloco",
      UNIT: "Unidade",
      ROLE: "Perfil",
      LINK_TYPE: "Tipo de vínculo",
      CUSTOM: "Personalizado",
    }[scope] || scope || "Não informado"
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

function statusBadgeClass(status: AnnouncementReportStatus) {
  return (
    {
      DRAFT: "border-[#DDE5DF] bg-[#F6F8F7] text-[#7A877F]",
      SCHEDULED: "border-yellow-200 bg-yellow-50 text-yellow-700",
      PUBLISHED: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
      ARCHIVED: "border-[#DDE5DF] bg-white text-[#5E6B63]",
    }[status] || "border-[#DDE5DF] bg-[#F6F8F7] text-[#7A877F]"
  );
}

function priorityBadgeClass(priority: AnnouncementReportPriority) {
  if (priority === "URGENT") return "border-red-200 bg-red-50 text-red-700";
  if (priority === "HIGH") return "border-yellow-200 bg-yellow-50 text-yellow-700";

  return "border-[#DDE5DF] bg-white text-[#5E6B63]";
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

export default function RelatorioComunicadosPage() {
  const [report, setReport] = useState<AnnouncementReportResponse>(emptyReport);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [period, setPeriod] = useState<PeriodFilter>("30D");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [blockFilter, setBlockFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");

  async function loadReport() {
    try {
      const params = new URLSearchParams({
        period,
        status: statusFilter,
        priority: priorityFilter,
        type: typeFilter,
        block: blockFilter,
      });

      const res = await fetch(`/api/admin/relatorios/comunicados?${params}`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Erro ao carregar relatório de comunicados.");
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
      setError("Erro ao carregar relatório de comunicados.");
      setReport(emptyReport);
    } finally {
      setLoading(false);
    }
  }

  function clearFilters() {
    setPeriod("30D");
    setStatusFilter("ALL");
    setPriorityFilter("ALL");
    setTypeFilter("ALL");
    setBlockFilter("ALL");
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

  const blockOptions = useMemo(() => {
    const blocks = report.entries.flatMap((entry) => entry.blocks || []);

    return Array.from(new Set(blocks)).sort((a, b) =>
      a.localeCompare(b, "pt-BR")
    );
  }, [report.entries]);

  const typeOptions = useMemo(() => {
    const types = report.entries
      .map((entry) => entry.type)
      .filter((type) => !!type);

    return Array.from(new Set(types)).sort((a, b) =>
      typeLabel(a).localeCompare(typeLabel(b), "pt-BR")
    );
  }, [report.entries]);

  const filteredEntries = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase("pt-BR");

    if (!term) return report.entries;

    return report.entries.filter((entry) => {
      const searchableText = [
        entry.title,
        typeLabel(entry.type),
        statusLabel(entry.status),
        priorityLabel(entry.priority),
        targetScopeLabel(entry.targetScope),
        entry.condominiumName,
        entry.blocks.join(" "),
      ]
        .join(" ")
        .toLocaleLowerCase("pt-BR");

      return searchableText.includes(term);
    });
  }, [report.entries, searchTerm]);

  const searchSummary = useMemo(() => {
    const totalTargets = filteredEntries.reduce(
      (sum, entry) => sum + entry.targetCount,
      0
    );
    const totalReadings = filteredEntries.reduce(
      (sum, entry) => sum + entry.readingCount,
      0
    );
    const totalPending = filteredEntries.reduce(
      (sum, entry) => sum + entry.pendingCount,
      0
    );

    return {
      totalTargets,
      totalReadings,
      totalPending,
      readingRate:
        totalTargets > 0 ? Math.round((totalReadings / totalTargets) * 100) : 0,
    };
  }, [filteredEntries]);

  const hasAnyFilter =
    period !== "30D" ||
    statusFilter !== "ALL" ||
    priorityFilter !== "ALL" ||
    typeFilter !== "ALL" ||
    blockFilter !== "ALL" ||
    searchTerm.trim() !== "";

  const activeFilterSummary = useMemo(() => {
    const items: string[] = [];

    if (period !== "30D") items.push(`Período: ${periodLabel(period)}`);
    if (statusFilter !== "ALL") items.push(`Status: ${statusLabel(statusFilter)}`);
    if (priorityFilter !== "ALL") {
      items.push(`Prioridade: ${priorityLabel(priorityFilter)}`);
    }
    if (typeFilter !== "ALL") items.push(`Tipo: ${typeLabel(typeFilter)}`);
    if (blockFilter !== "ALL") items.push(`Bloco: ${blockFilter}`);
    if (searchTerm.trim()) items.push(`Busca: "${searchTerm.trim()}"`);

    return items;
  }, [period, statusFilter, priorityFilter, typeFilter, blockFilter, searchTerm]);

  const executiveSummary =
    filteredEntries.length === 0
      ? "Nenhum comunicado encontrado para os filtros aplicados."
      : `O relatório atual contém ${filteredEntries.length} comunicado(s), com ${report.summary.published} publicado(s), ${report.summary.archived} arquivado(s), ${searchSummary.totalReadings} leitura(s) confirmada(s) e ${searchSummary.totalPending} pendência(s) estimada(s) de leitura.`;

  const recommendedAction =
    searchSummary.totalPending > 0
      ? "Priorize lembretes para comunicados publicados com pendências de leitura."
      : report.summary.urgent > 0
        ? "Revise os comunicados urgentes para garantir acompanhamento adequado."
        : report.summary.scheduled > 0
          ? "Acompanhe os comunicados agendados para confirmar a publicação no prazo."
          : filteredEntries.length === 0
            ? "Ajuste ou limpe os filtros para gerar um relatório com dados."
            : "Relatório sem alerta crítico evidente para os filtros atuais.";

  function exportCsv() {
    const headers = [
      "ID",
      "Título",
      "Tipo",
      "Status",
      "Prioridade",
      "Público",
      "Condomínio",
      "Blocos",
      "Alvos",
      "Leituras",
      "Pendências",
      "Percentual de leitura",
      "Exige confirmação",
      "Publicado em",
      "Arquivado em",
      "Início do evento",
      "Término do evento",
      "Criado em",
    ];

    const rows = filteredEntries.map((entry) => [
      entry.id,
      entry.title,
      typeLabel(entry.type),
      statusLabel(entry.status),
      priorityLabel(entry.priority),
      targetScopeLabel(entry.targetScope),
      entry.condominiumName,
      entry.blocks.length > 0 ? entry.blocks.join(", ") : "-",
      entry.targetCount,
      entry.readingCount,
      entry.pendingCount,
      `${entry.readingRate}%`,
      entry.requireReadingConfirmation ? "Sim" : "Não",
      formatDate(entry.publishedAt),
      formatDate(entry.archivedAt),
      formatDate(entry.eventStartAt),
      formatDate(entry.eventEndAt),
      formatDate(entry.createdAt),
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
    link.download = `relatorio-comunicados-${getCurrentDateForFilename()}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando relatório de comunicados..."
        description="Aguarde enquanto consolidamos publicações, leituras e pendências."
      />
    );
  }

  return (
    <AdminContextGuard
      fallbackTitle="Relatório de comunicados indisponível neste perfil de acesso"
      fallbackDescription="Os relatórios de comunicados são exclusivos para a administradora. Para acompanhar comunicados como síndico, morador, proprietário ou conselheiro, acesse o portal."
    >
      <AdminShell
        current="relatorios"
        title="Relatório De Comunicados"
        description="Consulte comunicados, leituras confirmadas e pendências."
      >
        <div className="space-y-6">
          <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#256D3C]">
                Relatórios Gerenciais
              </p>

              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17211B] md:text-4xl">
                Relatório De Comunicados
              </h1>

              <p className="mt-2 max-w-4xl text-sm leading-6 text-[#5E6B63]">
                Acompanhe comunicados criados, publicados, arquivados, leituras
                confirmadas e pendências de leitura.
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
                    Visão Dos Comunicados
                  </h2>

                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5E6B63]">
                    Os indicadores abaixo consideram os comunicados carregados para
                    os filtros atuais.
                  </p>

                  <p className="mt-2 text-xs text-[#7A877F]">
                    Atualizado em {formatDateTime(report.generatedAt)}.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:min-w-[620px] xl:grid-cols-4">
                  <ReportMetricBox
                    title="Comunicados"
                    value={report.summary.total}
                    description="Total filtrado."
                    highlighted
                  />

                  <ReportMetricBox
                    title="Publicados"
                    value={report.summary.published}
                    description="Disponíveis no portal."
                  />

                  <ReportMetricBox
                    title="Leituras"
                    value={report.summary.totalReadings}
                    description="Confirmações recebidas."
                  />

                  <ReportMetricBox
                    title="Pendências"
                    value={report.summary.totalPending}
                    description="Leituras pendentes."
                    highlighted={report.summary.totalPending > 0}
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-0 divide-y divide-[#DDE5DF] md:grid-cols-3 md:divide-x md:divide-y-0">
              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Percentual De Leitura
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  {report.summary.readingRate}% de leitura considerando os alvos
                  carregados nos filtros atuais.
                </p>
              </div>

              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Comunicados Urgentes
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  {report.summary.urgent > 0
                    ? `${report.summary.urgent} comunicado(s) urgente(s) exigem acompanhamento.`
                    : "Nenhum comunicado urgente nos filtros atuais."}
                </p>
              </div>

              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Exportação
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  CSV disponível com comunicados, leituras, pendências, público e
                  datas principais.
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
                As pendências são estimadas a partir dos alvos cadastrados no
                comunicado e das confirmações de leitura registradas.
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
                {searchSummary.totalPending > 0 && (
                  <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                    Leitura pendente
                  </span>
                )}

                {report.summary.urgent > 0 && (
                  <span className="rounded-full border border-yellow-200 bg-yellow-50 px-2 py-1 text-xs font-semibold text-yellow-700">
                    Urgente
                  </span>
                )}

                {searchSummary.totalPending === 0 && filteredEntries.length > 0 && (
                  <span className="rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-2 py-1 text-xs font-semibold text-[#256D3C]">
                    Sem alerta crítico
                  </span>
                )}
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <InfoSummaryCard
              title="Agendados"
              value={report.summary.scheduled}
              description="Comunicados programados."
            />

            <InfoSummaryCard
              title="Arquivados"
              value={report.summary.archived}
              description="Comunicados já arquivados."
            />

            <InfoSummaryCard
              title="Alvos"
              value={report.summary.totalTargets}
              description="Total de alvos cadastrados."
            />

            <InfoSummaryCard
              title="Leitura"
              value={`${report.summary.readingRate}%`}
              description="Percentual consolidado."
              tone="green"
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
                    placeholder="Título, condomínio, bloco, tipo..."
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
                    onChange={(event) =>
                      setStatusFilter(event.target.value as StatusFilter)
                    }
                    className="form-input"
                  >
                    <option value="ALL">Todos</option>
                    <option value="DRAFT">Rascunho</option>
                    <option value="SCHEDULED">Agendado</option>
                    <option value="PUBLISHED">Publicado</option>
                    <option value="ARCHIVED">Arquivado</option>
                  </select>
                </FormField>

                <FormField label="Prioridade">
                  <select
                    value={priorityFilter}
                    onChange={(event) =>
                      setPriorityFilter(event.target.value as PriorityFilter)
                    }
                    className="form-input"
                  >
                    <option value="ALL">Todas</option>
                    <option value="LOW">Baixa</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">Alta</option>
                    <option value="URGENT">Urgente</option>
                  </select>
                </FormField>

                <FormField label="Tipo">
                  <select
                    value={typeFilter}
                    onChange={(event) => setTypeFilter(event.target.value)}
                    className="form-input"
                  >
                    <option value="ALL">Todos</option>

                    {typeOptions.map((type) => (
                      <option key={type} value={type}>
                        {typeLabel(type)}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Bloco">
                  <select
                    value={blockFilter}
                    onChange={(event) => setBlockFilter(event.target.value)}
                    className="form-input"
                  >
                    <option value="ALL">Todos</option>

                    {blockOptions.map((block) => (
                      <option key={block} value={block}>
                        {block}
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
                    comunicado(s).
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
                  Lista dos comunicados conforme filtros aplicados.
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
                Nenhum comunicado encontrado para os filtros aplicados. Ajuste
                os filtros ou clique em “Limpar Filtros” para ampliar o resultado.
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-[#DDE5DF]">
                <table className="w-full table-fixed text-sm">
                  <thead>
                    <tr className="border-b border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]">
                      <th className="hidden w-[120px] px-3 py-3 text-left font-semibold lg:table-cell">
                        Publicado
                      </th>

                      <th className="px-3 py-3 text-left font-semibold">
                        Comunicado
                      </th>

                      <th className="hidden w-[120px] px-3 py-3 text-left font-semibold md:table-cell">
                        Status
                      </th>

                      <th className="hidden w-[120px] px-3 py-3 text-left font-semibold lg:table-cell">
                        Prioridade
                      </th>

                      <th className="hidden w-[110px] px-3 py-3 text-right font-semibold md:table-cell">
                        Leituras
                      </th>

                      <th className="hidden w-[110px] px-3 py-3 text-right font-semibold lg:table-cell">
                        Pendências
                      </th>

                      <th className="w-[110px] px-3 py-3 text-right font-semibold">
                        Leitura
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredEntries.map((entry) => (
                      <tr
                        key={entry.id}
                        className="border-b border-[#EEF2EF] align-top transition hover:bg-[#F9FBFA] last:border-b-0"
                      >
                        <td className="hidden px-3 py-4 text-[#5E6B63] lg:table-cell">
                          {formatDate(entry.publishedAt)}
                        </td>

                        <td className="px-3 py-4">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-[#17211B]">
                              {entry.title}
                            </p>

                            <p className="mt-1 truncate text-xs text-[#7A877F]">
                              {entry.condominiumName} •{" "}
                              {targetScopeLabel(entry.targetScope)}
                            </p>

                            <p className="mt-1 truncate text-xs text-[#7A877F]">
                              {entry.blocks.length > 0
                                ? `Blocos: ${entry.blocks.join(", ")}`
                                : typeLabel(entry.type)}
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
                                className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${priorityBadgeClass(
                                  entry.priority
                                )}`}
                              >
                                {priorityLabel(entry.priority)}
                              </span>
                            </div>
                          </div>
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

                        <td className="hidden px-3 py-4 lg:table-cell">
                          <span
                            className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${priorityBadgeClass(
                              entry.priority
                            )}`}
                          >
                            {priorityLabel(entry.priority)}
                          </span>
                        </td>

                        <td className="hidden px-3 py-4 text-right font-semibold text-[#17211B] md:table-cell">
                          {entry.readingCount}
                        </td>

                        <td className="hidden px-3 py-4 text-right font-semibold text-[#5E6B63] lg:table-cell">
                          {entry.pendingCount}
                        </td>

                        <td className="px-3 py-4 text-right font-semibold text-[#256D3C]">
                          {entry.readingRate}%
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
