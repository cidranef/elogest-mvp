"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import AdminContextGuard from "@/components/AdminContextGuard";
import AdminShell from "@/components/AdminShell";
import ResponsiveSection from "@/components/ui/ResponsiveSection";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";


/* =========================================================
   ETAPA 21 - RELATÓRIOS E FILTROS DO MÓDULO DE CHAMADOS

   Esta página gera uma visão tabular dos chamados e permite
   exportar os dados filtrados em CSV.

   Evoluções desta etapa:
   - filtro por tipo de chamado;
   - filtro por avaliação;
   - filtro por Prazo;
   - indicadores de avaliação;
   - avaliação e Prazo na tabela;
   - avaliação e Prazo na exportação CSV.

   ETAPA 28.5:
   - Adicionado ActiveAccessBadge no topo.
   - Usuário passa a visualizar o perfil de acesso ativo também
     nos relatórios.
   - Botão Trocar perfil fica disponível em /admin/chamados/relatorios.

   ETAPA 30.1:
   - Adicionado AdminContextGuard.
   - Perfis de portal não visualizam mais os relatórios
     administrativos de chamados.
   - SÍNDICO / MORADOR / PROPRIETÁRIO são direcionados ao portal
     ou à troca de perfil.

   ETAPA 38.8 — POLIMENTO FINAL DE USABILIDADE DOS CHAMADOS

   - Relatórios alinhados ao padrão da fila, detalhe e dashboard.
   - Textos visíveis ajustados para "perfil de acesso".
   - Adicionado resumo executivo do relatório.
   - Adicionada ação recomendada do relatório.
   - Filtros ativos passam a aparecer em chips.
   - Estado vazio ficou mais orientativo.
   - Exportação CSV ficou mais contextualizada.
   - Mantida toda a lógica funcional já aprovada.

   ETAPA 39.11 — NOVO VISUAL COM ADMINSHELL

   Atualização:
   - Página passa a usar AdminShell.
   - Removidos AdminTopActions e ActiveAccessBadge da própria página.
   - Topbar, sidebar, sino, logout e footer ficam no shell.
   - Layout migrado do tema escuro antigo para o padrão claro EloGest.
   - Cards, filtros, tabela, botões e exportação CSV recebem visual novo.
   - Filtros passam a usar ResponsiveSection para melhor experiência mobile.
   - Mantida toda a lógica funcional já existente.

   ETAPA 39.17.13 — PADRONIZAÇÃO DO LOADING ADMIN

   Atualização:
   - Loading inicial passa a usar EloGestLoadingScreen.
   - Evita montar AdminShell durante carregamento inicial.
   - Mantém AdminShell apenas após os dados principais carregarem.
   - Mantidas métricas, filtros, gráficos, tabela e ações existentes.
   ========================================================= */



/* =========================================================
   INTERFACES
   ========================================================= */

interface TicketRating {
  id: string;
  ticketId: string;
  userId: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  updatedAt?: string;
  user?: {
    id?: string;
    name?: string;
    email?: string;
    role?: string;
  };
}

interface Ticket {
  id: string;
  title: string;
  description: string;
  status: string;
  category?: string | null;
  priority?: string | null;
  scope?: "UNIT" | "CONDOMINIUM" | string | null;
  createdAt: string;
  firstResponseAt?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;

  condominium?: {
    id?: string;
    name: string;
  };

  unit?: {
    block?: string | null;
    unitNumber: string;
  } | null;

  resident?: {
    name: string;
  } | null;

  createdByUser?: {
    name: string;
  };

  assignedToUser?: {
    id?: string;
    name: string;
  } | null;

  rating?: TicketRating | null;
}

type PeriodFilter = "7D" | "30D" | "90D" | "ALL";
type StatusFilter = "ALL" | "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CANCELED";
type PriorityFilter = "ALL" | "LOW" | "MEDIUM" | "HIGH" | "URGENT";
type ScopeFilter = "ALL" | "UNIT" | "CONDOMINIUM";
type RatingFilter = "ALL" | "RATED" | "NOT_RATED" | "RESOLVED_NOT_RATED";
type SlaFilter = "ALL" | "OVERDUE" | "ON_TIME";



/* =========================================================
   HELPERS
   ========================================================= */

function statusLabel(status?: string | null) {
  return (
    {
      OPEN: "Aberto",
      IN_PROGRESS: "Em andamento",
      RESOLVED: "Resolvido",
      CANCELED: "Cancelado",
    }[status || ""] ||
    status ||
    "-"
  );
}

function statusBadgeClass(status?: string | null) {
  return (
    {
      OPEN: "border-[#DDE5DF] bg-white text-[#17211B]",
      IN_PROGRESS: "border-[#DDE5DF] bg-white text-[#5E6B63]",
      RESOLVED: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
      CANCELED: "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]",
    }[status || ""] || "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]"
  );
}

function priorityLabel(priority?: string | null) {
  return (
    {
      LOW: "Baixa",
      MEDIUM: "Média",
      HIGH: "Alta",
      URGENT: "Urgente",
    }[priority || ""] ||
    priority ||
    "-"
  );
}

