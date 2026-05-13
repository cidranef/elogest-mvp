"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AdminContextGuard from "@/components/AdminContextGuard";
import AdminShell from "@/components/AdminShell";
import ResponsiveSection from "@/components/ui/ResponsiveSection";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";



/* =========================================================
   DASHBOARD ADMINISTRATIVO DE CHAMADOS - ELOGEST

   ETAPA 28.5:
   - Adicionado ActiveAccessBadge no topo.
   - Usuário passa a visualizar o perfil de acesso ativo também no
     dashboard específico de chamados.
   - Botão Trocar perfil fica disponível em /admin/chamados/dashboard.

   ETAPA 30.1:
   - Adicionado AdminContextGuard.
   - Perfis de portal não visualizam mais o dashboard
     administrativo de chamados.
   - SÍNDICO / MORADOR / PROPRIETÁRIO são direcionados ao portal
     ou à troca de perfil.

   ETAPA 36.3:
   - Refinamento gerencial do dashboard específico de chamados.
   - Prazo passa a usar regra proporcional por prioridade.
   - Chamados sem responsável consideram apenas chamados ativos.
   - Chamados críticos passam a incluir Prazo vencido, próximo do prazo,
     urgentes e ativos sem responsável.
   - KPIs de risco foram melhorados.
   - Distribuições e filtros foram preservados.
   - Links de ação rápida foram adicionados nos principais indicadores.

   ETAPA 38.5.2 — USABILIDADE DO DASHBOARD ADMINISTRATIVO

   Objetivo:
   - melhorar a leitura gerencial;
   - reforçar indicadores críticos;
   - melhorar textos e hierarquia dos KPIs;
   - organizar filtros de análise;
   - destacar riscos operacionais;
   - preservar toda a lógica funcional já aprovada.

   ETAPA 38.8 — POLIMENTO FINAL DE USABILIDADE DOS CHAMADOS

   - Dashboard alinhado ao padrão da fila administrativa e detalhe.
   - Adicionado bloco "Ação recomendada do dashboard".
   - Filtros ativos passam a aparecer em chips.
   - Risco principal direciona para a fila já filtrada.
   - Chamados críticos passam a exibir ação recomendada.
   - Textos foram ajustados para leitura mais operacional.
   - Mantida toda a lógica funcional já aprovada.

   ETAPA 39.10 — NOVO VISUAL COM ADMINSHELL

   Atualização:
   - Página passa a usar AdminShell.
   - Removidos AdminTopActions e ActiveAccessBadge da própria página.
   - Topbar, sidebar, sino, logout e footer ficam no shell.
   - Layout migrado do tema escuro antigo para o padrão claro EloGest.
   - Cards, filtros, KPIs, gráficos e blocos críticos recebem visual novo.
   - Seções longas passam a usar ResponsiveSection para melhor mobile.
   - Mantida toda a lógica funcional já existente.

   ETAPA 39.17.12 — PADRONIZAÇÃO DO LOADING ADMIN

   Atualização:
   - Loading inicial passa a usar EloGestLoadingScreen.
   - Evita montar AdminShell durante carregamento inicial.
   - Mantém AdminShell apenas após os dados principais carregarem.
   - Mantidas métricas, filtros, gráficos, tabela e ações existentes.
   ========================================================= */



/* =========================================================
   INTERFACES
   ========================================================= */

interface TicketLog {
  id: string;
  ticketId?: string;
  action: string;
  fromValue?: string | null;
  toValue?: string | null;
  comment?: string | null;
  createdAt: string;
  user?: {
    name?: string;
  };
}



interface Ticket {
  id: string;
  title: string;
  description: string;
  status: string;
  category?: string | null;
  priority?: string | null;
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
  };

  resident?: {
    name: string;
  };

  createdByUser?: {
    name: string;
  };

  assignedToUser?: {
    id?: string;
    name: string;
  };

  logs?: TicketLog[];
}



type PeriodFilter = "7D" | "30D" | "90D" | "ALL";
type PriorityFilter = "ALL" | "LOW" | "MEDIUM" | "HIGH" | "URGENT";



const ACTIVE_TICKET_STATUSES = ["OPEN", "IN_PROGRESS"];



