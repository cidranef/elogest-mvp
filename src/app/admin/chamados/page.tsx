"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import AdminContextGuard from "@/components/AdminContextGuard";
import AdminShell from "@/components/AdminShell";
import ResponsiveSection from "@/components/ui/ResponsiveSection";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";



/* =========================================================
   FILA ADMINISTRATIVA DE CHAMADOS - ELOGEST

   ETAPA 41.4.3 — PADRONIZAÇÃO VISUAL DOS TÍTULOS

   Ajustes desta revisão:
   - Adicionado helper formatDisplayTitle().
   - Títulos dos chamados passam a ser exibidos em padrão visual
     mais elegante, evitando CAIXA ALTA inconsistente.
   - A alteração é apenas visual: não altera o dado salvo no banco.
   - Mantida a estrutura ultra limpa aprovada para a fila.
   - Mantida toda a lógica funcional aprovada.
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



type TicketScope = "UNIT" | "CONDOMINIUM";



const emptyTicketForm = {
  scope: "CONDOMINIUM" as TicketScope,
  condominiumId: "",
  unitId: "",
  residentId: "",
  assignedToUserId: "",
  title: "",
  description: "",
  category: "",
  priority: "MEDIUM",
};



const ACTIVE_TICKET_STATUSES = ["OPEN", "IN_PROGRESS"];



/* =========================================================
   INTERFACES
   ========================================================= */

interface Usuario {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive?: boolean;
  administratorId?: string | null;
  condominiumId?: string | null;
}



interface ActiveAccess {
  accessId?: string | null;
  role?: string | null;
  label?: string | null;
  administratorId?: string | null;
  condominiumId?: string | null;
  unitId?: string | null;
  residentId?: string | null;
  source?: string | null;
}



interface Morador {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  residentType?: string | null;
  status?: string | null;
}



interface Unidade {
  id: string;
  block?: string | null;
  unitNumber: string;
  status?: string | null;
  residents?: Morador[];
  condominium?: {
    id?: string;
    name: string;
  };
}



interface Condominio {
  id: string;
  name: string;
  administratorId?: string | null;
  status?: string | null;
  units?: Unidade[];
}



interface TicketLog {
  id: string;
  ticketId?: string;
  action: string;
  fromValue?: string | null;
  toValue?: string | null;
  comment?: string | null;
  createdAt: string;
  user?: { name: string };
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
    administratorId?: string | null;
  };
  unit?: { id?: string; block?: string | null; unitNumber: string } | null;
  resident?: { id?: string; name: string } | null;
  createdByUser?: { name: string };
  assignedToUser?: { id?: string; name: string };
  logs?: TicketLog[];
}



type FilterType =
  | "ALL"
  | "UNASSIGNED"
  | "OPEN"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "CANCELED"
  | "OVERDUE"
  | "WARNING";



type PriorityFilter = "ALL" | "LOW" | "MEDIUM" | "HIGH" | "URGENT";



/* =========================================================
   PÁGINA PRINCIPAL
   ========================================================= */

