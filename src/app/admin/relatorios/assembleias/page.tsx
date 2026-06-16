"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AdminContextGuard from "@/components/AdminContextGuard";
import AdminShell from "@/components/AdminShell";
import ResponsiveSection from "@/components/ui/ResponsiveSection";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";

/* =========================================================
   ETAPA 54.5 — RELATÓRIO DE ASSEMBLEIAS

   Página:
   /admin/relatorios/assembleias

   Objetivo:
   - Consolidar assembleias, participação, votos e pautas.
   - Exibir resultados aprovados, rejeitados, pendentes e revisados.
   - Permitir filtros gerenciais e exportação CSV.
   ========================================================= */

type AssemblyReportEntry = {
  id: string;
  title: string;
  type: string;
  status: string;
  mode: string;
  condominiumName: string;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  votingStartsAt: string | null;
  votingEndsAt: string | null;
  openedAt: string | null;
  closedAt: string | null;
  resultsPublishedAt: string | null;
  convocationPublishedAt: string | null;
  createdAt: string;
  eligibleUnits: number;
  blockedUnits: number;
  activeRepresentations: number;
  revokedRepresentations: number;
  votes: number;
  directVotes: number;
  proxyVotes: number;
  abstentions: number;
  agendaItems: number;
  deliberativeAgendaItems: number;
  informativeAgendaItems: number;
  approvedAgendaItems: number;
  rejectedAgendaItems: number;
  noQuorumAgendaItems: number;
  manualReviewAgendaItems: number;
  deferredAgendaItems: number;
  canceledAgendaItems: number;
  participationRate: number;
  minuteStatus: string | null;
};

type AssemblyReportResponse = {
  generatedAt: string;
  filters: {
    condominiumId: string;
    period: string;
    status: string;
    type: string;
    agendaResult: string;
  };
  summary: {
    total: number;
    draft: number;
    scheduled: number;
    open: number;
    closed: number;
    resultsPublished: number;
    canceled: number;
    archived: number;
    eligibleUnits: number;
    votes: number;
    abstentions: number;
    activeRepresentations: number;
    agendaItems: number;
    approvedAgendaItems: number;
    rejectedAgendaItems: number;
    pendingAgendaItems: number;
    deferredAgendaItems: number;
    averageParticipationRate: number;
    minutesPublished: number;
  };
  entries: AssemblyReportEntry[];
};

type PeriodFilter = "7D" | "30D" | "90D" | "ALL";

const emptyReport: AssemblyReportResponse = {
  generatedAt: new Date().toISOString(),
  filters: {
    condominiumId: "ALL",
    period: "30D",
    status: "ALL",
    type: "ALL",
    agendaResult: "ALL",
  },
  summary: {
    total: 0,
    draft: 0,
    scheduled: 0,
    open: 0,
    closed: 0,
    resultsPublished: 0,
    canceled: 0,
    archived: 0,
    eligibleUnits: 0,
    votes: 0,
    abstentions: 0,
    activeRepresentations: 0,
    agendaItems: 0,
    approvedAgendaItems: 0,
    rejectedAgendaItems: 0,
    pendingAgendaItems: 0,
    deferredAgendaItems: 0,
    averageParticipationRate: 0,
    minutesPublished: 0,
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
      DRAFT: "Rascunho",
      SCHEDULED: "Agendada",
      OPEN: "Em votação",
      CLOSED: "Encerrada",
      RESULTS_PUBLISHED: "Resultados publicados",
      CANCELED: "Cancelada",
      ARCHIVED: "Arquivada",
    }[status] || status || "Não informado"
  );
}

function typeLabel(type: string) {
  return (
    {
      ALL: "Todos",
      ORDINARY: "Ordinária",
      EXTRAORDINARY: "Extraordinária",
      SPECIAL: "Especial",
      OTHER: "Outra",
    }[type] || type || "Não informado"
  );
}

function modeLabel(mode: string) {
  return (
    {
      ONLINE: "Online",
      IN_PERSON: "Presencial",
      HYBRID: "Híbrida",
    }[mode] || mode || "Não informado"
  );
}

