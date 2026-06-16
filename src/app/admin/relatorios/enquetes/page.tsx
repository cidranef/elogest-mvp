"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AdminContextGuard from "@/components/AdminContextGuard";
import AdminShell from "@/components/AdminShell";
import ResponsiveSection from "@/components/ui/ResponsiveSection";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";

/* =========================================================
   ETAPA 54.6 — RELATÓRIO DE ENQUETES

   Página:
   /admin/relatorios/enquetes

   Objetivo:
   - Consolidar enquetes, respostas, participação e resultados.
   - Exibir opções mais votadas e enquetes sem participação.
   - Permitir filtros gerenciais e exportação CSV.
   ========================================================= */

type PollReportEntry = {
  id: string;
  title: string;
  type: string;
  status: string;
  condominiumName: string;
  targetScope: string;
  targetCount: number;
  optionCount: number;
  responseCount: number;
  openAnswerCount: number;
  participationRate: number;
  topOptionLabel: string;
  topOptionVotes: number;
  resultsPublished: boolean;
  allowResponseChange: boolean;
  startsAt: string | null;
  endsAt: string | null;
  closedAt: string | null;
  resultsPublishedAt: string | null;
  createdAt: string;
};

type PollReportResponse = {
  generatedAt: string;
  filters: {
    condominiumId: string;
    period: string;
    status: string;
    type: string;
    participation: string;
  };
  summary: {
    total: number;
    draft: number;
    scheduled: number;
    open: number;
    closed: number;
    archived: number;
    resultsPublished: number;
    totalTargets: number;
    totalResponses: number;
    totalOpenAnswers: number;
    averageParticipationRate: number;
    withoutParticipation: number;
  };
  entries: PollReportEntry[];
};

type PeriodFilter = "7D" | "30D" | "90D" | "ALL";

const emptyReport: PollReportResponse = {
  generatedAt: new Date().toISOString(),
  filters: {
    condominiumId: "ALL",
    period: "30D",
    status: "ALL",
    type: "ALL",
    participation: "ALL",
  },
  summary: {
    total: 0,
    draft: 0,
    scheduled: 0,
    open: 0,
    closed: 0,
    archived: 0,
    resultsPublished: 0,
    totalTargets: 0,
    totalResponses: 0,
    totalOpenAnswers: 0,
    averageParticipationRate: 0,
    withoutParticipation: 0,
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
      OPEN: "Aberta",
      CLOSED: "Encerrada",
      ARCHIVED: "Arquivada",
    }[status] || status || "Não informado"
  );
}

function typeLabel(type: string) {
  return (
    {
      ALL: "Todos",
      SINGLE_CHOICE: "Escolha única",
      MULTIPLE_CHOICE: "Múltipla escolha",
      YES_NO: "Sim / Não",
      OPEN_TEXT: "Resposta aberta",
      OPEN_ANSWER: "Resposta aberta",
      TEXT: "Resposta aberta",
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
      GOVERNANCE: "Governança",
      CUSTOM: "Personalizado",
    }[scope] || scope || "Não informado"
  );
}