/* =========================================================
   HELPERS GERAIS
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
  const classes: Record<string, string> = {
    OPEN: "border-blue-200 bg-blue-50 text-blue-700",
    IN_PROGRESS: "border-yellow-200 bg-yellow-50 text-yellow-700",
    RESOLVED: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
    CANCELED: "border-red-200 bg-red-50 text-red-700",
  };

  return classes[status || ""] || "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]";
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



function priorityBadgeClass(priority?: string | null) {
  const classes: Record<string, string> = {
    LOW: "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]",
    MEDIUM: "border-blue-200 bg-blue-50 text-blue-700",
    HIGH: "border-orange-200 bg-orange-50 text-orange-700",
    URGENT: "border-red-200 bg-red-50 text-red-700",
  };

  return classes[priority || ""] || "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]";
}



function isActiveTicket(ticket: Ticket) {
  return ACTIVE_TICKET_STATUSES.includes(ticket.status);
}



function getSlaLimitHours(priority?: string | null) {
  if (priority === "URGENT") return 4;
  if (priority === "HIGH") return 24;
  if (priority === "MEDIUM") return 48;
  return 72;
}



function getSlaInfo(ticket: Ticket) {
  const limitHours = getSlaLimitHours(ticket.priority);

  if (ticket.status === "RESOLVED" || ticket.status === "CANCELED") {
    return {
      limitHours,
      elapsedHours: 0,
      remainingHours: limitHours,
      consumedPercent: 0,
      status: "DONE" as const,
      isOverdue: false,
      isWarning: false,
    };
  }

  const createdAt = new Date(ticket.createdAt).getTime();

  const elapsedHours = Math.max(
    0,
    Math.floor((Date.now() - createdAt) / (1000 * 60 * 60))
  );

  const remainingHours = limitHours - elapsedHours;

  const consumedPercent =
    limitHours > 0
      ? Math.min(100, Math.round((elapsedHours / limitHours) * 100))
      : 100;

  const isOverdue = remainingHours <= 0;

  const warningThreshold = Math.max(2, Math.ceil(limitHours * 0.25));

  const isWarning = !isOverdue && remainingHours <= warningThreshold;

  return {
    limitHours,
    elapsedHours,
    remainingHours,
    consumedPercent,
    status: isOverdue ? ("OVERDUE" as const) : isWarning ? ("WARNING" as const) : ("OK" as const),
    isOverdue,
    isWarning,
  };
}



function getSlaStatus(ticket: Ticket) {
  return getSlaInfo(ticket).status;
}



function formatHours(hours: number) {
  if (!Number.isFinite(hours) || hours <= 0) return "-";

  if (hours < 1) {
    return `${Math.round(hours * 60)} min`;
  }

  if (hours < 24) {
    return `${hours.toFixed(1)} h`;
  }

  return `${(hours / 24).toFixed(1)} dias`;
}



function getHoursBetween(start?: string | null, end?: string | null) {
  if (!start || !end) return null;

  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();

  if (!startTime || !endTime || endTime < startTime) return null;

  return (endTime - startTime) / (1000 * 60 * 60);
}



function getPercent(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}



function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}



function formatDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
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
      if (index > 0 && smallWords.has(word)) return word;
      return word.charAt(0).toLocaleUpperCase("pt-BR") + word.slice(1);
    })
    .join(" ");
}



function startOfDay(date: Date) {
  const newDate = new Date(date);
  newDate.setHours(0, 0, 0, 0);
  return newDate;
}



function buildTicketFilterHref(params: {
  status?: string;
  priority?: string;
  assigned?: "none";
  sla?: "overdue" | "warning";
}) {
  const query = new URLSearchParams();

  if (params.status) {
    query.set("status", params.status);
  }

  if (params.priority) {
    query.set("priority", params.priority);
  }

  if (params.assigned === "none") {
    query.set("assigned", "none");
  }

  if (params.sla) {
    query.set("sla", params.sla);
  }

  const queryString = query.toString();

  return queryString ? `/admin/chamados?${queryString}` : "/admin/chamados";
}



function getTicketLocationLabel(ticket: Ticket) {
  if (ticket.unit) {
    return `Unidade ${
      ticket.unit.block ? ticket.unit.block + " - " : ""
    }${ticket.unit.unitNumber}`;
  }

  return "Condomínio / Área comum";
}



function getRecommendedAction(ticket: Ticket) {
  const sla = getSlaInfo(ticket);

  if (!isActiveTicket(ticket)) {
    if (ticket.status === "RESOLVED") {
      return "Chamado finalizado. Acompanhe apenas se houver avaliação ruim ou pedido de reabertura.";
    }

    if (ticket.status === "CANCELED") {
      return "Chamado cancelado. Nenhuma ação operacional pendente.";
    }

    return "Nenhuma ação operacional pendente.";
  }

  if (!ticket.assignedToUser) {
    return "Definir responsável para iniciar a triagem.";
  }

  if (sla.status === "OVERDUE") {
    return "Priorizar atendimento e registrar atualização pública.";
  }

  if (sla.status === "WARNING") {
    return "Acompanhar de perto para evitar vencimento do prazo.";
  }

  if (ticket.priority === "URGENT") {
    return "Tratar como prioridade operacional até a resolução.";
  }

  if (ticket.status === "OPEN") {
    return "Iniciar atendimento ou validar encaminhamento.";
  }

  if (ticket.status === "IN_PROGRESS") {
    return "Manter acompanhamento e registrar avanço no chamado.";
  }

  return "Acompanhar conforme a movimentação.";
}



/* =========================================================
   COMPONENTE AUXILIAR - CARD DE KPI
   ========================================================= */