function agendaResultLabel(result: string) {
  return (
    {
      ALL: "Todos",
      APPROVED: "Aprovadas",
      REJECTED: "Rejeitadas",
      PENDING: "Pendentes / revisão",
      DEFERRED: "Encaminhadas",
    }[result] || result || "Não informado"
  );
}

function minuteStatusLabel(status: string | null) {
  return (
    {
      DRAFT: "Rascunho",
      GENERATED: "Gerada",
      UNDER_REVIEW: "Em revisão",
      APPROVED: "Aprovada",
      PUBLISHED: "Publicada",
      ARCHIVED: "Arquivada",
    }[status || ""] ||
    status ||
    "-"
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
      DRAFT: "border-[#DDE5DF] bg-[#F6F8F7] text-[#7A877F]",
      SCHEDULED: "border-yellow-200 bg-yellow-50 text-yellow-700",
      OPEN: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
      CLOSED: "border-[#DDE5DF] bg-white text-[#5E6B63]",
      RESULTS_PUBLISHED: "border-[#CFE6D4] bg-white text-[#256D3C]",
      CANCELED: "border-red-200 bg-red-50 text-red-700",
      ARCHIVED: "border-[#DDE5DF] bg-[#F6F8F7] text-[#7A877F]",
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

export default function RelatorioAssembleiasPage() {
  const [report, setReport] = useState<AssemblyReportResponse>(emptyReport);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [period, setPeriod] = useState<PeriodFilter>("30D");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [agendaResultFilter, setAgendaResultFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");

  async function loadReport() {
    try {
      const params = new URLSearchParams({
        period,
        status: statusFilter,
        type: typeFilter,
        agendaResult: agendaResultFilter,
      });

      const res = await fetch(`/api/admin/relatorios/assembleias?${params}`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Erro ao carregar relatório de assembleias.");
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
      setError("Erro ao carregar relatório de assembleias.");
      setReport(emptyReport);
    } finally {
      setLoading(false);
    }
  }

  function clearFilters() {
    setPeriod("30D");
    setStatusFilter("ALL");
    setTypeFilter("ALL");
    setAgendaResultFilter("ALL");
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

  const filteredEntries = useMemo(() => {
    const term = searchTerm.trim().toLocaleLowerCase("pt-BR");

    if (!term) return report.entries;

    return report.entries.filter((entry) => {
      const searchableText = [
        entry.title,
        entry.condominiumName,
        statusLabel(entry.status),
        typeLabel(entry.type),
        modeLabel(entry.mode),
        minuteStatusLabel(entry.minuteStatus),
      ]
        .join(" ")
        .toLocaleLowerCase("pt-BR");

      return searchableText.includes(term);
    });
  }, [report.entries, searchTerm]);

  const searchSummary = useMemo(() => {
    const eligibleUnits = filteredEntries.reduce(
      (sum, entry) => sum + entry.eligibleUnits,
      0
    );
    const votes = filteredEntries.reduce((sum, entry) => sum + entry.votes, 0);

    return {
      eligibleUnits,
      votes,
      abstentions: filteredEntries.reduce(
        (sum, entry) => sum + entry.abstentions,
        0
      ),
      approved: filteredEntries.reduce(
        (sum, entry) => sum + entry.approvedAgendaItems,
        0
      ),
      rejected: filteredEntries.reduce(
        (sum, entry) => sum + entry.rejectedAgendaItems,
        0
      ),
      pending: filteredEntries.reduce(
        (sum, entry) =>
          sum + entry.manualReviewAgendaItems + entry.noQuorumAgendaItems,
        0
      ),
      participationRate:
        eligibleUnits > 0 ? Math.round((votes / eligibleUnits) * 100) : 0,
    };
  }, [filteredEntries]);

  const hasAnyFilter =
    period !== "30D" ||
    statusFilter !== "ALL" ||
    typeFilter !== "ALL" ||
    agendaResultFilter !== "ALL" ||
    searchTerm.trim() !== "";

  const activeFilterSummary = useMemo(() => {
    const items: string[] = [];

    if (period !== "30D") items.push(`Período: ${periodLabel(period)}`);
    if (statusFilter !== "ALL") items.push(`Status: ${statusLabel(statusFilter)}`);
    if (typeFilter !== "ALL") items.push(`Tipo: ${typeLabel(typeFilter)}`);
    if (agendaResultFilter !== "ALL") {
      items.push(`Resultado: ${agendaResultLabel(agendaResultFilter)}`);
    }
    if (searchTerm.trim()) items.push(`Busca: "${searchTerm.trim()}"`);

    return items;
  }, [period, statusFilter, typeFilter, agendaResultFilter, searchTerm]);

  const executiveSummary =
    filteredEntries.length === 0
      ? "Nenhuma assembleia encontrada para os filtros aplicados."
      : `O relatório atual contém ${filteredEntries.length} assembleia(s), com ${searchSummary.eligibleUnits} unidade(s) apta(s), ${searchSummary.votes} voto(s), ${searchSummary.abstentions} abstenção(ões), ${searchSummary.approved} pauta(s) aprovada(s), ${searchSummary.rejected} rejeitada(s) e ${searchSummary.pending} pendente(s) de revisão ou quórum.`;

  const recommendedAction =
    report.summary.pendingAgendaItems > 0
      ? "Priorize a revisão das pautas pendentes, sem quórum ou em análise manual."
      : report.summary.deferredAgendaItems > 0
        ? "Acompanhe as pautas encaminhadas para próxima assembleia."
        : report.summary.open > 0
          ? "Acompanhe as assembleias em votação e o nível de participação."
          : filteredEntries.length === 0
            ? "Ajuste ou limpe os filtros para gerar um relatório com dados."
            : "Relatório sem alerta crítico evidente para os filtros atuais.";

  function exportCsv() {
    const headers = [
      "ID",
      "Título",
      "Tipo",
      "Status",
      "Formato",
      "Condomínio",
      "Agendada para",
      "Início da votação",
      "Fim da votação",
      "Encerrada em",
      "Resultados publicados em",
      "Unidades aptas",
      "Unidades bloqueadas",
      "Procurações ativas",
      "Votos",
      "Votos diretos",
      "Votos por procuração",
      "Abstenções",
      "Pautas",
      "Pautas deliberativas",
      "Pautas informativas",
      "Pautas aprovadas",
      "Pautas rejeitadas",
      "Pautas sem quórum",
      "Pautas em revisão",
      "Pautas encaminhadas",
      "Participação",
      "Status da ata",
      "Criada em",
    ];

    const rows = filteredEntries.map((entry) => [
      entry.id,
      entry.title,
      typeLabel(entry.type),
      statusLabel(entry.status),
      modeLabel(entry.mode),
      entry.condominiumName,
      formatDate(entry.scheduledStartAt),
      formatDate(entry.votingStartsAt),
      formatDate(entry.votingEndsAt),
      formatDate(entry.closedAt),
      formatDate(entry.resultsPublishedAt),
      entry.eligibleUnits,
      entry.blockedUnits,
      entry.activeRepresentations,
      entry.votes,
      entry.directVotes,
      entry.proxyVotes,
      entry.abstentions,
      entry.agendaItems,
      entry.deliberativeAgendaItems,
      entry.informativeAgendaItems,
      entry.approvedAgendaItems,
      entry.rejectedAgendaItems,
      entry.noQuorumAgendaItems,
      entry.manualReviewAgendaItems,
      entry.deferredAgendaItems,
      `${entry.participationRate}%`,
      minuteStatusLabel(entry.minuteStatus),
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
    link.download = `relatorio-assembleias-${getCurrentDateForFilename()}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando relatório de assembleias..."
        description="Aguarde enquanto consolidamos participação, votos e resultados."
      />
    );
  }

  return (
    <AdminContextGuard
      fallbackTitle="Relatório de assembleias indisponível neste perfil de acesso"
      fallbackDescription="Os relatórios de assembleias são exclusivos para a administradora. Para acompanhar assembleias como síndico, morador, proprietário ou conselheiro, acesse o portal."
    >
      <AdminShell
        current="relatorios"
        title="Relatório De Assembleias"
        description="Consulte assembleias, participação, votos, pautas e resultados."
      >
        <div className="space-y-6">
          <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#256D3C]">
                Relatórios Gerenciais
              </p>

              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17211B] md:text-4xl">
                Relatório De Assembleias
              </h1>

              <p className="mt-2 max-w-4xl text-sm leading-6 text-[#5E6B63]">
                Acompanhe assembleias criadas, votação, participação, pautas,
                resultados e status da ata oficial.
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
                    Visão Das Assembleias
                  </h2>

                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5E6B63]">
                    Os indicadores abaixo consideram as assembleias carregadas
                    para os filtros atuais.
                  </p>

                  <p className="mt-2 text-xs text-[#7A877F]">
                    Atualizado em {formatDateTime(report.generatedAt)}.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:min-w-[620px] xl:grid-cols-4">
                  <ReportMetricBox
                    title="Assembleias"
                    value={report.summary.total}
                    description="Total filtrado."
                    highlighted
                  />

                  <ReportMetricBox
                    title="Em Votação"
                    value={report.summary.open}
                    description="Assembleias abertas."
                  />

                  <ReportMetricBox
                    title="Votos"
                    value={report.summary.votes}
                    description="Votos computados."
                  />

                  <ReportMetricBox
                    title="Participação"
                    value={`${report.summary.averageParticipationRate}%`}
                    description="Média por assembleia."
                    highlighted
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-0 divide-y divide-[#DDE5DF] md:grid-cols-3 md:divide-x md:divide-y-0">
              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Pautas Pendentes
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  {report.summary.pendingAgendaItems > 0
                    ? `${report.summary.pendingAgendaItems} pauta(s) exigem revisão ou análise de quórum.`
                    : "Nenhuma pauta pendente nos filtros atuais."}
                </p>
              </div>

              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Pautas Encaminhadas
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  {report.summary.deferredAgendaItems > 0
                    ? `${report.summary.deferredAgendaItems} pauta(s) encaminhadas para próxima assembleia.`
                    : "Nenhuma pauta encaminhada nos filtros atuais."}
                </p>
              </div>

              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Atas Publicadas
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  {report.summary.minutesPublished} ata(s) oficial(is) publicada(s)
                  nas assembleias filtradas.
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
                Os indicadores consideram as unidades aptas, votos atuais,
                procurações ativas e resultados registrados por pauta.
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
                {report.summary.pendingAgendaItems > 0 && (
                  <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                    Pauta pendente
                  </span>
                )}

                {report.summary.deferredAgendaItems > 0 && (
                  <span className="rounded-full border border-yellow-200 bg-yellow-50 px-2 py-1 text-xs font-semibold text-yellow-700">
                    Encaminhada
                  </span>
                )}

                {report.summary.open > 0 && (
                  <span className="rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-2 py-1 text-xs font-semibold text-[#256D3C]">
                    Em votação
                  </span>
                )}

                {report.summary.pendingAgendaItems === 0 &&
                  report.summary.deferredAgendaItems === 0 &&
                  report.summary.open === 0 &&
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
              title="Unidades Aptas"
              value={report.summary.eligibleUnits}
              description="Unidades com direito de voto."
            />

            <InfoSummaryCard
              title="Procurações Ativas"
              value={report.summary.activeRepresentations}
              description="Representações válidas."
            />

            <InfoSummaryCard
              title="Abstenções"
              value={report.summary.abstentions}
              description="Votos registrados como abstenção."
            />

            <InfoSummaryCard
              title="Pautas Aprovadas"
              value={report.summary.approvedAgendaItems}
              description="Pautas aprovadas nos filtros atuais."
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
                    placeholder="Título, condomínio, status, tipo..."
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
                    <option value="DRAFT">Rascunho</option>
                    <option value="SCHEDULED">Agendada</option>
                    <option value="OPEN">Em votação</option>
                    <option value="CLOSED">Encerrada</option>
                    <option value="RESULTS_PUBLISHED">Resultados publicados</option>
                    <option value="CANCELED">Cancelada</option>
                    <option value="ARCHIVED">Arquivada</option>
                  </select>
                </FormField>

                <FormField label="Tipo">
                  <select
                    value={typeFilter}
                    onChange={(event) => setTypeFilter(event.target.value)}
                    className="form-input"
                  >
                    <option value="ALL">Todos</option>
                    <option value="ORDINARY">Ordinária</option>
                    <option value="EXTRAORDINARY">Extraordinária</option>
                    <option value="SPECIAL">Especial</option>
                    <option value="OTHER">Outra</option>
                  </select>
                </FormField>

                <FormField label="Resultado De Pauta">
                  <select
                    value={agendaResultFilter}
                    onChange={(event) => setAgendaResultFilter(event.target.value)}
                    className="form-input"
                  >
                    <option value="ALL">Todos</option>
                    <option value="APPROVED">Aprovadas</option>
                    <option value="REJECTED">Rejeitadas</option>
                    <option value="PENDING">Pendentes / revisão</option>
                    <option value="DEFERRED">Encaminhadas</option>
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
                    assembleia(s).
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
                  Lista das assembleias conforme filtros aplicados.
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
                Nenhuma assembleia encontrada para os filtros aplicados. Ajuste
                os filtros ou clique em “Limpar Filtros” para ampliar o resultado.
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-[#DDE5DF]">
                <table className="w-full table-fixed text-sm">
                  <thead>
                    <tr className="border-b border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]">
                      <th className="hidden w-[120px] px-3 py-3 text-left font-semibold lg:table-cell">
                        Data
                      </th>

                      <th className="px-3 py-3 text-left font-semibold">
                        Assembleia
                      </th>

                      <th className="hidden w-[140px] px-3 py-3 text-left font-semibold md:table-cell">
                        Status
                      </th>

                      <th className="hidden w-[120px] px-3 py-3 text-left font-semibold lg:table-cell">
                        Tipo
                      </th>

                      <th className="hidden w-[100px] px-3 py-3 text-right font-semibold md:table-cell">
                        Votos
                      </th>

                      <th className="hidden w-[120px] px-3 py-3 text-right font-semibold lg:table-cell">
                        Pautas
                      </th>

                      <th className="w-[120px] px-3 py-3 text-right font-semibold">
                        Participação
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
                          {formatDate(entry.scheduledStartAt || entry.createdAt)}
                        </td>

                        <td className="px-3 py-4">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-[#17211B]">
                              {entry.title}
                            </p>

                            <p className="mt-1 truncate text-xs text-[#7A877F]">
                              {entry.condominiumName} • {modeLabel(entry.mode)}
                            </p>

                            <p className="mt-1 truncate text-xs text-[#7A877F]">
                              {entry.eligibleUnits} unidade(s) apta(s) • Ata:{" "}
                              {minuteStatusLabel(entry.minuteStatus)}
                            </p>

                            <div className="mt-2 flex flex-wrap gap-1 md:hidden">
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
                            className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusBadgeClass(
                              entry.status
                            )}`}
                          >
                            {statusLabel(entry.status)}
                          </span>
                        </td>

                        <td className="hidden px-3 py-4 text-[#5E6B63] lg:table-cell">
                          {typeLabel(entry.type)}
                        </td>

                        <td className="hidden px-3 py-4 text-right font-semibold text-[#17211B] md:table-cell">
                          {entry.votes}
                        </td>

                        <td className="hidden px-3 py-4 text-right text-[#5E6B63] lg:table-cell">
                          <span className="font-semibold text-[#17211B]">
                            {entry.agendaItems}
                          </span>
                          <span className="ml-1 text-xs text-[#7A877F]">
                            ({entry.approvedAgendaItems} aprov.)
                          </span>
                        </td>

                        <td className="px-3 py-4 text-right font-semibold text-[#256D3C]">
                          {entry.participationRate}%
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