function priorityClass(priority?: string | null) {
  return priority === "URGENT" ? "text-red-700" : "text-[#5E6B63]";
}
function formatDisplayTitle(value?: string | null) {
  const text = String(value || "").trim();

  if (!text) return "-";

  const smallWords = new Set([
    "a",
    "à",
    "ao",
    "as",
    "às",
    "o",
    "os",
    "de",
    "da",
    "das",
    "do",
    "dos",
    "e",
    "em",
    "no",
    "na",
    "nos",
    "nas",
    "com",
    "para",
    "por",
    "sem",
    "sob",
    "sobre",
  ]);

  return text
    .toLocaleLowerCase("pt-BR")
    .split(" ")
    .map((word, index) => {
      if (!word) return word;

      if (index > 0 && smallWords.has(word)) {
        return word;
      }

      return word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1);
    })
    .join(" ");
}


function priorityBadgeClass(priority?: string | null) {
  return priority === "URGENT"
    ? "border-red-200 bg-red-50 text-red-700"
    : "border-[#DDE5DF] bg-white text-[#5E6B63]";
}

function scopeLabel(scope?: string | null) {
  if (scope === "CONDOMINIUM") return "Condomínio";
  return "Unidade";
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleString("pt-BR");
}

function getUnitLabel(ticket: Ticket) {
  if (ticket.scope === "CONDOMINIUM") {
    return "Condomínio / Área comum";
  }

  if (!ticket.unit) return "-";

  return `${ticket.unit.block ? ticket.unit.block + " - " : ""}${
    ticket.unit.unitNumber
  }`;
}

function getHoursBetween(start?: string | null, end?: string | null) {
  if (!start || !end) return null;

  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();

  if (!startTime || !endTime || endTime < startTime) return null;

  return (endTime - startTime) / (1000 * 60 * 60);
}

function formatDurationHours(hours: number | null) {
  if (hours === null || !Number.isFinite(hours)) return "-";

  if (hours < 1) {
    return `${Math.round(hours * 60)} min`;
  }

  if (hours < 24) {
    return `${hours.toFixed(1)} h`;
  }

  return `${(hours / 24).toFixed(1)} dias`;
}

function getSlaLimitHours(priority?: string | null) {
  if (priority === "URGENT") return 4;
  if (priority === "HIGH") return 24;
  if (priority === "MEDIUM") return 48;
  return 72;
}

function isTicketOverdue(ticket: Ticket) {
  if (ticket.status === "RESOLVED" || ticket.status === "CANCELED") {
    return false;
  }

  const createdAt = new Date(ticket.createdAt).getTime();
  const elapsedHours = Math.floor((Date.now() - createdAt) / (1000 * 60 * 60));
  const remainingHours = getSlaLimitHours(ticket.priority) - elapsedHours;

  return remainingHours <= 0;
}

function getSlaLabel(ticket: Ticket) {
  if (ticket.status === "RESOLVED" || ticket.status === "CANCELED") {
    return "Encerrado";
  }

  return isTicketOverdue(ticket) ? "Vencido" : "No prazo";
}

function getRatingLabel(ticket: Ticket) {
  if (!ticket.rating) return "-";

  return `${ticket.rating.rating}/5`;
}

function renderStars(value: number) {
  return "★".repeat(value) + "☆".repeat(Math.max(0, 5 - value));
}