function participationLabel(value: string) {
  return (
    {
      ALL: "Todas",
      WITH_RESPONSES: "Com respostas",
      WITHOUT_RESPONSES: "Sem respostas",
      LOW: "Baixa participação",
      HIGH: "Boa participação",
    }[value] || "Todas"
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

export default function RelatorioEnquetesPage() {
  const [report, setReport] = useState<PollReportResponse>(emptyReport);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [period, setPeriod] = useState<PeriodFilter>("30D");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [participationFilter, setParticipationFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");

  async function loadReport() {
    try {
      const params = new URLSearchParams({
        period,
        status: statusFilter,
        type: typeFilter,
        participation: participationFilter,
      });

      const res = await fetch(`/api/admin/relatorios/enquetes?${params}`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Erro ao carregar relatório de enquetes.");
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
      setError("Erro ao carregar relatório de enquetes.");
      setReport(emptyReport);
    } finally {
      setLoading(false);
    }
  }

  function clearFilters() {
    setPeriod("30D");
    setStatusFilter("ALL");
    setTypeFilter("ALL");
    setParticipationFilter("ALL");
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
        targetScopeLabel(entry.targetScope),
        entry.topOptionLabel,
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
    const totalResponses = filteredEntries.reduce(
      (sum, entry) => sum + entry.responseCount,
      0
    );

    return {
      totalTargets,
      totalResponses,
      withoutParticipation: filteredEntries.filter(
        (entry) => entry.responseCount === 0
      ).length,
      averageParticipationRate:
        filteredEntries.length > 0
          ? Math.round(
              filteredEntries.reduce(
                (sum, entry) => sum + entry.participationRate,
                0
              ) / filteredEntries.length
            )
          : 0,
    };
  }, [filteredEntries]);

  const hasAnyFilter =
    period !== "30D" ||
    statusFilter !== "ALL" ||
    typeFilter !== "ALL" ||
    participationFilter !== "ALL" ||
    searchTerm.trim() !== "";

  const activeFilterSummary = useMemo(() => {
    const items: string[] = [];

    if (period !== "30D") items.push(`Período: ${periodLabel(period)}`);
    if (statusFilter !== "ALL") items.push(`Status: ${statusLabel(statusFilter)}`);
    if (typeFilter !== "ALL") items.push(`Tipo: ${typeLabel(typeFilter)}`);
    if (participationFilter !== "ALL") {
      items.push(`Participação: ${participationLabel(participationFilter)}`);
    }
    if (searchTerm.trim()) items.push(`Busca: "${searchTerm.trim()}"`);

    return items;
  }, [period, statusFilter, typeFilter, participationFilter, searchTerm]);

  const executiveSummary =
    filteredEntries.length === 0
      ? "Nenhuma enquete encontrada para os filtros aplicados."
      : `O relatório atual contém ${filteredEntries.length} enquete(s), com ${searchSummary.totalResponses} resposta(s), ${searchSummary.totalTargets} alvo(s), participação média de ${searchSummary.averageParticipationRate}% e ${searchSummary.withoutParticipation} enquete(s) sem participação.`;

  const recommendedAction =
    searchSummary.withoutParticipation > 0
      ? "Priorize lembretes ou revisão de público-alvo nas enquetes sem participação."
      : report.summary.open > 0
        ? "Acompanhe as enquetes abertas e avalie se há necessidade de lembrete."
        : report.summary.resultsPublished < report.summary.closed
          ? "Revise as enquetes encerradas que ainda não tiveram resultado publicado."
          : filteredEntries.length === 0
            ? "Ajuste ou limpe os filtros para gerar um relatório com dados."
            : "Relatório sem alerta crítico evidente para os filtros atuais.";

  function exportCsv() {
    const headers = [
      "ID",
      "Título",
      "Tipo",
      "Status",
      "Condomínio",
      "Público",
      "Alvos",
      "Opções",
      "Respostas",
      "Respostas abertas",
      "Participação",
      "Opção mais votada",
      "Votos da opção mais votada",
      "Resultado publicado",
      "Permite alteração",
      "Início",
      "Encerramento",
      "Resultado publicado em",
      "Criada em",
    ];

    const rows = filteredEntries.map((entry) => [
      entry.id,
      entry.title,
      typeLabel(entry.type),
      statusLabel(entry.status),
      entry.condominiumName,
      targetScopeLabel(entry.targetScope),
      entry.targetCount,
      entry.optionCount,
      entry.responseCount,
      entry.openAnswerCount,
      `${entry.participationRate}%`,
      entry.topOptionLabel,
      entry.topOptionVotes,
      entry.resultsPublished ? "Sim" : "Não",
      entry.allowResponseChange ? "Sim" : "Não",
      formatDate(entry.startsAt),
      formatDate(entry.endsAt),
      formatDate(entry.resultsPublishedAt),
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
    link.download = `relatorio-enquetes-${getCurrentDateForFilename()}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando relatório de enquetes..."
        description="Aguarde enquanto consolidamos respostas, participação e resultados."
      />
    );
  }

  return (
    <AdminContextGuard
      fallbackTitle="Relatório de enquetes indisponível neste perfil de acesso"
      fallbackDescription="Os relatórios de enquetes são exclusivos para a administradora. Para acompanhar enquetes como síndico, morador, proprietário ou conselheiro, acesse o portal."
    >
      <AdminShell
        current="relatorios"
        title="Relatório De Enquetes"
        description="Consulte enquetes, respostas, participação e resultados publicados."
      >
        <div className="space-y-6">
          <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#256D3C]">
                Relatórios Gerenciais
              </p>

              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17211B] md:text-4xl">
                Relatório De Enquetes
              </h1>

              <p className="mt-2 max-w-4xl text-sm leading-6 text-[#5E6B63]">
                Acompanhe enquetes criadas, abertas, encerradas, respostas,
                participação e publicação de resultados.
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
                    Visão Das Enquetes
                  </h2>

                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5E6B63]">
                    Os indicadores abaixo consideram as enquetes carregadas para
                    os filtros atuais.
                  </p>

                  <p className="mt-2 text-xs text-[#7A877F]">
                    Atualizado em {formatDateTime(report.generatedAt)}.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:min-w-[620px] xl:grid-cols-4">
                  <ReportMetricBox
                    title="Enquetes"
                    value={report.summary.total}
                    description="Total filtrado."
                    highlighted
                  />

                  <ReportMetricBox
                    title="Abertas"
                    value={report.summary.open}
                    description="Recebendo respostas."
                  />

                  <ReportMetricBox
                    title="Respostas"
                    value={report.summary.totalResponses}
                    description="Total registrado."
                  />

                  <ReportMetricBox
                    title="Participação"
                    value={`${report.summary.averageParticipationRate}%`}
                    description="Média por enquete."
                    highlighted
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-0 divide-y divide-[#DDE5DF] md:grid-cols-3 md:divide-x md:divide-y-0">
              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Sem Participação
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  {report.summary.withoutParticipation > 0
                    ? `${report.summary.withoutParticipation} enquete(s) ainda sem resposta.`
                    : "Nenhuma enquete sem participação nos filtros atuais."}
                </p>
              </div>

              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Resultados Publicados
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  {report.summary.resultsPublished} resultado(s) publicado(s)
                  nas enquetes filtradas.
                </p>
              </div>

              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Respostas Abertas
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  {report.summary.totalOpenAnswers} resposta(s) aberta(s)
                  registradas.
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
                Os indicadores consideram os alvos cadastrados, respostas
                registradas, opções disponíveis e publicação de resultados.
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
                {searchSummary.withoutParticipation > 0 && (
                  <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                    Sem participação
                  </span>
                )}

                {report.summary.open > 0 && (
                  <span className="rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-2 py-1 text-xs font-semibold text-[#256D3C]">
                    Aberta
                  </span>
                )}

                {report.summary.resultsPublished < report.summary.closed && (
                  <span className="rounded-full border border-yellow-200 bg-yellow-50 px-2 py-1 text-xs font-semibold text-yellow-700">
                    Resultado pendente
                  </span>
                )}

                {searchSummary.withoutParticipation === 0 &&
                  report.summary.open === 0 &&
                  report.summary.resultsPublished >= report.summary.closed &&
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
              title="Alvos"
              value={report.summary.totalTargets}
              description="Público total das enquetes."
            />

            <InfoSummaryCard
              title="Encerradas"
              value={report.summary.closed}
              description="Enquetes já encerradas."
            />

            <InfoSummaryCard
              title="Arquivadas"
              value={report.summary.archived}
              description="Enquetes arquivadas."
            />

            <InfoSummaryCard
              title="Publicadas"
              value={report.summary.resultsPublished}
              description="Resultados liberados."
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
                    placeholder="Título, condomínio, tipo, opção..."
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
                    <option value="OPEN">Aberta</option>
                    <option value="CLOSED">Encerrada</option>
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
                    <option value="SINGLE_CHOICE">Escolha única</option>
                    <option value="MULTIPLE_CHOICE">Múltipla escolha</option>
                    <option value="YES_NO">Sim / Não</option>
                    <option value="OPEN_TEXT">Resposta aberta</option>
                  </select>
                </FormField>

                <FormField label="Participação">
                  <select
                    value={participationFilter}
                    onChange={(event) => setParticipationFilter(event.target.value)}
                    className="form-input"
                  >
                    <option value="ALL">Todas</option>
                    <option value="WITH_RESPONSES">Com respostas</option>
                    <option value="WITHOUT_RESPONSES">Sem respostas</option>
                    <option value="LOW">Baixa participação</option>
                    <option value="HIGH">Boa participação</option>
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
                    enquete(s).
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
                  Lista das enquetes conforme filtros aplicados.
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
                Nenhuma enquete encontrada para os filtros aplicados. Ajuste os
                filtros ou clique em “Limpar Filtros” para ampliar o resultado.
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-[#DDE5DF]">
                <table className="w-full table-fixed text-sm">
                  <thead>
                    <tr className="border-b border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]">
                      <th className="hidden w-[120px] px-3 py-3 text-left font-semibold lg:table-cell">
                        Criada em
                      </th>

                      <th className="px-3 py-3 text-left font-semibold">
                        Enquete
                      </th>

                      <th className="hidden w-[120px] px-3 py-3 text-left font-semibold md:table-cell">
                        Status
                      </th>

                      <th className="hidden w-[150px] px-3 py-3 text-left font-semibold lg:table-cell">
                        Tipo
                      </th>

                      <th className="hidden w-[110px] px-3 py-3 text-right font-semibold md:table-cell">
                        Respostas
                      </th>

                      <th className="hidden w-[150px] px-3 py-3 text-left font-semibold xl:table-cell">
                        Mais votada
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
                          {formatDate(entry.createdAt)}
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
                              {entry.resultsPublished
                                ? "Resultado publicado"
                                : "Resultado não publicado"}{" "}
                              • {entry.targetCount} alvo(s)
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
                          {entry.responseCount}
                        </td>

                        <td className="hidden px-3 py-4 text-[#5E6B63] xl:table-cell">
                          <span className="line-clamp-2">
                            {entry.topOptionLabel}{" "}
                            {entry.topOptionVotes > 0
                              ? `(${entry.topOptionVotes})`
                              : ""}
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
