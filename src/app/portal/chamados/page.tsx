"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import PortalContextGuard from "@/components/PortalContextGuard";
import PortalShell from "@/components/PortalShell";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";
import ResponsiveSection from "@/components/ui/ResponsiveSection";



/* =========================================================
   PORTAL DE CHAMADOS - ELOGEST

   ETAPA 35.6 — REVISÃO DO PORTAL DE CHAMADOS

   MORADOR / PROPRIETÁRIO:
   - vê chamados da própria unidade/morador;
   - abre chamado da própria unidade.

   SÍNDICO:
   - vê chamados do condomínio;
   - abre chamado do condomínio / área comum;
   - abre chamado de outra unidade;
   - não abre chamado da própria unidade no perfil de síndico.

   Regras reforçadas:
   - perfil administrativo não usa o portal;
   - síndico não seleciona a própria unidade;
   - moradores inativos não aparecem no select defensivamente;
   - unidades inativas não aparecem no select defensivamente, caso a API envie status;
   - modal fecha com reset seguro;
   - mensagem de sucesso após criação;
   - histórico/listagem continua preservado.

   ETAPA 37.3:
   - Página passa a ler filtros vindos do dashboard do portal.
   - Integração com:
     /portal/chamados?status=OPEN
     /portal/chamados?status=IN_PROGRESS
     /portal/chamados?status=RESOLVED
     /portal/chamados?status=CANCELED
     /portal/chamados?sla=overdue
     /portal/chamados?sla=warning
     /portal/chamados?priority=URGENT
     /portal/chamados?assigned=none
     /portal/chamados?attention=true
     /portal/chamados?scope=unit
     /portal/chamados?scope=condominium
   - Adicionados filtros de prioridade, atenção, SLA e sem responsável.
   - Cards internos também passam a filtrar.
   - Adicionado aviso visual quando filtro veio do dashboard.

   ETAPA 38.8 — POLIMENTO FINAL DE USABILIDADE DOS CHAMADOS

   - Revisão leve da lista do portal.
   - Cards passam a exibir "Orientação do chamado".
   - Chamados em atenção recebem destaque visual.
   - Textos do portal ficam alinhados com a experiência administrativa.
   - Mantida toda a lógica funcional já aprovada.

   ETAPA 39.14.2 — NOVO VISUAL COM PORTALSHELL

   Atualização:
   - Página passa a usar PortalShell.
   - Removidos LogoutButton, NotificationBell e ActiveAccessBadge da página.
   - Topbar, sidebar, sino, perfil ativo, logout e footer ficam no shell.
   - Layout migrado do tema escuro antigo para o padrão claro EloGest.
   - Modal, filtros, métricas, cards e estados vazios recebem visual novo.
   - Mantida toda a lógica funcional já existente.

   ETAPA 40.7.1 — CORREÇÃO DE LISTAGEM E ORDENAÇÃO DO PORTAL

   ETAPA 41.5.1 — PADRÃO PREMIUM LIMPO DA LISTA DO PORTAL

   Ajustes desta revisão:
   - Adicionada filtragem defensiva no front com base no perfil ativo.
   - MORADOR / PROPRIETARIO só visualizam chamados da unidade ativa.
   - Chamados de escopo CONDOMINIUM não aparecem na visão residencial.
   - SINDICO só visualiza chamados do condomínio ativo.
   - Evita exibir chamados que depois retornam "Chamado não encontrado".
   - Lista base passa a ser ordenada do mais recente para o mais antigo.
   - Filtros e métricas trabalham sobre a lista já sanitizada.
   - Contagem de perfis considera apenas perfis ativos.
   - Visual reduzido e menos colorido, alinhado à fila Admin aprovada.
   ========================================================= */



const TICKET_CATEGORIES = [
  "Manutenção",
  "Segurança",
  "Limpeza",
  "Portaria",
  "Financeiro",
  "Administrativo",
  "Barulho",
  "Garagem",
  "Elevador",
  "Áreas comuns",
  "Outros",
];

const ACTIVE_TICKET_STATUSES = ["OPEN", "IN_PROGRESS"];



/* =========================================================
   INTERFACES
   ========================================================= */

interface Morador {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  residentType?: string | null;
  status?: string | null;
}

interface Unidade {
  id?: string;
  block?: string | null;
  unitNumber: string;
  status?: string | null;
  residents?: Morador[];
}

interface TicketLog {
  id: string;
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
    name: string;
  } | null;

  createdByUser?: {
    name?: string;
  } | null;

  assignedToUser?: {
    name?: string;
  } | null;

  logs?: TicketLog[];
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

type TicketTarget = "CONDOMINIUM" | "MY_UNIT" | "UNIT";

type StatusFilter =
  | "ALL"
  | "OPEN"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "CANCELED";

type ScopeFilter = "ALL" | "CONDOMINIUM" | "UNIT";

type PriorityFilter = "ALL" | "LOW" | "MEDIUM" | "HIGH" | "URGENT";

type SlaFilter = "ALL" | "OVERDUE" | "WARNING";

interface TicketFormState {
  target: TicketTarget;
  unitId: string;
  residentId: string;
  title: string;
  description: string;
  category: string;
  priority: string;
}



/* =========================================================
   EXTRAIR QUANTIDADE DE PERFIS DISPONÍVEIS

   Considera apenas perfis ativos.
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
   HELPERS DE SEGURANÇA VISUAL

   A API /api/portal/chamados já deve retornar os chamados
   filtrados pelo perfil ativo.

   Mesmo assim, esta página aplica uma segunda camada defensiva
   para evitar que um chamado apareça na listagem e depois seja
   bloqueado no detalhe com "Chamado não encontrado".
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

    /*
      Na visão de MORADOR / PROPRIETARIO:
      - não mostrar chamados gerais do condomínio;
      - não mostrar chamados de outras unidades;
      - não usar role legado do usuário;
      - respeitar apenas o perfil ativo.
    */
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