function csvEscape(value: any) {
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



/* =========================================================
   CARD DE KPI
   ========================================================= */

function ReportKpiCard({
  title,
  value,
  description,
  tone = "default",
}: {
  title: string;
  value: string | number;
  description?: string;
  tone?: "default" | "blue" | "yellow" | "green" | "red" | "purple";
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

      <strong className={`mt-1 block text-4xl font-semibold tracking-tight ${valueClass}`}>
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



/* =========================================================
   PÁGINA DE RELATÓRIOS
   ========================================================= */

export default function ChamadosRelatoriosPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // =========================================================
  // FILTROS DO RELATÓRIO
  // =========================================================

  const [period, setPeriod] = useState<PeriodFilter>("30D");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("ALL");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("ALL");
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("ALL");
  const [slaFilter, setSlaFilter] = useState<SlaFilter>("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [responsibleFilter, setResponsibleFilter] = useState("ALL");
  const [condominiumFilter, setCondominiumFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);



  /* =========================================================
     CARREGAMENTO DOS CHAMADOS
     ========================================================= */

  async function loadTickets() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/admin/chamados", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Erro ao carregar chamados.");
        setTickets([]);
        return;
      }

      if (!Array.isArray(data)) {
        setError("Resposta inválida da API.");
        setTickets([]);
        return;
      }

      setTickets(data);
    } catch (err) {
      console.error(err);
      setError("Erro ao carregar chamados.");
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }



  /* =========================================================
     LIMPAR FILTROS
     ========================================================= */

  function clearFilters() {
    setPeriod("30D");
    setStatusFilter("ALL");
    setPriorityFilter("ALL");
    setScopeFilter("ALL");
    setRatingFilter("ALL");
    setSlaFilter("ALL");
    setCategoryFilter("ALL");
    setResponsibleFilter("ALL");
    setCondominiumFilter("ALL");
    setSearchTerm("");
  }



  /* =========================================================
     INIT
     ========================================================= */

  useEffect(() => {
    loadTickets();
  }, []);



  /* =========================================================
     OPÇÕES DOS FILTROS
     ========================================================= */

  const categoryOptions = useMemo(() => {
    const categories = tickets
      .map((ticket) => ticket.category?.trim())
      .filter((category): category is string => !!category);

    return Array.from(new Set(categories)).sort((a, b) =>
      a.localeCompare(b, "pt-BR")
    );
  }, [tickets]);

  const responsibleOptions = useMemo(() => {
    const map = new Map<string, string>();

    tickets.forEach((ticket) => {
      const id = ticket.assignedToUser?.id || ticket.assignedToUser?.name;
      const name = ticket.assignedToUser?.name;

      if (id && name) {
        map.set(id, name);
      }
    });

    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [tickets]);

  const condominiumOptions = useMemo(() => {
    const map = new Map<string, string>();

    tickets.forEach((ticket) => {
      const id = ticket.condominium?.id || ticket.condominium?.name;
      const name = ticket.condominium?.name;

      if (id && name) {
        map.set(id, name);
      }
    });

    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [tickets]);



  /* =========================================================
     FILTROS APLICADOS
     ========================================================= */

  const filteredTickets = useMemo(() => {
    let result = [...tickets];

    if (period !== "ALL") {
      const now = new Date();
      const days = period === "7D" ? 7 : period === "30D" ? 30 : 90;

      const startDate = new Date(now);
      startDate.setDate(now.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      result = result.filter((ticket) => {
        const createdAt = new Date(ticket.createdAt);
        return createdAt >= startDate;
      });
    }

    if (statusFilter !== "ALL") {
      result = result.filter((ticket) => ticket.status === statusFilter);
    }

    if (priorityFilter !== "ALL") {
      result = result.filter((ticket) => ticket.priority === priorityFilter);
    }

    if (scopeFilter !== "ALL") {
      result = result.filter((ticket) => ticket.scope === scopeFilter);
    }

    if (ratingFilter === "RATED") {
      result = result.filter((ticket) => !!ticket.rating);
    }

    if (ratingFilter === "NOT_RATED") {
      result = result.filter((ticket) => !ticket.rating);
    }

    if (ratingFilter === "RESOLVED_NOT_RATED") {
      result = result.filter(
        (ticket) => ticket.status === "RESOLVED" && !ticket.rating
      );
    }

    if (slaFilter === "OVERDUE") {
      result = result.filter((ticket) => isTicketOverdue(ticket));
    }

    if (slaFilter === "ON_TIME") {
      result = result.filter(
        (ticket) =>
          ticket.status !== "RESOLVED" &&
          ticket.status !== "CANCELED" &&
          !isTicketOverdue(ticket)
      );
    }

    if (categoryFilter !== "ALL") {
      result = result.filter((ticket) => ticket.category === categoryFilter);
    }

    if (responsibleFilter !== "ALL") {
      result = result.filter((ticket) => {
        const id = ticket.assignedToUser?.id || ticket.assignedToUser?.name;
        return id === responsibleFilter;
      });
    }

    if (condominiumFilter !== "ALL") {
      result = result.filter((ticket) => {
        const id = ticket.condominium?.id || ticket.condominium?.name;
        return id === condominiumFilter;
      });
    }

    const term = searchTerm.trim().toLowerCase();

    if (term) {
      result = result.filter((ticket) => {
        const searchableText = [
          ticket.title,
          ticket.description,
          ticket.category,
          ticket.condominium?.name,
          getUnitLabel(ticket),
          ticket.resident?.name,
          ticket.createdByUser?.name,
          ticket.assignedToUser?.name,
          ticket.status,
          ticket.priority,
          scopeLabel(ticket.scope),
          getRatingLabel(ticket),
          ticket.rating?.comment,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchableText.includes(term);
      });
    }

    return result.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [
    tickets,
    period,
    statusFilter,
    priorityFilter,
    scopeFilter,
    ratingFilter,
    slaFilter,
    categoryFilter,
    responsibleFilter,
    condominiumFilter,
    searchTerm,
  ]);



  const hasAnyFilter =
    period !== "30D" ||
    statusFilter !== "ALL" ||
    priorityFilter !== "ALL" ||
    scopeFilter !== "ALL" ||
    ratingFilter !== "ALL" ||
    slaFilter !== "ALL" ||
    categoryFilter !== "ALL" ||
    responsibleFilter !== "ALL" ||
    condominiumFilter !== "ALL" ||
    searchTerm.trim() !== "";



  const activeFilterSummary = useMemo(() => {
    const items: string[] = [];

    if (period !== "30D") {
      items.push(`Período: ${periodLabel(period)}`);
    }

    if (statusFilter !== "ALL") {
      items.push(`Status: ${statusLabel(statusFilter)}`);
    }

    if (priorityFilter !== "ALL") {
      items.push(`Prioridade: ${priorityLabel(priorityFilter)}`);
    }

    if (scopeFilter !== "ALL") {
      items.push(`Tipo: ${scopeLabel(scopeFilter)}`);
    }

    if (ratingFilter === "RATED") {
      items.push("Avaliação: Avaliados");
    }

    if (ratingFilter === "NOT_RATED") {
      items.push("Avaliação: Sem avaliação");
    }

    if (ratingFilter === "RESOLVED_NOT_RATED") {
      items.push("Avaliação: Resolvidos sem avaliação");
    }

    if (slaFilter === "OVERDUE") {
      items.push("Prazo: Vencidos");
    }

    if (slaFilter === "ON_TIME") {
      items.push("Prazo: No prazo");
    }

    if (categoryFilter !== "ALL") {
      items.push(`Categoria: ${categoryFilter}`);
    }

    if (responsibleFilter !== "ALL") {
      const responsible = responsibleOptions.find(
        (item) => item.id === responsibleFilter
      );

      items.push(`Responsável: ${responsible?.name || responsibleFilter}`);
    }

    if (condominiumFilter !== "ALL") {
      const condominium = condominiumOptions.find(
        (item) => item.id === condominiumFilter
      );

      items.push(`Condomínio: ${condominium?.name || condominiumFilter}`);
    }

    if (searchTerm.trim()) {
      items.push(`Busca: "${searchTerm.trim()}"`);
    }

    return items;
  }, [
    period,
    statusFilter,
    priorityFilter,
    scopeFilter,
    ratingFilter,
    slaFilter,
    categoryFilter,
    responsibleFilter,
    condominiumFilter,
    searchTerm,
    responsibleOptions,
    condominiumOptions,
  ]);



  /* =========================================================
     RESUMO DO RELATÓRIO
     ========================================================= */

  const summary = useMemo(() => {
    const total = filteredTickets.length;

    const open = filteredTickets.filter((ticket) => ticket.status === "OPEN")
      .length;

    const inProgress = filteredTickets.filter(
      (ticket) => ticket.status === "IN_PROGRESS"
    ).length;

    const resolved = filteredTickets.filter(
      (ticket) => ticket.status === "RESOLVED"
    ).length;

    const unassigned = filteredTickets.filter(
      (ticket) =>
        ticket.status !== "RESOLVED" &&
        ticket.status !== "CANCELED" &&
        !ticket.assignedToUser
    ).length;

    const overdue = filteredTickets.filter((ticket) =>
      isTicketOverdue(ticket)
    ).length;

    const rated = filteredTickets.filter((ticket) => !!ticket.rating).length;

    const resolvedWithoutRating = filteredTickets.filter(
      (ticket) => ticket.status === "RESOLVED" && !ticket.rating
    ).length;

    const ratingSum = filteredTickets.reduce((sum, ticket) => {
      return sum + (ticket.rating?.rating || 0);
    }, 0);

    const avgRating = rated > 0 ? ratingSum / rated : null;

    const avgResolutionValues = filteredTickets
      .map((ticket) => getHoursBetween(ticket.createdAt, ticket.resolvedAt))
      .filter((value): value is number => value !== null);

    const avgResolution =
      avgResolutionValues.length > 0
        ? avgResolutionValues.reduce((sum, value) => sum + value, 0) /
          avgResolutionValues.length
        : null;

    const ratingRate =
      resolved > 0 ? Math.round((rated / resolved) * 100) : null;

    return {
      total,
      open,
      inProgress,
      resolved,
      unassigned,
      overdue,
      rated,
      resolvedWithoutRating,
      avgRating,
      avgResolution,
      ratingRate,
    };
  }, [filteredTickets]);



  const reportExecutiveSummary =
    summary.total === 0
      ? "Nenhum chamado encontrado para os filtros aplicados."
      : `O relatório atual contém ${summary.total} chamado(s), com ${summary.open} aberto(s), ${summary.inProgress} em andamento, ${summary.resolved} resolvido(s), ${summary.overdue} vencido(s) e ${summary.unassigned} ativo(s) sem responsável.`;



  const reportRecommendedAction =
    summary.overdue > 0
      ? "Priorize a análise dos chamados vencidos antes da exportação ou reunião operacional."
      : summary.unassigned > 0
        ? "Revise os chamados ativos sem responsável para evitar perda de acompanhamento."
        : summary.resolvedWithoutRating > 0
          ? "Avalie ações para incentivar avaliação dos chamados resolvidos."
          : summary.total === 0
            ? "Ajuste ou limpe os filtros para gerar um relatório com dados."
            : "Relatório sem alerta crítico evidente. Exporte os dados ou aprofunde a análise por filtros específicos.";



  /* =========================================================
     EXPORTAÇÃO CSV
     ========================================================= */

  function exportCsv() {
    const headers = [
      "ID",
      "Título",
      "Status",
      "Prioridade",
      "Tipo",
      "Categoria",
      "Condomínio",
      "Unidade / Área comum",
      "Morador",
      "Criado por",
      "Responsável",
      "Criado em",
      "Primeira resposta",
      "Resolvido em",
      "Prazo",
      "Avaliação",
      "Comentário da avaliação",
      "Tempo até primeira resposta",
      "Tempo até resolução",
      "Descrição",
    ];

    const rows = filteredTickets.map((ticket) => {
      const firstResponseHours = getHoursBetween(
        ticket.createdAt,
        ticket.firstResponseAt
      );

      const resolutionHours = getHoursBetween(
        ticket.createdAt,
        ticket.resolvedAt
      );

      return [
        ticket.id,
        ticket.title,
        statusLabel(ticket.status),
        priorityLabel(ticket.priority),
        scopeLabel(ticket.scope),
        ticket.category || "-",
        ticket.condominium?.name || "-",
        getUnitLabel(ticket),
        ticket.resident?.name || "-",
        ticket.createdByUser?.name || "-",
        ticket.assignedToUser?.name || "Não atribuído",
        formatDateTime(ticket.createdAt),
        formatDateTime(ticket.firstResponseAt),
        formatDateTime(ticket.resolvedAt),
        getSlaLabel(ticket),
        getRatingLabel(ticket),
        ticket.rating?.comment || "-",
        formatDurationHours(firstResponseHours),
        formatDurationHours(resolutionHours),
        ticket.description || "-",
      ];
    });

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
    link.download = `relatorio-chamados-${getCurrentDateForFilename()}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }



  /* =========================================================
     ESTADOS
     ========================================================= */

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando relatório de chamados..."
        description="Aguarde enquanto identificamos seu perfil de acesso e carregamos os relatórios administrativos."
      />
    );
  }



  /* =========================================================
     RENDER
     ========================================================= */

  return (
    <AdminContextGuard
      fallbackTitle="Relatórios administrativos indisponíveis neste perfil de acesso"
      fallbackDescription="Os relatórios administrativos de chamados são exclusivos para administradora ou super admin. Para acompanhar chamados como síndico, morador ou proprietário, acesse o portal."
    >
      <AdminShell
        current="relatorios"
        title="Relatórios de Chamados"
        description="Consulte, filtre, analise e exporte os chamados registrados."
      >
        <div className="space-y-6">
          {/* =====================================================
              TOPO
              ===================================================== */}

          <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#256D3C]">
                Relatórios
              </p>

              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17211B] md:text-4xl">
                Relatórios de Chamados
              </h1>

              <p className="mt-2 max-w-4xl text-sm leading-6 text-[#5E6B63]">
                Consulte, filtre, analise e exporte os chamados registrados na carteira administrativa.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/admin/chamados"
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#17211B] shadow-sm transition hover:border-[#256D3C] hover:text-[#256D3C]"
              >
                Ir para fila
              </Link>

              <button
                type="button"
                onClick={exportCsv}
                disabled={filteredTickets.length === 0}
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
              >
                Exportar CSV
              </button>
            </div>
          </header>

          <section className="rounded-[32px] border border-[#DDE5DF] bg-white shadow-sm">
            <div className="border-b border-[#DDE5DF] bg-[linear-gradient(135deg,#FFFFFF_0%,#F8FAF9_62%,#EAF7EE_135%)] p-6">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-[#17211B] md:text-3xl">
                    Visão do Relatório
                  </h2>

                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5E6B63]">
                    Os indicadores abaixo consideram exatamente os filtros aplicados no relatório.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:min-w-[620px] xl:grid-cols-4">
                  <ReportMetricBox title="Total" value={summary.total} description="Chamados filtrados." highlighted />
                  <ReportMetricBox title="Abertos" value={summary.open} description="Aguardando início." />
                  <ReportMetricBox title="Em andamento" value={summary.inProgress} description="Em atendimento." />
                  <ReportMetricBox title="Resolvidos" value={summary.resolved} description="Finalizados." highlighted />
                </div>
              </div>
            </div>

            <div className="grid gap-0 divide-y divide-[#DDE5DF] md:grid-cols-3 md:divide-x md:divide-y-0">
              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Prazo vencido
                </p>
                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  {summary.overdue > 0 ? `${summary.overdue} chamado(s) exigem priorização.` : "Nenhum chamado ativo fora do prazo esperado."}
                </p>
              </div>

              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Sem responsável
                </p>
                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  {summary.unassigned > 0 ? `${summary.unassigned} chamado(s) ativos ainda sem responsável.` : "Todos os chamados ativos possuem responsável ou estão sem pendência de atribuição."}
                </p>
              </div>

              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Exportação
                </p>
                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  CSV disponível com os dados filtrados e ordenados do mais recente para o mais antigo.
                </p>
              </div>
            </div>
          </section>



          {/* =====================================================
              ERRO
              ===================================================== */}

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}



          {/* =====================================================
              RESUMO EXECUTIVO
              ===================================================== */}

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm xl:col-span-2">
              <h2 className="text-xl font-semibold text-[#17211B]">
                Resumo Executivo do Relatório
              </h2>

              <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                {reportExecutiveSummary}
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
                {reportRecommendedAction}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {summary.overdue > 0 && (
                  <span className="rounded-full border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                    Prazo vencido
                  </span>
                )}

                {summary.unassigned > 0 && (
                  <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-1 text-xs font-semibold text-purple-700">
                    Sem responsável
                  </span>
                )}

                {summary.resolvedWithoutRating > 0 && (
                  <span className="rounded-full border border-yellow-200 bg-yellow-50 px-2 py-1 text-xs font-semibold text-yellow-700">
                    Sem avaliação
                  </span>
                )}

                {summary.total > 0 &&
                  summary.overdue === 0 &&
                  summary.unassigned === 0 &&
                  summary.resolvedWithoutRating === 0 && (
                    <span className="rounded-full border border-[#CFE6D4] bg-white px-2 py-1 text-xs font-semibold text-[#256D3C]">
                      Sem alerta crítico
                    </span>
                  )}
              </div>
            </div>
          </section>



          {/* =====================================================
              RESUMO COMPLEMENTAR
              ===================================================== */}

          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <InfoSummaryCard
              title="Ativos sem responsável"
              value={summary.unassigned}
              description="Considera apenas chamados abertos ou em andamento."
              tone="red"
            />

            <InfoSummaryCard
              title="Média de resolução"
              value={formatDurationHours(summary.avgResolution)}
              description="Baseada em chamados com data de resolução."
            />

            <InfoSummaryCard
              title="Taxa de avaliação"
              value={summary.ratingRate !== null ? `${summary.ratingRate}%` : "-"}
              description="Percentual de chamados resolvidos que receberam avaliação."
              tone="green"
            />
          </section>



          {/* =====================================================
              FILTROS DO RELATÓRIO
              ===================================================== */}

          <ResponsiveSection
            title="Filtros do Relatório"
            description="Refine os dados antes de consultar a tabela ou exportar o CSV."
            defaultOpenMobile
          >
            <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-sm">
              <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-[#17211B]">
                    Filtros do Relatório
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
                    Limpar filtros
                  </button>

                  <button
                    onClick={exportCsv}
                    disabled={filteredTickets.length === 0}
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
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="form-input"
                    placeholder="Título, morador, unidade, condomínio..."
                  />
                </FormField>

                <FormField label="Período">
                  <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value as PeriodFilter)}
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
                    onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    className="form-input"
                  >
                    <option value="ALL">Todos</option>
                    <option value="OPEN">Aberto</option>
                    <option value="IN_PROGRESS">Em andamento</option>
                    <option value="RESOLVED">Resolvido</option>
                    <option value="CANCELED">Cancelado</option>
                  </select>
                </FormField>

                <FormField label="Prioridade">
                  <select
                    value={priorityFilter}
                    onChange={(e) =>
                      setPriorityFilter(e.target.value as PriorityFilter)
                    }
                    className="form-input"
                  >
                    <option value="ALL">Todas</option>
                    <option value="LOW">Baixa</option>
                    <option value="MEDIUM">Média</option>
                    <option value="HIGH">Alta</option>
                    <option value="URGENT">Urgente</option>
                  </select>
                </FormField>

                <FormField label="Tipo de chamado">
                  <select
                    value={scopeFilter}
                    onChange={(e) => setScopeFilter(e.target.value as ScopeFilter)}
                    className="form-input"
                  >
                    <option value="ALL">Todos</option>
                    <option value="UNIT">Unidade</option>
                    <option value="CONDOMINIUM">Condomínio / Área comum</option>
                  </select>
                </FormField>

                <FormField label="Avaliação">
                  <select
                    value={ratingFilter}
                    onChange={(e) => setRatingFilter(e.target.value as RatingFilter)}
                    className="form-input"
                  >
                    <option value="ALL">Todos</option>
                    <option value="RATED">Avaliados</option>
                    <option value="NOT_RATED">Sem avaliação</option>
                    <option value="RESOLVED_NOT_RATED">
                      Resolvidos sem avaliação
                    </option>
                  </select>
                </FormField>

                <FormField label="Prazo">
                  <select
                    value={slaFilter}
                    onChange={(e) => setSlaFilter(e.target.value as SlaFilter)}
                    className="form-input"
                  >
                    <option value="ALL">Todos</option>
                    <option value="OVERDUE">Vencidos</option>
                    <option value="ON_TIME">No prazo</option>
                  </select>
                </FormField>

                <FormField label="Condomínio">
                  <select
                    value={condominiumFilter}
                    onChange={(e) => setCondominiumFilter(e.target.value)}
                    className="form-input"
                  >
                    <option value="ALL">Todos</option>

                    {condominiumOptions.map((condominium) => (
                      <option key={condominium.id} value={condominium.id}>
                        {condominium.name}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Categoria">
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
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

                <FormField label="Responsável">
                  <select
                    value={responsibleFilter}
                    onChange={(e) => setResponsibleFilter(e.target.value)}
                    className="form-input"
                  >
                    <option value="ALL">Todos</option>

                    {responsibleOptions.map((responsible) => (
                      <option key={responsible.id} value={responsible.id}>
                        {responsible.name}
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
                      {filteredTickets.length}
                    </strong>{" "}
                    chamado(s) de{" "}
                    <strong className="text-[#17211B]">
                      {tickets.length}
                    </strong>{" "}
                    carregado(s).
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



          {/* =====================================================
              TABELA DO RELATÓRIO
              ===================================================== */}

          <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-[#17211B]">
                  Resultado do Relatório
                </h2>

                <p className="mt-1 text-sm text-[#5E6B63]">
                  Lista dos chamados conforme filtros aplicados.
                </p>
              </div>

              <button
                onClick={exportCsv}
                disabled={filteredTickets.length === 0}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
              >
                Exportar CSV
              </button>
            </div>

            {filteredTickets.length === 0 ? (
              <div className="rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-6 text-sm leading-6 text-[#5E6B63]">
                Nenhum chamado encontrado para os filtros aplicados. Ajuste os
                filtros ou clique em “Limpar filtros” para ampliar o resultado.
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-[#DDE5DF]">
                <table className="w-full table-fixed text-sm">
                  <thead>
                    <tr className="border-b border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]">
                      <th className="hidden w-[128px] px-3 py-3 text-left font-semibold lg:table-cell">
                        Criado em
                      </th>

                      <th className="px-3 py-3 text-left font-semibold">
                        Chamado
                      </th>

                      <th className="hidden w-[120px] px-3 py-3 text-left font-semibold md:table-cell">
                        Status
                      </th>

                      <th className="hidden w-[110px] px-3 py-3 text-left font-semibold lg:table-cell">
                        Prazo
                      </th>

                      <th className="hidden w-[120px] px-3 py-3 text-left font-semibold md:table-cell">
                        Prioridade
                      </th>

                      <th className="hidden w-[160px] px-3 py-3 text-left font-semibold xl:table-cell">
                        Responsável
                      </th>

                      <th className="hidden w-[110px] px-3 py-3 text-left font-semibold lg:table-cell">
                        Avaliação
                      </th>

                      <th className="w-[120px] px-3 py-3 text-right font-semibold">
                        Ações
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredTickets.map((ticket) => {
                      const overdue = isTicketOverdue(ticket);
                      const isExpanded = expandedTicketId === ticket.id;

                      return (
                        <Fragment key={ticket.id}>
                          <tr className="border-b border-[#EEF2EF] align-top transition hover:bg-[#F9FBFA]">
                            <td className="hidden px-3 py-4 text-[#5E6B63] lg:table-cell">
                              {formatDateTime(ticket.createdAt)}
                            </td>

                            <td className="px-3 py-4">
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-[#17211B]">
                                  {formatDisplayTitle(ticket.title)}
                                </p>

                                <p className="mt-1 truncate text-xs text-[#7A877F]">
                                  {ticket.condominium?.name || "-"} • {getUnitLabel(ticket)}
                                </p>

                                <div className="mt-2 flex flex-wrap gap-1 md:hidden">
                                  <span
                                    className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${statusBadgeClass(
                                      ticket.status
                                    )}`}
                                  >
                                    {statusLabel(ticket.status)}
                                  </span>

                                  <span
                                    className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${priorityBadgeClass(
                                      ticket.priority
                                    )}`}
                                  >
                                    {priorityLabel(ticket.priority)}
                                  </span>
                                </div>
                              </div>
                            </td>

                            <td className="hidden px-3 py-4 md:table-cell">
                              <span
                                className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${statusBadgeClass(
                                  ticket.status
                                )}`}
                              >
                                {statusLabel(ticket.status)}
                              </span>
                            </td>

                            <td className="hidden px-3 py-4 lg:table-cell">
                              {ticket.status === "RESOLVED" ||
                              ticket.status === "CANCELED" ? (
                                <span className="text-[#7A877F]">Encerrado</span>
                              ) : overdue ? (
                                <span className="font-semibold text-red-700">
                                  Vencido
                                </span>
                              ) : (
                                <span className="font-semibold text-[#256D3C]">
                                  No prazo
                                </span>
                              )}
                            </td>

                            <td className="hidden px-3 py-4 md:table-cell">
                              <span
                                className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${priorityBadgeClass(
                                  ticket.priority
                                )}`}
                              >
                                {priorityLabel(ticket.priority)}
                              </span>
                            </td>

                            <td className="hidden px-3 py-4 text-[#5E6B63] xl:table-cell">
                              <span className="line-clamp-2">
                                {ticket.assignedToUser?.name || "Não atribuído"}
                              </span>
                            </td>

                            <td className="hidden px-3 py-4 lg:table-cell">
                              {ticket.rating ? (
                                <div>
                                  <p className="font-semibold text-[#17211B]">
                                    {ticket.rating.rating}/5
                                  </p>

                                  <p className="text-xs text-[#7A877F]">
                                    {renderStars(ticket.rating.rating)}
                                  </p>
                                </div>
                              ) : (
                                <span className="text-[#7A877F]">-</span>
                              )}
                            </td>

                            <td className="px-3 py-4 text-right">
                              <div className="flex flex-col items-end gap-2">
                                <Link
                                  href={`/admin/chamados/${ticket.id}`}
                                  className="inline-flex h-9 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-3 text-xs font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
                                >
                                  Abrir
                                </Link>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedTicketId(isExpanded ? null : ticket.id)
                                  }
                                  className="inline-flex h-9 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-3 text-xs font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
                                >
                                  {isExpanded ? "Ocultar" : "Detalhes"}
                                </button>
                              </div>
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr className="border-b border-[#EEF2EF] bg-[#F9FBFA] last:border-b-0">
                              <td colSpan={8} className="px-3 py-4">
                                <div className="rounded-[24px] border border-[#DDE5DF] bg-white p-4 shadow-sm">
                                  <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                                    <div>
                                      <h3 className="text-base font-semibold text-[#17211B]">
                                        Detalhes do Chamado
                                      </h3>

                                      <p className="text-sm text-[#5E6B63]">
                                        Informações complementares do registro selecionado.
                                      </p>
                                    </div>

                                    <Link
                                      href={`/admin/chamados/${ticket.id}`}
                                      className="inline-flex h-10 items-center justify-center rounded-2xl bg-[#256D3C] px-4 text-sm font-semibold text-white transition hover:bg-[#1F5A32]"
                                    >
                                      Abrir chamado
                                    </Link>
                                  </div>

                                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                    <ReportDetailBox
                                      label="Status"
                                      value={statusLabel(ticket.status)}
                                    />

                                    <ReportDetailBox
                                      label="Prazo"
                                      value={getSlaLabel(ticket)}
                                    />

                                    <ReportDetailBox
                                      label="Prioridade"
                                      value={priorityLabel(ticket.priority)}
                                    />

                                    <ReportDetailBox
                                      label="Tipo"
                                      value={scopeLabel(ticket.scope)}
                                    />

                                    <ReportDetailBox
                                      label="Categoria"
                                      value={ticket.category || "-"}
                                    />

                                    <ReportDetailBox
                                      label="Condomínio"
                                      value={ticket.condominium?.name || "-"}
                                    />

                                    <ReportDetailBox
                                      label="Unidade / Área"
                                      value={getUnitLabel(ticket)}
                                    />

                                    <ReportDetailBox
                                      label="Morador"
                                      value={ticket.resident?.name || "-"}
                                    />

                                    <ReportDetailBox
                                      label="Criado por"
                                      value={ticket.createdByUser?.name || "-"}
                                    />

                                    <ReportDetailBox
                                      label="Responsável"
                                      value={ticket.assignedToUser?.name || "Não atribuído"}
                                    />

                                    <ReportDetailBox
                                      label="Criado em"
                                      value={formatDateTime(ticket.createdAt)}
                                    />

                                    <ReportDetailBox
                                      label="Primeira resposta"
                                      value={formatDateTime(ticket.firstResponseAt)}
                                    />

                                    <ReportDetailBox
                                      label="Resolvido em"
                                      value={formatDateTime(ticket.resolvedAt)}
                                    />

                                    <ReportDetailBox
                                      label="Tempo até primeira resposta"
                                      value={formatDurationHours(
                                        getHoursBetween(ticket.createdAt, ticket.firstResponseAt)
                                      )}
                                    />

                                    <ReportDetailBox
                                      label="Tempo até resolução"
                                      value={formatDurationHours(
                                        getHoursBetween(ticket.createdAt, ticket.resolvedAt)
                                      )}
                                    />

                                    <ReportDetailBox
                                      label="Avaliação"
                                      value={getRatingLabel(ticket)}
                                    />
                                  </div>

                                  {ticket.rating?.comment && (
                                    <div className="mt-3 rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-3">
                                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
                                        Comentário da avaliação
                                      </p>

                                      <p className="mt-1 whitespace-pre-line text-sm leading-6 text-[#5E6B63]">
                                        {ticket.rating.comment}
                                      </p>
                                    </div>
                                  )}

                                  <div className="mt-3 rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-3">
                                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
                                      Descrição
                                    </p>

                                    <p className="mt-1 whitespace-pre-line text-sm leading-6 text-[#5E6B63]">
                                      {ticket.description || "-"}
                                    </p>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
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



/* =========================================================
   CARD PRINCIPAL DA VISÃO DO RELATÓRIO
   ========================================================= */

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
          "mt-2 block text-3xl font-semibold",
          highlighted ? "text-[#256D3C]" : "text-[#17211B]",
        ].join(" ")}
      >
        {value}
      </strong>

      {description && <p className="mt-1 text-xs text-[#5E6B63]">{description}</p>}
    </div>
  );
}



/* =========================================================
   CARD DE RESUMO COMPLEMENTAR
   ========================================================= */

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

      <strong className={`mt-1 block text-3xl font-semibold ${valueClass}`}>
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




/* =========================================================
   BOX DE DETALHE DO RELATÓRIO
   ========================================================= */

function ReportDetailBox({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-[#DDE5DF] bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
        {label}
      </p>

      <p className="mt-1 break-words text-sm font-semibold text-[#17211B]">
        {value}
      </p>
    </div>
  );
}



/* =========================================================
   CAMPO DE FORMULÁRIO
   ========================================================= */

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-sm font-semibold text-[#17211B]">
        {label}
      </label>

      <div className="mt-1">
        {children}
      </div>
    </div>
  );
}