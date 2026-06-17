"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AdminContextGuard from "@/components/AdminContextGuard";
import AdminShell from "@/components/AdminShell";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";
import OperationalReportsAiSummary from "@/components/admin/OperationalReportsAiSummary";

/* =========================================================
   ETAPA 54.8 — CENTRAL DE RELATÓRIOS GERENCIAIS

   Página:
   /admin/relatorios

   Objetivo:
   - Consolidar a central da Etapa 54.
   - Liberar os relatórios aprovados.
   - Padronizar textos, status e navegação.
   - Exibir indicadores gerais vindos de /api/admin/relatorios/resumo.
   ========================================================= */

type ReportStatus = "Disponível" | "Em Preparação";

type ReportCard = {
  id: string;
  title: string;
  description: string;
  href: string;
  status: ReportStatus;
  accent: string;
  metricLabel: string;
  metricValue: number | string;
  highlights: string[];
};

type ReportSummaryResponse = {
  generatedAt?: string;
  chamados?: {
    total?: number;
    open?: number;
    closed?: number;
    overdue?: number;
  };
  financeiro?: {
    total?: number;
    receitas?: number;
    despesas?: number;
    pendentes?: number;
  };
  comunicados?: {
    total?: number;
    published?: number;
    pendingReadings?: number;
  };
  assembleias?: {
    total?: number;
    open?: number;
    closed?: number;
  };
  enquetes?: {
    total?: number;
    open?: number;
    closed?: number;
  };
  fornecedores?: {
    total?: number;
    approved?: number;
    blocked?: number;
  };
};

const emptySummary: ReportSummaryResponse = {
  generatedAt: new Date().toISOString(),
  chamados: {
    total: 0,
    open: 0,
    closed: 0,
    overdue: 0,
  },
  financeiro: {
    total: 0,
    receitas: 0,
    despesas: 0,
    pendentes: 0,
  },
  comunicados: {
    total: 0,
    published: 0,
    pendingReadings: 0,
  },
  assembleias: {
    total: 0,
    open: 0,
    closed: 0,
  },
  enquetes: {
    total: 0,
    open: 0,
    closed: 0,
  },
  fornecedores: {
    total: 0,
    approved: 0,
    blocked: 0,
  },
};

function formatDateTime(value?: string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleString("pt-BR");
}

