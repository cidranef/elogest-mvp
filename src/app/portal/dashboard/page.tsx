"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PortalContextGuard from "@/components/PortalContextGuard";
import PortalShell from "@/components/PortalShell";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";
import ResponsiveSection from "@/components/ui/ResponsiveSection";



/* =========================================================
   DASHBOARD DO PORTAL - ELOGEST

   ETAPA 41.3 — REFINAMENTO PREMIUM DO DASHBOARD PORTAL

   ETAPA 41.3.2 — PADRONIZAÇÃO VISUAL DOS TÍTULOS

   Ajustes desta revisão:
   - Adicionado ResponsiveSection no Dashboard Portal.
   - No desktop, as seções continuam abertas.
   - No mobile, blocos secundários viram menus suspensos.
   - Mantidos visíveis no topo:
     título da página, boas-vindas e Visão do Portal.
   - Seções extensas ficam recolhíveis:
     Prioridades, Distribuição, Minha Unidade,
     Chamados em Atenção, Atalhos, Recentes e Atualizações.
   - Reduzida a rolagem excessiva no celular.
   - Mantida toda a lógica funcional aprovada.
   - Títulos dos chamados passam a usar formatação visual consistente.
   ========================================================= */



interface TicketLog {
  id: string;
  action: string;
  comment?: string | null;
  createdAt: string;
  user?: {
    name?: string;
  };
}



interface Ticket {
  id: string;
  scope?: "UNIT" | "CONDOMINIUM" | string | null;
  title: string;
  description: string;
  status: string;
  category?: string | null;
  priority?: string | null;
  createdAt: string;
  resolvedAt?: string | null;

  condominium?: {
    id?: string;
    name: string;
  };

  unit?: {
    id?: string;
    block?: string | null;
    unitNumber: string;
  } | null;

  resident?: {
    id?: string;
    name?: string;
  } | null;

  assignedToUser?: {
    name?: string;
  } | null;

  logs?: TicketLog[];
}



interface Unidade {
  id?: string;
  block?: string | null;
  unitNumber: string;
}



interface PortalUser {
  id: string;
  name: string;
  email: string;
  role: string;
  residentId?: string | null;
  condominiumId?: string | null;
  unitId?: string | null;
}



type PortalRole = "MORADOR" | "SINDICO" | "PROPRIETARIO" | string;



const ACTIVE_TICKET_STATUSES = ["OPEN", "IN_PROGRESS"];



const PORTAL_VISIBLE_LOG_ACTIONS = [
  "CREATED",
  "STATUS_CHANGED",
  "COMMENT_PUBLIC",
  "ATTACHMENT_ADDED",
];



/* =========================================================
   EXTRAIR QUANTIDADE DE PERFIS DISPONÍVEIS
   ========================================================= */

function extractAccessCount(data: unknown) {
  const value = data as {
    accesses?: unknown;
    user?: {
      accesses?: unknown;
    };
    availableAccesses?: unknown;
    items?: unknown;
  };

  const possibleLists = [
    value?.accesses,
    value?.user?.accesses,
    value?.availableAccesses,
    value?.items,
  ];

  const list = possibleLists.find((item) => Array.isArray(item));

  if (!Array.isArray(list)) {
    return 0;
  }

  return list.filter((item: any) => item?.isActive !== false).length;
}



/* =========================================================
   HELPERS DE SEGURANÇA VISUAL DO DASHBOARD
   ========================================================= */

function isSindicoRole(role?: string | null) {
  return role === "SINDICO";
}



function isResidentialRole(role?: string | null) {
  return role === "MORADOR" || role === "PROPRIETARIO";
}



function sortTicketsNewestFirst(list: Ticket[]) {
  return [...list].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}



function ticketBelongsToActivePortalContext({
  ticket,
  user,
  role,
}: {
  ticket: Ticket;
  user: PortalUser | null;
  role: PortalRole;
}) {
  if (!user) {
    return false;
  }

  if (isSindicoRole(role)) {
    if (!user.condominiumId) {
      return false;
    }

    return ticket.condominium?.id === user.condominiumId;
  }

  if (isResidentialRole(role)) {
    if (!user.condominiumId || !user.unitId) {
      return false;
    }

    if (ticket.scope === "CONDOMINIUM") {
      return false;
    }

    return (
      ticket.condominium?.id === user.condominiumId &&
      ticket.unit?.id === user.unitId
    );
  }

  return false;
}



function sanitizePortalDashboardTickets({
  tickets,
  user,
  role,
}: {
  tickets: Ticket[];
  user: PortalUser | null;
  role: PortalRole;
}) {
  return sortTicketsNewestFirst(
    tickets.filter((ticket) =>
      ticketBelongsToActivePortalContext({
        ticket,
        user,
        role,
      })
    )
  );
}



function percentage(value: number, total: number) {
  if (total <= 0) return 0;

  return Math.round((value / total) * 100);
}



/* =========================================================
   HELPER DE PADRONIZAÇÃO VISUAL DE TÍTULOS

   Observação:
   - Apenas formata a exibição.
   - Não altera o texto salvo no banco de dados.
   ========================================================= */

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



/* =========================================================
   PÁGINA
   ========================================================= */