function MetricCard({
  title,
  value,
  detail,
  href,
  tone = "default",
}: {
  title: string;
  value: number | string;
  detail?: string;
  href?: string;
  tone?: "default" | "blue" | "green" | "yellow" | "red" | "orange" | "purple";
}) {
  const valueClass =
    tone === "green"
      ? "text-[#256D3C]"
      : tone === "red" || tone === "orange"
        ? "text-[#17211B]"
        : tone === "blue" || tone === "purple" || tone === "yellow"
          ? "text-[#17211B]"
          : "text-[#17211B]";

  const content = (
    <div className="h-full rounded-[24px] border border-[#DDE5DF] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#CFE6D4] hover:shadow-[0_18px_50px_rgba(23,33,27,0.08)]">
      <p className="text-sm text-[#5E6B63]">{title}</p>

      <strong className={`mt-1 block text-4xl font-semibold tracking-tight ${valueClass}`}>
        {value}
      </strong>

      {detail && (
        <p className="mt-2 text-xs leading-relaxed text-[#7A877F]">
          {detail}
        </p>
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}



/* =========================================================
   COMPONENTE AUXILIAR - RANKING COM BARRA HORIZONTAL
   ========================================================= */

function DistributionBar({
  label,
  value,
  total,
  detail,
}: {
  label: string;
  value: number;
  total: number;
  detail?: string;
}) {
  const percent = getPercent(value, total);

  return (
    <div className="rounded-2xl border border-[#DDE5DF] bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-semibold text-[#17211B]">{label}</p>

          {detail && (
            <p className="mt-1 text-xs leading-relaxed text-[#7A877F]">
              {detail}
            </p>
          )}
        </div>

        <div className="shrink-0 text-right">
          <strong className="text-[#17211B]">{value}</strong>

          <p className="text-xs text-[#7A877F]">{percent}%</p>
        </div>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-[#EEF2EF]">
        <div
          className="h-full rounded-full bg-[#256D3C]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}



/* =========================================================
   COMPONENTE AUXILIAR - GRÁFICO DE ROSCA PREMIUM
   ========================================================= */

function DonutChart({
  items,
  total,
  centerLabel,
}: {
  items: { label: string; value: number }[];
  total: number;
  centerLabel: string;
}) {
  const size = 220;
  const strokeWidth = 26;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const palette = [
    "#256D3C",
    "#8ED08E",
    "#BFD8C7",
    "#DDE5DF",
    "#A9B8AF",
  ];

  let accumulated = 0;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr] lg:items-center">
      <div className="relative mx-auto h-[220px] w-[220px]">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="block"
          aria-hidden="true"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#EEF2EF"
            strokeWidth={strokeWidth}
          />

          {total > 0 &&
            items.map((item, index) => {
              const fraction = item.value / total;
              const dash = fraction * circumference;
              const gap = circumference - dash;
              const dashOffset = -accumulated * circumference;

              accumulated += fraction;

              return (
                <circle
                  key={`${item.label}-${index}`}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={palette[index % palette.length]}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${dash} ${gap}`}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
              );
            })}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <strong className="text-4xl font-semibold tracking-tight text-[#17211B]">
            {total}
          </strong>

          <span className="mt-1 max-w-[120px] text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
            {centerLabel}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {items.map((item, index) => {
          const percent = getPercent(item.value, total);

          return (
            <div
              key={`${item.label}-${index}`}
              className="flex items-center justify-between gap-4 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: palette[index % palette.length] }}
                />

                <span className="truncate text-sm font-semibold text-[#17211B]">
                  {item.label}
                </span>
              </div>

              <div className="shrink-0 text-right">
                <strong className="text-sm text-[#17211B]">{item.value}</strong>
                <span className="ml-2 text-xs text-[#7A877F]">{percent}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}



/* =========================================================
   COMPONENTE AUXILIAR - EVOLUÇÃO TEMPORAL EM LINHA
   ========================================================= */

function TimelineChart({
  data,
}: {
  data: {
    key: string;
    label: string;
    created: number;
    resolved: number;
    total: number;
  }[];
}) {
  const width = 1000;
  const height = 260;
  const paddingLeft = 30;
  const paddingRight = 18;
  const paddingTop = 24;
  const paddingBottom = 46;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  const bottomY = paddingTop + chartHeight;

  const maxValue = Math.max(
    1,
    ...data.map((item) => Math.max(item.created, item.resolved))
  );

  const getX = (index: number) => {
    if (data.length <= 1) return paddingLeft + chartWidth / 2;
    return paddingLeft + (index / (data.length - 1)) * chartWidth;
  };

  const getY = (value: number) =>
    paddingTop + chartHeight - (value / maxValue) * chartHeight;

  const createdSeries = data.map((item, index) => ({
    x: getX(index),
    y: getY(item.created),
    value: item.created,
  }));

  const resolvedSeries = data.map((item, index) => ({
    x: getX(index),
    y: getY(item.resolved),
    value: item.resolved,
  }));

  function buildSoftPath(points: { x: number; y: number }[]) {
    if (!points.length) return "";
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

    let path = `M ${points[0].x} ${points[0].y}`;

    for (let index = 0; index < points.length - 1; index += 1) {
      const current = points[index];
      const next = points[index + 1];
      const controlDistance = (next.x - current.x) * 0.42;

      path += ` C ${current.x + controlDistance} ${current.y}, ${
        next.x - controlDistance
      } ${next.y}, ${next.x} ${next.y}`;
    }

    return path;
  }

  function buildSoftAreaPath(points: { x: number; y: number }[]) {
    if (!points.length) return "";

    const first = points[0];
    const last = points[points.length - 1];

    return `${buildSoftPath(points)} L ${last.x} ${bottomY} L ${first.x} ${bottomY} Z`;
  }

  const createdPath = buildSoftPath(createdSeries);
  const resolvedPath = buildSoftPath(resolvedSeries);
  const createdAreaPath = buildSoftAreaPath(createdSeries);
  const resolvedAreaPath = buildSoftAreaPath(resolvedSeries);

  const visibleLabelStep = data.length > 45 ? 7 : data.length > 18 ? 4 : 2;

  return (
    <div className="w-full overflow-hidden rounded-[24px] border border-[#DDE5DF] bg-white p-4 shadow-sm sm:p-5">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label="Evolução de chamados criados e resolvidos"
      >
        <defs>
          <linearGradient id="createdSoftFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(154,167,160,0.10)" />
            <stop offset="100%" stopColor="rgba(154,167,160,0)" />
          </linearGradient>

          <linearGradient id="resolvedSoftFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(37,109,60,0.12)" />
            <stop offset="100%" stopColor="rgba(37,109,60,0)" />
          </linearGradient>
        </defs>

        {[0.33, 0.66, 1].map((ratio) => {
          const y = paddingTop + chartHeight - chartHeight * ratio;

          return (
            <line
              key={ratio}
              x1={paddingLeft}
              x2={paddingLeft + chartWidth}
              y1={y}
              y2={y}
              stroke="#EEF2EF"
              strokeDasharray="4 10"
            />
          );
        })}

        <line
          x1={paddingLeft}
          x2={paddingLeft + chartWidth}
          y1={bottomY}
          y2={bottomY}
          stroke="#DDE5DF"
        />

        {createdAreaPath && (
          <path d={createdAreaPath} fill="url(#createdSoftFill)" />
        )}

        {resolvedAreaPath && (
          <path d={resolvedAreaPath} fill="url(#resolvedSoftFill)" />
        )}

        {createdPath && (
          <path
            d={createdPath}
            fill="none"
            stroke="#9AA7A0"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {resolvedPath && (
          <path
            d={resolvedPath}
            fill="none"
            stroke="#256D3C"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {data.map((item, index) => {
          const showLabel =
            index === 0 || index === data.length - 1 || index % visibleLabelStep === 0;

          return (
            <g key={item.key}>
              {item.created > 0 && (
                <circle
                  cx={getX(index)}
                  cy={getY(item.created)}
                  r="4.5"
                  fill="#FFFFFF"
                  stroke="#9AA7A0"
                  strokeWidth="2.5"
                />
              )}

              {item.resolved > 0 && (
                <circle
                  cx={getX(index)}
                  cy={getY(item.resolved)}
                  r="4.5"
                  fill="#FFFFFF"
                  stroke="#256D3C"
                  strokeWidth="2.5"
                />
              )}

              {showLabel && (
                <text
                  x={getX(index)}
                  y={height - 16}
                  textAnchor="middle"
                  fontSize="15"
                  fill="#7A877F"
                >
                  {item.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="mt-4 flex flex-wrap items-center gap-5 border-t border-[#EEF2EF] pt-4 text-xs text-[#5E6B63]">
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-7 rounded-full bg-[#9AA7A0]" />
          Chamados criados
        </div>

        <div className="flex items-center gap-2">
          <span className="h-0.5 w-7 rounded-full bg-[#256D3C]" />
          Chamados resolvidos
        </div>
      </div>
    </div>
  );
}


/* =========================================================
   PÁGINA - DASHBOARD DE CHAMADOS
   ========================================================= */

export default function ChamadosDashboardPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [period, setPeriod] = useState<PeriodFilter>("30D");

  const [condominiumFilter, setCondominiumFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [responsibleFilter, setResponsibleFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("ALL");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");



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
     LIMPAR FILTROS AVANÇADOS
     ========================================================= */

  function clearAdvancedFilters() {
    setCondominiumFilter("ALL");
    setCategoryFilter("ALL");
    setResponsibleFilter("ALL");
    setPriorityFilter("ALL");
  }



  /* =========================================================
     INIT
     ========================================================= */

  useEffect(() => {
    loadTickets();
  }, []);



  /* =========================================================
     FILTRO DE PERÍODO
     ========================================================= */

  const periodTickets = useMemo(() => {
    if (period === "ALL") return tickets;

    const now = new Date();
    const days = period === "7D" ? 7 : period === "30D" ? 30 : 90;

    const startDate = new Date(now);
    startDate.setDate(now.getDate() - days + 1);
    startDate.setHours(0, 0, 0, 0);

    return tickets.filter((ticket) => {
      const createdAt = new Date(ticket.createdAt);
      return createdAt >= startDate;
    });
  }, [tickets, period]);



  /* =========================================================
     OPÇÕES DINÂMICAS DOS FILTROS
     ========================================================= */

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



  /* =========================================================
     APLICAÇÃO DOS FILTROS AVANÇADOS
     ========================================================= */

  const filteredTickets = useMemo(() => {
    return periodTickets.filter((ticket) => {
      const ticketCondominiumId =
        ticket.condominium?.id || ticket.condominium?.name || "";
      const ticketResponsibleId =
        ticket.assignedToUser?.id || ticket.assignedToUser?.name || "";

      const matchesCondominium =
        condominiumFilter === "ALL" ||
        ticketCondominiumId === condominiumFilter ||
        ticket.condominium?.name === condominiumFilter;

      const matchesCategory =
        categoryFilter === "ALL" || ticket.category === categoryFilter;

      const matchesResponsible =
        responsibleFilter === "ALL" ||
        ticketResponsibleId === responsibleFilter ||
        ticket.assignedToUser?.name === responsibleFilter;

      const matchesPriority =
        priorityFilter === "ALL" || ticket.priority === priorityFilter;

      return (
        matchesCondominium &&
        matchesCategory &&
        matchesResponsible &&
        matchesPriority
      );
    });
  }, [
    periodTickets,
    condominiumFilter,
    categoryFilter,
    responsibleFilter,
    priorityFilter,
  ]);



  const hasAdvancedFilters =
    condominiumFilter !== "ALL" ||
    categoryFilter !== "ALL" ||
    responsibleFilter !== "ALL" ||
    priorityFilter !== "ALL";



  const activeFilterSummary = useMemo(() => {
    const items: string[] = [];

    if (condominiumFilter !== "ALL") {
      const condominium = condominiumOptions.find(
        (item) => item.id === condominiumFilter
      );

      items.push(`Condomínio: ${condominium?.name || condominiumFilter}`);
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

    if (priorityFilter !== "ALL") {
      items.push(`Prioridade: ${priorityLabel(priorityFilter)}`);
    }

    return items;
  }, [
    condominiumFilter,
    categoryFilter,
    responsibleFilter,
    priorityFilter,
    condominiumOptions,
    responsibleOptions,
  ]);



  /* =========================================================
     MÉTRICAS PRINCIPAIS
     ========================================================= */

  const metrics = useMemo(() => {
    const total = filteredTickets.length;

    const open = filteredTickets.filter((ticket) => ticket.status === "OPEN")
      .length;

    const inProgress = filteredTickets.filter(
      (ticket) => ticket.status === "IN_PROGRESS"
    ).length;

    const resolved = filteredTickets.filter(
      (ticket) => ticket.status === "RESOLVED"
    ).length;

    const canceled = filteredTickets.filter(
      (ticket) => ticket.status === "CANCELED"
    ).length;

    const active = filteredTickets.filter((ticket) => isActiveTicket(ticket));

    const unassigned = active.filter((ticket) => !ticket.assignedToUser).length;

    const overdue = active.filter(
      (ticket) => getSlaStatus(ticket) === "OVERDUE"
    ).length;

    const warning = active.filter(
      (ticket) => getSlaStatus(ticket) === "WARNING"
    ).length;

    const urgent = active.filter((ticket) => ticket.priority === "URGENT").length;

    const highPriority = active.filter(
      (ticket) => ticket.priority === "HIGH"
    ).length;

    const firstResponseHours = filteredTickets
      .map((ticket) => getHoursBetween(ticket.createdAt, ticket.firstResponseAt))
      .filter((value): value is number => value !== null);

    const resolutionHours = filteredTickets
      .filter((ticket) => ticket.status === "RESOLVED")
      .map((ticket) => getHoursBetween(ticket.createdAt, ticket.resolvedAt))
      .filter((value): value is number => value !== null);

    const avgFirstResponse =
      firstResponseHours.length > 0
        ? firstResponseHours.reduce((sum, value) => sum + value, 0) /
          firstResponseHours.length
        : 0;

    const avgResolution =
      resolutionHours.length > 0
        ? resolutionHours.reduce((sum, value) => sum + value, 0) /
          resolutionHours.length
        : 0;

    const resolutionRate = getPercent(resolved, total);

    return {
      total,
      open,
      inProgress,
      resolved,
      canceled,
      active: active.length,
      unassigned,
      overdue,
      warning,
      urgent,
      highPriority,
      avgFirstResponse,
      avgResolution,
      resolutionRate,
    };
  }, [filteredTickets]);



  /* =========================================================
     DISTRIBUIÇÕES
     ========================================================= */

  const statusDistribution = useMemo(() => {
    const items = [
      { label: "Abertos", status: "OPEN" },
      { label: "Em andamento", status: "IN_PROGRESS" },
      { label: "Resolvidos", status: "RESOLVED" },
      { label: "Cancelados", status: "CANCELED" },
    ];

    return items.map((item) => ({
      ...item,
      value: filteredTickets.filter((ticket) => ticket.status === item.status)
        .length,
    }));
  }, [filteredTickets]);



  const priorityDistribution = useMemo(() => {
    const items = [
      { label: "Urgente", priority: "URGENT" },
      { label: "Alta", priority: "HIGH" },
      { label: "Média", priority: "MEDIUM" },
      { label: "Baixa", priority: "LOW" },
    ];

    return items.map((item) => ({
      ...item,
      value: filteredTickets.filter((ticket) => ticket.priority === item.priority)
        .length,
    }));
  }, [filteredTickets]);



  const categoryDistribution = useMemo(() => {
    const map = new Map<string, number>();

    filteredTickets.forEach((ticket) => {
      const category = ticket.category || "Sem categoria";
      map.set(category, (map.get(category) || 0) + 1);
    });

    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredTickets]);



  const responsibleDistribution = useMemo(() => {
    const map = new Map<string, number>();

    filteredTickets.forEach((ticket) => {
      const responsible = ticket.assignedToUser?.name || "Sem responsável";
      map.set(responsible, (map.get(responsible) || 0) + 1);
    });

    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredTickets]);



  const condominiumDistribution = useMemo(() => {
    const map = new Map<string, number>();

    filteredTickets.forEach((ticket) => {
      const condominium = ticket.condominium?.name || "Sem condomínio";
      map.set(condominium, (map.get(condominium) || 0) + 1);
    });

    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [filteredTickets]);



  /* =========================================================
     EVOLUÇÃO TEMPORAL
     ========================================================= */

  const timelineData = useMemo(() => {
    const now = startOfDay(new Date());

    let days = 30;

    if (period === "7D") days = 7;
    if (period === "30D") days = 30;
    if (period === "90D") days = 90;
    if (period === "ALL") days = 30;

    const dateMap = new Map<
      string,
      {
        key: string;
        label: string;
        created: number;
        resolved: number;
        total: number;
      }
    >();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(now.getDate() - i);

      const key = formatDateKey(date);

      dateMap.set(key, {
        key,
        label: formatDateLabel(key),
        created: 0,
        resolved: 0,
        total: 0,
      });
    }

    filteredTickets.forEach((ticket) => {
      const createdKey = formatDateKey(new Date(ticket.createdAt));

      if (dateMap.has(createdKey)) {
        const item = dateMap.get(createdKey)!;
        item.created += 1;
        item.total += 1;
      }

      if (ticket.resolvedAt) {
        const resolvedKey = formatDateKey(new Date(ticket.resolvedAt));

        if (dateMap.has(resolvedKey)) {
          const item = dateMap.get(resolvedKey)!;
          item.resolved += 1;
        }
      }
    });

    return Array.from(dateMap.values());
  }, [filteredTickets, period]);



  /* =========================================================
     RESUMO DE TENDÊNCIA
     ========================================================= */

  const trendSummary = useMemo(() => {
    if (timelineData.length === 0) {
      return {
        createdTotal: 0,
        resolvedTotal: 0,
        busiestDay: null as null | {
          label: string;
          created: number;
          resolved: number;
          total: number;
        },
        tendency: "Sem dados suficientes",
      };
    }

    const createdTotal = timelineData.reduce(
      (sum, item) => sum + item.created,
      0
    );

    const resolvedTotal = timelineData.reduce(
      (sum, item) => sum + item.resolved,
      0
    );

    const busiestDay = [...timelineData].sort(
      (a, b) => b.created + b.resolved - (a.created + a.resolved)
    )[0];

    const middle = Math.floor(timelineData.length / 2);

    const firstHalfCreated = timelineData
      .slice(0, middle)
      .reduce((sum, item) => sum + item.created, 0);

    const secondHalfCreated = timelineData
      .slice(middle)
      .reduce((sum, item) => sum + item.created, 0);

    let tendency = "Estável";

    if (secondHalfCreated > firstHalfCreated) {
      tendency = "Volume de abertura em alta";
    }

    if (secondHalfCreated < firstHalfCreated) {
      tendency = "Volume de abertura em queda";
    }

    return {
      createdTotal,
      resolvedTotal,
      busiestDay,
      tendency,
    };
  }, [timelineData]);



  /* =========================================================
     CHAMADOS CRÍTICOS
     ========================================================= */

  const criticalTickets = useMemo(() => {
    return filteredTickets
      .filter((ticket) => {
        if (!isActiveTicket(ticket)) return false;

        const slaStatus = getSlaStatus(ticket);

        return (
          slaStatus === "OVERDUE" ||
          slaStatus === "WARNING" ||
          ticket.priority === "URGENT" ||
          !ticket.assignedToUser
        );
      })
      .sort((a, b) => {
        const slaA = getSlaInfo(a);
        const slaB = getSlaInfo(b);

        if (slaA.isOverdue && !slaB.isOverdue) return -1;
        if (!slaA.isOverdue && slaB.isOverdue) return 1;

        if (a.priority === "URGENT" && b.priority !== "URGENT") return -1;
        if (a.priority !== "URGENT" && b.priority === "URGENT") return 1;

        if (slaA.isWarning && !slaB.isWarning) return -1;
        if (!slaA.isWarning && slaB.isWarning) return 1;

        if (!a.assignedToUser && b.assignedToUser) return -1;
        if (a.assignedToUser && !b.assignedToUser) return 1;

        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      })
      .slice(0, 8);
  }, [filteredTickets]);



  /* =========================================================
     LABELS E RESUMOS
     ========================================================= */

  const periodLabel =
    {
      "7D": "últimos 7 dias",
      "30D": "últimos 30 dias",
      "90D": "últimos 90 dias",
      ALL: "todo o período",
    }[period] || "período selecionado";



  const riskSummaryText =
    metrics.overdue > 0
      ? `${metrics.overdue} chamado(s) ativo(s) fora do prazo. Priorize a fila crítica.`
      : metrics.warning > 0
        ? `${metrics.warning} chamado(s) próximo(s) do limite de atendimento.`
        : metrics.unassigned > 0
          ? `${metrics.unassigned} chamado(s) ativo(s) ainda sem responsável.`
          : metrics.urgent > 0
            ? `${metrics.urgent} chamado(s) urgente(s) em aberto ou andamento.`
            : "Nenhum alerta crítico no filtro atual.";



  const riskQueueHref =
    metrics.overdue > 0
      ? buildTicketFilterHref({ sla: "overdue" })
      : metrics.warning > 0
        ? buildTicketFilterHref({ sla: "warning" })
        : metrics.unassigned > 0
          ? buildTicketFilterHref({ assigned: "none" })
          : metrics.urgent > 0
            ? buildTicketFilterHref({ priority: "URGENT" })
            : "/admin/chamados";



  const dashboardRecommendedAction =
    metrics.overdue > 0
      ? "Priorize os chamados vencidos e registre uma atualização pública nos casos mais críticos."
      : metrics.warning > 0
        ? "Acompanhe os chamados próximos do prazo para evitar vencimento do prazo."
        : metrics.unassigned > 0
          ? "Distribua responsáveis para os chamados ativos ainda sem atribuição."
          : metrics.urgent > 0
            ? "Revise os chamados urgentes e confirme se estão com responsável e andamento."
            : "A operação está sem alerta crítico no filtro atual. Mantenha o acompanhamento periódico da fila.";



  const filteredSummaryText = hasAdvancedFilters
    ? "Os indicadores abaixo estão considerando os filtros avançados aplicados."
    : "Os indicadores abaixo consideram todos os chamados do período selecionado.";



  /* =========================================================
     ESTADOS
     ========================================================= */

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando dashboard de chamados..."
        description="Aguarde enquanto identificamos seu perfil de acesso e carregamos os indicadores administrativos."
      />
    );
  }



  /* =========================================================
     RENDER
     ========================================================= */

  return (
    <AdminContextGuard
      fallbackTitle="Dashboard administrativo indisponível neste perfil de acesso"
      fallbackDescription="O dashboard administrativo de chamados é exclusivo para administradora ou super admin. Para acompanhar chamados como síndico, morador ou proprietário, acesse o portal."
    >
      <AdminShell
        current="chamados-dashboard"
        title="Indicadores de chamados"
        description="Análise gerencial dos chamados, prazos, prioridades e riscos operacionais."
      >
        <div className="space-y-6">
          {/* =====================================================
              TOPO OPERACIONAL
              ===================================================== */}

          <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#256D3C]">
                Análise de chamados
              </p>

              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17211B] md:text-4xl">
                Dashboard Administrativo de Chamados
              </h1>

              <p className="mt-2 max-w-4xl text-sm leading-6 text-[#5E6B63]">
                Visão gerencial dos chamados, prazos, prioridades, responsáveis,
                evolução e pontos que exigem atenção operacional.
              </p>
            </div>

            <Link
              href="/admin/chamados"
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5A32]"
            >
              Ir para fila de chamados
            </Link>
          </header>



          {/* =====================================================
              ERRO
              ===================================================== */}

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}



          {/* =====================================================
              CONTROLES DE ANÁLISE
              ===================================================== */}

          <ResponsiveSection
            title="Filtros de análise"
            description="Selecione o período e refine os indicadores por condomínio, categoria, responsável ou prioridade."
            defaultOpenMobile
          >
            <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-sm">
              <div className="mb-5 flex flex-wrap gap-2">
                  {[
                    { value: "7D", label: "7 dias" },
                    { value: "30D", label: "30 dias" },
                    { value: "90D", label: "90 dias" },
                    { value: "ALL", label: "Tudo" },
                  ].map((item) => (
                    <button
                      key={item.value}
                      onClick={() => setPeriod(item.value as PeriodFilter)}
                      className={
                        period === item.value
                          ? "inline-flex h-10 items-center justify-center rounded-2xl border border-[#256D3C] bg-[#256D3C] px-4 text-sm font-semibold text-white"
                          : "inline-flex h-10 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
                      }
                    >
                      {item.label}
                    </button>
                  ))}
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                <div className="lg:col-span-3">
                  <label className="text-sm font-semibold text-[#17211B]">
                    Condomínio
                  </label>

                  <select
                    value={condominiumFilter}
                    onChange={(e) => setCondominiumFilter(e.target.value)}
                    className="form-input mt-1"
                  >
                    <option value="ALL">Todos</option>

                    {condominiumOptions.map((condominium) => (
                      <option key={condominium.id} value={condominium.id}>
                        {condominium.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="lg:col-span-3">
                  <label className="text-sm font-semibold text-[#17211B]">
                    Categoria
                  </label>

                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="form-input mt-1"
                  >
                    <option value="ALL">Todas</option>

                    {categoryOptions.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="lg:col-span-3">
                  <label className="text-sm font-semibold text-[#17211B]">
                    Responsável
                  </label>

                  <select
                    value={responsibleFilter}
                    onChange={(e) => setResponsibleFilter(e.target.value)}
                    className="form-input mt-1"
                  >
                    <option value="ALL">Todos</option>

                    {responsibleOptions.map((responsible) => (
                      <option key={responsible.id} value={responsible.id}>
                        {responsible.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="lg:col-span-2">
                  <label className="text-sm font-semibold text-[#17211B]">
                    Prioridade
                  </label>

                  <select
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}
                    className="form-input mt-1"
                  >
                    <option value="ALL">Todas</option>
                    <option value="LOW">Baixa</option>
                    <option value="MEDIUM">Média</option>
                    <option value="HIGH">Alta</option>
                    <option value="URGENT">Urgente</option>
                  </select>
                </div>

                <div className="flex items-end lg:col-span-1">
                  <button
                    onClick={clearAdvancedFilters}
                    disabled={!hasAdvancedFilters}
                    className="inline-flex h-12 w-full items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:cursor-not-allowed disabled:bg-[#F6F8F7] disabled:text-[#9AA7A0]"
                  >
                    Limpar
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2 text-sm text-[#5E6B63] md:flex-row md:items-start md:justify-between">
                <div>
                  <p>
                    Período:{" "}
                    <strong className="text-[#17211B]">
                      {periodLabel}
                    </strong>{" "}
                    • Exibindo{" "}
                    <strong className="text-[#17211B]">
                      {filteredTickets.length}
                    </strong>{" "}
                    de{" "}
                    <strong className="text-[#17211B]">
                      {periodTickets.length}
                    </strong>{" "}
                    chamado(s).
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
                    hasAdvancedFilters
                      ? "font-semibold text-[#256D3C]"
                      : "text-[#7A877F]"
                  }
                >
                  {filteredSummaryText}
                </p>
              </div>
            </section>
          </ResponsiveSection>



          {/* =====================================================
              VISÃO DO DASHBOARD
              ===================================================== */}

          <section className="overflow-hidden rounded-[32px] border border-[#DDE5DF] bg-white shadow-sm">
            <div className="border-b border-[#DDE5DF] bg-[linear-gradient(135deg,#FFFFFF_0%,#F8FAF9_62%,#EAF7EE_135%)] p-6">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-[#17211B] md:text-3xl">
                    Visão do Dashboard
                  </h2>

                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5E6B63]">
                    No filtro atual, há <strong className="text-[#17211B]">{metrics.total}</strong>{" "}
                    chamado(s), com <strong className="text-[#17211B]">{metrics.active}</strong>{" "}
                    ativo(s), <strong className="text-[#256D3C]">{metrics.resolved}</strong>{" "}
                    resolvido(s) e <strong className="text-[#17211B]">{metrics.overdue}</strong>{" "}
                    fora do prazo.
                  </p>

                  <p className="mt-1 text-sm leading-6 text-[#7A877F]">
                    Taxa de resolução: <strong className="text-[#17211B]">{metrics.resolutionRate}%</strong>{" "}
                    • Primeira resposta média: <strong className="text-[#17211B]">{formatHours(metrics.avgFirstResponse)}</strong>{" "}
                    • Resolução média: <strong className="text-[#17211B]">{formatHours(metrics.avgResolution)}</strong>.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:min-w-[560px] xl:grid-cols-4">
                  <MetricCard title="Total" value={metrics.total} detail={periodLabel} href="/admin/chamados" />
                  <MetricCard title="Abertos" value={metrics.open} detail="Aguardando início." href={buildTicketFilterHref({ status: "OPEN" })} />
                  <MetricCard title="Em andamento" value={metrics.inProgress} detail="Já em atendimento." href={buildTicketFilterHref({ status: "IN_PROGRESS" })} />
                  <MetricCard title="Resolvidos" value={metrics.resolved} detail={`${metrics.resolutionRate}% de resolução.`} href={buildTicketFilterHref({ status: "RESOLVED" })} tone="green" />
                </div>
              </div>
            </div>

            <div className="grid gap-0 divide-y divide-[#DDE5DF] md:grid-cols-3 md:divide-x md:divide-y-0">
              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Ponto de atenção
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  {riskSummaryText}
                </p>

                <Link
                  href={riskQueueHref}
                  className="mt-4 inline-flex h-10 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
                >
                  Ver fila crítica
                </Link>
              </div>

              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Ação recomendada
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  {dashboardRecommendedAction}
                </p>
              </div>

              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Resultado atual
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  Período: <strong className="text-[#17211B]">{periodLabel}</strong>. Exibindo{" "}
                  <strong className="text-[#17211B]">{filteredTickets.length}</strong> de{" "}
                  <strong className="text-[#17211B]">{periodTickets.length}</strong> chamado(s).
                </p>
              </div>
            </div>
          </section>

          {/* =====================================================
              KPIS DE RISCO E TEMPO
              ===================================================== */}

          <section className="grid grid-cols-1 gap-4 md:grid-cols-4 xl:grid-cols-6">
            <MetricCard
              title="Fora do prazo"
              value={metrics.overdue}
              detail="Chamados ativos com Prazo vencido."
              href={buildTicketFilterHref({ sla: "overdue" })}
              tone="red"
            />

            <MetricCard
              title="Próximos do prazo"
              value={metrics.warning}
              detail="Chamados ativos próximos do limite."
              href={buildTicketFilterHref({ sla: "warning" })}
              tone="orange"
            />

            <MetricCard
              title="Urgentes"
              value={metrics.urgent}
              detail="Chamados ativos marcados como urgentes."
              href={buildTicketFilterHref({ priority: "URGENT" })}
              tone="red"
            />

            <MetricCard
              title="Sem responsável"
              value={metrics.unassigned}
              detail="Chamados ativos sem responsável definido."
              href={buildTicketFilterHref({ assigned: "none" })}
              tone="purple"
            />

            <MetricCard
              title="Tempo médio 1ª resposta"
              value={formatHours(metrics.avgFirstResponse)}
              detail="Baseado em chamados com primeira resposta."
            />

            <MetricCard
              title="Tempo médio resolução"
              value={formatHours(metrics.avgResolution)}
              detail="Baseado em chamados resolvidos."
            />
          </section>



          {/* =====================================================
              EVOLUÇÃO TEMPORAL
              ===================================================== */}

          <ResponsiveSection
            title="Evolução dos chamados"
            description="Comparativo de chamados criados e resolvidos por dia no período selecionado."
            defaultOpenMobile={false}
          >
            <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
              <div className="mb-5 grid w-full grid-cols-1 gap-3 md:grid-cols-3">
                  <InfoSummaryCard
                    label="Criados no gráfico"
                    value={trendSummary.createdTotal}
                    tone="blue"
                  />

                  <InfoSummaryCard
                    label="Resolvidos no gráfico"
                    value={trendSummary.resolvedTotal}
                    tone="green"
                  />

                  <InfoSummaryCard
                    label="Tendência"
                    value={trendSummary.tendency}
                  />
              </div>

              <TimelineChart data={timelineData} />

              {trendSummary.busiestDay && (
                <div className="mt-5 rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-4 text-sm leading-6 text-[#5E6B63]">
                  Dia com maior movimento:{" "}
                  <strong className="text-[#17211B]">
                    {trendSummary.busiestDay.label}
                  </strong>{" "}
                  com{" "}
                  <strong className="text-blue-700">
                    {trendSummary.busiestDay.created}
                  </strong>{" "}
                  chamado(s) criado(s) e{" "}
                  <strong className="text-[#256D3C]">
                    {trendSummary.busiestDay.resolved}
                  </strong>{" "}
                  resolvido(s).
                </div>
              )}
            </section>
          </ResponsiveSection>



          {/* =====================================================
              DISTRIBUIÇÕES PRINCIPAIS
              ===================================================== */}

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <ResponsiveSection
              title="Distribuição por status"
              description="Composição dos chamados por estágio de atendimento."
              defaultOpenMobile={false}
            >
              <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
                <DonutChart
                  total={metrics.total}
                  centerLabel="Chamados"
                  items={statusDistribution.map((item) => ({
                    label: item.label,
                    value: item.value,
                  }))}
                />
              </section>
            </ResponsiveSection>

            <ResponsiveSection
              title="Distribuição por prioridade"
              description="Composição dos chamados por nível de impacto operacional."
              defaultOpenMobile={false}
            >
              <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
                <DonutChart
                  total={metrics.total}
                  centerLabel="Prioridades"
                  items={priorityDistribution.map((item) => ({
                    label: item.label,
                    value: item.value,
                  }))}
                />
              </section>
            </ResponsiveSection>
          </div>



          {/* =====================================================
              CATEGORIAS E RESPONSÁVEIS
              ===================================================== */}

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <ResponsiveSection
              title="Chamados por categoria"
              description="Tipos de ocorrência mais recorrentes no período."
              defaultOpenMobile={false}
            >
              <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
                {categoryDistribution.length === 0 ? (
                  <p className="text-sm text-[#7A877F]">
                    Nenhuma categoria encontrada no período.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {categoryDistribution.map((item) => (
                      <DistributionBar
                        key={item.label}
                        label={item.label}
                        value={item.value}
                        total={metrics.total}
                      />
                    ))}
                  </div>
                )}
              </section>
            </ResponsiveSection>

            <ResponsiveSection
              title="Chamados por responsável"
              description="Distribuição da fila por pessoa responsável."
              defaultOpenMobile={false}
            >
              <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
                {responsibleDistribution.length === 0 ? (
                  <p className="text-sm text-[#7A877F]">
                    Nenhum responsável encontrado no período.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {responsibleDistribution.map((item) => (
                      <DistributionBar
                        key={item.label}
                        label={item.label}
                        value={item.value}
                        total={metrics.total}
                      />
                    ))}
                  </div>
                )}
              </section>
            </ResponsiveSection>
          </div>



          {/* =====================================================
              CONDOMÍNIOS COM MAIS CHAMADOS
              ===================================================== */}

          <ResponsiveSection
            title="Condomínios com mais chamados"
            description="Ranking dos condomínios com maior volume no período."
            defaultOpenMobile={false}
          >
            <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-sm sm:p-6">
              {condominiumDistribution.length === 0 ? (
                <p className="text-sm text-[#7A877F]">
                  Nenhum condomínio encontrado no período.
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col gap-2 border-b border-[#EEF2EF] pb-4 md:flex-row md:items-center md:justify-between">
                    <p className="text-sm leading-6 text-[#5E6B63]">
                      Lista preparada para carteiras maiores, mantendo a página curta mesmo com muitos condomínios.
                    </p>

                    <span className="inline-flex w-fit rounded-full border border-[#DDE5DF] bg-[#F6F8F7] px-3 py-1 text-xs font-semibold text-[#5E6B63]">
                      {condominiumDistribution.length} condomínio(s)
                    </span>
                  </div>

                  <div className="max-h-[440px] overflow-y-auto pr-1">
                    <div className="space-y-3">
                      {condominiumDistribution.map((item, index) => (
                        <RankingRow
                          key={item.label}
                          position={index + 1}
                          label={item.label}
                          value={item.value}
                          total={metrics.total}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>
          </ResponsiveSection>



          {/* =====================================================
              CHAMADOS CRÍTICOS - BLOCO OPERACIONAL FINAL
              ===================================================== */}

          <ResponsiveSection
            title="Chamados críticos"
            description="Lista operacional dos chamados que exigem atenção por prazo, urgência ou ausência de responsável."
            defaultOpenMobile
          >
            <section className="overflow-hidden rounded-[32px] border border-[#DDE5DF] bg-white shadow-sm">
              <div className="border-b border-[#DDE5DF] bg-[linear-gradient(135deg,#FFFFFF_0%,#F8FAF9_64%,#EAF7EE_135%)] p-5 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <p className="max-w-4xl text-sm leading-6 text-[#5E6B63]">
                    Priorizados por prazo, urgência ou ausência de responsável. Esta lista fica separada dos gráficos para facilitar a ação operacional.
                  </p>

                  <Link
                    href={riskQueueHref}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#256D3C] bg-white px-5 text-sm font-semibold text-[#256D3C] shadow-sm transition hover:bg-[#EAF7EE]"
                  >
                    Ver fila crítica
                  </Link>
                </div>
              </div>

              <div className="p-5">
                {criticalTickets.length === 0 ? (
                  <div className="rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-5 text-sm text-[#5E6B63]">
                    Nenhum chamado crítico encontrado no período.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {criticalTickets.map((ticket) => {
                      const sla = getSlaInfo(ticket);

                      return (
                        <article
                          key={ticket.id}
                          className="rounded-2xl border border-[#DDE5DF] bg-white p-4 shadow-sm transition hover:border-[#256D3C]/40 hover:shadow-md"
                        >
                          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="mb-2 flex flex-wrap items-center gap-2">
                                <span
                                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusBadgeClass(
                                    ticket.status
                                  )}`}
                                >
                                  {statusLabel(ticket.status)}
                                </span>

                                <span
                                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${priorityBadgeClass(
                                    ticket.priority
                                  )}`}
                                >
                                  {priorityLabel(ticket.priority)}
                                </span>

                                {sla.status === "OVERDUE" && (
                                  <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                                    Fora do prazo
                                  </span>
                                )}

                                {sla.status === "WARNING" && (
                                  <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
                                    Próximo do prazo
                                  </span>
                                )}

                                {!ticket.assignedToUser && (
                                  <span className="rounded-full border border-[#DDE5DF] bg-[#F6F8F7] px-3 py-1 text-xs font-semibold text-[#5E6B63]">
                                    Sem responsável
                                  </span>
                                )}
                              </div>

                              <p className="truncate text-lg font-semibold text-[#17211B]">
                                {formatDisplayTitle(ticket.title)}
                              </p>

                              <p className="mt-1 truncate text-sm text-[#5E6B63]">
                                {ticket.condominium?.name || "-"} • {getTicketLocationLabel(ticket)}
                              </p>

                              <p className="mt-1 text-xs text-[#7A877F]">
                                Criado em {new Date(ticket.createdAt).toLocaleString("pt-BR")}
                              </p>
                            </div>

                            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3 xl:min-w-[520px]">
                              <div className="rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
                                  Prazo
                                </p>

                                {sla.status === "OVERDUE" ? (
                                  <p className="mt-1 font-semibold text-red-700">
                                    Vencido há {Math.abs(sla.remainingHours)}h
                                  </p>
                                ) : sla.status === "WARNING" ? (
                                  <p className="mt-1 font-semibold text-orange-700">
                                    Restam {sla.remainingHours}h
                                  </p>
                                ) : (
                                  <p className="mt-1 font-semibold text-[#256D3C]">
                                    Dentro do prazo
                                  </p>
                                )}
                              </div>

                              <div className="rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
                                  Responsável
                                </p>

                                <p
                                  className={
                                    ticket.assignedToUser
                                      ? "mt-1 truncate font-semibold text-[#17211B]"
                                      : "mt-1 truncate font-semibold text-red-700"
                                  }
                                >
                                  {ticket.assignedToUser?.name || "Sem responsável"}
                                </p>
                              </div>

                              <div className="flex items-center justify-start sm:justify-end">
                                <Link
                                  href={`/admin/chamados/${ticket.id}`}
                                  className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C] sm:w-auto"
                                >
                                  Abrir chamado
                                </Link>
                              </div>
                            </div>
                          </div>

                          <details className="group mt-3 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA]">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#17211B] transition hover:bg-[#F6F8F7]">
                              <span>Ação recomendada</span>
                              <span className="text-[#7A877F] transition group-open:rotate-180">▾</span>
                            </summary>

                            <div className="border-t border-[#DDE5DF] p-4 text-sm leading-6 text-[#5E6B63]">
                              {getRecommendedAction(ticket)}
                            </div>
                          </details>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          </ResponsiveSection>
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
   LINHA DE RANKING
   ========================================================= */

function RankingRow({
  position,
  label,
  value,
  total,
}: {
  position: number;
  label: string;
  value: number;
  total: number;
}) {
  const percent = getPercent(value, total);

  return (
    <div className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4 transition hover:border-[#256D3C]/40 hover:bg-white">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#DDE5DF] bg-white text-sm font-semibold text-[#256D3C]">
            {position}
          </span>

          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-[#17211B]">
              {label}
            </p>

            <p className="text-xs text-[#7A877F]">
              {percent}% dos chamados do filtro atual
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 md:min-w-[260px]">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white">
            <div
              className="h-full rounded-full bg-[#256D3C]"
              style={{ width: `${percent}%` }}
            />
          </div>

          <div className="min-w-[56px] text-right">
            <strong className="text-lg font-semibold text-[#17211B]">
              {value}
            </strong>
            <p className="text-xs text-[#7A877F]">chamados</p>
          </div>
        </div>
      </div>
    </div>
  );
}



/* =========================================================
   CARD DE RESUMO
   ========================================================= */

function InfoSummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "blue" | "green";
}) {
  return (
    <div className="rounded-2xl border border-[#DDE5DF] bg-white p-4 shadow-sm">
      <p className="text-xs text-[#7A877F]">{label}</p>

      <strong
        className={
          tone === "blue"
            ? "text-2xl font-semibold text-[#17211B]"
            : tone === "green"
              ? "text-2xl font-semibold text-[#256D3C]"
              : "text-sm font-semibold text-[#17211B]"
        }
      >
        {value}
      </strong>
    </div>
  );
}