function sanitizePortalTickets({
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



/* =========================================================
   FORMULÁRIO PADRÃO
   ========================================================= */

function getEmptyForm(role?: PortalRole): TicketFormState {
  return {
    target:
      role === "MORADOR" || role === "PROPRIETARIO"
        ? "MY_UNIT"
        : "CONDOMINIUM",
    unitId: "",
    residentId: "",
    title: "",
    description: "",
    category: "",
    priority: "MEDIUM",
  };
}



/* =========================================================
   PÁGINA
   ========================================================= */

export default function PortalChamadosPage() {
  return (
    <Suspense
      fallback={
        <EloGestLoadingScreen
          title="Carregando chamados..."
          description="Aguarde enquanto preparamos o portal de chamados."
        />
      }
    >
      <PortalChamadosContent />
    </Suspense>
  );
}



function PortalChamadosContent() {
  const searchParams = useSearchParams();

  const [role, setRole] = useState<PortalRole>("");
  const [user, setUser] = useState<PortalUser | null>(null);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [units, setUnits] = useState<Unidade[]>([]);

  const [hasPersonalUnit, setHasPersonalUnit] = useState(false);
  const [personalUnit, setPersonalUnit] = useState<Unidade | null>(null);

  const [accessCount, setAccessCount] = useState(0);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("ALL");
  const [slaFilter, setSlaFilter] = useState<SlaFilter>("ALL");
  const [assignedFilter, setAssignedFilter] = useState<"ALL" | "NONE">("ALL");
  const [attentionFilter, setAttentionFilter] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [urlFilterMessage, setUrlFilterMessage] = useState("");

  const [form, setForm] = useState<TicketFormState>(getEmptyForm());

  const canSwitchProfile = accessCount > 1;



  /* =========================================================
     MENSAGENS
     ========================================================= */

  function showSuccess(message: string) {
    setSuccess(message);
    setError("");

    window.setTimeout(() => {
      setSuccess("");
    }, 4500);
  }

  function showError(message: string) {
    setError(message);
    setSuccess("");
  }



  /* =========================================================
     MODAL
     ========================================================= */

  function openCreateModal() {
    setForm(getEmptyForm(role));
    setModalOpen(true);
  }

  function closeCreateModal() {
    if (creating) return;

    setForm(getEmptyForm(role));
    setModalOpen(false);
  }



  /* =========================================================
     CARREGAR CHAMADOS DO PORTAL
     ========================================================= */

  async function loadPortalChamados() {
    try {
      setLoading(true);
      setError("");
      setAccessDenied(false);

      const res = await fetch("/api/portal/chamados", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        showError(data?.error || "Erro ao carregar chamados.");
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

      const safeTickets = sanitizePortalTickets({
        tickets: receivedTickets,
        user: nextUser,
        role: nextRole,
      });

      setRole(nextRole);
      setUser(nextUser);
      setTickets(safeTickets);
      setUnits(Array.isArray(data.units) ? data.units : []);
      setHasPersonalUnit(!!data.hasPersonalUnit);
      setPersonalUnit(data.personalUnit || null);

      setForm((prev) => {
        if (nextRole === "MORADOR" || nextRole === "PROPRIETARIO") {
          return {
            ...prev,
            target: "MY_UNIT",
            unitId: "",
            residentId: "",
          };
        }

        if (nextRole === "SINDICO") {
          return {
            ...prev,
            target: "CONDOMINIUM",
            unitId: "",
            residentId: "",
          };
        }

        return prev;
      });
    } catch (err) {
      console.error(err);
      showError("Erro ao carregar chamados.");
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
     CRIAR CHAMADO PELO PORTAL
     ========================================================= */

  async function createTicket(e: React.FormEvent) {
    e.preventDefault();

    if (!form.title.trim() || !form.description.trim()) {
      alert("Informe título e descrição.");
      return;
    }

    if (role === "SINDICO" && form.target === "UNIT" && !form.unitId) {
      alert("Selecione a unidade.");
      return;
    }

    if (role === "SINDICO" && form.target === "MY_UNIT") {
      alert(
        canSwitchProfile
          ? "Para abrir chamado da sua própria unidade, troque o perfil para Morador ou Proprietário."
          : "Este usuário não possui outro perfil de acesso disponível para abertura como morador ou proprietário."
      );
      return;
    }

    if (
      role === "SINDICO" &&
      form.target === "UNIT" &&
      personalUnit?.id &&
      form.unitId === personalUnit.id
    ) {
      alert(
        canSwitchProfile
          ? "No perfil de síndico, abra chamados apenas para outras unidades. Para sua unidade, troque para Morador ou Proprietário."
          : "No perfil de síndico, abra chamados apenas para outras unidades. Este usuário não possui outro perfil disponível para abrir chamado da própria unidade."
      );
      return;
    }

    try {
      setCreating(true);

      const payload: any = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category || null,
        priority: form.priority || "MEDIUM",
      };

      if (role === "SINDICO") {
        if (form.target === "CONDOMINIUM") {
          payload.scope = "CONDOMINIUM";
        }

        if (form.target === "UNIT") {
          payload.scope = "UNIT";
          payload.unitId = form.unitId;

          if (form.residentId) {
            payload.residentId = form.residentId;
          }
        }
      }

      const res = await fetch("/api/portal/chamados", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error || "Erro ao criar chamado.");
        return;
      }

      setForm(getEmptyForm(role));
      setModalOpen(false);

      await loadPortalChamados();

      showSuccess(
        "Chamado criado com sucesso. Você pode acompanhar o andamento pela lista."
      );
    } catch (err) {
      console.error(err);
      alert("Erro ao criar chamado.");
    } finally {
      setCreating(false);
    }
  }



  /* =========================================================
     INIT
     ========================================================= */

  useEffect(() => {
    loadPortalChamados();
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
      IN_PROGRESS: "border-[#DDE5DF] bg-white text-[#5E6B63]",
      RESOLVED: "border-[#CFE6D4] bg-[#F9FBFA] text-[#256D3C]",
      CANCELED: "border-[#DDE5DF] bg-white text-[#5E6B63]",
    }[status] || "border-[#DDE5DF] bg-white text-[#5E6B63]");

  const priorityTextClass = (priority?: string | null) =>
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
      HIGH: "border-orange-200 bg-white text-orange-700",
      URGENT: "border-red-200 bg-white text-red-700",
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

  function getPageTitle() {
    if (isSindicoPortal()) {
      return "Chamados do condomínio";
    }

    return "Meus chamados";
  }

  function getPageDescription() {
    if (isSindicoPortal()) {
      return "Acompanhe as solicitações do condomínio, áreas comuns e unidades vinculadas ao seu perfil de acesso.";
    }

    return "Acompanhe seus chamados, mensagens, status e atualizações do atendimento.";
  }

  function getOpenTicketButtonLabel() {
    if (isSindicoPortal()) {
      return "Abrir chamado";
    }

    return "Abrir meu chamado";
  }

  function getModalTitle() {
    if (isSindicoPortal()) {
      return "Novo chamado do condomínio";
    }

    return "Novo chamado";
  }

  function getModalDescription() {
    if (isSindicoPortal()) {
      return "Registre uma solicitação relacionada ao condomínio, área comum ou outra unidade.";
    }

    return "Descreva sua solicitação com detalhes para facilitar o atendimento.";
  }

  function residentTypeLabel(type?: string | null) {
    return (
      {
        PROPRIETARIO: "Proprietário",
        INQUILINO: "Inquilino",
        FAMILIAR: "Familiar",
        RESPONSAVEL: "Responsável",
        OUTRO: "Outro",
      }[type || ""] || type || ""
    );
  }

  function getUnitLabel(unit?: Unidade | null) {
    if (!unit) return "-";

    return `${unit.block ? `Bloco ${unit.block} - ` : ""}Unidade ${
      unit.unitNumber
    }`;
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

  function getFullLocationLabel(ticket: Ticket) {
    const condominiumName = ticket.condominium?.name || "Condomínio não informado";

    if (ticket.scope === "CONDOMINIUM") {
      return `${condominiumName} • Área comum`;
    }

    if (ticket.unit) {
      return `${condominiumName} • ${getUnitLabel(ticket.unit)}`;
    }

    return condominiumName;
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

  function getOriginLine(ticket: Ticket) {
    const senderName =
      ticket.resident?.name ||
      ticket.createdByUser?.name ||
      "Solicitante não identificado";

    return `Enviado por ${senderName} • ${getFullLocationLabel(ticket)}`;
  }

  function shouldShowSlaBadge(ticket: Ticket) {
    const sla = getSlaInfo(ticket);

    return sla.status === "OVERDUE" || sla.status === "WARNING";
  }

  function getLatestLog(ticket: Ticket) {
    const logs = ticket.logs || [];

    if (logs.length === 0) return null;

    return [...logs].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
  }

  function getLatestMovementLabel(ticket: Ticket) {
    const latestLog = getLatestLog(ticket);

    if (!latestLog) return "Sem movimentação recente.";

    if (latestLog.action === "CREATED") return "Chamado criado.";
    if (latestLog.action === "STATUS_CHANGED") return "Status atualizado.";
    if (latestLog.action === "ASSIGNED") return "Responsável atribuído.";
    if (latestLog.action === "COMMENT_PUBLIC") return "Mensagem registrada.";
    if (latestLog.action === "ATTACHMENT_ADDED") return "Anexo adicionado.";
    if (latestLog.action === "ATTACHMENT_REMOVED") return "Anexo removido.";

    return "Movimentação registrada.";
  }

  function isPersonalUnitTicket(ticket: Ticket) {
    if (!personalUnit?.id) return false;

    return (
      ticket.unit?.id === personalUnit.id ||
      (!!user?.residentId && ticket.resident?.id === user.residentId)
    );
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
    const isOverdue = remainingHours <= 0;

    const warningThreshold = Math.max(2, Math.ceil(limitHours * 0.25));
    const isWarning = !isOverdue && remainingHours <= warningThreshold;

    if (isOverdue) {
      return {
        limitHours,
        elapsedHours,
        remainingHours,
        status: "OVERDUE",
        isOverdue,
        isWarning,
        label: "Em atenção",
        className: "border-red-200 bg-white text-red-700",
      };
    }

    if (isWarning) {
      return {
        limitHours,
        elapsedHours,
        remainingHours,
        status: "WARNING",
        isOverdue,
        isWarning,
        label: "Acompanhamento prioritário",
        className: "border-orange-200 bg-white text-orange-700",
      };
    }

    return {
      limitHours,
      elapsedHours,
      remainingHours,
      status: "OK",
      isOverdue,
      isWarning,
      label: "Em acompanhamento",
      className: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
    };
  }

  function getTicketShortDescription(ticket: Ticket) {
    const description = String(ticket.description || "").trim();

    if (!description) return "Sem descrição informada.";

    if (description.length <= 220) return description;

    return `${description.slice(0, 220).trim()}...`;
  }

  function getTicketCardClass(ticket: Ticket) {
    const sla = getSlaInfo(ticket);

    if (isActiveTicket(ticket) && sla.status === "OVERDUE") {
      return "border-red-200 bg-white";
    }

    if (isActiveTicket(ticket) && sla.status === "WARNING") {
      return "border-orange-200 bg-white";
    }

    return "border-[#DDE5DF] bg-white";
  }

  function getPortalTicketGuidance(ticket: Ticket) {
    const sla = getSlaInfo(ticket);

    if (ticket.status === "OPEN") {
      if (!ticket.assignedToUser) {
        return isSindicoPortal()
          ? "Aguardando atribuição ou início do atendimento pela administradora."
          : "Seu chamado foi registrado e está aguardando início do atendimento.";
      }

      return `Chamado aguardando início do atendimento com ${
        ticket.assignedToUser.name
      }.`;
    }

    if (ticket.status === "IN_PROGRESS") {
      if (sla.status === "OVERDUE") {
        return "Este chamado está em atenção. Acompanhe as atualizações e envie informações complementares se necessário.";
      }

      if (sla.status === "WARNING") {
        return "Este chamado está em acompanhamento prioritário. Verifique se há mensagens recentes no detalhe.";
      }

      return "Chamado em atendimento. Use o detalhe para acompanhar mensagens, anexos e movimentações.";
    }

    if (ticket.status === "RESOLVED") {
      return "Chamado resolvido. Acesse o detalhe para revisar o histórico e avaliar o atendimento, quando disponível.";
    }

    if (ticket.status === "CANCELED") {
      return "Chamado cancelado. Caso ainda precise de atendimento, abra um novo chamado.";
    }

    return "Acompanhe o andamento deste chamado pelo detalhe.";
  }

  function getListHelperText() {
    if (filteredTickets.length === 0) {
      return "Nenhum chamado encontrado com os filtros atuais.";
    }

    if (attentionFilter || slaFilter !== "ALL" || assignedFilter === "NONE") {
      return "A lista está focada em chamados que exigem maior acompanhamento.";
    }

    if (statusFilter !== "ALL" || scopeFilter !== "ALL" || priorityFilter !== "ALL") {
      return "A lista está filtrada conforme os critérios selecionados.";
    }

    return isSindicoPortal()
      ? "Veja abaixo os chamados vinculados ao condomínio e às unidades permitidas para o seu perfil."
      : "Veja abaixo seus chamados e acompanhe o andamento pelo detalhe.";
  }

  function getActiveFilterSummary() {
    const filters: string[] = [];

    if (statusFilter !== "ALL") {
      filters.push(`Status: ${statusLabel(statusFilter)}`);
    }

    if (scopeFilter === "CONDOMINIUM") {
      filters.push("Origem: Condomínio");
    }

    if (scopeFilter === "UNIT") {
      filters.push("Origem: Unidade");
    }

    if (priorityFilter !== "ALL") {
      filters.push(`Prioridade: ${priorityLabel(priorityFilter)}`);
    }

    if (attentionFilter) {
      filters.push("Em atenção");
    }

    if (slaFilter === "OVERDUE") {
      filters.push("Prazo vencido");
    }

    if (slaFilter === "WARNING") {
      filters.push("Próximo do prazo");
    }

    if (assignedFilter === "NONE") {
      filters.push("Sem responsável");
    }

    if (searchTerm.trim()) {
      filters.push(`Busca: "${searchTerm.trim()}"`);
    }

    return filters;
  }



  /* =========================================================
     FILTROS VINDOS DA URL / DASHBOARD
     ========================================================= */

  function applyUrlFilters() {
    const status = searchParams.get("status");
    const scope = searchParams.get("scope");
    const priority = searchParams.get("priority");
    const sla = searchParams.get("sla");
    const assigned = searchParams.get("assigned");
    const attention = searchParams.get("attention");

    const appliedMessages: string[] = [];

    setStatusFilter("ALL");
    setScopeFilter("ALL");
    setPriorityFilter("ALL");
    setSlaFilter("ALL");
    setAssignedFilter("ALL");
    setAttentionFilter(false);
    setSearchTerm("");

    if (
      status === "OPEN" ||
      status === "IN_PROGRESS" ||
      status === "RESOLVED" ||
      status === "CANCELED"
    ) {
      setStatusFilter(status);
      appliedMessages.push(`Status: ${statusLabel(status)}`);
    }

    if (scope === "unit") {
      setScopeFilter("UNIT");
      appliedMessages.push("Origem: Unidade");
    }

    if (scope === "condominium") {
      setScopeFilter("CONDOMINIUM");
      appliedMessages.push("Origem: Condomínio");
    }

    if (
      priority === "LOW" ||
      priority === "MEDIUM" ||
      priority === "HIGH" ||
      priority === "URGENT"
    ) {
      setPriorityFilter(priority);
      appliedMessages.push(`Prioridade: ${priorityLabel(priority)}`);
    }

    if (sla === "overdue") {
      setSlaFilter("OVERDUE");
      appliedMessages.push("Em atenção");
    }

    if (sla === "warning" || sla === "near_due") {
      setSlaFilter("WARNING");
      appliedMessages.push("Acompanhamento prioritário");
    }

    if (assigned === "none") {
      setAssignedFilter("NONE");
      appliedMessages.push("Sem responsável");
    }

    if (attention === "true") {
      setAttentionFilter(true);
      appliedMessages.push("Solicitações em atenção");
    }

    setUrlFilterMessage(
      appliedMessages.length > 0
        ? `Filtro vindo do Dashboard portal aplicado: ${appliedMessages.join(" • ")}.`
        : ""
    );
  }

  useEffect(() => {
    applyUrlFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);



  /* =========================================================
     LIMPAR FILTROS
     ========================================================= */

  function clearAllFilters() {
    setStatusFilter("ALL");
    setScopeFilter("ALL");
    setPriorityFilter("ALL");
    setSlaFilter("ALL");
    setAssignedFilter("ALL");
    setAttentionFilter(false);
    setSearchTerm("");
    setUrlFilterMessage("");

    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/portal/chamados");
    }
  }



  /* =========================================================
     SELECTS DINÂMICOS
     ========================================================= */

  const activeUnits = useMemo(() => {
    return units.filter((unit) => {
      return !unit.status || unit.status === "ACTIVE";
    });
  }, [units]);

  const syndicSelectableUnits = useMemo(() => {
    const baseUnits = role === "SINDICO" ? activeUnits : activeUnits;

    if (role !== "SINDICO") {
      return baseUnits;
    }

    return baseUnits.filter((unit) => {
      const sameAsPersonalUnit =
        !!personalUnit?.id && unit.id === personalUnit.id;

      const sameAsUserUnit = !!user?.unitId && unit.id === user.unitId;

      const hasLoggedResident =
        !!user?.residentId &&
        Array.isArray(unit.residents) &&
        unit.residents.some((resident) => resident.id === user.residentId);

      const hasLoggedUserEmail =
        !!user?.email &&
        Array.isArray(unit.residents) &&
        unit.residents.some((resident) => {
          return (
            String(resident.email || "").toLowerCase() ===
            String(user.email || "").toLowerCase()
          );
        });

      return !(
        sameAsPersonalUnit ||
        sameAsUserUnit ||
        hasLoggedResident ||
        hasLoggedUserEmail
      );
    });
  }, [role, activeUnits, personalUnit, user]);

  const selectedUnit = useMemo(() => {
    if (!form.unitId) return null;

    return syndicSelectableUnits.find((unit) => unit.id === form.unitId) || null;
  }, [syndicSelectableUnits, form.unitId]);

  const selectedUnitResidents = useMemo(() => {
    return (selectedUnit?.residents || []).filter((resident) => {
      return !resident.status || resident.status === "ACTIVE";
    });
  }, [selectedUnit]);



  /* =========================================================
     MÉTRICAS
     ========================================================= */

  const metrics = useMemo(() => {
    const activeTickets = tickets.filter((ticket) => isActiveTicket(ticket));

    return {
      total: tickets.length,
      open: tickets.filter((ticket) => ticket.status === "OPEN").length,
      progress: tickets.filter((ticket) => ticket.status === "IN_PROGRESS")
        .length,
      resolved: tickets.filter((ticket) => ticket.status === "RESOLVED").length,
      canceled: tickets.filter((ticket) => ticket.status === "CANCELED").length,
      condominium: tickets.filter((ticket) => ticket.scope === "CONDOMINIUM")
        .length,
      unit: tickets.filter((ticket) => ticket.scope !== "CONDOMINIUM").length,
      urgent: activeTickets.filter((ticket) => ticket.priority === "URGENT")
        .length,
      overdue: activeTickets.filter(
        (ticket) => getSlaInfo(ticket).status === "OVERDUE"
      ).length,
      warning: activeTickets.filter(
        (ticket) => getSlaInfo(ticket).status === "WARNING"
      ).length,
      unassigned: activeTickets.filter((ticket) => !ticket.assignedToUser)
        .length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, role]);



  /* =========================================================
     FILTROS
     ========================================================= */

  const filteredTickets = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return tickets.filter((ticket) => {
      const sla = getSlaInfo(ticket);

      const matchesStatus =
        statusFilter === "ALL" || ticket.status === statusFilter;

      const matchesScope =
        scopeFilter === "ALL" ||
        (scopeFilter === "CONDOMINIUM" &&
          ticket.scope === "CONDOMINIUM") ||
        (scopeFilter === "UNIT" && ticket.scope !== "CONDOMINIUM");

      const matchesPriority =
        priorityFilter === "ALL" || ticket.priority === priorityFilter;

      const matchesSla =
        slaFilter === "ALL" ||
        (slaFilter === "OVERDUE" &&
          isActiveTicket(ticket) &&
          sla.status === "OVERDUE") ||
        (slaFilter === "WARNING" &&
          isActiveTicket(ticket) &&
          sla.status === "WARNING");

      const matchesAssigned =
        assignedFilter === "ALL" ||
        (assignedFilter === "NONE" &&
          isActiveTicket(ticket) &&
          !ticket.assignedToUser);

      const matchesAttention =
        !attentionFilter ||
        (isActiveTicket(ticket) &&
          (sla.status === "OVERDUE" ||
            sla.status === "WARNING" ||
            ticket.priority === "URGENT" ||
            !ticket.assignedToUser));

      const searchable = [
        ticket.title,
        ticket.description,
        ticket.category,
        ticket.priority,
        ticket.status,
        ticket.condominium?.name,
        getTicketLocationLabel(ticket),
        ticket.resident?.name,
        ticket.createdByUser?.name,
        ticket.assignedToUser?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !term || searchable.includes(term);

      return (
        matchesStatus &&
        matchesScope &&
        matchesPriority &&
        matchesSla &&
        matchesAssigned &&
        matchesAttention &&
        matchesSearch
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tickets,
    statusFilter,
    scopeFilter,
    priorityFilter,
    slaFilter,
    assignedFilter,
    attentionFilter,
    searchTerm,
    personalUnit,
    user,
    role,
  ]);

  const sortedFilteredTickets = useMemo(() => {
    return [...filteredTickets].sort((a, b) => {
      /*
        Quando há filtro de atenção/SLA/sem responsável, mantemos
        priorização por criticidade. Em empate, mais recentes primeiro.

        Quando não há filtro crítico, a experiência padrão é:
        mais recentes primeiro.
      */
      const useCriticalOrdering =
        attentionFilter || slaFilter !== "ALL" || assignedFilter === "NONE";

      if (useCriticalOrdering) {
        const slaA = getSlaInfo(a);
        const slaB = getSlaInfo(b);

        if (isActiveTicket(a) && !isActiveTicket(b)) return -1;
        if (!isActiveTicket(a) && isActiveTicket(b)) return 1;

        if (slaA.status === "OVERDUE" && slaB.status !== "OVERDUE") return -1;
        if (slaA.status !== "OVERDUE" && slaB.status === "OVERDUE") return 1;

        if (slaA.status === "WARNING" && slaB.status !== "WARNING") return -1;
        if (slaA.status !== "WARNING" && slaB.status === "WARNING") return 1;

        if (!a.assignedToUser && b.assignedToUser) return -1;
        if (a.assignedToUser && !b.assignedToUser) return 1;

        if (a.priority === "URGENT" && b.priority !== "URGENT") return -1;
        if (a.priority !== "URGENT" && b.priority === "URGENT") return 1;
      }

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredTickets, attentionFilter, slaFilter, assignedFilter, role]);

  const hasAdvancedFilters =
    searchTerm.trim() !== "" ||
    priorityFilter !== "ALL" ||
    slaFilter !== "ALL" ||
    assignedFilter !== "ALL" ||
    attentionFilter;

  const hasAnyFilter =
    statusFilter !== "ALL" ||
    scopeFilter !== "ALL" ||
    hasAdvancedFilters ||
    !!urlFilterMessage;

  const activeFilterSummary = getActiveFilterSummary();



  /* =========================================================
     LOADING
     ========================================================= */

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando chamados..."
        description="Aguarde enquanto identificamos seu perfil de acesso e carregamos a lista de chamados."
      />
    );
  }



  /* =========================================================
     ACESSO RESTRITO
     ========================================================= */

  if (accessDenied) {
    return (
      <PortalContextGuard
        fallbackTitle="Portal de chamados indisponível neste perfil de acesso"
        fallbackDescription="A lista de chamados do portal é destinada a síndicos, moradores e proprietários. Para acessar dados administrativos, utilize a área admin."
      >
        <PortalShell
          current="chamados"
          title="Portal de chamados"
          description="Este portal é destinado a síndicos, moradores e proprietários."
          canSwitchProfile={canSwitchProfile}
        >
          <section className="rounded-[32px] border border-red-200 bg-white p-8 shadow-sm">
            <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
              Acesso restrito
            </span>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[#17211B]">
              Portal de chamados
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5E6B63]">
              Este portal é destinado exclusivamente a síndicos, proprietários e
              moradores.
            </p>

            {error && (
              <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
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
      fallbackTitle="Portal de chamados indisponível neste perfil de acesso"
      fallbackDescription="A lista de chamados do portal é destinada a síndicos, moradores e proprietários. Para acessar dados administrativos, utilize a área admin."
    >
      <PortalShell
        current="chamados"
        title={getPageTitle()}
        description={getPageDescription()}
        canSwitchProfile={canSwitchProfile}
      >
        <div className="space-y-6">
          {/* =====================================================
              TOPO
              ===================================================== */}

          <section className="rounded-[32px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-1 text-xs font-semibold text-[#256D3C]">
                    {getRoleLabel(role)}
                  </span>

                  <span className="inline-flex rounded-full border border-[#DDE5DF] bg-[#F6F8F7] px-3 py-1 text-xs font-semibold text-[#5E6B63]">
                    Portal de chamados
                  </span>
                </div>

                <h1 className="text-3xl font-semibold tracking-tight text-[#17211B] sm:text-4xl">
                  {getPageTitle()}
                </h1>

                <p className="mt-3 max-w-4xl text-sm leading-6 text-[#5E6B63]">
                  {getPageDescription()}
                </p>

                {role === "SINDICO" && hasPersonalUnit && (
                  <div className="mt-4 rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm leading-6 text-yellow-800">
                    Sua unidade pessoal é{" "}
                    <strong>{getUnitLabel(personalUnit)}</strong>.
                    {canSwitchProfile
                      ? " Para abrir chamado dessa unidade, troque o perfil para Morador ou Proprietário."
                      : " Este usuário não possui outro perfil de acesso disponível para abertura como morador ou proprietário."}
                  </div>
                )}
              </div>

              <div className="flex shrink-0 xl:min-w-[260px]">
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-[#256D3C] px-6 text-sm font-semibold text-white transition hover:bg-[#1F5A32] xl:w-auto xl:min-w-[220px]"
                >
                  {getOpenTicketButtonLabel()}
                </button>
              </div>
            </div>
          </section>



          {/* =====================================================
              MENSAGENS
              ===================================================== */}

          {urlFilterMessage && (
            <div className="rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] p-4 text-sm text-[#256D3C]">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <span>{urlFilterMessage}</span>

                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="inline-flex h-10 items-center justify-center rounded-2xl bg-[#256D3C] px-4 text-sm font-semibold text-white transition hover:bg-[#1F5A32]"
                >
                  Limpar filtro do Dashboard portal
                </button>
              </div>
            </div>
          )}

          {success && (
            <div className="rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] p-4 text-sm font-semibold text-[#256D3C]">
              {success}
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}



          {/* =====================================================
              MODAL NOVO CHAMADO
              ===================================================== */}

          {modalOpen && (
            <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#17211B]/65 p-4 backdrop-blur-sm">
              <div className="my-6 max-h-[calc(100vh-3rem)] w-full max-w-2xl overflow-y-auto rounded-[32px] border border-[#DDE5DF] bg-white p-6 shadow-2xl">
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-semibold text-[#17211B]">
                      {getModalTitle()}
                    </h2>

                    <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
                      {getModalDescription()}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={closeCreateModal}
                    disabled={creating}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white text-[#5E6B63] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                    aria-label="Fechar"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={createTicket} className="space-y-4">
                  {role === "SINDICO" && (
                    <div className="rounded-[28px] border border-[#DDE5DF] bg-[#F6F8F7] p-4">
                      <FormField label="Tipo de chamado">
                        <select
                          value={form.target}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              target: e.target.value as TicketTarget,
                              unitId: "",
                              residentId: "",
                            }))
                          }
                          className="form-input"
                        >
                          <option value="CONDOMINIUM">
                            Condomínio / Área comum
                          </option>

                          <option value="UNIT">Outra unidade</option>
                        </select>
                      </FormField>

                      <p className="mt-2 text-xs leading-5 text-[#7A877F]">
                        Use “Condomínio / Área comum” para portaria, elevador,
                        garagem, limpeza, segurança e demais temas coletivos.
                      </p>

                      {hasPersonalUnit && (
                        <p className="mt-2 text-xs leading-5 text-yellow-700">
                          Sua unidade pessoal não aparece na opção “Outra unidade”.
                          {canSwitchProfile
                            ? " Para abrir chamado dessa unidade, use o perfil de Morador ou Proprietário."
                            : " Este usuário não possui outro perfil de acesso disponível para abertura dessa unidade."}
                        </p>
                      )}
                    </div>
                  )}

                  {(role === "MORADOR" || role === "PROPRIETARIO") && (
                    <div className="rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-4 text-sm leading-6 text-[#5E6B63]">
                      Este chamado será registrado para sua própria unidade. Após a
                      abertura, você poderá acompanhar mensagens, anexos e status pela
                      lista de chamados.
                    </div>
                  )}

                  {role === "SINDICO" && form.target === "UNIT" && (
                    <>
                      <FormField label="Unidade" required>
                        <select
                          value={form.unitId}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              unitId: e.target.value,
                              residentId: "",
                            }))
                          }
                          className="form-input"
                        >
                          <option value="">Selecione uma unidade</option>

                          {syndicSelectableUnits.map((unit) => (
                            <option key={unit.id} value={unit.id}>
                              {getUnitLabel(unit)}
                            </option>
                          ))}
                        </select>

                        {syndicSelectableUnits.length === 0 && (
                          <p className="mt-2 text-xs text-yellow-700">
                            Não há outras unidades disponíveis para abertura de
                            chamado neste condomínio.
                          </p>
                        )}
                      </FormField>

                      <FormField label="Morador vinculado ao chamado">
                        <select
                          value={form.residentId}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              residentId: e.target.value,
                            }))
                          }
                          disabled={!form.unitId || selectedUnitResidents.length === 0}
                          className="form-input disabled:opacity-60"
                        >
                          <option value="">
                            {form.unitId
                              ? "Sem morador específico"
                              : "Selecione primeiro uma unidade"}
                          </option>

                          {selectedUnitResidents.map((resident) => (
                            <option key={resident.id} value={resident.id}>
                              {resident.name}
                              {residentTypeLabel(resident.residentType)
                                ? ` — ${residentTypeLabel(resident.residentType)}`
                                : ""}
                            </option>
                          ))}
                        </select>

                        {form.unitId && selectedUnitResidents.length === 0 && (
                          <p className="mt-1 text-xs text-yellow-700">
                            Esta unidade não possui morador ativo cadastrado.
                          </p>
                        )}

                        {form.unitId && selectedUnitResidents.length > 0 && (
                          <p className="mt-1 text-xs text-[#7A877F]">
                            Campo opcional. Use quando a ocorrência estiver ligada a
                            um morador específico.
                          </p>
                        )}
                      </FormField>
                    </>
                  )}

                  <FormField label="Título" required>
                    <input
                      value={form.title}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          title: e.target.value,
                        }))
                      }
                      className="form-input"
                      placeholder="Ex: Vazamento no banheiro, barulho excessivo, portão com defeito..."
                    />

                    <p className="mt-1 text-xs text-[#7A877F]">
                      Use um título curto e objetivo para facilitar a identificação.
                    </p>
                  </FormField>

                  <FormField label="Categoria">
                    <select
                      value={form.category}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          category: e.target.value,
                        }))
                      }
                      className="form-input"
                    >
                      <option value="">Selecione uma categoria</option>

                      {TICKET_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </FormField>

                  <FormField label="Prioridade">
                    <select
                      value={form.priority}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          priority: e.target.value,
                        }))
                      }
                      className="form-input"
                    >
                      <option value="LOW">Baixa</option>
                      <option value="MEDIUM">Média</option>
                      <option value="HIGH">Alta</option>
                      <option value="URGENT">Urgente</option>
                    </select>

                    <p className="mt-1 text-xs text-[#7A877F]">
                      Use “Urgente” apenas para situações que exigem atenção imediata
                      ou possam causar risco, prejuízo ou interrupção importante.
                    </p>
                  </FormField>

                  <FormField label="Descrição" required>
                    <textarea
                      value={form.description}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          description: e.target.value,
                        }))
                      }
                      rows={5}
                      className="form-input min-h-[140px] resize-y"
                      placeholder="Descreva o que aconteceu, onde ocorreu, desde quando acontece e qualquer detalhe que ajude no atendimento."
                    />

                    <p className="mt-1 text-xs text-[#7A877F]">
                      Após criar o chamado, você poderá anexar fotos ou documentos na
                      tela de detalhes.
                    </p>
                  </FormField>

                  <div className="flex justify-end gap-3 pt-4">
                    <button
                      type="button"
                      onClick={closeCreateModal}
                      disabled={creating}
                      className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#17211B] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                    >
                      Cancelar
                    </button>

                    <button
                      type="submit"
                      disabled={creating}
                      className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
                    >
                      {creating ? "Criando..." : "Criar chamado"}
                    </button>
                  </div>
                </form>
              </div>
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
                    Visão dos Chamados
                  </h2>

                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5E6B63]">
                    Resumo das solicitações vinculadas ao seu perfil de acesso, com foco nos chamados ativos e no acompanhamento do atendimento.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:min-w-[620px] xl:grid-cols-4">
                  <MetricCard
                    title="Total"
                    value={metrics.total}
                    description="Todos os chamados"
                    onClick={clearAllFilters}
                  />

                  <MetricCard
                    title="Abertos"
                    value={metrics.open}
                    description="Aguardando início"
                    tone="blue"
                    onClick={() => setStatusFilter("OPEN")}
                  />

                  <MetricCard
                    title="Em andamento"
                    value={metrics.progress}
                    description="Em atendimento"
                    tone="yellow"
                    onClick={() => setStatusFilter("IN_PROGRESS")}
                  />

                  <MetricCard
                    title="Resolvidos"
                    value={metrics.resolved}
                    description="Finalizados"
                    tone="green"
                    onClick={() => setStatusFilter("RESOLVED")}
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-0 divide-y divide-[#DDE5DF] md:grid-cols-3 md:divide-x md:divide-y-0">
              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Origem dos chamados
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  {metrics.condominium} chamado(s) do condomínio e {metrics.unit} chamado(s) de unidade.
                </p>
              </div>

              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Atenção
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  {metrics.overdue > 0 || metrics.warning > 0 || metrics.unassigned > 0
                    ? `${metrics.overdue + metrics.warning + metrics.unassigned} chamado(s) pedem acompanhamento mais próximo.`
                    : "Nenhum chamado ativo exige atenção especial no momento."}
                </p>
              </div>

              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Resultado atual
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  Exibindo <strong className="text-[#17211B]">{sortedFilteredTickets.length}</strong>{" "}
                  chamado(s) conforme filtros aplicados.
                </p>
              </div>
            </div>
          </section>



          {/* =====================================================
              PRIORIDADES DO PORTAL
              ===================================================== */}

          <ResponsiveSection
            title="Prioridades dos Chamados"
            description="Indicadores para acompanhar chamados que exigem maior atenção."
            defaultOpenMobile={metrics.overdue > 0 || metrics.warning > 0 || metrics.unassigned > 0}
          >
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
              <MetricCard
                title="Em atenção"
                value={metrics.overdue}
                description="Fora do prazo"
                tone={metrics.overdue > 0 ? "red" : "default"}
                onClick={() => setSlaFilter("OVERDUE")}
              />

              <MetricCard
                title="Prioritário"
                value={metrics.warning}
                description="Próximos do limite"
                tone={metrics.warning > 0 ? "orange" : "default"}
                onClick={() => setSlaFilter("WARNING")}
              />

              <MetricCard
                title="Sem responsável"
                value={metrics.unassigned}
                description="Aguardando atribuição"
                tone={metrics.unassigned > 0 ? "orange" : "default"}
                onClick={() => setAssignedFilter("NONE")}
              />

              <MetricCard
                title="Urgentes"
                value={metrics.urgent}
                description="Alta criticidade"
                tone={metrics.urgent > 0 ? "red" : "default"}
                onClick={() => setPriorityFilter("URGENT")}
              />

              <MetricCard
                title="Condomínio"
                value={metrics.condominium}
                description="Áreas comuns"
                onClick={() => setScopeFilter("CONDOMINIUM")}
              />

              <MetricCard
                title="Unidades"
                value={metrics.unit}
                description="Chamados por unidade"
                onClick={() => setScopeFilter("UNIT")}
              />
            </section>
          </ResponsiveSection>



          {/* =====================================================
              FILTROS
              ===================================================== */}

          <ResponsiveSection
            title="Filtros da Lista"
            description="Refine a visualização por texto, status, origem, prioridade ou atenção."
            defaultOpenMobile
          >
            <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-sm">
              <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-[#17211B]">
                    Filtros da Lista
                  </h2>

                  <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
                    Encontre chamados por status, origem, prioridade, atenção ou palavras-chave.
                  </p>
                </div>

                {hasAnyFilter && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#1F5A32]"
                  >
                    Limpar todos os filtros
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-6">
                <FormField label="Buscar">
                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="form-input"
                    placeholder="Buscar por título, unidade, morador, categoria..."
                  />
                </FormField>

                <FormField label="Status">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    className="form-input"
                  >
                    <option value="ALL">Todos</option>
                    <option value="OPEN">Abertos</option>
                    <option value="IN_PROGRESS">Em andamento</option>
                    <option value="RESOLVED">Resolvidos</option>
                    <option value="CANCELED">Cancelados</option>
                  </select>
                </FormField>

                <FormField label="Origem">
                  <select
                    value={scopeFilter}
                    onChange={(e) => setScopeFilter(e.target.value as ScopeFilter)}
                    className="form-input"
                  >
                    <option value="ALL">Todas</option>
                    <option value="CONDOMINIUM">Condomínio</option>
                    <option value="UNIT">Unidades</option>
                  </select>
                </FormField>

                <FormField label="Prioridade">
                  <select
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}
                    className="form-input"
                  >
                    <option value="ALL">Todas</option>
                    <option value="LOW">Baixa</option>
                    <option value="MEDIUM">Média</option>
                    <option value="HIGH">Alta</option>
                    <option value="URGENT">Urgente</option>
                  </select>
                </FormField>

                <FormField label="Atenção">
                  <select
                    value={
                      attentionFilter
                        ? "ATTENTION"
                        : slaFilter !== "ALL"
                          ? slaFilter
                          : assignedFilter === "NONE"
                            ? "UNASSIGNED"
                            : "ALL"
                    }
                    onChange={(e) => {
                      const value = e.target.value;

                      setAttentionFilter(false);
                      setSlaFilter("ALL");
                      setAssignedFilter("ALL");

                      if (value === "ATTENTION") {
                        setAttentionFilter(true);
                      }

                      if (value === "OVERDUE") {
                        setSlaFilter("OVERDUE");
                      }

                      if (value === "WARNING") {
                        setSlaFilter("WARNING");
                      }

                      if (value === "UNASSIGNED") {
                        setAssignedFilter("NONE");
                      }
                    }}
                    className="form-input"
                  >
                    <option value="ALL">Todos</option>
                    <option value="ATTENTION">Em atenção</option>
                    <option value="OVERDUE">Prazo vencido</option>
                    <option value="WARNING">Próximo do prazo</option>
                    <option value="UNASSIGNED">Sem responsável</option>
                  </select>
                </FormField>
              </div>

              <div className="mt-4 flex flex-col gap-3 text-sm text-[#5E6B63] md:flex-row md:items-start md:justify-between">
                <div>
                  <p>
                    Exibindo{" "}
                    <strong className="text-[#17211B]">
                      {sortedFilteredTickets.length}
                    </strong>{" "}
                    de{" "}
                    <strong className="text-[#17211B]">
                      {tickets.length}
                    </strong>{" "}
                    chamado(s).
                  </p>

                  <p className="mt-1 text-[#7A877F]">
                    {getListHelperText()}
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
              </div>
            </section>
          </ResponsiveSection>



          {/* =====================================================
              LISTAGEM ULTRA LIMPA
              ===================================================== */}

          <ResponsiveSection
            title="Chamados da Lista"
            description="Lista dos chamados conforme os filtros aplicados."
            defaultOpenMobile
          >
            {sortedFilteredTickets.length === 0 ? (
              <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-8 text-center shadow-sm">
                <h2 className="mb-2 text-2xl font-semibold text-[#17211B]">
                  Nenhum Chamado Encontrado
                </h2>

                <p className="mx-auto max-w-2xl text-sm leading-6 text-[#5E6B63]">
                  Não encontramos chamados com os filtros atuais. Você pode limpar os
                  filtros para ver a lista completa ou abrir um novo chamado.
                </p>

                <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    disabled={!hasAnyFilter}
                    className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-6 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:opacity-50"
                  >
                    Limpar filtros
                  </button>

                  <button
                    type="button"
                    onClick={openCreateModal}
                    className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-6 text-sm font-semibold text-white transition hover:bg-[#1F5A32]"
                  >
                    {getOpenTicketButtonLabel()}
                  </button>
                </div>
              </section>
            ) : (
              <div className="space-y-3">
                {sortedFilteredTickets.map((ticket) => {
                  const sla = getSlaInfo(ticket);
                  const latestLog = getLatestLog(ticket);

                  return (
                    <article
                      key={ticket.id}
                      className={`rounded-[24px] border p-5 shadow-sm transition hover:border-[#256D3C]/30 hover:shadow-[0_14px_38px_rgba(23,33,27,0.07)] ${getTicketCardClass(
                        ticket
                      )}`}
                    >
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="mb-3 flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(
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

                            {shouldShowSlaBadge(ticket) && (
                              <span
                                className={`rounded-full border px-3 py-1 text-xs font-semibold ${sla.className}`}
                              >
                                {sla.label}
                              </span>
                            )}

                            {!ticket.assignedToUser && isActiveTicket(ticket) && (
                              <span className="rounded-full border border-[#DDE5DF] bg-white px-3 py-1 text-xs font-semibold text-[#5E6B63]">
                                Aguardando responsável
                              </span>
                            )}
                          </div>

                          <h2 className="break-words text-xl font-semibold tracking-tight text-[#17211B] md:text-2xl">
                            {formatDisplayTitle(ticket.title)}
                          </h2>

                          <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                            {getOriginLine(ticket)}
                          </p>

                          <p className="mt-2 text-xs text-[#7A877F]">
                            Última movimentação:{" "}
                            <strong className="text-[#5E6B63]">
                              {getLatestMovementLabel(ticket)}
                            </strong>
                            {latestLog?.createdAt
                              ? ` • ${new Date(latestLog.createdAt).toLocaleString("pt-BR")}`
                              : ""}
                          </p>
                        </div>

                        <div className="flex shrink-0 flex-wrap items-start gap-2 xl:w-[180px] xl:flex-col">
                          <Link
                            href={`/portal/chamados/${ticket.id}`}
                            className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#1F5A32]"
                          >
                            Acompanhar
                          </Link>
                        </div>
                      </div>

                      <details className="mt-4 group rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA]">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#17211B]">
                          <span>Mais Informações</span>
                          <span className="text-[#7A877F] transition group-open:rotate-180">
                            ▾
                          </span>
                        </summary>

                        <div className="border-t border-[#DDE5DF] p-4">
                          <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-4">
                            <InfoBox
                              label="Solicitado por"
                              value={getTicketScopeLabel(ticket)}
                            />

                            <InfoBox
                              label="Local"
                              value={getFullLocationLabel(ticket)}
                            />

                            <InfoBox
                              label="Categoria"
                              value={ticket.category || "-"}
                            />

                            <InfoBox
                              label="Responsável"
                              value={ticket.assignedToUser?.name || "Aguardando atribuição"}
                            />

                            <InfoBox
                              label="Criado por"
                              value={ticket.createdByUser?.name || ticket.resident?.name || "-"}
                            />

                            <InfoBox
                              label="Criado em"
                              value={new Date(ticket.createdAt).toLocaleString("pt-BR")}
                            />

                            <InfoBox
                              label="Prazo"
                              value={sla.label}
                            />

                            <InfoBox
                              label="Prioridade"
                              value={priorityLabel(ticket.priority)}
                            />
                          </div>

                          <div className="mt-4 rounded-2xl border border-[#DDE5DF] bg-white p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
                              Resumo
                            </p>

                            <p className="mt-1 whitespace-pre-line text-sm leading-6 text-[#5E6B63]">
                              {getTicketShortDescription(ticket)}
                            </p>
                          </div>

                          <div className="mt-4 rounded-2xl border border-[#DDE5DF] bg-white p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
                              Orientação
                            </p>

                            <p className="mt-1 text-sm font-semibold leading-6 text-[#17211B]">
                              {getPortalTicketGuidance(ticket)}
                            </p>
                          </div>
                        </div>
                      </details>
                    </article>
                  );
                })}
              </div>
            )}
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

          details > summary::-webkit-details-marker {
            display: none;
          }
        `}</style>
      </PortalShell>
    </PortalContextGuard>
  );
}



/* =========================================================
   CARD DE MÉTRICA
   ========================================================= */

function MetricCard({
  title,
  value,
  description,
  tone = "default",
  onClick,
}: {
  title: string;
  value: number;
  description?: string;
  tone?: "default" | "green" | "blue" | "yellow" | "red" | "orange";
  onClick?: () => void;
}) {
  const markerClass =
    tone === "green"
      ? "bg-[#256D3C]"
      : tone === "red"
        ? "bg-red-600"
        : tone === "orange"
          ? "bg-orange-500"
          : tone === "yellow"
            ? "bg-yellow-500"
            : tone === "blue"
              ? "bg-[#256D3C]"
              : "bg-[#CFE6D4]";

  const valueClass =
    tone === "green"
      ? "text-[#256D3C]"
      : tone === "red"
        ? "text-red-700"
        : tone === "orange" || tone === "yellow"
          ? "text-[#17211B]"
          : "text-[#17211B]";

  const content = (
    <div className="relative h-full overflow-hidden rounded-[24px] border border-[#DDE5DF] bg-white p-4 text-[#17211B] shadow-sm transition hover:-translate-y-0.5 hover:border-[#256D3C]/40 hover:shadow-[0_18px_50px_rgba(23,33,27,0.08)]">
      <span
        className={`absolute left-0 top-5 h-8 w-1 rounded-r-full ${markerClass}`}
      />

      <p className="pl-2 text-sm font-semibold text-[#5E6B63]">
        {title}
      </p>

      <strong className={`mt-1 block pl-2 text-3xl font-semibold ${valueClass}`}>
        {value}
      </strong>

      {description && (
        <p className="mt-1 pl-2 text-xs leading-relaxed text-[#7A877F]">
          {description}
        </p>
      )}
    </div>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="text-left">
        {content}
      </button>
    );
  }

  return content;
}



/* =========================================================
   BOX DE INFORMAÇÃO
   ========================================================= */

function InfoBox({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-4">
      <p className="text-sm text-[#7A877F]">{label}</p>

      <strong className="break-words text-[#17211B]">
        {value}
      </strong>
    </div>
  );
}



/* =========================================================
   CAMPO DE FORMULÁRIO
   ========================================================= */

function FormField({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-sm font-semibold text-[#17211B]">
        {label}{" "}
        {required && <span className="text-red-600">*</span>}
      </label>

      <div className="mt-1">
        {children}
      </div>
    </div>
  );
}