export default function PortalDashboardPage() {
  const [role, setRole] = useState<PortalRole>("");
  const [user, setUser] = useState<PortalUser | null>(null);
  const [userName, setUserName] = useState("");

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [hasPersonalUnit, setHasPersonalUnit] = useState(false);
  const [personalUnit, setPersonalUnit] = useState<Unidade | null>(null);

  const [accessCount, setAccessCount] = useState(0);

  const [error, setError] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);
  const [loading, setLoading] = useState(true);

  const canSwitchProfile = accessCount > 1;



  /* =========================================================
     CARREGAR DASHBOARD
     ========================================================= */

  async function loadDashboard() {
    try {
      setLoading(true);
      setError("");
      setAccessDenied(false);

      const res = await fetch("/api/portal/chamados", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        const message = data?.error || "Erro ao carregar dashboard.";

        setError(message);
        setTickets([]);

        if (res.status === 403) {
          setAccessDenied(true);
        }

        return;
      }

      const nextRole: PortalRole =
        data.role || data.activeAccess?.role || data.user?.role || "";

      const nextUser: PortalUser | null = data.user || null;

      const receivedTickets: Ticket[] = Array.isArray(data.tickets)
        ? data.tickets
        : [];

      const safeTickets = sanitizePortalDashboardTickets({
        tickets: receivedTickets,
        user: nextUser,
        role: nextRole,
      });

      setRole(nextRole);
      setUser(nextUser);
      setUserName(nextUser?.name || "");
      setTickets(safeTickets);

      setHasPersonalUnit(!!data.hasPersonalUnit);
      setPersonalUnit(data.personalUnit || null);
    } catch (err) {
      console.error(err);
      setError("Erro ao carregar dashboard.");
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }



  /* =========================================================
     CARREGAR QUANTIDADE DE PERFIS DISPONÍVEIS
     ========================================================= */

  async function loadAccessCount() {
    try {
      const res = await fetch("/api/user/accesses", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setAccessCount(0);
        return;
      }

      setAccessCount(extractAccessCount(data));
    } catch (err) {
      console.error(err);
      setAccessCount(0);
    }
  }



  /* =========================================================
     INIT
     ========================================================= */

  useEffect(() => {
    loadDashboard();
    loadAccessCount();
  }, []);



  /* =========================================================
     HELPERS
     ========================================================= */

  const statusLabel = (status?: string | null) =>
    ({
      OPEN: "Aberto",
      IN_PROGRESS: "Em andamento",
      RESOLVED: "Resolvido",
      CANCELED: "Cancelado",
    }[status || ""] || status || "-");



  const priorityLabel = (priority?: string | null) =>
    ({
      LOW: "Baixa",
      MEDIUM: "Média",
      HIGH: "Alta",
      URGENT: "Urgente",
    }[priority || ""] || "-");



  const statusClass = (status: string) =>
    ({
      OPEN: "border-[#DDE5DF] bg-white text-[#17211B]",
      IN_PROGRESS: "border-yellow-200 bg-yellow-50 text-yellow-800",
      RESOLVED: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
      CANCELED: "border-red-200 bg-red-50 text-red-700",
    }[status] || "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]");



  const priorityClass = (priority?: string | null) =>
    ({
      LOW: "text-[#5E6B63]",
      MEDIUM: "text-[#5E6B63]",
      HIGH: "text-orange-700",
      URGENT: "text-red-700",
    }[priority || ""] || "text-[#5E6B63]");



  const priorityBadgeClass = (priority?: string | null) =>
    ({
      LOW: "border-[#DDE5DF] bg-white text-[#5E6B63]",
      MEDIUM: "border-[#DDE5DF] bg-white text-[#5E6B63]",
      HIGH: "border-orange-200 bg-orange-50 text-orange-700",
      URGENT: "border-red-200 bg-red-50 text-red-700",
    }[priority || ""] || "border-[#DDE5DF] bg-white text-[#5E6B63]");



  function getRoleLabel(currentRole: PortalRole) {
    if (currentRole === "SINDICO") return "Síndico";
    if (currentRole === "MORADOR") return "Morador";
    if (currentRole === "PROPRIETARIO") return "Proprietário";
    return currentRole || "-";
  }



  function isSindicoPortal() {
    return role === "SINDICO";
  }



  function isMoradorOrProprietarioPortal() {
    return role === "MORADOR" || role === "PROPRIETARIO";
  }



  function isActiveTicket(ticket: Ticket) {
    return ACTIVE_TICKET_STATUSES.includes(ticket.status);
  }



  function getUnitLabel(unit?: Unidade | null) {
    if (!unit) return "-";

    return `${unit.block ? `Bloco ${unit.block} - ` : ""}Unidade ${
      unit.unitNumber
    }`;
  }



  function isPersonalUnitTicket(ticket: Ticket) {
    if (!personalUnit?.id) return false;

    return (
      ticket.unit?.id === personalUnit.id ||
      (!!user?.residentId && ticket.resident?.id === user.residentId)
    );
  }



  function getTicketScopeLabel(ticket: Ticket) {
    if (ticket.scope === "CONDOMINIUM") {
      return "Condomínio";
    }

    if (isPersonalUnitTicket(ticket)) {
      return "Minha unidade";
    }

    return "Unidade";
  }



  function getTicketLocationLabel(ticket: Ticket) {
    if (ticket.scope === "CONDOMINIUM") {
      return "Condomínio / Área comum";
    }

    if (ticket.unit) {
      return getUnitLabel(ticket.unit);
    }

    return "Unidade";
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
        status: "DONE",
        isOverdue: false,
        isWarning: false,
        label: "Encerrado",
        className: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
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

    if (isOverdue) {
      return {
        limitHours,
        elapsedHours,
        remainingHours,
        consumedPercent,
        status: "OVERDUE",
        isOverdue,
        isWarning,
        label: isSindicoPortal()
          ? `Prazo vencido há ${Math.abs(remainingHours)}h`
          : "Em atenção",
        className: "border-red-200 bg-red-50 text-red-700",
      };
    }

    if (isWarning) {
      return {
        limitHours,
        elapsedHours,
        remainingHours,
        consumedPercent,
        status: "WARNING",
        isOverdue,
        isWarning,
        label: isSindicoPortal()
          ? `Prazo vence em ${remainingHours}h`
          : "Acompanhamento prioritário",
        className: "border-orange-200 bg-orange-50 text-orange-700",
      };
    }

    return {
      limitHours,
      elapsedHours,
      remainingHours,
      consumedPercent,
      status: "OK",
      isOverdue,
      isWarning,
      label: isSindicoPortal() ? "Dentro do prazo" : "Em acompanhamento",
      className: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
    };
  }



  function getPortalLogText(log: TicketLog) {
    if (log.action === "CREATED") {
      return "Chamado criado.";
    }

    if (log.action === "STATUS_CHANGED") {
      return "Status do chamado atualizado.";
    }

    if (log.action === "COMMENT_PUBLIC") {
      return log.comment || "Nova mensagem no chamado.";
    }

    if (log.action === "ATTACHMENT_ADDED") {
      return log.comment || "Novo anexo adicionado.";
    }

    return log.comment || "Atualização no chamado.";
  }



  function getWelcomeTitle() {
    if (isSindicoPortal()) {
      return "Painel do condomínio";
    }

    if (role === "PROPRIETARIO") {
      return "Portal do proprietário";
    }

    return "Meu portal";
  }



  function getWelcomeDescription() {
    if (isSindicoPortal()) {
      return "Acompanhe os chamados do condomínio, veja prioridades e consulte as principais atualizações da operação.";
    }

    if (role === "PROPRIETARIO") {
      return "Acompanhe os chamados vinculados à sua unidade, mensagens públicas e atualizações do atendimento.";
    }

    return "Acompanhe seus chamados, mensagens públicas, anexos e atualizações do atendimento.";
  }



  function getDashboardPageDescription() {
    if (isSindicoPortal()) {
      return "Visão geral dos chamados do condomínio, prioridades de acompanhamento e movimentações recentes.";
    }

    if (role === "PROPRIETARIO") {
      return "Visão geral das solicitações vinculadas à sua unidade e das atualizações públicas do atendimento.";
    }

    return "Visão geral das suas solicitações, atualizações públicas e chamados em acompanhamento.";
  }



  function getAttentionBlockTitle() {
    if (isSindicoPortal()) {
      return "Chamados que precisam de atenção";
    }

    return "Solicitações que merecem acompanhamento";
  }



  function getAttentionBlockDescription() {
    if (isSindicoPortal()) {
      return "Priorizamos aqui chamados urgentes, com prazo vencido, próximos do limite ou ainda sem responsável.";
    }

    return "Aqui aparecem solicitações urgentes ou próximas de exigir uma nova ação de acompanhamento.";
  }



  function getEmptyAttentionMessage() {
    if (isSindicoPortal()) {
      return "Nenhum chamado crítico no momento. Os chamados do condomínio estão sem alertas prioritários.";
    }

    return "Nenhuma solicitação em atenção no momento.";
  }



  function getOpenTicketActionLabel() {
    if (isSindicoPortal()) {
      return "Abrir chamado";
    }

    return "Abrir meu chamado";
  }



  function getPortalRecommendedAction() {
    if (metrics.overdue > 0) {
      return isSindicoPortal()
        ? "Priorize os chamados com prazo vencido e verifique se já possuem responsável definido."
        : "Acompanhe as solicitações em atenção e verifique se há mensagens recentes no detalhe do chamado.";
    }

    if (metrics.warning > 0) {
      return isSindicoPortal()
        ? "Acompanhe os chamados próximos do prazo para evitar vencimento."
        : "Revise as solicitações em acompanhamento prioritário.";
    }

    if (isSindicoPortal() && metrics.unassigned > 0) {
      return "Verifique os chamados sem responsável e acompanhe a atribuição pela administradora.";
    }

    if (metrics.urgent > 0) {
      return "Acompanhe os chamados urgentes até a próxima movimentação.";
    }

    if (metrics.active > 0) {
      return "Continue acompanhando os chamados em aberto ou em andamento pela lista.";
    }

    return isSindicoPortal()
      ? "Não há chamados ativos com alerta no momento. Mantenha o acompanhamento periódico do condomínio."
      : "Não há solicitações ativas com alerta no momento. Abra um chamado se precisar registrar uma nova solicitação.";
  }



  function getLatestTicketGuidance(ticket: Ticket) {
    const sla = getSlaInfo(ticket);

    if (ticket.status === "OPEN") {
      return ticket.assignedToUser
        ? "Aguardando início do atendimento."
        : "Aguardando responsável ou triagem.";
    }

    if (ticket.status === "IN_PROGRESS") {
      if (sla.status === "OVERDUE") {
        return "Chamado em atenção. Acompanhe as atualizações.";
      }

      if (sla.status === "WARNING") {
        return "Chamado em acompanhamento prioritário.";
      }

      return "Chamado em atendimento.";
    }

    if (ticket.status === "RESOLVED") {
      return "Chamado resolvido.";
    }

    if (ticket.status === "CANCELED") {
      return "Chamado cancelado.";
    }

    return "Acompanhe pelo detalhe.";
  }



  /* =========================================================
     MÉTRICAS
     ========================================================= */

  const metrics = useMemo(() => {
    const total = tickets.length;

    const activeTickets = tickets.filter((ticket) => isActiveTicket(ticket));

    const open = tickets.filter((ticket) => ticket.status === "OPEN").length;

    const progress = tickets.filter(
      (ticket) => ticket.status === "IN_PROGRESS"
    ).length;

    const resolved = tickets.filter(
      (ticket) => ticket.status === "RESOLVED"
    ).length;

    const canceled = tickets.filter(
      (ticket) => ticket.status === "CANCELED"
    ).length;

    const unassigned = activeTickets.filter(
      (ticket) => !ticket.assignedToUser
    ).length;

    const urgent = activeTickets.filter(
      (ticket) => ticket.priority === "URGENT"
    ).length;

    const highPriority = activeTickets.filter(
      (ticket) => ticket.priority === "HIGH"
    ).length;

    const overdue = activeTickets.filter(
      (ticket) => getSlaInfo(ticket).status === "OVERDUE"
    ).length;

    const warning = activeTickets.filter(
      (ticket) => getSlaInfo(ticket).status === "WARNING"
    ).length;

    const condominiumScope = tickets.filter(
      (ticket) => ticket.scope === "CONDOMINIUM"
    ).length;

    const unitScope = tickets.filter(
      (ticket) => ticket.scope !== "CONDOMINIUM"
    ).length;

    return {
      total,
      active: activeTickets.length,
      open,
      progress,
      resolved,
      canceled,
      unassigned,
      urgent,
      highPriority,
      overdue,
      warning,
      condominiumScope,
      unitScope,
    };
    // role é usado por getSlaInfo para linguagem do prazo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, role]);



  const personalUnitTickets = useMemo(() => {
    if (!hasPersonalUnit) return [];

    return tickets.filter((ticket) => isPersonalUnitTicket(ticket));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, hasPersonalUnit, personalUnit, user]);



  const personalUnitMetrics = useMemo(() => {
    const activeTickets = personalUnitTickets.filter((ticket) =>
      isActiveTicket(ticket)
    );

    return {
      total: personalUnitTickets.length,
      open: personalUnitTickets.filter((ticket) => ticket.status === "OPEN")
        .length,
      progress: personalUnitTickets.filter(
        (ticket) => ticket.status === "IN_PROGRESS"
      ).length,
      resolved: personalUnitTickets.filter(
        (ticket) => ticket.status === "RESOLVED"
      ).length,
      urgent: activeTickets.filter((ticket) => ticket.priority === "URGENT")
        .length,
      attention: activeTickets.filter((ticket) => {
        const sla = getSlaInfo(ticket);
        return sla.status === "OVERDUE" || sla.status === "WARNING";
      }).length,
    };
    // role é usado por getSlaInfo para linguagem do prazo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personalUnitTickets, role]);



  const attentionTickets = useMemo(() => {
    return tickets
      .filter((ticket) => {
        if (!isActiveTicket(ticket)) return false;

        const sla = getSlaInfo(ticket);

        return (
          sla.status === "OVERDUE" ||
          sla.status === "WARNING" ||
          ticket.priority === "URGENT" ||
          (isSindicoPortal() && !ticket.assignedToUser)
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

        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
      .slice(0, 5);
    // role é usado por isSindicoPortal/getSlaInfo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, role]);



  const latestTickets = useMemo(() => {
    return sortTicketsNewestFirst(tickets).slice(0, 5);
  }, [tickets]);



  const latestPersonalUnitTickets = useMemo(() => {
    return sortTicketsNewestFirst(personalUnitTickets).slice(0, 3);
  }, [personalUnitTickets]);



  const latestLogs = useMemo(() => {
    const logs = tickets.flatMap((ticket) =>
      (ticket.logs || [])
        .filter((log) => PORTAL_VISIBLE_LOG_ACTIONS.includes(log.action))
        .map((log) => ({
          ...log,
          ticketId: ticket.id,
          ticketTitle: ticket.title,
        }))
    );

    return logs
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .slice(0, 6);
  }, [tickets]);



  const primaryTicketsLabel = isSindicoPortal()
    ? "Chamados do condomínio"
    : "Meus chamados";



  const primaryOpenTicketLabel = isSindicoPortal()
    ? "Abrir chamado"
    : "Abrir meu chamado";



  /* =========================================================
     LOADING
     ========================================================= */

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando dashboard..."
        description="Aguarde enquanto identificamos seu perfil de acesso e carregamos os dados do portal."
      />
    );
  }



  /* =========================================================
     ACESSO NEGADO
     ========================================================= */

  if (accessDenied) {
    return (
      <PortalContextGuard
        fallbackTitle="Dashboard do portal indisponível neste perfil de acesso"
        fallbackDescription="O dashboard do portal é destinado a síndicos, moradores e proprietários. Para acessar dados administrativos, utilize a área admin."
      >
        <PortalShell
          current="dashboard"
          title="Dashboard do portal"
          description="Este dashboard é destinado a síndicos, moradores e proprietários."
          canSwitchProfile={canSwitchProfile}
        >
          <section className="rounded-[32px] border border-red-200 bg-white p-8 shadow-sm">
            <div className="mb-6">
              <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                Acesso restrito
              </span>

              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[#17211B]">
                Dashboard do Portal
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5E6B63]">
                Este dashboard é destinado exclusivamente a síndicos,
                proprietários e moradores.
              </p>
            </div>

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
                {error}
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/admin/dashboard"
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-6 text-sm font-semibold text-white transition hover:bg-[#1F5A32]"
              >
                Dashboard admin
              </Link>

              {canSwitchProfile && (
                <Link
                  href="/contexto"
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-6 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
                >
                  Trocar perfil
                </Link>
              )}
            </div>
          </section>
        </PortalShell>
      </PortalContextGuard>
    );
  }



  /* =========================================================
     RENDER
     ========================================================= */

  return (
    <PortalContextGuard
      fallbackTitle="Dashboard do portal indisponível neste perfil de acesso"
      fallbackDescription="O dashboard do portal é destinado a síndicos, moradores e proprietários. Para acessar dados administrativos, utilize a área admin."
    >
      <PortalShell
        current="dashboard"
        title={getWelcomeTitle()}
        description={getWelcomeDescription()}
        roleLabel={getRoleLabel(role)}
        canSwitchProfile={canSwitchProfile}
      >
        <div className="space-y-6">
          {/* =====================================================
              TÍTULO DA PÁGINA
              ===================================================== */}

          <header>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#256D3C]">
              Portal
            </p>

            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17211B] md:text-4xl">
              Dashboard do Portal
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5E6B63]">
              {getDashboardPageDescription()}
            </p>
          </header>



          {/* =====================================================
              BOAS-VINDAS
              ===================================================== */}

          <section className="rounded-[32px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-[#17211B] md:text-3xl">
                  Olá{userName ? `, ${userName}` : ""}.
                </h2>

                <p className="mt-2 text-lg font-semibold text-[#256D3C]">
                  {getWelcomeTitle()}
                </p>

                <p className="mt-3 max-w-4xl text-sm leading-6 text-[#5E6B63]">
                  {getWelcomeDescription()}
                </p>

                {role === "SINDICO" && hasPersonalUnit && (
                  <div className="mt-4 rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm leading-6 text-yellow-800">
                    Além do seu perfil de síndico, você também possui vínculo com{" "}
                    <strong>{getUnitLabel(personalUnit)}</strong>.
                    {canSwitchProfile
                      ? " Para abrir ou acompanhar chamados da sua própria unidade, utilize o perfil de morador ou proprietário quando disponível."
                      : " Este usuário não possui outro perfil de acesso disponível para troca."}
                  </div>
                )}
              </div>

              <div className="flex shrink-0 xl:min-w-[260px]">
                <Link
                  href="/portal/chamados"
                  className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-[#256D3C] px-6 text-sm font-semibold text-white transition hover:bg-[#1F5A32] xl:w-auto xl:min-w-[220px]"
                >
                  {getOpenTicketActionLabel()}
                </Link>
              </div>
            </div>
          </section>



          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}



          {/* =====================================================
              VISÃO DO PORTAL
              ===================================================== */}

          <section className="overflow-hidden rounded-[32px] border border-[#DDE5DF] bg-white shadow-sm">
            <div className="border-b border-[#DDE5DF] bg-[linear-gradient(135deg,#FFFFFF_0%,#F8FAF9_62%,#EAF7EE_135%)] p-6">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-[#17211B] md:text-3xl">
                    Visão do Portal
                  </h2>

                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5E6B63]">
                    Resumo dos chamados disponíveis para o seu perfil de acesso.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:min-w-[620px] xl:grid-cols-4">
                  <PortalMetricBox
                    title={isSindicoPortal() ? "Chamados" : "Meus chamados"}
                    value={metrics.total}
                    href="/portal/chamados"
                    highlighted
                    description={
                      isSindicoPortal()
                        ? "Total do condomínio."
                        : "Total da sua unidade."
                    }
                  />

                  <PortalMetricBox
                    title="Abertos"
                    value={metrics.open}
                    href="/portal/chamados?status=OPEN"
                    description="Aguardando triagem."
                  />

                  <PortalMetricBox
                    title="Em andamento"
                    value={metrics.progress}
                    href="/portal/chamados?status=IN_PROGRESS"
                    description="Em acompanhamento."
                  />

                  <PortalMetricBox
                    title="Resolvidos"
                    value={metrics.resolved}
                    href="/portal/chamados?status=RESOLVED"
                    highlighted
                    description="Finalizados."
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-0 divide-y divide-[#DDE5DF] md:grid-cols-3 md:divide-x md:divide-y-0">
              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Ativos
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  {metrics.active} chamado(s) em aberto ou em andamento.
                </p>
              </div>

              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Em atenção
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  {metrics.overdue > 0
                    ? `${metrics.overdue} chamado(s) exigem acompanhamento prioritário.`
                    : "Nenhum chamado ativo em atenção no momento."}
                </p>
              </div>

              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Orientação
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  {getPortalRecommendedAction()}
                </p>
              </div>
            </div>
          </section>



          {/* =====================================================
              PRIORIDADES DO ATENDIMENTO
              ===================================================== */}

          <ResponsiveSection
            title="Prioridades do Atendimento"
            description="Chamados que exigem acompanhamento especial."
            defaultOpenMobile={metrics.overdue > 0 || metrics.warning > 0 || metrics.urgent > 0}
          >
            <section
              className={`grid grid-cols-1 gap-4 ${
                isSindicoPortal() ? "md:grid-cols-4" : "md:grid-cols-3"
              }`}
            >
              <MetricCard
                title={isSindicoPortal() ? "Prazo vencido" : "Em atenção"}
                value={metrics.overdue}
                href="/portal/chamados?sla=overdue"
                tone={metrics.overdue > 0 ? "red" : "default"}
                description={
                  isSindicoPortal()
                    ? "Chamados ativos que precisam de ação imediata."
                    : "Solicitações que precisam de acompanhamento."
                }
              />

              <MetricCard
                title={
                  isSindicoPortal()
                    ? "Próximos do prazo"
                    : "Acompanhamento prioritário"
                }
                value={metrics.warning}
                href="/portal/chamados?sla=warning"
                tone={metrics.warning > 0 ? "orange" : "default"}
                description={
                  isSindicoPortal()
                    ? "Chamados próximos do limite de atendimento."
                    : "Solicitações próximas de exigir uma nova ação."
                }
              />

              <MetricCard
                title="Urgentes"
                value={metrics.urgent}
                href="/portal/chamados?priority=URGENT"
                tone={metrics.urgent > 0 ? "red" : "default"}
                description="Chamados marcados com prioridade urgente."
              />

              {isSindicoPortal() && (
                <MetricCard
                  title="Sem responsável"
                  value={metrics.unassigned}
                  href="/portal/chamados?assigned=none"
                  tone={metrics.unassigned > 0 ? "orange" : "default"}
                  description="Chamados ativos ainda sem responsável definido."
                />
              )}
            </section>
          </ResponsiveSection>



          {/* =====================================================
              DISTRIBUIÇÃO DOS CHAMADOS
              ===================================================== */}

          <ResponsiveSection
            title="Distribuição dos Chamados"
            description="Comparativo simples do volume operacional."
            defaultOpenMobile={false}
          >
            <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
              <div className="grid grid-cols-1 gap-8 xl:grid-cols-5">
                <div className="xl:col-span-3">
                  <h2 className="text-xl font-semibold text-[#17211B]">
                    Distribuição dos Chamados
                  </h2>

                  <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
                    As barras indicam a participação de cada situação dentro do
                    total de chamados visíveis para o seu perfil.
                  </p>

                  <div className="mt-6 space-y-5">
                    <DistributionRow
                      label="Abertos"
                      value={metrics.open}
                      total={metrics.total}
                    />

                    <DistributionRow
                      label="Em andamento"
                      value={metrics.progress}
                      total={metrics.total}
                      tone="warning"
                    />

                    <DistributionRow
                      label="Resolvidos"
                      value={metrics.resolved}
                      total={metrics.total}
                      tone="green"
                    />

                    <DistributionRow
                      label={isSindicoPortal() ? "Prazo vencido" : "Em atenção"}
                      value={metrics.overdue}
                      total={metrics.total}
                      tone="danger"
                    />

                    {isSindicoPortal() && (
                      <DistributionRow
                        label="Sem responsável"
                        value={metrics.unassigned}
                        total={metrics.total}
                        tone="warning"
                      />
                    )}
                  </div>
                </div>

                <div className="rounded-[24px] border border-[#DDE5DF] bg-[#F9FBFA] p-5 xl:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                    Leitura executiva
                  </p>

                  <h3 className="mt-2 text-xl font-semibold text-[#17211B]">
                    {metrics.total > 0
                      ? `${metrics.total} chamado(s) no portal`
                      : "Sem chamados registrados"}
                  </h3>

                  <p className="mt-3 text-sm leading-6 text-[#5E6B63]">
                    {metrics.total > 0
                      ? "Use essa visão para acompanhar prioridades, identificar pendências e consultar rapidamente as solicitações recentes."
                      : "Assim que houver chamados vinculados ao perfil, esta área mostrará a distribuição da operação."}
                  </p>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-[#DDE5DF] bg-white p-4">
                      <p className="text-xs text-[#7A877F]">
                        Ativos
                      </p>

                      <strong className="text-2xl text-[#17211B]">
                        {metrics.active}
                      </strong>
                    </div>

                    <div className="rounded-2xl border border-[#DDE5DF] bg-white p-4">
                      <p className="text-xs text-[#7A877F]">
                        Finalizados
                      </p>

                      <strong className="text-2xl text-[#256D3C]">
                        {metrics.resolved}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </ResponsiveSection>



          {/* =====================================================
              BLOCO MINHA UNIDADE PARA SÍNDICO
              ===================================================== */}

          {role === "SINDICO" && hasPersonalUnit && (
            <ResponsiveSection
              title="Minha Unidade"
              description="Chamados relacionados à unidade vinculada ao seu usuário."
              defaultOpenMobile={false}
            >
              <section className="rounded-[28px] border border-[#CFE6D4] bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold text-[#17211B]">
                      Minha Unidade
                    </h2>

                    <p className="mt-2 text-lg font-semibold text-[#256D3C]">
                      {getUnitLabel(personalUnit)}
                    </p>

                    <p className="mt-2 max-w-4xl text-sm leading-6 text-[#5E6B63]">
                      Este bloco mostra chamados relacionados à sua unidade
                      vinculada.
                      {canSwitchProfile
                        ? " Para abrir chamado como morador ou proprietário, troque o perfil de acesso antes de registrar a solicitação."
                        : " Este usuário não possui outro perfil de acesso disponível para abertura como morador ou proprietário."}
                    </p>
                  </div>

                  {canSwitchProfile && (
                    <Link
                      href="/contexto"
                      className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-6 text-sm font-semibold text-white transition hover:bg-[#1F5A32]"
                    >
                      Trocar perfil
                    </Link>
                  )}
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-6">
                  <MiniMetricCard
                    title="Total"
                    value={personalUnitMetrics.total}
                    href="/portal/chamados?scope=unit"
                  />

                  <MiniMetricCard
                    title="Abertos"
                    value={personalUnitMetrics.open}
                    href="/portal/chamados?scope=unit&status=OPEN"
                  />

                  <MiniMetricCard
                    title="Em andamento"
                    value={personalUnitMetrics.progress}
                    href="/portal/chamados?scope=unit&status=IN_PROGRESS"
                    tone={personalUnitMetrics.progress > 0 ? "yellow" : "default"}
                  />

                  <MiniMetricCard
                    title="Resolvidos"
                    value={personalUnitMetrics.resolved}
                    href="/portal/chamados?scope=unit&status=RESOLVED"
                    tone="green"
                  />

                  <MiniMetricCard
                    title="Urgentes"
                    value={personalUnitMetrics.urgent}
                    href="/portal/chamados?scope=unit&priority=URGENT"
                    tone={personalUnitMetrics.urgent > 0 ? "red" : "default"}
                  />

                  <MiniMetricCard
                    title="Em atenção"
                    value={personalUnitMetrics.attention}
                    href="/portal/chamados?scope=unit&attention=true"
                    tone={personalUnitMetrics.attention > 0 ? "orange" : "default"}
                  />
                </div>

                {latestPersonalUnitTickets.length > 0 && (
                  <div className="mt-6">
                    <h3 className="mb-3 text-lg font-semibold text-[#17211B]">
                      Chamados Recentes da Minha Unidade
                    </h3>

                    <div className="space-y-3">
                      {latestPersonalUnitTickets.map((ticket) => (
                        <Link
                          key={ticket.id}
                          href={`/portal/chamados/${ticket.id}`}
                          className="block rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4 transition hover:border-[#256D3C] hover:bg-white"
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div>
                              <div className="mb-2 flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-[#17211B]">
                                  {formatDisplayTitle(ticket.title)}
                                </p>

                                <span
                                  className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(
                                    ticket.status
                                  )}`}
                                >
                                  {statusLabel(ticket.status)}
                                </span>
                              </div>

                              <p className="text-sm text-[#5E6B63]">
                                {getTicketLocationLabel(ticket)}
                              </p>
                            </div>

                            <p className={`text-sm font-semibold ${priorityClass(ticket.priority)}`}>
                              {priorityLabel(ticket.priority)}
                            </p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </ResponsiveSection>
          )}



          {/* =====================================================
              CHAMADOS EM ATENÇÃO
              ===================================================== */}

          <ResponsiveSection
            title={getAttentionBlockTitle()}
            description={getAttentionBlockDescription()}
            defaultOpenMobile={attentionTickets.length > 0}
          >
            <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
              <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-[#17211B]">
                    {getAttentionBlockTitle()}
                  </h2>

                  <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
                    {getAttentionBlockDescription()}
                  </p>
                </div>

                <Link
                  href="/portal/chamados?attention=true"
                  className="inline-flex h-10 items-center justify-center rounded-2xl border border-orange-200 bg-orange-50 px-4 text-sm font-semibold text-orange-700 transition hover:bg-orange-100"
                >
                  Ver chamados em atenção
                </Link>
              </div>

              {attentionTickets.length === 0 ? (
                <div className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-5 text-sm text-[#5E6B63]">
                  {getEmptyAttentionMessage()}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {attentionTickets.map((ticket) => {
                    const sla = getSlaInfo(ticket);

                    return (
                      <Link
                        key={ticket.id}
                        href={`/portal/chamados/${ticket.id}`}
                        className="block rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4 transition hover:border-orange-300 hover:bg-white"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(
                                  ticket.status
                                )}`}
                              >
                                {statusLabel(ticket.status)}
                              </span>

                              <span
                                className={`rounded-full border px-2 py-1 text-xs font-semibold ${priorityBadgeClass(
                                  ticket.priority
                                )}`}
                              >
                                {priorityLabel(ticket.priority)}
                              </span>

                              {(sla.status === "OVERDUE" ||
                                sla.status === "WARNING") && (
                                <span
                                  className={`rounded-full border px-2 py-1 text-xs font-semibold ${sla.className}`}
                                >
                                  {sla.label}
                                </span>
                              )}

                              {isSindicoPortal() && !ticket.assignedToUser && (
                                <span className="rounded-full border border-yellow-200 bg-yellow-50 px-2 py-1 text-xs font-semibold text-yellow-700">
                                  Sem responsável
                                </span>
                              )}
                            </div>

                            <p className="font-semibold text-[#17211B]">
                              {formatDisplayTitle(ticket.title)}
                            </p>

                            <p className="mt-1 text-sm text-[#5E6B63]">
                              {ticket.condominium?.name || "-"} •{" "}
                              {getTicketLocationLabel(ticket)}
                            </p>

                            <p className="mt-1 text-xs text-[#7A877F]">
                              Criado em{" "}
                              {new Date(ticket.createdAt).toLocaleString("pt-BR")}
                            </p>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          </ResponsiveSection>



          {/* =====================================================
              ATALHOS
              ===================================================== */}

          <ResponsiveSection
            title="Atalhos"
            description="Acessos rápidos para as principais áreas do portal."
            defaultOpenMobile={false}
          >
            <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Link
                href="/portal/chamados"
                className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-sm transition hover:border-[#256D3C]"
              >
                <p className="text-xl font-semibold text-[#17211B]">
                  {primaryTicketsLabel}
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  Consulte a lista completa, acompanhe status, mensagens públicas,
                  anexos, responsáveis e orientações de cada chamado.
                </p>
              </Link>

              <Link
                href="/portal/chamados"
                className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-sm transition hover:border-[#256D3C]"
              >
                <p className="text-xl font-semibold text-[#17211B]">
                  {primaryOpenTicketLabel}
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  Acesse a lista de chamados e use o botão de abertura para
                  registrar uma nova solicitação.
                </p>
              </Link>

              <div className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-sm">
                <p className="text-xl font-semibold text-[#17211B]">
                  Resumo por Origem
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  Veja a distribuição entre chamados de condomínio e chamados de
                  unidade.
                </p>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <Link
                    href="/portal/chamados?scope=condominium"
                    className="block rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-3 transition hover:border-[#256D3C] hover:bg-white"
                  >
                    <p className="text-[#7A877F]">Condomínio</p>
                    <strong className="text-2xl text-[#17211B]">
                      {metrics.condominiumScope}
                    </strong>
                  </Link>

                  <Link
                    href="/portal/chamados?scope=unit"
                    className="block rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-3 transition hover:border-[#256D3C] hover:bg-white"
                  >
                    <p className="text-[#7A877F]">Unidade</p>
                    <strong className="text-2xl text-[#17211B]">
                      {metrics.unitScope}
                    </strong>
                  </Link>
                </div>
              </div>
            </section>
          </ResponsiveSection>



          {/* =====================================================
              RECENTES + ATUALIZAÇÕES
              ===================================================== */}

          <ResponsiveSection
            title="Chamados Recentes e Atualizações"
            description="Últimos chamados e movimentações públicas do portal."
            defaultOpenMobile={false}
          >
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm xl:col-span-2">
                <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-[#17211B]">
                      Chamados Recentes
                    </h2>

                    <p className="text-sm text-[#5E6B63]">
                      Solicitações mais recentes disponíveis para o seu perfil.
                    </p>
                  </div>

                  <Link
                    href="/portal/chamados"
                    className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
                  >
                    Ver chamados
                  </Link>
                </div>

                {latestTickets.length === 0 ? (
                  <div className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-6 text-[#5E6B63]">
                    Nenhum chamado encontrado para este perfil de acesso.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {latestTickets.map((ticket) => {
                      const sla = getSlaInfo(ticket);

                      return (
                        <Link
                          key={ticket.id}
                          href={`/portal/chamados/${ticket.id}`}
                          className="block rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4 transition hover:border-[#256D3C] hover:bg-white"
                        >
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div>
                              <div className="mb-2 flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-[#17211B]">
                                  {formatDisplayTitle(ticket.title)}
                                </p>

                                <span
                                  className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(
                                    ticket.status
                                  )}`}
                                >
                                  {statusLabel(ticket.status)}
                                </span>

                                <span className="rounded-full border border-[#DDE5DF] bg-white px-2 py-1 text-xs font-semibold text-[#5E6B63]">
                                  {getTicketScopeLabel(ticket)}
                                </span>

                                {(sla.status === "OVERDUE" ||
                                  sla.status === "WARNING") && (
                                  <span
                                    className={`rounded-full border px-2 py-1 text-xs font-semibold ${sla.className}`}
                                  >
                                    {sla.label}
                                  </span>
                                )}
                              </div>

                              <p className="text-sm text-[#5E6B63]">
                                {ticket.condominium?.name || "-"} •{" "}
                                {getTicketLocationLabel(ticket)}
                              </p>

                              <p className="mt-1 text-xs text-[#7A877F]">
                                Criado em{" "}
                                {new Date(ticket.createdAt).toLocaleString("pt-BR")}
                              </p>

                              <p className="mt-2 text-sm text-[#17211B]">
                                {getLatestTicketGuidance(ticket)}
                              </p>
                            </div>

                            <div className="text-sm">
                              <p
                                className={`font-semibold ${priorityClass(
                                  ticket.priority
                                )}`}
                              >
                                {priorityLabel(ticket.priority)}
                              </p>

                              {isSindicoPortal() && (
                                <p className="text-[#7A877F]">
                                  {ticket.assignedToUser?.name || "Sem responsável"}
                                </p>
                              )}

                              {isMoradorOrProprietarioPortal() && (
                                <p className="text-[#7A877F]">
                                  Atendimento
                                </p>
                              )}
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>



              <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
                <h2 className="mb-2 text-xl font-semibold text-[#17211B]">
                  Atualizações Recentes
                </h2>

                <p className="mb-5 text-sm leading-6 text-[#5E6B63]">
                  Últimas movimentações públicas registradas no portal.
                </p>

                {latestLogs.length === 0 ? (
                  <div className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-5 text-sm text-[#5E6B63]">
                    Nenhuma atualização recente.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {latestLogs.map((log) => (
                      <Link
                        key={log.id}
                        href={`/portal/chamados/${log.ticketId}`}
                        className="block rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4 transition hover:border-[#256D3C] hover:bg-white"
                      >
                        <p className="text-sm font-semibold text-[#17211B]">
                          {formatDisplayTitle(log.ticketTitle)}
                        </p>

                        <p className="mt-1 text-sm text-[#5E6B63]">
                          {getPortalLogText(log)}
                        </p>

                        <p className="mt-2 text-xs text-[#7A877F]">
                          {log.user?.name || "Sistema"} •{" "}
                          {new Date(log.createdAt).toLocaleString("pt-BR")}
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </ResponsiveSection>
        </div>
      </PortalShell>
    </PortalContextGuard>
  );
}



/* =========================================================
   CARD PRINCIPAL DA VISÃO DO PORTAL
   ========================================================= */

function PortalMetricBox({
  title,
  value,
  description,
  href,
  highlighted = false,
}: {
  title: string;
  value: number;
  description?: string;
  href?: string;
  highlighted?: boolean;
}) {
  const content = (
    <div
      className={[
        "h-full rounded-2xl border bg-white p-4 shadow-sm transition",
        "hover:border-[#256D3C]/40 hover:bg-[#F9FBFA]",
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

      {description && (
        <p className="mt-1 text-xs text-[#5E6B63]">
          {description}
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
   CARD DE MÉTRICA
   ========================================================= */

function MetricCard({
  title,
  value,
  description,
  href,
  tone = "default",
}: {
  title: string;
  value: number;
  description?: string;
  href?: string;
  tone?: "default" | "green" | "yellow" | "red" | "orange" | "purple";
}) {
  const toneClass =
    tone === "green"
      ? "border-[#CFE6D4] bg-white text-[#256D3C]"
      : tone === "yellow"
        ? "border-yellow-200 bg-white text-yellow-800"
        : tone === "red"
          ? "border-red-200 bg-white text-red-700"
          : tone === "orange"
            ? "border-orange-200 bg-white text-orange-700"
            : tone === "purple"
              ? "border-purple-200 bg-white text-purple-700"
              : "border-[#DDE5DF] bg-white text-[#17211B]";

  const markerClass =
    tone === "green"
      ? "bg-[#256D3C]"
      : tone === "yellow"
        ? "bg-yellow-500"
        : tone === "red"
          ? "bg-red-600"
          : tone === "orange"
            ? "bg-orange-500"
            : tone === "purple"
              ? "bg-purple-600"
              : "bg-[#CFE6D4]";

  const content = (
    <div
      className={[
        "relative h-full overflow-hidden rounded-[24px] border p-5 shadow-sm transition",
        "hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(23,33,27,0.08)]",
        toneClass,
      ].join(" ")}
    >
      <span
        className={[
          "absolute left-0 top-5 h-8 w-1 rounded-r-full",
          markerClass,
        ].join(" ")}
      />

      <p className="pl-2 text-sm font-semibold opacity-80">{title}</p>

      <strong className="mt-1 block pl-2 text-4xl font-semibold tracking-tight">
        {value}
      </strong>

      {description && (
        <p className="mt-2 pl-2 text-xs leading-relaxed opacity-75">
          {description}
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
   CARD PEQUENO DE MÉTRICA
   ========================================================= */

function MiniMetricCard({
  title,
  value,
  href,
  tone = "default",
}: {
  title: string;
  value: number;
  href?: string;
  tone?: "default" | "green" | "yellow" | "red" | "orange" | "purple";
}) {
  const toneClass =
    tone === "green"
      ? "border-[#CFE6D4] bg-white text-[#256D3C]"
      : tone === "yellow"
        ? "border-yellow-200 bg-white text-yellow-800"
        : tone === "red"
          ? "border-red-200 bg-white text-red-700"
          : tone === "orange"
            ? "border-orange-200 bg-white text-orange-700"
            : tone === "purple"
              ? "border-purple-200 bg-white text-purple-700"
              : "border-[#DDE5DF] bg-white text-[#17211B]";

  const content = (
    <div className={`h-full rounded-2xl border p-4 shadow-sm transition hover:border-[#256D3C] ${toneClass}`}>
      <p className="text-sm opacity-80">{title}</p>
      <strong className="mt-1 block text-3xl font-semibold">{value}</strong>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}



/* =========================================================
   LINHA DO GRÁFICO DE DISTRIBUIÇÃO
   ========================================================= */

function DistributionRow({
  label,
  value,
  total,
  tone = "neutral",
}: {
  label: string;
  value: number;
  total: number;
  tone?: "neutral" | "green" | "warning" | "danger";
}) {
  const percent = percentage(value, total);

  const barClass =
    tone === "green"
      ? "bg-[#256D3C]"
      : tone === "warning"
        ? "bg-yellow-500"
        : tone === "danger"
          ? "bg-red-600"
          : "bg-[#8ED08E]";

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[#17211B]">
          {label}
        </p>

        <p className="text-sm font-semibold text-[#5E6B63]">
          {value}
          <span className="ml-1 text-xs font-medium text-[#9AA7A0]">
            {percent}%
          </span>
        </p>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-[#EDF2EF]">
        <div
          className={`h-full rounded-full ${barClass}`}
          style={{
            width: `${Math.max(percent, value > 0 ? 4 : 0)}%`,
          }}
        />
      </div>
    </div>
  );
}