function valueOrZero(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function statusClass(status: ReportStatus) {
  if (status === "Disponível") {
    return "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]";
  }

  return "border-[#DDE5DF] bg-[#F6F8F7] text-[#7A877F]";
}

export default function RelatoriosGerenciaisPage() {
  const [summary, setSummary] = useState<ReportSummaryResponse>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadSummary() {
    try {
      const res = await fetch("/api/admin/relatorios/resumo", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Erro ao carregar resumo dos relatórios.");
        setSummary(emptySummary);
        return;
      }

      setError("");
      setSummary({
        ...emptySummary,
        ...data,
        chamados: {
          ...emptySummary.chamados,
          ...(data?.chamados || {}),
        },
        financeiro: {
          ...emptySummary.financeiro,
          ...(data?.financeiro || {}),
        },
        comunicados: {
          ...emptySummary.comunicados,
          ...(data?.comunicados || {}),
        },
        assembleias: {
          ...emptySummary.assembleias,
          ...(data?.assembleias || {}),
        },
        enquetes: {
          ...emptySummary.enquetes,
          ...(data?.enquetes || {}),
        },
        fornecedores: {
          ...emptySummary.fornecedores,
          ...(data?.fornecedores || {}),
        },
      });
    } catch (err) {
      console.error(err);
      setError("Erro ao carregar resumo dos relatórios.");
      setSummary(emptySummary);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    void Promise.resolve().then(async () => {
      if (!isMounted) return;

      await loadSummary();
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const reportCards: ReportCard[] = useMemo(
    () => [
      {
        id: "chamados",
        title: "Relatórios De Chamados",
        description:
          "Analise chamados por período, status, prioridade, prazo, avaliação, responsável e condomínio.",
        href: "/admin/relatorios/chamados",
        status: "Disponível",
        accent: "Chamados",
        metricLabel: "Chamados",
        metricValue: valueOrZero(summary.chamados?.total),
        highlights: [
          `${valueOrZero(summary.chamados?.open)} em aberto`,
          `${valueOrZero(summary.chamados?.closed)} encerrados`,
          `${valueOrZero(summary.chamados?.overdue)} em atraso`,
        ],
      },
      {
        id: "financeiro",
        title: "Relatório Financeiro",
        description:
          "Consolide receitas, despesas, saldo, baixas, mensalidades, pendências e vencimentos.",
        href: "/admin/relatorios/financeiro",
        status: "Disponível",
        accent: "Financeiro",
        metricLabel: "Lançamentos",
        metricValue: valueOrZero(summary.financeiro?.total),
        highlights: [
          `${valueOrZero(summary.financeiro?.receitas)} receitas`,
          `${valueOrZero(summary.financeiro?.despesas)} despesas`,
          `${valueOrZero(summary.financeiro?.pendentes)} pendências`,
        ],
      },
      {
        id: "comunicados",
        title: "Relatório De Comunicados",
        description:
          "Acompanhe comunicados publicados, arquivados, leituras confirmadas e pendências de leitura.",
        href: "/admin/relatorios/comunicados",
        status: "Disponível",
        accent: "Comunicados",
        metricLabel: "Comunicados",
        metricValue: valueOrZero(summary.comunicados?.total),
        highlights: [
          `${valueOrZero(summary.comunicados?.published)} publicados`,
          `${valueOrZero(summary.comunicados?.pendingReadings)} pendências`,
          "Exportação CSV",
        ],
      },
      {
        id: "assembleias",
        title: "Relatório De Assembleias",
        description:
          "Consulte assembleias, unidades aptas, participação, votos, procurações, pautas e atas.",
        href: "/admin/relatorios/assembleias",
        status: "Disponível",
        accent: "Assembleias",
        metricLabel: "Assembleias",
        metricValue: valueOrZero(summary.assembleias?.total),
        highlights: [
          `${valueOrZero(summary.assembleias?.open)} em votação`,
          `${valueOrZero(summary.assembleias?.closed)} encerradas`,
          "Pautas e atas",
        ],
      },
      {
        id: "enquetes",
        title: "Relatório De Enquetes",
        description:
          "Acompanhe enquetes abertas, encerradas, respostas, participação e publicação de resultados.",
        href: "/admin/relatorios/enquetes",
        status: "Disponível",
        accent: "Enquetes",
        metricLabel: "Enquetes",
        metricValue: valueOrZero(summary.enquetes?.total),
        highlights: [
          `${valueOrZero(summary.enquetes?.open)} abertas`,
          `${valueOrZero(summary.enquetes?.closed)} encerradas`,
          "Opções mais votadas",
        ],
      },
      {
        id: "fornecedores",
        title: "Relatório De Fornecedores",
        description:
          "Consolide fornecedores homologados, bloqueados, categorias, vínculos e liberação para chamados.",
        href: "/admin/relatorios/fornecedores",
        status: "Disponível",
        accent: "Fornecedores",
        metricLabel: "Fornecedores",
        metricValue: valueOrZero(summary.fornecedores?.total),
        highlights: [
          `${valueOrZero(summary.fornecedores?.approved)} homologados`,
          `${valueOrZero(summary.fornecedores?.blocked)} bloqueados`,
          "Vínculos por condomínio",
        ],
      },
    ],
    [summary]
  );

  const availableReports = reportCards.filter(
    (report) => report.status === "Disponível"
  ).length;

  const totalRegisters = reportCards.reduce((sum, report) => {
    return sum + (typeof report.metricValue === "number" ? report.metricValue : 0);
  }, 0);

  const executiveSummary =
    availableReports === reportCards.length
      ? `A central possui ${availableReports} relatórios disponíveis, cobrindo chamados, financeiro, comunicados, assembleias, enquetes e fornecedores.`
      : `A central possui ${availableReports} relatório(s) disponível(is) e ${reportCards.length - availableReports} em preparação.`;

  const recommendedAction =
    totalRegisters > 0
      ? "Use os relatórios específicos para filtrar, analisar e exportar os dados consolidados da administradora."
      : "Acesse cada relatório para validar os dados por módulo ou ampliar o período dos filtros.";

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando relatórios gerenciais..."
        description="Aguarde enquanto consolidamos os indicadores da administradora."
      />
    );
  }

  return (
    <AdminContextGuard
      fallbackTitle="Relatórios indisponíveis neste perfil de acesso"
      fallbackDescription="Os relatórios gerenciais são exclusivos para a administradora. Para acompanhar informações como síndico, morador, proprietário ou conselheiro, acesse o portal."
    >
      <AdminShell
        current="relatorios"
        title="Relatórios Gerenciais"
        description="Acesse visões consolidadas dos principais módulos da administradora."
      >
        <div className="space-y-6">
          <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#256D3C]">
                Gestão E Análise
              </p>

              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17211B] md:text-4xl">
                Relatórios Gerenciais
              </h1>

              <p className="mt-2 max-w-4xl text-sm leading-6 text-[#5E6B63]">
                Consulte os relatórios consolidados da administradora para apoiar
                decisões, acompanhar indicadores e exportar dados operacionais.
              </p>

              <p className="mt-2 text-xs text-[#7A877F]">
                Atualizado em {formatDateTime(summary.generatedAt)}.
              </p>
            </div>

            <button
              type="button"
              onClick={loadSummary}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#17211B] shadow-sm transition hover:border-[#256D3C] hover:text-[#256D3C]"
            >
              Atualizar Central
            </button>
          </header>

          {error && (
            <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm font-semibold text-yellow-800">
              {error}
            </div>
          )}

          <OperationalReportsAiSummary
            summary={summary}
            reports={reportCards.map((report) => ({
              id: report.id,
              title: report.title,
              status: report.status,
              metricLabel: report.metricLabel,
              metricValue: report.metricValue,
              highlights: report.highlights,
            }))}
          />

          <section className="rounded-[32px] border border-[#DDE5DF] bg-white shadow-sm">
            <div className="border-b border-[#DDE5DF] bg-[linear-gradient(135deg,#FFFFFF_0%,#F8FAF9_62%,#EAF7EE_135%)] p-6">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-[#17211B] md:text-3xl">
                    Visão Geral Dos Relatórios
                  </h2>

                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5E6B63]">
                    Central consolidada da Etapa 54 com navegação para todos os
                    relatórios gerenciais aprovados.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:min-w-[620px] xl:grid-cols-4">
                  <ReportMetricBox
                    title="Relatórios"
                    value={reportCards.length}
                    description="Módulos mapeados."
                    highlighted
                  />

                  <ReportMetricBox
                    title="Disponíveis"
                    value={availableReports}
                    description="Aprovados na Etapa 54."
                    highlighted
                  />

                  <ReportMetricBox
                    title="Registros"
                    value={totalRegisters}
                    description="Indicadores consolidados."
                  />

                  <ReportMetricBox
                    title="Exportação"
                    value="CSV"
                    description="Disponível nos relatórios."
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-0 divide-y divide-[#DDE5DF] md:grid-cols-3 md:divide-x md:divide-y-0">
              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Resumo Executivo
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  {executiveSummary}
                </p>
              </div>

              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Ação Recomendada
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  {recommendedAction}
                </p>
              </div>

              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Padronização
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  Todos os relatórios disponíveis seguem o padrão com filtros,
                  resumo executivo, ação recomendada, tabela e exportação CSV.
                </p>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {reportCards.map((report) => (
              <ReportCardItem key={report.id} report={report} />
            ))}
          </section>

          <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-[#17211B]">
                  Fechamento Da Central
                </h2>

                <p className="mt-2 max-w-4xl text-sm leading-6 text-[#5E6B63]">
                  A central de relatórios gerenciais está organizada para servir
                  como ponto único de acesso aos relatórios aprovados nesta etapa.
                  Cada módulo mantém sua própria análise, filtros e exportação.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {reportCards.map((report) => (
                  <span
                    key={report.id}
                    className="rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-1 text-xs font-semibold text-[#256D3C]"
                  >
                    {report.accent}
                  </span>
                ))}
              </div>
            </div>
          </section>
        </div>
      </AdminShell>
    </AdminContextGuard>
  );
}

function ReportCardItem({ report }: { report: ReportCard }) {
  const disabled = report.status !== "Disponível";

  const content = (
    <article
      className={[
        "group flex h-full flex-col rounded-[28px] border bg-white p-6 shadow-sm transition",
        disabled
          ? "border-[#DDE5DF] opacity-80"
          : "border-[#DDE5DF] hover:-translate-y-0.5 hover:border-[#256D3C] hover:shadow-md",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-1 text-xs font-semibold text-[#256D3C]">
            {report.accent}
          </span>

          <h2 className="mt-4 text-xl font-semibold tracking-tight text-[#17211B]">
            {report.title}
          </h2>
        </div>

        <span
          className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(
            report.status
          )}`}
        >
          {report.status}
        </span>
      </div>

      <p className="mt-3 min-h-[72px] text-sm leading-6 text-[#5E6B63]">
        {report.description}
      </p>

      <div className="mt-5 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
          {report.metricLabel}
        </p>

        <strong className="mt-2 block text-3xl font-semibold text-[#17211B]">
          {report.metricValue}
        </strong>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {report.highlights.map((highlight) => (
          <span
            key={highlight}
            className="rounded-full border border-[#DDE5DF] bg-white px-2 py-1 text-xs font-semibold text-[#5E6B63]"
          >
            {highlight}
          </span>
        ))}
      </div>

      <div className="mt-auto pt-5">
        <span
          className={[
            "inline-flex h-11 w-full items-center justify-center rounded-2xl text-sm font-semibold transition",
            disabled
              ? "bg-[#DDE5DF] text-[#7A877F]"
              : "bg-[#256D3C] text-white group-hover:bg-[#1F5A32]",
          ].join(" ")}
        >
          {disabled ? "Em Preparação" : "Acessar Relatório"}
        </span>
      </div>
    </article>
  );

  if (disabled) return content;

  return (
    <Link href={report.href} className="block h-full">
      {content}
    </Link>
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