export default function ChamadosPage() {
  const searchParams = useSearchParams();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [currentUser, setCurrentUser] = useState<Usuario | null>(null);
  const [activeAccess, setActiveAccess] = useState<ActiveAccess | null>(null);
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [filter, setFilter] = useState<FilterType>("ALL");

  const [searchTerm, setSearchTerm] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [responsibleFilter, setResponsibleFilter] = useState("ALL");
  const [urlFilterMessage, setUrlFilterMessage] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updatingTicketId, setUpdatingTicketId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState(emptyTicketForm);



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
     CARREGAMENTO DE DADOS
     ========================================================= */

  async function loadCurrentUser() {
    try {
      const res = await fetch("/api/admin/me", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        setCurrentUser(null);
        return;
      }

      setCurrentUser(data);
    } catch (err) {
      console.error(err);
      setCurrentUser(null);
    }
  }



  async function loadActiveAccess() {
    try {
      const res = await fetch("/api/user/active-access", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setActiveAccess(null);
        return;
      }

      setActiveAccess(data?.activeAccess || null);
    } catch (err) {
      console.error(err);
      setActiveAccess(null);
    }
  }



  async function loadTickets() {
    try {
      setError("");

      const res = await fetch("/api/admin/chamados", { cache: "no-store" });
      const data = await res.json();

      if (!res.ok) {
        showError(data?.error || "Erro ao carregar chamados");
        setTickets([]);
        return;
      }

      if (!Array.isArray(data)) {
        showError("Resposta inválida da API.");
        setTickets([]);
        return;
      }

      setTickets(data);
    } catch (err) {
      console.error(err);
      showError("Erro ao carregar chamados");
      setTickets([]);
    }
  }



  async function loadMeta() {
    try {
      const res = await fetch("/api/admin/chamados/meta", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setCondominios([]);
        setUsuarios([]);
        return;
      }

      setCondominios(Array.isArray(data.condominiums) ? data.condominiums : []);
      setUsuarios(Array.isArray(data.users) ? data.users : []);
    } catch (err) {
      console.error(err);
      setCondominios([]);
      setUsuarios([]);
    }
  }



  /* =========================================================
     FILTROS VINDOS DA URL / DASHBOARD
     ========================================================= */

  function applyUrlFilters() {
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const assigned = searchParams.get("assigned");
    const sla = searchParams.get("sla");

    const appliedMessages: string[] = [];

    setFilter("ALL");
    setPriorityFilter("ALL");
    setCategoryFilter("ALL");
    setResponsibleFilter("ALL");
    setSearchTerm("");

    if (
      status === "OPEN" ||
      status === "IN_PROGRESS" ||
      status === "RESOLVED" ||
      status === "CANCELED"
    ) {
      setFilter(status as FilterType);
      appliedMessages.push(`Status: ${statusLabel(status)}`);
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

    if (assigned === "none") {
      setFilter("UNASSIGNED");
      appliedMessages.push("Sem responsável");
    }

    if (sla === "overdue") {
      setFilter("OVERDUE");
      appliedMessages.push("Prazo vencido");
    }

    if (sla === "warning" || sla === "near_due") {
      setFilter("WARNING");
      appliedMessages.push("Próximo do prazo");
    }

    setUrlFilterMessage(
      appliedMessages.length > 0
        ? `Filtro vindo do dashboard aplicado: ${appliedMessages.join(" • ")}.`
        : ""
    );
  }



  /* =========================================================
     PERMISSÕES VISUAIS POR PERFIL DE ACESSO
     ========================================================= */

  function isAdminContext() {
    return (
      activeAccess?.role === "SUPER_ADMIN" ||
      activeAccess?.role === "ADMINISTRADORA"
    );
  }



  function canCreateAdminTicket() {
    return isAdminContext();
  }



  function canChangeStatus() {
    return isAdminContext();
  }



  function canAssignResponsible() {
    return isAdminContext();
  }



  function canUseOperationalActions() {
    return canChangeStatus() || canAssignResponsible();
  }



  /* =========================================================
     MODAL
     ========================================================= */

  function openCreateModal() {
    setForm(emptyTicketForm);
    setModalOpen(true);
  }



  function closeCreateModal() {
    if (creating) return;

    setForm(emptyTicketForm);
    setModalOpen(false);
  }



  /* =========================================================
     CRIAÇÃO DE CHAMADO ADMINISTRATIVO
     ========================================================= */

  async function createTicket(e: React.FormEvent) {
    e.preventDefault();

    if (!canCreateAdminTicket()) {
      alert("Este perfil de acesso não possui permissão para criar chamado administrativo.");
      return;
    }

    if (!form.condominiumId || !form.title.trim() || !form.description.trim()) {
      alert("Informe condomínio, título e descrição.");
      return;
    }

    if (form.scope === "UNIT" && !form.unitId) {
      alert("Selecione a unidade.");
      return;
    }

    try {
      setCreating(true);

      const payload: any = {
        scope: form.scope,
        condominiumId: form.condominiumId,
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category || null,
        priority: form.priority || "MEDIUM",
      };

      if (form.scope === "UNIT") {
        payload.unitId = form.unitId;

        if (form.residentId) {
          payload.residentId = form.residentId;
        }
      }

      if (form.assignedToUserId) {
        payload.assignedToUserId = form.assignedToUserId;
      }

      const res = await fetch("/api/admin/chamados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error || "Erro ao criar chamado.");
        return;
      }

      setForm(emptyTicketForm);
      setModalOpen(false);
      setFilter("OPEN");

      await loadTickets();

      showSuccess("Chamado criado com sucesso.");
    } catch (err) {
      console.error(err);
      alert("Erro ao criar chamado.");
    } finally {
      setCreating(false);
    }
  }



  /* =========================================================
     ATUALIZAÇÃO DE CHAMADO
     ========================================================= */

  async function updateTicket(id: string, payload: any) {
    try {
      setUpdatingTicketId(id);

      const res = await fetch(`/api/admin/chamados/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Erro ao atualizar chamado.");
        return;
      }

      await loadTickets();
    } catch (err) {
      console.error(err);
      alert("Erro ao atualizar chamado.");
    } finally {
      setUpdatingTicketId(null);
    }
  }



  /* =========================================================
     RESOLVER CHAMADO PELA FILA
     ========================================================= */

  async function resolveTicketFromList(ticket: Ticket) {
    if (!canChangeStatus()) {
      alert("Este perfil de acesso não possui permissão para resolver chamados.");
      return;
    }

    if (ticket.status !== "IN_PROGRESS") {
      alert("O chamado precisa estar em andamento para ser resolvido.");
      return;
    }

    const resolutionComment = window.prompt(
      "Informe a mensagem de resolução que ficará visível ao morador:"
    );

    if (!resolutionComment || !resolutionComment.trim()) {
      alert("A mensagem de resolução é obrigatória para finalizar o chamado.");
      return;
    }

    await updateTicket(ticket.id, {
      status: "RESOLVED",
      resolutionComment: resolutionComment.trim(),
    });
  }



  /* =========================================================
     LIMPAR FILTROS
     ========================================================= */

  function clearAdvancedFilters() {
    setSearchTerm("");
    setPriorityFilter("ALL");
    setCategoryFilter("ALL");
    setResponsibleFilter("ALL");
  }



  function clearAllFilters() {
    setFilter("ALL");
    setSearchTerm("");
    setPriorityFilter("ALL");
    setCategoryFilter("ALL");
    setResponsibleFilter("ALL");
    setUrlFilterMessage("");

    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/admin/chamados");
    }
  }



  /* =========================================================
     CARREGAMENTO INICIAL
     ========================================================= */

  async function loadInitialData() {
    try {
      setLoading(true);

      await Promise.all([
        loadActiveAccess(),
        loadTickets(),
        loadMeta(),
        loadCurrentUser(),
      ]);
    } finally {
      setLoading(false);
    }
  }



  /* =========================================================
     INIT
     ========================================================= */

  useEffect(() => {
    loadInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  useEffect(() => {
    applyUrlFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);



  /* =========================================================
     SELECTS DINÂMICOS DO MODAL
     ========================================================= */

  const activeCondominios = useMemo(() => {
    return condominios.filter((condominio) => {
      return !condominio.status || condominio.status === "ACTIVE";
    });
  }, [condominios]);



  const selectedCondominio = useMemo(() => {
    if (!form.condominiumId) return null;

    return (
      activeCondominios.find(
        (condominio) => condominio.id === form.condominiumId
      ) || null
    );
  }, [activeCondominios, form.condominiumId]);



  const selectedCondominioUnits = useMemo(() => {
    return selectedCondominio?.units || [];
  }, [selectedCondominio]);



  const selectedUnit = useMemo(() => {
    if (!form.unitId) return null;

    return (
      selectedCondominioUnits.find((unit) => unit.id === form.unitId) || null
    );
  }, [selectedCondominioUnits, form.unitId]);



  const selectedUnitResidents = useMemo(() => {
    return (selectedUnit?.residents || []).filter((resident) => {
      return !resident.status || resident.status === "ACTIVE";
    });
  }, [selectedUnit]);



  const operationalUsers = useMemo(() => {
    return usuarios.filter((usuario) => {
      const isActive = usuario.isActive !== false;

      const allowedRole =
        usuario.role === "ADMINISTRADORA" || usuario.role === "SINDICO";

      return isActive && allowedRole;
    });
  }, [usuarios]);



  const responsibleUsersForModal = useMemo(() => {
    if (!selectedCondominio) return operationalUsers;

    return operationalUsers.filter((usuario) => {
      if (usuario.role === "SINDICO") {
        return usuario.condominiumId === selectedCondominio.id;
      }

      if (usuario.role === "ADMINISTRADORA") {
        if (selectedCondominio.administratorId && usuario.administratorId) {
          return usuario.administratorId === selectedCondominio.administratorId;
        }

        return true;
      }

      return false;
    });
  }, [operationalUsers, selectedCondominio]);



  function getResponsibleUsersForTicket(ticket: Ticket) {
    const targetCondominiumId = ticket.condominium?.id || null;
    const targetAdministratorId = ticket.condominium?.administratorId || null;

    return operationalUsers.filter((usuario) => {
      if (usuario.role === "SINDICO") {
        return !!targetCondominiumId && usuario.condominiumId === targetCondominiumId;
      }

      if (usuario.role === "ADMINISTRADORA") {
        if (targetAdministratorId && usuario.administratorId) {
          return usuario.administratorId === targetAdministratorId;
        }

        return true;
      }

      return false;
    });
  }



  /* =========================================================
     LABELS E HELPERS
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



  const roleLabel = (role?: string | null) =>
    ({
      SUPER_ADMIN: "Super Admin",
      ADMINISTRADORA: "Administradora",
      SINDICO: "Síndico",
      MORADOR: "Morador",
      PROPRIETARIO: "Proprietário",
    }[role || ""] || role || "-");



  const residentTypeLabel = (type?: string | null) =>
    ({
      PROPRIETARIO: "Proprietário",
      INQUILINO: "Inquilino",
      FAMILIAR: "Familiar",
      RESPONSAVEL: "Responsável",
      OUTRO: "Outro",
    }[type || ""] || type || "");



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



  function isActiveTicket(ticket: Ticket) {
    return ACTIVE_TICKET_STATUSES.includes(ticket.status);
  }



  function getSlaLimitHours(priority?: string | null) {
    if (priority === "URGENT") return 4;
    if (priority === "HIGH") return 24;
    if (priority === "MEDIUM") return 48;
    return 72;
  }



  function getSla(ticket: Ticket) {
    if (ticket.status === "RESOLVED" || ticket.status === "CANCELED") {
      return {
        status: "DONE",
        label: "Prazo encerrado",
        className: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
      };
    }

    const createdAt = new Date(ticket.createdAt).getTime();
    const elapsedHours = Math.floor((Date.now() - createdAt) / (1000 * 60 * 60));
    const remainingHours = getSlaLimitHours(ticket.priority) - elapsedHours;
    const warningThreshold = Math.max(
      2,
      Math.ceil(getSlaLimitHours(ticket.priority) * 0.25)
    );

    if (remainingHours <= 0) {
      return {
        status: "OVERDUE",
        label: `Prazo vencido há ${Math.abs(remainingHours)}h`,
        className: "border-red-200 bg-red-50 text-red-700",
      };
    }

    if (remainingHours <= warningThreshold) {
      return {
        status: "WARNING",
        label: `Prazo vence em ${remainingHours}h`,
        className: "border-orange-200 bg-orange-50 text-orange-700",
      };
    }

    return {
      status: "OK",
      label: `${remainingHours}h restantes`,
      className: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
    };
  }



  const statusClass = (status: string) =>
    ({
      OPEN: "border-[#DDE5DF] bg-white text-[#17211B]",
      IN_PROGRESS: "border-yellow-200 bg-yellow-50 text-yellow-800",
      RESOLVED: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
      CANCELED: "border-red-200 bg-red-50 text-red-700",
    }[status] || "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]");



  const priorityBadgeClass = (priority?: string | null) =>
    ({
      LOW: "border-[#DDE5DF] bg-white text-[#5E6B63]",
      MEDIUM: "border-[#DDE5DF] bg-white text-[#5E6B63]",
      HIGH: "border-orange-200 bg-orange-50 text-orange-700",
      URGENT: "border-red-200 bg-red-50 text-red-700",
    }[priority || ""] || "border-[#DDE5DF] bg-white text-[#5E6B63]");



  function shouldShowSlaBadge(ticket: Ticket) {
    const sla = getSla(ticket);

    return sla.status === "OVERDUE" || sla.status === "WARNING";
  }



  function getTicketScopeLabel(ticket: Ticket) {
    if (ticket.scope === "CONDOMINIUM") {
      return "Condomínio";
    }

    return "Unidade";
  }



  function getTicketLocationLabel(ticket: Ticket) {
    if (ticket.scope === "CONDOMINIUM") {
      return "Condomínio / Área comum";
    }

    if (ticket.unit) {
      return `Unidade ${
        ticket.unit.block ? ticket.unit.block + " - " : ""
      }${ticket.unit.unitNumber}`;
    }

    return "Condomínio / Área comum";
  }



  function getOriginLine(ticket: Ticket) {
    const senderName =
      ticket.resident?.name ||
      ticket.createdByUser?.name ||
      "Solicitante não identificado";

    const condominiumName = ticket.condominium?.name || "Condomínio não informado";
    const location = getTicketLocationLabel(ticket);

    return `Enviado por ${senderName} • ${condominiumName} • ${location}`;
  }



  function getUnitLabel(unit: Unidade) {
    return `${unit.block ? unit.block + " - " : ""}${unit.unitNumber}`;
  }



  function getShortDescription(description?: string | null) {
    const text = String(description || "").trim();

    if (!text) return "Sem descrição informada.";

    if (text.length <= 180) return text;

    return `${text.slice(0, 180).trim()}...`;
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

    if (!latestLog) {
      return "Sem movimentação recente.";
    }

    if (latestLog.action === "CREATED") {
      return "Chamado criado.";
    }

    if (latestLog.action === "STATUS_CHANGED") {
      return "Status atualizado.";
    }

    if (latestLog.action === "ASSIGNED") {
      return "Responsável atribuído.";
    }

    if (latestLog.action === "COMMENT_PUBLIC") {
      return "Resposta pública registrada.";
    }

    if (latestLog.action === "COMMENT_INTERNAL") {
      return "Comentário interno registrado.";
    }

    if (latestLog.action === "COMMENT") {
      return "Comentário registrado.";
    }

    if (latestLog.action === "ATTACHMENT_ADDED") {
      return "Anexo adicionado.";
    }

    if (latestLog.action === "ATTACHMENT_REMOVED") {
      return "Anexo removido.";
    }

    return "Movimentação registrada.";
  }



  function getFilterLabel(currentFilter: FilterType) {
    if (currentFilter === "ALL") return "Todos";
    if (currentFilter === "UNASSIGNED") return "Sem responsável";
    if (currentFilter === "OPEN") return "Abertos";
    if (currentFilter === "IN_PROGRESS") return "Em andamento";
    if (currentFilter === "RESOLVED") return "Resolvidos";
    if (currentFilter === "CANCELED") return "Cancelados";
    if (currentFilter === "OVERDUE") return "Prazo vencido";
    if (currentFilter === "WARNING") return "Próximo do prazo";

    return currentFilter;
  }



  /* =========================================================
     MÉTRICAS
     ========================================================= */

  const metrics = useMemo(() => {
    const activeTickets = tickets.filter((ticket) => isActiveTicket(ticket));

    return {
      total: tickets.length,
      unassigned: activeTickets.filter((t) => !t.assignedToUser).length,
      open: tickets.filter((t) => t.status === "OPEN").length,
      progress: tickets.filter((t) => t.status === "IN_PROGRESS").length,
      resolved: tickets.filter((t) => t.status === "RESOLVED").length,
      canceled: tickets.filter((t) => t.status === "CANCELED").length,
      overdue: activeTickets.filter((t) => getSla(t).status === "OVERDUE").length,
      warning: activeTickets.filter((t) => getSla(t).status === "WARNING").length,
    };
  }, [tickets]);



  const overdueTickets = useMemo(
    () =>
      tickets.filter(
        (ticket) => isActiveTicket(ticket) && getSla(ticket).status === "OVERDUE"
      ),
    [tickets]
  );



  /* =========================================================
     OPÇÕES DE CATEGORIA E RESPONSÁVEL
     ========================================================= */

  const categoryOptions = useMemo(() => {
    const legacyCategories = tickets
      .map((ticket) => ticket.category?.trim())
      .filter((category): category is string => !!category);

    const mergedCategories = Array.from(
      new Set([...TICKET_CATEGORIES, ...legacyCategories])
    );

    return mergedCategories.sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [tickets]);



  const responsibleOptions = useMemo(() => {
    const responsaveis = tickets
      .map((ticket) => ticket.assignedToUser)
      .filter((user): user is { id?: string; name: string } => !!user?.name);

    const uniqueMap = new Map<string, { id?: string; name: string }>();

    responsaveis.forEach((user) => {
      const key = user.id || user.name;
      uniqueMap.set(key, user);
    });

    return Array.from(uniqueMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR")
    );
  }, [tickets]);



  /* =========================================================
     FILTRO POR STATUS/MÉTRICA
     ========================================================= */

  const statusFilteredTickets = useMemo(() => {
    if (filter === "UNASSIGNED") {
      return tickets.filter((t) => isActiveTicket(t) && !t.assignedToUser);
    }

    if (filter === "OPEN") return tickets.filter((t) => t.status === "OPEN");

    if (filter === "IN_PROGRESS") {
      return tickets.filter((t) => t.status === "IN_PROGRESS");
    }

    if (filter === "RESOLVED") {
      return tickets.filter((t) => t.status === "RESOLVED");
    }

    if (filter === "CANCELED") {
      return tickets.filter((t) => t.status === "CANCELED");
    }

    if (filter === "OVERDUE") {
      return tickets.filter(
        (t) => isActiveTicket(t) && getSla(t).status === "OVERDUE"
      );
    }

    if (filter === "WARNING") {
      return tickets.filter(
        (t) => isActiveTicket(t) && getSla(t).status === "WARNING"
      );
    }

    return tickets;
  }, [tickets, filter]);



  /* =========================================================
     FILTROS AVANÇADOS + BUSCA
     ========================================================= */

  const filteredTickets = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return statusFilteredTickets.filter((ticket) => {
      const searchableText = [
        ticket.title,
        ticket.description,
        ticket.category,
        ticket.condominium?.name,
        getTicketLocationLabel(ticket),
        getTicketScopeLabel(ticket),
        ticket.resident?.name,
        ticket.createdByUser?.name,
        ticket.assignedToUser?.name,
        ticket.status,
        ticket.priority,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !term || searchableText.includes(term);

      const matchesPriority =
        priorityFilter === "ALL" || ticket.priority === priorityFilter;

      const matchesCategory =
        categoryFilter === "ALL" || ticket.category === categoryFilter;

      const matchesResponsible =
        responsibleFilter === "ALL" ||
        ticket.assignedToUser?.id === responsibleFilter ||
        ticket.assignedToUser?.name === responsibleFilter;

      return (
        matchesSearch &&
        matchesPriority &&
        matchesCategory &&
        matchesResponsible
      );
    });
  }, [
    statusFilteredTickets,
    searchTerm,
    priorityFilter,
    categoryFilter,
    responsibleFilter,
  ]);



  const hasAdvancedFilters =
    searchTerm.trim() !== "" ||
    priorityFilter !== "ALL" ||
    categoryFilter !== "ALL" ||
    responsibleFilter !== "ALL";



  const hasAnyFilter =
    filter !== "ALL" ||
    hasAdvancedFilters ||
    !!urlFilterMessage;



  /* =========================================================
     LOADING
     ========================================================= */

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando fila de chamados..."
        description="Aguarde enquanto identificamos seu perfil de acesso e carregamos a fila administrativa."
      />
    );
  }



  /* =========================================================
     RENDER
     ========================================================= */

  return (
    <AdminContextGuard
      fallbackTitle="Fila administrativa indisponível neste perfil de acesso"
      fallbackDescription="A fila administrativa de chamados é exclusiva para administradora ou super admin. Para acompanhar chamados como síndico, morador ou proprietário, acesse o portal."
    >
      <AdminShell
        current="chamados"
        title="Fila de chamados"
        description="Acompanhe, filtre, priorize, atribua responsáveis e atualize o andamento dos chamados."
      >
        <div className="space-y-6">
          {/* =====================================================
              TÍTULO DA PÁGINA
              ===================================================== */}

          <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#256D3C]">
                Chamados
              </p>

              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17211B] md:text-4xl">
                Fila de Chamados
              </h1>

              <p className="mt-2 max-w-4xl text-sm leading-6 text-[#5E6B63]">
                Acompanhe a fila administrativa, priorize atendimentos, atribua responsáveis e atualize o andamento dos chamados.
              </p>
            </div>

            {canCreateAdminTicket() && (
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5A32] focus:outline-none focus:ring-4 focus:ring-[#256D3C]/20"
              >
                Novo chamado
              </button>
            )}
          </header>



          {/* =====================================================
              RESUMO OPERACIONAL
              ===================================================== */}

          <section className="overflow-hidden rounded-[32px] border border-[#DDE5DF] bg-white shadow-sm">
            <div className="border-b border-[#DDE5DF] bg-[linear-gradient(135deg,#FFFFFF_0%,#F8FAF9_62%,#EAF7EE_135%)] p-6">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-[#17211B] md:text-3xl">
                    Visão da Fila
                  </h2>

                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5E6B63]">
                    Resumo dos chamados da carteira administrativa, com foco nos casos ativos, prazos e responsáveis.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:min-w-[620px] xl:grid-cols-4">
                  <QueueMetricBox
                    title="Total"
                    value={metrics.total}
                    active={filter === "ALL"}
                    onClick={() => setFilter("ALL")}
                    highlighted
                    description="Todos os chamados."
                  />

                  <QueueMetricBox
                    title="Abertos"
                    value={metrics.open}
                    active={filter === "OPEN"}
                    onClick={() => setFilter("OPEN")}
                    description="Aguardando triagem."
                  />

                  <QueueMetricBox
                    title="Em andamento"
                    value={metrics.progress}
                    active={filter === "IN_PROGRESS"}
                    onClick={() => setFilter("IN_PROGRESS")}
                    description="Em atendimento."
                  />

                  <QueueMetricBox
                    title="Resolvidos"
                    value={metrics.resolved}
                    active={filter === "RESOLVED"}
                    onClick={() => setFilter("RESOLVED")}
                    highlighted
                    description="Finalizados."
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-0 divide-y divide-[#DDE5DF] md:grid-cols-3 md:divide-x md:divide-y-0">
              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Sem responsável
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  {metrics.unassigned > 0
                    ? `${metrics.unassigned} chamado(s) ativos ainda sem atribuição.`
                    : "Todos os chamados ativos possuem responsável ou estão sem pendência de atribuição."}
                </p>
              </div>

              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Prazo vencido
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  {metrics.overdue > 0
                    ? `${metrics.overdue} chamado(s) exigem priorização.`
                    : "Nenhum chamado ativo fora do prazo esperado."}
                </p>
              </div>

              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Resultado atual
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  Exibindo <strong className="text-[#17211B]">{filteredTickets.length}</strong>{" "}
                  chamado(s) conforme filtros aplicados.
                </p>
              </div>
            </div>
          </section>



          {/* =====================================================
              AVISOS
              ===================================================== */}

          {activeAccess && !isAdminContext() && (
            <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm leading-6 text-yellow-800">
              Este perfil de acesso não possui ações operacionais administrativas
              nesta tela. Para operar como morador, proprietário ou síndico,
              utilize o portal.
            </div>
          )}

          {urlFilterMessage && (
            <div className="flex flex-col gap-3 rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] p-4 text-sm text-[#256D3C] md:flex-row md:items-center md:justify-between">
              <span>{urlFilterMessage}</span>

              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex h-10 items-center justify-center rounded-2xl bg-[#256D3C] px-4 text-sm font-semibold text-white transition hover:bg-[#1F5A32]"
              >
                Limpar filtro do dashboard
              </button>
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

          {modalOpen && canCreateAdminTicket() && (
            <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#17211B]/65 p-4 backdrop-blur-sm">
              <div className="my-6 max-h-[calc(100vh-3rem)] w-full max-w-2xl overflow-y-auto rounded-[32px] border border-[#DDE5DF] bg-white p-6 shadow-2xl">
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-semibold text-[#17211B]">
                      Novo Chamado Administrativo
                    </h2>

                    <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
                      Registre uma ocorrência recebida pela administradora e,
                      se necessário, já atribua um responsável para triagem.
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
                  <FormField label="Condomínio" required>
                    <select
                      value={form.condominiumId}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          condominiumId: e.target.value,
                          unitId: "",
                          residentId: "",
                          assignedToUserId: "",
                        }))
                      }
                      className="form-input"
                    >
                      <option value="">Selecione um condomínio</option>

                      {activeCondominios.map((condominio) => (
                        <option key={condominio.id} value={condominio.id}>
                          {condominio.name}
                        </option>
                      ))}
                    </select>

                    {activeCondominios.length === 0 && (
                      <p className="mt-1 text-xs text-yellow-700">
                        Nenhum condomínio ativo disponível para abertura de chamado.
                      </p>
                    )}
                  </FormField>

                  <FormField label="Tipo de chamado">
                    <select
                      value={form.scope}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          scope: e.target.value as TicketScope,
                          unitId: "",
                          residentId: "",
                        }))
                      }
                      className="form-input"
                    >
                      <option value="CONDOMINIUM">Condomínio / Área comum</option>
                      <option value="UNIT">Unidade específica</option>
                    </select>
                  </FormField>

                  {form.scope === "UNIT" && (
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
                          disabled={!form.condominiumId}
                          className="form-input disabled:opacity-60"
                        >
                          <option value="">
                            {form.condominiumId
                              ? "Selecione uma unidade"
                              : "Selecione primeiro o condomínio"}
                          </option>

                          {selectedCondominioUnits.map((unit) => (
                            <option key={unit.id} value={unit.id}>
                              {getUnitLabel(unit)}
                            </option>
                          ))}
                        </select>
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
                            Campo opcional. Use quando a ocorrência estiver ligada
                            a um morador específico.
                          </p>
                        )}
                      </FormField>
                    </>
                  )}

                  <FormField label="Responsável pelo atendimento">
                    <select
                      value={form.assignedToUserId}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          assignedToUserId: e.target.value,
                        }))
                      }
                      disabled={responsibleUsersForModal.length === 0}
                      className="form-input disabled:opacity-60"
                    >
                      <option value="">Sem responsável / Triagem</option>

                      {responsibleUsersForModal.map((usuario) => (
                        <option key={usuario.id} value={usuario.id}>
                          {usuario.name} — {roleLabel(usuario.role)}
                        </option>
                      ))}
                    </select>

                    <p className="mt-1 text-xs text-[#7A877F]">
                      O responsável deve ser uma administradora da carteira ou um
                      síndico do condomínio selecionado.
                    </p>
                  </FormField>

                  <FormField label="Título" required>
                    <input
                      value={form.title}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, title: e.target.value }))
                      }
                      className="form-input"
                      placeholder="Ex: Portão com defeito, vazamento, barulho..."
                    />
                  </FormField>

                  <FormField label="Categoria">
                    <select
                      value={form.category}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, category: e.target.value }))
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
                        setForm((prev) => ({ ...prev, priority: e.target.value }))
                      }
                      className="form-input"
                    >
                      <option value="LOW">Baixa</option>
                      <option value="MEDIUM">Média</option>
                      <option value="HIGH">Alta</option>
                      <option value="URGENT">Urgente</option>
                    </select>

                    <p className="mt-1 text-xs text-[#7A877F]">
                      Use “Urgente” apenas para ocorrências que exigem ação imediata
                      ou possam causar risco, prejuízo ou impacto relevante.
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
                      className="form-input"
                      placeholder="Descreva o problema, local, histórico e detalhes úteis para o atendimento."
                    />
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
              ALERTA PRAZO
              ===================================================== */}

          {overdueTickets.length > 0 && (
            <div className="flex flex-col gap-4 rounded-2xl border border-red-200 bg-red-50 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <strong className="text-lg text-red-700">
                  Atenção: {overdueTickets.length} chamado(s) com prazo vencido
                </strong>

                <p className="mt-1 text-sm text-red-700/80">
                  Existem chamados ativos fora do prazo. Recomendamos priorizar estes atendimentos.
                </p>
              </div>

              <button
                onClick={() => setFilter("OVERDUE")}
                className="inline-flex h-10 items-center justify-center rounded-2xl bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                Ver chamados vencidos
              </button>
            </div>
          )}



          {/* =====================================================
              PRIORIDADES DA FILA
              ===================================================== */}

          <ResponsiveSection
            title="Prioridades da Fila"
            description="Indicadores operacionais para priorização dos chamados."
            defaultOpenMobile={metrics.overdue > 0 || metrics.warning > 0 || metrics.unassigned > 0}
          >
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-7">
              <MetricButton
                title="Sem responsável"
                value={metrics.unassigned}
                description="Ativos sem atribuição"
                active={filter === "UNASSIGNED"}
                onClick={() => setFilter("UNASSIGNED")}
                tone={metrics.unassigned > 0 ? "orange" : "default"}
              />

              <MetricButton
                title="Prazo vencido"
                value={metrics.overdue}
                description="Fora do prazo"
                active={filter === "OVERDUE"}
                onClick={() => setFilter("OVERDUE")}
                tone={metrics.overdue > 0 ? "red" : "default"}
              />

              <MetricButton
                title="Próximo do prazo"
                value={metrics.warning}
                description="Próximos do limite"
                active={filter === "WARNING"}
                onClick={() => setFilter("WARNING")}
                tone={metrics.warning > 0 ? "orange" : "default"}
              />

              <MetricButton
                title="Abertos"
                value={metrics.open}
                description="Aguardando início"
                active={filter === "OPEN"}
                onClick={() => setFilter("OPEN")}
              />

              <MetricButton
                title="Em andamento"
                value={metrics.progress}
                description="Em atendimento"
                active={filter === "IN_PROGRESS"}
                onClick={() => setFilter("IN_PROGRESS")}
                tone={metrics.progress > 0 ? "yellow" : "default"}
              />

              <MetricButton
                title="Resolvidos"
                value={metrics.resolved}
                description="Finalizados"
                active={filter === "RESOLVED"}
                onClick={() => setFilter("RESOLVED")}
                tone="green"
              />

              <MetricButton
                title="Cancelados"
                value={metrics.canceled}
                description="Encerrados sem resolução"
                active={filter === "CANCELED"}
                onClick={() => setFilter("CANCELED")}
              />
            </section>
          </ResponsiveSection>



          {/* =====================================================
              FILTROS
              ===================================================== */}

          <ResponsiveSection
            title="Filtros da Fila"
            description="Refine a visualização por texto, prioridade, categoria ou responsável."
            defaultOpenMobile
          >
            <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-sm">
              <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-[#17211B]">
                    Filtros da Fila
                  </h2>

                  <p className="mt-1 text-sm text-[#5E6B63]">
                    Refine a visualização por texto, prioridade, categoria ou responsável.
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

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                <div className="lg:col-span-5">
                  <label className="text-sm font-semibold text-[#17211B]">
                    Buscar
                  </label>

                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="form-input mt-1"
                    placeholder="Buscar por título, morador, unidade, condomínio, responsável..."
                  />
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

                <div className="lg:col-span-2">
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

                <div className="lg:col-span-2">
                  <label className="text-sm font-semibold text-[#17211B]">
                    Responsável
                  </label>

                  <select
                    value={responsibleFilter}
                    onChange={(e) => setResponsibleFilter(e.target.value)}
                    className="form-input mt-1"
                  >
                    <option value="ALL">Todos</option>

                    {responsibleOptions.map((responsavel) => (
                      <option
                        key={responsavel.id || responsavel.name}
                        value={responsavel.id || responsavel.name}
                      >
                        {responsavel.name}
                      </option>
                    ))}
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

              <div className="mt-4 flex flex-col gap-2 text-sm text-[#5E6B63] md:flex-row md:items-center md:justify-between">
                <p>
                  Filtro principal:{" "}
                  <strong className="text-[#17211B]">{getFilterLabel(filter)}</strong> •
                  Exibindo{" "}
                  <strong className="text-[#17211B]">{filteredTickets.length}</strong>{" "}
                  de{" "}
                  <strong className="text-[#17211B]">{statusFilteredTickets.length}</strong>{" "}
                  chamado(s).
                </p>

                {hasAdvancedFilters && (
                  <p className="font-semibold text-[#256D3C]">
                    Filtros avançados aplicados.
                  </p>
                )}
              </div>
            </section>
          </ResponsiveSection>



          {/* =====================================================
              LISTA ULTRA LIMPA
              ===================================================== */}

          <ResponsiveSection
            title="Chamados da Fila"
            description="Lista operacional dos chamados conforme os filtros aplicados."
            defaultOpenMobile
          >
            {filteredTickets.length === 0 ? (
              <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-8 text-center shadow-sm">
                <h2 className="mb-2 text-2xl font-semibold text-[#17211B]">
                  Nenhum Chamado Encontrado
                </h2>

                <p className="mx-auto max-w-2xl text-sm leading-6 text-[#5E6B63]">
                  Não encontramos chamados com os filtros atuais. Você pode limpar
                  os filtros para voltar à fila completa.
                </p>

                <button
                  type="button"
                  onClick={clearAllFilters}
                  disabled={!hasAnyFilter}
                  className="mt-6 inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-6 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
                >
                  Limpar filtros
                </button>
              </section>
            ) : (
              <div className="space-y-3">
                {filteredTickets.map((ticket) => {
                  const sla = getSla(ticket);
                  const latestLog = getLatestLog(ticket);
                  const ticketResponsibleUsers = getResponsibleUsersForTicket(ticket);

                  return (
                    <article
                      key={ticket.id}
                      className="rounded-[24px] border border-[#DDE5DF] bg-white p-5 shadow-sm transition hover:border-[#256D3C]/30 hover:shadow-[0_14px_38px_rgba(23,33,27,0.07)]"
                    >
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="mb-3 flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(ticket.status)}`}
                            >
                              {statusLabel(ticket.status)}
                            </span>

                            <span
                              className={`rounded-full border px-3 py-1 text-xs font-semibold ${priorityBadgeClass(ticket.priority)}`}
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
                              <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                                Sem responsável
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

                        <div className="flex shrink-0 flex-wrap items-start gap-2 xl:w-[160px] xl:flex-col">
                          <Link
                            href={`/admin/chamados/${ticket.id}`}
                            className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
                          >
                            Ver detalhes
                          </Link>

                          {canChangeStatus() && ticket.status === "OPEN" && (
                            <button
                              onClick={() =>
                                updateTicket(ticket.id, { status: "IN_PROGRESS" })
                              }
                              disabled={updatingTicketId === ticket.id}
                              className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[#256D3C] px-4 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
                            >
                              Iniciar
                            </button>
                          )}

                          {canChangeStatus() && ticket.status === "IN_PROGRESS" && (
                            <button
                              onClick={() => resolveTicketFromList(ticket)}
                              disabled={updatingTicketId === ticket.id}
                              className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[#256D3C] px-4 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
                            >
                              Resolver
                            </button>
                          )}

                          {canChangeStatus() && ticket.status === "RESOLVED" && (
                            <button
                              onClick={() =>
                                updateTicket(ticket.id, { status: "OPEN" })
                              }
                              disabled={updatingTicketId === ticket.id}
                              className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:opacity-60"
                            >
                              Reabrir
                            </button>
                          )}
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
                          <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-4">
                            <InfoLine
                              label="Responsável"
                              value={ticket.assignedToUser?.name || "Não atribuído"}
                            />

                            <InfoLine
                              label="Categoria"
                              value={ticket.category || "-"}
                            />

                            <InfoLine
                              label="Tipo"
                              value={getTicketScopeLabel(ticket)}
                            />

                            <InfoLine
                              label="Prazo"
                              value={sla.label}
                            />

                            <InfoLine
                              label="Criado por"
                              value={ticket.createdByUser?.name || "-"}
                            />

                            <InfoLine
                              label="Criado em"
                              value={new Date(ticket.createdAt).toLocaleString("pt-BR")}
                            />

                            <InfoLine
                              label="Solicitante"
                              value={ticket.resident?.name || ticket.createdByUser?.name || "-"}
                            />

                            <InfoLine
                              label="Local"
                              value={getTicketLocationLabel(ticket)}
                            />
                          </div>

                          <div className="mt-4 rounded-2xl border border-[#DDE5DF] bg-white p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
                              Resumo
                            </p>

                            <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
                              {getShortDescription(ticket.description)}
                            </p>
                          </div>

                          {canAssignResponsible() && isActiveTicket(ticket) && (
                            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
                              {!ticket.assignedToUser && (
                                <button
                                  onClick={() => {
                                    if (!currentUser?.id) {
                                      alert("Usuário logado não identificado.");
                                      return;
                                    }

                                    updateTicket(ticket.id, {
                                      assignedToUserId: currentUser.id,
                                    });
                                  }}
                                  disabled={!currentUser?.id || updatingTicketId === ticket.id}
                                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-4 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
                                >
                                  Assumir chamado
                                </button>
                              )}

                              <select
                                defaultValue=""
                                disabled={
                                  updatingTicketId === ticket.id ||
                                  ticketResponsibleUsers.length === 0
                                }
                                onChange={(e) => {
                                  if (!e.target.value) return;

                                  updateTicket(ticket.id, {
                                    assignedToUserId: e.target.value,
                                  });

                                  e.target.value = "";
                                }}
                                className="h-11 rounded-2xl border border-[#DDE5DF] bg-white px-3 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:ring-4 focus:ring-[#256D3C]/10 disabled:opacity-60 md:min-w-[260px]"
                              >
                                <option value="">Atribuir responsável</option>

                                {ticketResponsibleUsers.map((usuario) => (
                                  <option key={usuario.id} value={usuario.id}>
                                    {usuario.name} — {roleLabel(usuario.role)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {!canUseOperationalActions() && (
                            <div className="mt-4 rounded-2xl border border-[#DDE5DF] bg-white p-3 text-xs text-[#5E6B63]">
                              Visualização sem ações administrativas rápidas.
                            </div>
                          )}
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
      </AdminShell>
    </AdminContextGuard>
  );
}



/* =========================================================
   CARD PRINCIPAL DA VISÃO DA FILA
   ========================================================= */

function QueueMetricBox({
  title,
  value,
  description,
  active,
  onClick,
  highlighted = false,
}: {
  title: string;
  value: number;
  description?: string;
  active: boolean;
  onClick: () => void;
  highlighted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "h-full rounded-2xl border bg-white p-4 text-left shadow-sm transition",
        "hover:border-[#256D3C]/40 hover:bg-[#F9FBFA]",
        active
          ? "border-[#256D3C] ring-4 ring-[#256D3C]/10"
          : highlighted
            ? "border-[#CFE6D4]"
            : "border-[#DDE5DF]",
      ].join(" ")}
    >
      <p
        className={[
          "text-xs font-semibold uppercase tracking-[0.12em]",
          highlighted || active ? "text-[#256D3C]" : "text-[#7A877F]",
        ].join(" ")}
      >
        {title}
      </p>

      <strong
        className={[
          "mt-2 block text-3xl font-semibold",
          highlighted || active ? "text-[#256D3C]" : "text-[#17211B]",
        ].join(" ")}
      >
        {value}
      </strong>

      {description && (
        <p className="mt-1 text-xs text-[#5E6B63]">
          {description}
        </p>
      )}
    </button>
  );
}



/* =========================================================
   CARD DE MÉTRICA CLICÁVEL
   ========================================================= */

function MetricButton({
  title,
  value,
  description,
  active,
  onClick,
  tone = "default",
}: {
  title: string;
  value: number;
  description?: string;
  active: boolean;
  onClick: () => void;
  tone?: "default" | "green" | "yellow" | "red" | "orange" | "purple";
}) {
  const activeClass = "border-[#256D3C] bg-[#256D3C] text-white shadow-sm";

  const toneClass =
    tone === "green"
      ? "border-[#CFE6D4] bg-white text-[#256D3C] hover:border-[#8ED08E]"
      : tone === "yellow"
        ? "border-yellow-200 bg-white text-yellow-800 hover:border-yellow-300"
        : tone === "red"
          ? "border-red-200 bg-white text-red-700 hover:border-red-300"
          : tone === "orange"
            ? "border-orange-200 bg-white text-orange-700 hover:border-orange-300"
            : tone === "purple"
              ? "border-[#DDE5DF] bg-white text-[#17211B] hover:border-[#256D3C]/50"
              : "border-[#DDE5DF] bg-white text-[#17211B] hover:border-[#256D3C]/50";

  const markerClass =
    tone === "green"
      ? "bg-[#256D3C]"
      : tone === "yellow"
        ? "bg-yellow-500"
        : tone === "red"
          ? "bg-red-600"
          : tone === "orange"
            ? "bg-orange-500"
            : "bg-[#CFE6D4]";

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "relative overflow-hidden rounded-[24px] border p-4 text-left transition",
        "hover:-translate-y-0.5 hover:shadow-[0_18px_50px_rgba(23,33,27,0.08)]",
        active ? activeClass : toneClass,
      ].join(" ")}
    >
      {!active && (
        <span
          className={[
            "absolute left-0 top-5 h-8 w-1 rounded-r-full",
            markerClass,
          ].join(" ")}
        />
      )}

      <p className="pl-2 text-sm font-semibold opacity-80">{title}</p>

      <strong className="mt-1 block pl-2 text-3xl font-semibold">
        {value}
      </strong>

      {description && (
        <p className="mt-1 pl-2 text-xs opacity-75">{description}</p>
      )}
    </button>
  );
}



/* =========================================================
   LINHA DE INFORMAÇÃO DO MENU SUSPENSO
   ========================================================= */

function InfoLine({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div>
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
   CAMPO DE FORMULÁRIO DO MODAL
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