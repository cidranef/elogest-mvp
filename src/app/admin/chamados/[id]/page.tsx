"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import AdminContextGuard from "@/components/AdminContextGuard";
import AdminShell from "@/components/AdminShell";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";

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

interface TicketLog {
  id: string;
  ticketId?: string;
  action: string;
  fromValue?: string | null;
  toValue?: string | null;
  comment?: string | null;
  createdAt: string;

  actorRole?: string | null;
  actorLabel?: string | null;

  user?: {
    id?: string;
    name?: string;
    email?: string;
    role?: string;
  };

  access?: {
    id?: string;
    role?: string;
    label?: string | null;
  } | null;
}

interface TicketAttachment {
  id: string;
  ticketId: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdAt: string;
  uploadedByUser?: {
    id?: string;
    name?: string;
    email?: string;
    role?: string;
  };
}

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

  scope?: "UNIT" | "CONDOMINIUM" | string | null;

  title: string;
  description: string;
  status: string;
  category?: string | null;
  priority?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  closedAt?: string | null;
  firstResponseAt?: string | null;

  condominium?: {
    id?: string;
    name: string;
    administratorId?: string | null;
    cnpj?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    number?: string | null;
    district?: string | null;
    city?: string | null;
    state?: string | null;
  };

  unit?: {
    id?: string;
    block?: string | null;
    unitNumber: string;
    unitType?: string | null;
  } | null;

  resident?: {
    id?: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    residentType?: string | null;
  } | null;

  createdByUser?: {
    name: string;
    email?: string | null;
  };

  assignedToUser?: {
    id?: string;
    name: string;
    email?: string | null;
  };

  logs?: TicketLog[];
  attachments?: TicketAttachment[];
  rating?: TicketRating | null;
}

/* =========================================================
   PÁGINA DE DETALHES DO CHAMADO

   ETAPA 35.5:
   - Responsáveis filtrados por usuário ativo.
   - Responsáveis limitados a ADMINISTRADORA / SINDICO.
   - SINDICO só aparece quando pertence ao mesmo condomínio.
   - Histórico preservado.
   - Ações continuam protegidas pela API.

   ETAPA 38.6:
   - Melhorias de usabilidade da visão administrativa individual.
   - Adicionado resumo executivo no topo.
   - Adicionada situação operacional do chamado.
   - Comunicação pública e interna ficam mais claras.
   - Histórico passa a ser apresentado como "Histórico do Chamado".
   - Textos visíveis usam "perfil de acesso".
   - Regras funcionais preservadas.

   ETAPA 38.8 — POLIMENTO FINAL DE USABILIDADE DOS CHAMADOS

   - Adicionado bloco "Ação Recomendada".
   - Melhorada a leitura de Prazo, responsável e prioridade.
   - Situação operacional ficou mais orientada à próxima ação.
   - Chamados sem responsável, vencidos ou próximos do prazo ficam
     mais claros no resumo.
   - Comunicação pública e interna mantêm distinção visual forte.
   - Estados de chamado finalizado ficam mais explicativos.
   - Mantida toda a lógica funcional já aprovada.

   ETAPA 39.6 — DETALHE DO CHAMADO COM ADMINSHELL

   Atualização visual:
   - Página passa a usar AdminShell.
   - Removidos AdminTopActions e ActiveAccessBadge da própria página.
   - Topbar, sidebar, notificações, logout e footer passam para o shell.
   - Layout migrado do tema escuro antigo para o padrão claro EloGest.
   - Cards, badges, ações, anexos, comunicação e histórico recebem
     visual padronizado.
   - Mantida toda a lógica funcional já aprovada.

   ETAPA 39.17.6 — PADRONIZAÇÃO DO LOADING ADMIN

   Atualização:
   - Loading passa a usar EloGestLoadingScreen.
   - Evita montar AdminShell durante carregamento inicial.
   - Mantido AdminShell apenas após o chamado ser carregado.
   - Mantidas todas as ações operacionais já existentes.

   ETAPA 41.5 — REFINAMENTO PREMIUM DO DETALHE ADMIN

   Ajustes desta revisão:
   - Título do chamado passa a usar padrão visual elegante.
   - Removidas labels redundantes do topo.
   - "Prazo" substituído visualmente por "Prazo".
   - Título principal fica fora de card, como nos dashboards.
   - Mantida toda a lógica funcional já aprovada.
   ========================================================= */

export default function ChamadoDetalhesPage() {
  const params = useParams();

  const ticketId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [activeAccess, setActiveAccess] = useState<ActiveAccess | null>(null);
  const [currentUser, setCurrentUser] = useState<Usuario | null>(null);

  const [internalComment, setInternalComment] = useState("");
  const [publicComment, setPublicComment] = useState("");

  const [showResolutionBox, setShowResolutionBox] = useState(false);
  const [resolutionComment, setResolutionComment] = useState("");

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [savingInternalComment, setSavingInternalComment] = useState(false);
  const [savingPublicComment, setSavingPublicComment] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<
    string | null
  >(null);

  const [activeTab, setActiveTab] = useState("overview");
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

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
     LEITURA SEGURA DE RESPOSTAS DA API

     Evita erro:
     SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON

     Esse erro acontece quando uma rota retorna HTML de 404/erro
     e a página tenta executar response.json().
     ========================================================= */

  async function readApiJson(res: Response, fallbackMessage: string) {
    const contentType = res.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      return res.json();
    }

    const text = await res.text();

    console.error("Resposta inesperada da API. Era esperado JSON.", {
      status: res.status,
      statusText: res.statusText,
      contentType,
      preview: text.slice(0, 300),
    });

    throw new Error(`${fallbackMessage} Código HTTP: ${res.status}.`);
  }

  /* =========================================================
     CARREGAMENTO DO CHAMADO INDIVIDUAL
     ========================================================= */

  async function loadTicket() {
    if (!ticketId) return;

    try {
      setError("");
      setLoading(true);

      const res = await fetch(`/api/admin/chamados/${ticketId}`, {
        cache: "no-store",
      });

      const data = await readApiJson(res, "Erro ao carregar chamado.");

      if (!res.ok) {
        showError(data?.error || "Erro ao carregar chamado.");
        setTicket(null);
        return;
      }

      setTicket(data);
    } catch (err) {
      console.error(err);
      showError("Erro ao carregar chamado.");
      setTicket(null);
    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     RECARREGAMENTO DO CHAMADO SEM ATIVAR A TELA DE LOADING
     ========================================================= */

  async function refreshTicket() {
    if (!ticketId) return;

    try {
      const res = await fetch(`/api/admin/chamados/${ticketId}`, {
        cache: "no-store",
      });

      const data = await readApiJson(res, "Erro ao atualizar os dados do chamado.");

      if (!res.ok) {
        alert(data?.error || "Erro ao atualizar os dados do chamado.");
        return;
      }

      setTicket(data);
    } catch (err) {
      console.error(err);
      alert("Erro ao atualizar os dados do chamado.");
    }
  }

  /* =========================================================
     CARREGAMENTO DE USUÁRIOS PARA ATRIBUIÇÃO
     ========================================================= */

  async function loadUsuarios() {
    if (!ticketId) return;

    try {
      const res = await fetch(`/api/admin/chamados/${ticketId}/responsaveis`, {
        cache: "no-store",
      });

      const data = await readApiJson(res, "Erro ao carregar responsáveis.");

      if (!res.ok || !Array.isArray(data)) {
        setUsuarios([]);
        return;
      }

      setUsuarios(data);
    } catch (err) {
      console.error(err);
      setUsuarios([]);
    }
  }

  /* =========================================================
     CARREGAR USUÁRIO LOGADO
     ========================================================= */

  async function loadCurrentUser() {
    try {
      const res = await fetch("/api/user/accesses", {
        cache: "no-store",
      });

      const data = await readApiJson(res, "Erro ao carregar usuário logado.");

      if (!res.ok || !data?.user) {
        setCurrentUser(null);
        return;
      }

      setCurrentUser({
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        role: data.user.role,
        isActive: data.user.isActive,
        administratorId: data.user.administratorId,
        condominiumId: data.user.condominiumId,
      });
    } catch (err) {
      console.error(err);
      setCurrentUser(null);
    }
  }

  /* =========================================================
     CARREGAR PERFIL DE ACESSO ATIVO
     ========================================================= */

  async function loadActiveAccess() {
    try {
      const res = await fetch("/api/user/active-access", {
        cache: "no-store",
      });

      const data = await readApiJson(res, "Erro ao carregar perfil de acesso ativo.");

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

  /* =========================================================
     ATUALIZAÇÃO DO CHAMADO
     ========================================================= */

  async function updateTicket(payload: any, successMessage?: string) {
    if (!ticketId) return;

    try {
      setUpdating(true);

      const res = await fetch(`/api/admin/chamados/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await readApiJson(res, "Erro ao atualizar chamado.");

      if (!res.ok) {
        alert(data?.error || "Erro ao atualizar chamado.");
        return;
      }

      setTicket(data);

      if (successMessage) {
        showSuccess(successMessage);
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao atualizar chamado.");
    } finally {
      setUpdating(false);
    }
  }

  /* =========================================================
     RESOLVER CHAMADO COM MENSAGEM OBRIGATÓRIA
     ========================================================= */

  async function resolveTicketWithComment() {
    if (!ticket) return;

    const comment = resolutionComment.trim();

    if (!comment) {
      alert("Informe a mensagem de resolução antes de finalizar o chamado.");
      return;
    }

    if (ticket.status !== "IN_PROGRESS") {
      alert("O chamado precisa estar em andamento para ser resolvido.");
      return;
    }

    await updateTicket(
      {
        status: "RESOLVED",
        resolutionComment: comment,
      },
      "Chamado resolvido com sucesso.",
    );

    setResolutionComment("");
    setShowResolutionBox(false);
  }

  /* =========================================================
     SALVAR COMUNICAÇÃO DO CHAMADO
     ========================================================= */

  async function submitTicketCommunication(type: "internal" | "public") {
    if (!ticket || !ticketId) return;

    const currentComment =
      type === "internal" ? internalComment.trim() : publicComment.trim();

    if (!currentComment) {
      return;
    }

    if (ticket.status === "RESOLVED" || ticket.status === "CANCELED") {
      alert(
        "Este chamado está finalizado. Reabra o chamado antes de adicionar uma comunicação.",
      );
      return;
    }

    if (type === "internal" && !canSendInternalComment()) {
      alert(
        "Este perfil de acesso não possui permissão para comentário interno.",
      );
      return;
    }

    if (type === "public" && !canSendPublicComment()) {
      alert(
        "Este perfil de acesso não possui permissão para responder ao morador.",
      );
      return;
    }

    try {
      if (type === "internal") {
        setSavingInternalComment(true);
      } else {
        setSavingPublicComment(true);
      }

      const res = await fetch(`/api/admin/chamados/${ticketId}/comentarios`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type,
          comment: currentComment,
        }),
      });

      const data = await readApiJson(res, "Erro ao salvar comunicação do chamado.");

      if (!res.ok) {
        alert(data?.error || "Erro ao salvar comunicação do chamado.");
        return;
      }

      if (type === "internal") {
        setInternalComment("");
        showSuccess("Comentário Interno registrado com sucesso.");
      } else {
        setPublicComment("");
        showSuccess("Resposta Pública enviada com sucesso.");
      }

      await refreshTicket();
    } catch (err) {
      console.error(err);
      alert("Erro ao salvar comunicação do chamado.");
    } finally {
      setSavingInternalComment(false);
      setSavingPublicComment(false);
    }
  }

  /* =========================================================
     UPLOAD DE ANEXO
     ========================================================= */

  async function uploadAttachment() {
    if (!ticket || !ticketId) return;

    if (!selectedFile) {
      alert("Selecione um arquivo para anexar.");
      return;
    }

    if (!canUploadAttachment()) {
      alert("Este perfil de acesso não possui permissão para anexar arquivos.");
      return;
    }

    if (ticket.status === "RESOLVED" || ticket.status === "CANCELED") {
      alert(
        "Este chamado está finalizado. Reabra o chamado antes de anexar arquivos.",
      );
      return;
    }

    try {
      setUploading(true);

      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch(`/api/admin/chamados/${ticketId}/attachments`, {
        method: "POST",
        body: formData,
      });

      const data = await readApiJson(res, "Erro ao enviar anexo.");

      if (!res.ok) {
        alert(data?.error || "Erro ao enviar anexo.");
        return;
      }

      setSelectedFile(null);

      const fileInput = document.getElementById(
        "ticket-attachment-input",
      ) as HTMLInputElement | null;

      if (fileInput) {
        fileInput.value = "";
      }

      await refreshTicket();
      showSuccess("Anexo enviado com sucesso.");
    } catch (err) {
      console.error(err);
      alert("Erro ao enviar anexo.");
    } finally {
      setUploading(false);
    }
  }

  /* =========================================================
     REMOVER ANEXO
     ========================================================= */

  async function deleteAttachment(attachment: TicketAttachment) {
    if (!ticket || !ticketId) return;

    if (ticket.status === "RESOLVED" || ticket.status === "CANCELED") {
      alert(
        "Este chamado está finalizado. Reabra o chamado antes de remover anexos.",
      );
      return;
    }

    const confirmed = confirm(
      `Deseja realmente remover este anexo?\n\n${attachment.originalName}`,
    );

    if (!confirmed) return;

    try {
      setDeletingAttachmentId(attachment.id);

      const res = await fetch(
        `/api/admin/chamados/${ticketId}/attachments/${attachment.id}`,
        {
          method: "DELETE",
        },
      );

      const data = await readApiJson(res, "Erro ao remover anexo.");

      if (!res.ok) {
        alert(data?.error || "Erro ao remover anexo.");
        return;
      }

      await refreshTicket();
      showSuccess("Anexo removido com sucesso.");
    } catch (err) {
      console.error(err);
      alert("Erro ao remover anexo.");
    } finally {
      setDeletingAttachmentId(null);
    }
  }

  /* =========================================================
     INIT
     ========================================================= */

  useEffect(() => {
    loadTicket();
    loadUsuarios();
    loadCurrentUser();
    loadActiveAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  /* =========================================================
     LABELS E HELPERS
     ========================================================= */

  const statusLabel = (status?: string | null) =>
    ({
      OPEN: "Aberto",
      IN_PROGRESS: "Em andamento",
      RESOLVED: "Resolvido",
      CANCELED: "Cancelado",
    })[status || ""] ||
    status ||
    "-";

  const priorityLabel = (priority?: string | null) =>
    ({
      LOW: "Baixa",
      MEDIUM: "Média",
      HIGH: "Alta",
      URGENT: "Urgente",
    })[priority || ""] || "-";

  const roleLabel = (role?: string | null) =>
    ({
      SUPER_ADMIN: "Super Admin",
      ADMINISTRADORA: "Administradora",
      SINDICO: "Síndico",
      MORADOR: "Morador",
      PROPRIETARIO: "Proprietário",
      CONSELHEIRO: "Conselheiro",
    })[role || ""] ||
    role ||
    "-";

  const residentTypeLabel = (type?: string | null) =>
    ({
      PROPRIETARIO: "Proprietário",
      INQUILINO: "Inquilino",
      FAMILIAR: "Familiar",
      RESPONSAVEL: "Responsável",
      OUTRO: "Outro",
    })[type || ""] ||
    type ||
    "-";

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

  function isFinalizedTicket(currentTicket: Ticket) {
    return (
      currentTicket.status === "RESOLVED" || currentTicket.status === "CANCELED"
    );
  }

  function getSlaLimitHours(priority?: string | null) {
    if (priority === "URGENT") return 4;
    if (priority === "HIGH") return 24;
    if (priority === "MEDIUM") return 48;
    return 72;
  }

  function getSla(currentTicket: Ticket) {
    if (isFinalizedTicket(currentTicket)) {
      return {
        status: "DONE",
        label: "Prazo encerrado",
        className: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
      };
    }

    const createdAt = new Date(currentTicket.createdAt).getTime();
    const elapsedHours = Math.floor(
      (Date.now() - createdAt) / (1000 * 60 * 60),
    );
    const remainingHours =
      getSlaLimitHours(currentTicket.priority) - elapsedHours;

    const warningThreshold = Math.max(
      2,
      Math.ceil(getSlaLimitHours(currentTicket.priority) * 0.25),
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
      OPEN: "bg-blue-50 text-blue-700 border-blue-200",
      IN_PROGRESS: "bg-yellow-50 text-yellow-700 border-yellow-200",
      RESOLVED: "bg-[#EAF7EE] text-[#256D3C] border-[#CFE6D4]",
      CANCELED: "bg-red-50 text-red-700 border-red-200",
    })[status] || "bg-[#F6F8F7] text-[#5E6B63] border-[#DDE5DF]";

  const priorityClass = (priority?: string | null) =>
    ({
      LOW: "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]",
      MEDIUM: "border-blue-200 bg-blue-50 text-blue-700",
      HIGH: "border-orange-200 bg-orange-50 text-orange-700",
      URGENT: "border-red-200 bg-red-50 text-red-700",
    })[priority || ""] || "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]";

  /* =========================================================
     PERMISSÕES VISUAIS POR PERFIL DE ACESSO
     ========================================================= */

  function isAdminContext() {
    return (
      activeAccess?.role === "SUPER_ADMIN" ||
      activeAccess?.role === "ADMINISTRADORA"
    );
  }

  function isSyndicContext() {
    return activeAccess?.role === "SINDICO";
  }

  function canChangeStatus() {
    return isAdminContext();
  }

  function canAssignResponsible() {
    return isAdminContext();
  }

  function canSendInternalComment() {
    return isAdminContext();
  }

  function canSendPublicComment() {
    return isAdminContext() || isSyndicContext();
  }

  function canUploadAttachment() {
    return isAdminContext() || isSyndicContext();
  }

  function canSeeOperationalActions() {
    return canChangeStatus() || canAssignResponsible();
  }

  /* =========================================================
     RESPONSÁVEIS OPERACIONAIS
     ========================================================= */

  const responsibleUsers = useMemo(() => {
    if (!ticket) return [];

    const targetCondominiumId = ticket.condominium?.id || null;
    const targetAdministratorId = ticket.condominium?.administratorId || null;

    return usuarios.filter((usuario) => {
      const isActive = usuario.isActive !== false;

      if (!isActive) return false;

      if (usuario.role === "ADMINISTRADORA") {
        if (targetAdministratorId && usuario.administratorId) {
          return usuario.administratorId === targetAdministratorId;
        }

        return true;
      }

      if (usuario.role === "SINDICO") {
        return (
          !!targetCondominiumId && usuario.condominiumId === targetCondominiumId
        );
      }

      return false;
    });
  }, [usuarios, ticket]);

  const canCurrentUserAssumeTicket = useMemo(() => {
    if (!currentUser || !ticket) return false;

    return responsibleUsers.some((usuario) => usuario.id === currentUser.id);
  }, [currentUser, responsibleUsers, ticket]);

  /* =========================================================
     LABELS DO ESCOPO DO CHAMADO
     ========================================================= */

  function getTicketScopeLabel(currentTicket: Ticket) {
    if (currentTicket.scope === "CONDOMINIUM") {
      return "Condomínio";
    }

    return "Unidade";
  }

  function getTicketLocationLabel(currentTicket: Ticket) {
    if (currentTicket.scope === "CONDOMINIUM") {
      return "Condomínio / Área comum";
    }

    if (currentTicket.unit) {
      return `Unidade ${
        currentTicket.unit.block ? currentTicket.unit.block + " - " : ""
      }${currentTicket.unit.unitNumber}`;
    }

    return "Condomínio / Área comum";
  }

  function getFullAddressLabel(currentTicket: Ticket) {
    const condominium = currentTicket.condominium;

    if (!condominium) return "-";

    const parts = [
      condominium.address,
      condominium.number,
      condominium.district,
      condominium.city,
      condominium.state,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(", ") : "-";
  }

  /* =========================================================
     SITUAÇÃO OPERACIONAL E AÇÃO RECOMENDADA
     ========================================================= */

  function getRecommendedAction(currentTicket: Ticket) {
    const currentSla = getSla(currentTicket);

    if (currentTicket.status === "RESOLVED") {
      return "Chamado resolvido. Revise a avaliação do morador e o histórico apenas se houver solicitação de reabertura.";
    }

    if (currentTicket.status === "CANCELED") {
      return "Chamado cancelado. Nenhuma ação operacional pendente.";
    }

    if (!currentTicket.assignedToUser) {
      return "Definir ou assumir um responsável para iniciar a triagem do chamado.";
    }

    if (currentSla.status === "OVERDUE") {
      return "Priorizar atendimento, registrar atualização pública e acompanhar até a resolução.";
    }

    if (currentSla.status === "WARNING") {
      return "Acompanhar de perto para evitar vencimento do prazo e registrar avanço no chamado.";
    }

    if (currentTicket.status === "OPEN") {
      return "Iniciar atendimento ou validar se a ocorrência já deve ser encaminhada ao responsável.";
    }

    if (currentTicket.status === "IN_PROGRESS") {
      return "Registrar avanço público quando houver retorno e finalizar somente com mensagem de resolução.";
    }

    return "Acompanhar conforme a movimentação do chamado.";
  }

  function getOperationalSituation(currentTicket: Ticket) {
    const currentSla = getSla(currentTicket);

    if (currentTicket.status === "OPEN") {
      if (!currentTicket.assignedToUser) {
        return {
          title: "Aguardando responsável",
          description:
            "Este chamado ainda não foi iniciado e não possui responsável definido. A próxima ação recomendada é assumir ou atribuir um responsável para triagem.",
          className: "border-purple-200 bg-purple-50 text-purple-800",
        };
      }

      return {
        title: "Aguardando início do atendimento",
        description:
          "Este chamado ainda não foi iniciado. O responsável já foi definido, mas o atendimento precisa ser iniciado para registrar avanço operacional.",
        className: "border-blue-200 bg-blue-50 text-blue-800",
      };
    }

    if (currentTicket.status === "IN_PROGRESS") {
      if (currentSla.status === "OVERDUE") {
        return {
          title: "Atendimento fora do prazo",
          description:
            "O chamado está em andamento, mas o prazo venceu. Priorize o atendimento e registre uma atualização pública para o solicitante.",
          className: "border-red-200 bg-red-50 text-red-800",
        };
      }

      if (currentSla.status === "WARNING") {
        return {
          title: "Atendimento próximo do limite",
          description:
            "O chamado está em andamento e se aproxima do vencimento do prazo. Acompanhe de perto e registre avanço quando houver retorno.",
          className: "border-orange-200 bg-orange-50 text-orange-800",
        };
      }

      return {
        title: "Chamado em atendimento",
        description:
          "O chamado está em andamento. Registre respostas públicas, comentários internos, anexos e, quando finalizar, informe a mensagem de resolução.",
        className: "border-yellow-200 bg-yellow-50 text-yellow-800",
      };
    }

    if (currentTicket.status === "RESOLVED") {
      return {
        title: "Chamado resolvido",
        description:
          "Este chamado foi finalizado como resolvido. Para novas comunicações ou anexos, será necessário reabrir o chamado.",
        className: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
      };
    }

    if (currentTicket.status === "CANCELED") {
      return {
        title: "Chamado cancelado",
        description:
          "Este chamado foi encerrado sem continuidade. Para prosseguir com atendimento, reabra ou registre um novo chamado.",
        className: "border-red-200 bg-red-50 text-red-800",
      };
    }

    return {
      title: "Acompanhamento operacional",
      description:
        "Acompanhe os dados, comunicações, anexos e histórico deste chamado.",
      className: "border-[#DDE5DF] bg-white text-[#17211B]",
    };
  }

  /* =========================================================
     LABELS DO AUTOR NA TIMELINE ADMIN
     ========================================================= */

  function actorRoleLabel(roleValue?: string | null) {
    if (roleValue === "SUPER_ADMIN") return "Super Admin";
    if (roleValue === "ADMINISTRADORA") return "Administradora";
    if (roleValue === "SINDICO") return "Síndico";
    if (roleValue === "MORADOR") return "Morador";
    if (roleValue === "PROPRIETARIO") return "Proprietário";
    if (roleValue === "CONSELHEIRO") return "Conselheiro";

    return "Usuário";
  }

  function getTimelineActorName(log: TicketLog) {
    return log.user?.name || "Sistema";
  }

  function getTimelineActorLabel(log: TicketLog) {
    const roleValue = getTimelineActorRole(log);

    if (roleValue === "SISTEMA") {
      return "Sistema";
    }

    return actorRoleLabel(roleValue);
  }

  function getTimelineActorRole(log: TicketLog) {
    return log.actorRole || log.access?.role || log.user?.role || "SISTEMA";
  }

  function actorBadgeClass(roleValue?: string | null) {
    if (roleValue === "SINDICO") {
      return "border-purple-200 bg-purple-50 text-purple-700";
    }

    if (roleValue === "MORADOR") {
      return "border-blue-200 bg-blue-50 text-blue-700";
    }

    if (roleValue === "PROPRIETARIO") {
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    }

    if (roleValue === "ADMINISTRADORA") {
      return "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]";
    }

    if (roleValue === "SUPER_ADMIN") {
      return "border-red-200 bg-red-50 text-red-700";
    }

    return "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]";
  }

  /* =========================================================
     LINHA DO TEMPO - TÍTULOS
     ========================================================= */

  const timelineTitle = (log: TicketLog) => {
    if (log.action === "CREATED") return "Chamado criado";

    if (log.action === "STATUS_CHANGED") {
      return `${statusLabel(log.fromValue)} → ${statusLabel(log.toValue)}`;
    }

    if (log.action === "ASSIGNED") {
      return `Responsável atribuído: ${log.toValue || "-"}`;
    }

    if (log.action === "COMMENT_INTERNAL") return "Comentário Interno";
    if (log.action === "COMMENT_PUBLIC") return "Resposta Pública";
    if (log.action === "COMMENT") return "Comentário";

    if (log.action === "ATTACHMENT_ADDED") return "Anexo adicionado";
    if (log.action === "ATTACHMENT_REMOVED") return "Anexo removido";

    return log.action;
  };

  const timelineColor = (action: string) => {
    if (action === "CREATED") return "border-blue-500";
    if (action === "STATUS_CHANGED") return "border-yellow-500";
    if (action === "ASSIGNED") return "border-purple-500";

    if (action === "COMMENT_INTERNAL") return "border-[#7A877F]";
    if (action === "COMMENT_PUBLIC") return "border-[#256D3C]";
    if (action === "COMMENT") return "border-[#7A877F]";

    if (action === "ATTACHMENT_ADDED") return "border-cyan-500";
    if (action === "ATTACHMENT_REMOVED") return "border-red-500";

    return "border-[#DDE5DF]";
  };

  const timelineBadge = (action: string) => {
    if (action === "COMMENT_INTERNAL") {
      return {
        label: "Interno",
        className: "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]",
      };
    }

    if (action === "COMMENT_PUBLIC") {
      return {
        label: "Visível no portal",
        className: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
      };
    }

    if (action === "ATTACHMENT_ADDED") {
      return {
        label: "Anexo",
        className: "border-cyan-200 bg-cyan-50 text-cyan-700",
      };
    }

    if (action === "ATTACHMENT_REMOVED") {
      return {
        label: "Anexo removido",
        className: "border-red-200 bg-red-50 text-red-700",
      };
    }

    if (action === "ASSIGNED") {
      return {
        label: "Responsável",
        className: "border-purple-200 bg-purple-50 text-purple-700",
      };
    }

    return null;
  };

  function formatFileSize(bytes: number) {
    if (!bytes) return "-";

    if (bytes < 1024) {
      return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function isImageAttachment(attachment: TicketAttachment) {
    return attachment.mimeType.startsWith("image/");
  }

  function canDeleteAttachment(attachment: TicketAttachment) {
    if (!ticket) return false;

    if (!canUploadAttachment()) return false;

    if (isFinalizedTicket(ticket)) {
      return false;
    }

    return (
      !!currentUser?.id && attachment.uploadedByUser?.id === currentUser.id
    );
  }

  function renderStars(value: number) {
    return "★".repeat(value) + "☆".repeat(Math.max(0, 5 - value));
  }

  /* =========================================================
     LOGS FILTRADOS
     ========================================================= */

  const visibleLogs = useMemo(() => {
    if (!ticket) return [];

    return (ticket.logs || []).filter(
      (log) => !log.ticketId || log.ticketId === ticket.id,
    );
  }, [ticket]);

  /* =========================================================
     ANEXOS FILTRADOS
     ========================================================= */

  const attachments = useMemo(() => {
    if (!ticket) return [];

    return (ticket.attachments || []).filter(
      (attachment) => attachment.ticketId === ticket.id,
    );
  }, [ticket]);

  /* =========================================================
     ESTADOS DE CARREGAMENTO
     ========================================================= */

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando chamado..."
        description="Aguarde enquanto identificamos seu perfil de acesso e carregamos o detalhe administrativo."
      />
    );
  }

  if (error || !ticket) {
    return (
      <AdminContextGuard
        fallbackTitle="Detalhe administrativo indisponível neste perfil de acesso"
        fallbackDescription="O detalhe administrativo do chamado é exclusivo para administradora ou super admin. Para acompanhar chamados como síndico, morador ou proprietário, acesse o portal."
      >
        <AdminShell
          current="chamados"
          title="Detalhe do Chamado"
          description="Não foi possível carregar este chamado."
        >
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error || "Chamado não encontrado."}
          </div>

          <Link
            href="/admin/chamados"
            className="mt-5 inline-flex h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
          >
            Voltar para a fila
          </Link>
        </AdminShell>
      </AdminContextGuard>
    );
  }

  const sla = getSla(ticket);
  const operationalSituation = getOperationalSituation(ticket);
  const recommendedAction = getRecommendedAction(ticket);

  /* =========================================================
     RENDER
     ========================================================= */

  const orderedLogs = [...visibleLogs].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const latestLog = orderedLogs[orderedLogs.length - 1] || null;

  const selectedTimelineLog =
    orderedLogs.find((log) => log.id === selectedLogId) ||
    latestLog ||
    null;

  const selectedTimelineIndex = selectedTimelineLog
    ? Math.max(
        0,
        orderedLogs.findIndex((log) => log.id === selectedTimelineLog.id),
      )
    : 0;

  const finalized = isFinalizedTicket(ticket);

  const tabItems = [
    { id: "overview", label: "Visão Geral", shortLabel: "Geral", icon: "◉" },
    { id: "service", label: "Atendimento", shortLabel: "Atend.", icon: "✓" },
    { id: "attachments", label: `Anexos (${attachments.length})`, shortLabel: `Anexos`, icon: "↥" },
    { id: "communication", label: "Comunicação", shortLabel: "Com.", icon: "✉" },
    { id: "history", label: `Histórico (${orderedLogs.length})`, shortLabel: "Hist.", icon: "↺" },
  ];

  return (
    <AdminContextGuard
      fallbackTitle="Detalhe administrativo indisponível neste perfil de acesso"
      fallbackDescription="O detalhe administrativo do chamado é exclusivo para administradora ou super admin. Para acompanhar chamados como síndico, morador ou proprietário, acesse o portal."
    >
      <AdminShell
        current="chamados"
        title="Detalhe do Chamado"
        description="Resumo, atendimento, anexos, comunicação e histórico do chamado."
      >
        <div className="space-y-6">
          <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#256D3C]">
                Chamados
              </p>

              <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight text-[#17211B] md:text-4xl">
                {formatDisplayTitle(ticket.title)}
              </h1>

              <p className="mt-2 max-w-4xl text-sm leading-6 text-[#5E6B63]">
                {ticket.condominium?.name || "Condomínio não informado"} •{" "}
                {getTicketLocationLabel(ticket)} • Aberto por{" "}
                {ticket.resident?.name || ticket.createdByUser?.name || "-"}
              </p>
            </div>

            <Link
              href="/admin/chamados"
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#17211B] shadow-sm transition hover:border-[#256D3C] hover:text-[#256D3C]"
            >
              Voltar para a fila
            </Link>
          </header>

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
              CABEÇALHO-RESUMO COMPACTO
              ===================================================== */}

          <section className="overflow-hidden rounded-[32px] border border-[#DDE5DF] bg-white shadow-sm">
            <div className="bg-[linear-gradient(135deg,#FFFFFF_0%,#F8FAF9_62%,#EAF7EE_135%)] p-6">
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(ticket.status)}`}
                  >
                    {statusLabel(ticket.status)}
                  </span>

                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${priorityClass(ticket.priority)}`}
                  >
                    {priorityLabel(ticket.priority)}
                  </span>

                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${sla.className}`}
                  >
                    {sla.label}
                  </span>

                  {!ticket.assignedToUser && !finalized && (
                    <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
                      Sem responsável
                    </span>
                  )}

                  {ticket.rating && (
                    <span className="rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-700">
                      Avaliado: {ticket.rating.rating}/5
                    </span>
                  )}
                </div>

                <div className="rounded-[26px] border border-[#CFE6D4] bg-white p-5 shadow-sm">
                  <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#256D3C]">
                        Descrição do Chamado
                      </p>

                      <p className="mt-1 text-sm text-[#7A877F]">
                        Texto enviado na abertura da solicitação.
                      </p>
                    </div>

                    <span className="inline-flex w-fit rounded-full border border-[#DDE5DF] bg-[#F9FBFA] px-3 py-1 text-xs font-semibold text-[#5E6B63]">
                      {getTicketScopeLabel(ticket)}
                    </span>
                  </div>

                  <p className="whitespace-pre-line text-base leading-8 text-[#17211B] md:text-lg">
                    {ticket.description || "Sem descrição informada."}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
                  <div className="rounded-[24px] border border-[#DDE5DF] bg-white/90 p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                          Próxima Ação
                        </p>

                        <h2 className="mt-2 text-xl font-semibold text-[#17211B]">
                          {operationalSituation.title}
                        </h2>

                        <p className="mt-2 max-w-4xl text-sm leading-6 text-[#5E6B63]">
                          {recommendedAction}
                        </p>
                      </div>
                    </div>
                  </div>

                  <aside className="rounded-[24px] border border-[#DDE5DF] bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                      Atendimento
                    </p>

                    <div className="mt-4 space-y-3 text-sm">
                      <CompactInfoLine
                        label="Responsável"
                        value={ticket.assignedToUser?.name || "Não atribuído"}
                      />

                      <CompactInfoLine
                        label="Criado em"
                        value={new Date(ticket.createdAt).toLocaleString("pt-BR")}
                      />
                    </div>
                  </aside>
                </div>
              </div>
            </div>

            <div className="border-t border-[#DDE5DF] bg-white p-4">
              <div className="flex flex-wrap gap-3">
                {canChangeStatus() && ticket.status === "OPEN" && (
                  <button
                    onClick={() =>
                      updateTicket(
                        { status: "IN_PROGRESS" },
                        "Atendimento iniciado com sucesso.",
                      )
                    }
                    disabled={updating}
                    className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
                  >
                    Iniciar Atendimento
                  </button>
                )}

                {canChangeStatus() && ticket.status === "IN_PROGRESS" && (
                  <button
                    onClick={() => setShowResolutionBox((current) => !current)}
                    disabled={updating}
                    className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
                  >
                    Resolver Chamado
                  </button>
                )}

                {canChangeStatus() && finalized && (
                  <button
                    onClick={() =>
                      updateTicket(
                        { status: "OPEN" },
                        "Chamado reaberto com sucesso.",
                      )
                    }
                    disabled={updating}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:opacity-60"
                  >
                    Reabrir Chamado
                  </button>
                )}

                {canAssignResponsible() && !ticket.assignedToUser && !finalized && (
                  <button
                    onClick={() => {
                      if (!currentUser?.id) {
                        alert("Usuário logado não identificado.");
                        return;
                      }

                      if (!canCurrentUserAssumeTicket) {
                        alert("Seu usuário não está disponível como responsável para este chamado.");
                        return;
                      }

                      updateTicket(
                        { assignedToUserId: currentUser.id },
                        "Chamado assumido com sucesso.",
                      );
                    }}
                    disabled={updating || !currentUser?.id || !canCurrentUserAssumeTicket}
                    className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:opacity-60"
                  >
                    Assumir Chamado
                  </button>
                )}

                {canAssignResponsible() && !finalized && (
                  <select
                    defaultValue=""
                    disabled={updating || responsibleUsers.length === 0}
                    onChange={(e) => {
                      if (!e.target.value) return;

                      updateTicket(
                        { assignedToUserId: e.target.value },
                        "Responsável atribuído com sucesso.",
                      );

                      e.target.value = "";
                    }}
                    className="h-11 rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:ring-4 focus:ring-[#256D3C]/10 disabled:opacity-60"
                  >
                    <option value="">Atribuir Responsável</option>

                    {responsibleUsers.map((usuario) => (
                      <option key={usuario.id} value={usuario.id}>
                        {usuario.name} — {roleLabel(usuario.role)}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {showResolutionBox && ticket.status === "IN_PROGRESS" && (
                <div className="mt-4 rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] p-4">
                  <label className="text-sm font-semibold text-[#17211B]">
                    Mensagem de resolução visível no portal
                  </label>

                  <textarea
                    value={resolutionComment}
                    onChange={(e) => setResolutionComment(e.target.value)}
                    rows={4}
                    className="form-input mt-2 bg-white"
                    placeholder="Informe o que foi resolvido, orientação final ou providência realizada."
                  />

                  <div className="mt-3 flex flex-wrap justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setResolutionComment("");
                        setShowResolutionBox(false);
                      }}
                      className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#17211B] transition hover:border-red-200 hover:text-red-700"
                    >
                      Cancelar
                    </button>

                    <button
                      type="button"
                      onClick={resolveTicketWithComment}
                      disabled={updating || !resolutionComment.trim()}
                      className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
                    >
                      Confirmar Resolução
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* =====================================================
              ABAS
              ===================================================== */}

          <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-2 shadow-sm">
            <div className="grid grid-cols-5 gap-1 sm:gap-2">
              {tabItems.map((tab) => {
                const isActive = activeTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    title={tab.label}
                    aria-label={tab.label}
                    className={[
                      "flex min-h-[58px] flex-col items-center justify-center rounded-2xl px-2 py-2 text-center text-xs font-semibold transition sm:min-h-[46px] sm:flex-row sm:gap-2 sm:px-4 sm:text-sm",
                      isActive
                        ? "bg-[#256D3C] text-white shadow-sm"
                        : "border border-[#DDE5DF] bg-white text-[#5E6B63] hover:border-[#256D3C] hover:text-[#256D3C]",
                    ].join(" ")}
                  >
                    <span className="text-lg leading-none sm:text-base">{tab.icon}</span>
                    <span className="mt-1 leading-tight sm:mt-0 sm:hidden">
                      {tab.shortLabel}
                    </span>
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {activeTab === "overview" && (
            <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <div className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm xl:col-span-2">
                <h2 className="text-xl font-semibold text-[#17211B]">
                  Visão Geral
                </h2>

                <p className="mt-1 text-sm text-[#5E6B63]">
                  Dados principais do chamado e contexto da ocorrência.
                </p>

                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <InfoBox label="Status" value={statusLabel(ticket.status)} />
                  <InfoBox label="Prioridade" value={priorityLabel(ticket.priority)} />
                  <InfoBox label="Prazo" value={sla.label} />
                  <InfoBox
                    label="Responsável"
                    value={ticket.assignedToUser?.name || "Não atribuído"}
                  />
                  <InfoBox
                    label="Condomínio"
                    value={ticket.condominium?.name || "-"}
                  />
                  <InfoBox label="Local" value={getTicketLocationLabel(ticket)} />
                  <InfoBox label="Tipo" value={getTicketScopeLabel(ticket)} />
                  <InfoBox
                    label="Categoria"
                    value={ticket.category || "-"}
                  />
                </div>
              </div>

              <aside className="space-y-6">
                <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
                  <h2 className="text-xl font-semibold text-[#17211B]">
                    Solicitante
                  </h2>

                  <div className="mt-5 space-y-3">
                    <InfoBox
                      label="Nome"
                      value={ticket.resident?.name || ticket.createdByUser?.name || "-"}
                    />
                    <InfoBox
                      label="Contato"
                      value={ticket.resident?.email || ticket.resident?.phone || ticket.createdByUser?.email || "-"}
                    />
                    <InfoBox
                      label="Tipo de morador"
                      value={residentTypeLabel(ticket.resident?.residentType)}
                    />
                  </div>
                </section>

                {ticket.rating && (
                  <section className="rounded-[28px] border border-yellow-200 bg-yellow-50 p-6 shadow-sm">
                    <h2 className="text-xl font-semibold text-[#17211B]">
                      Avaliação
                    </h2>

                    <p className="mt-3 text-2xl tracking-wider text-yellow-700">
                      {renderStars(ticket.rating.rating)}
                    </p>

                    <p className="mt-2 text-sm font-semibold text-yellow-800">
                      Nota {ticket.rating.rating} de 5
                    </p>

                    {ticket.rating.comment && (
                      <p className="mt-3 whitespace-pre-line rounded-2xl border border-yellow-200 bg-white p-3 text-sm leading-6 text-[#5E6B63]">
                        {ticket.rating.comment}
                      </p>
                    )}
                  </section>
                )}
              </aside>
            </section>
          )}

          {activeTab === "service" && (
            <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <div className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm xl:col-span-2">
                <h2 className="text-xl font-semibold text-[#17211B]">
                  Atendimento
                </h2>

                <p className="mt-1 text-sm text-[#5E6B63]">
                  Atualize responsável, status e acompanhe os pontos de atenção do chamado.
                </p>

                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                  <InfoBox
                    label="Criado em"
                    value={new Date(ticket.createdAt).toLocaleString("pt-BR")}
                  />
                  <InfoBox
                    label="Primeira resposta"
                    value={
                      ticket.firstResponseAt
                        ? new Date(ticket.firstResponseAt).toLocaleString("pt-BR")
                        : "-"
                    }
                  />
                  <InfoBox
                    label="Resolvido em"
                    value={
                      ticket.resolvedAt
                        ? new Date(ticket.resolvedAt).toLocaleString("pt-BR")
                        : "-"
                    }
                  />
                </div>

                <div className="mt-5 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                    Orientação Operacional
                  </p>
                  <p className="mt-2 text-sm leading-7 text-[#5E6B63]">
                    {recommendedAction}
                  </p>
                </div>
              </div>

              <aside className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-[#17211B]">
                  Ações Administrativas
                </h2>

                <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
                  As ações principais também ficam disponíveis no cabeçalho do chamado.
                </p>

                <div className="mt-5 space-y-3">
                  {canChangeStatus() && ticket.status === "OPEN" && (
                    <button
                      onClick={() =>
                        updateTicket({ status: "IN_PROGRESS" }, "Atendimento iniciado com sucesso.")
                      }
                      disabled={updating}
                      className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
                    >
                      Iniciar Atendimento
                    </button>
                  )}

                  {canChangeStatus() && ticket.status === "IN_PROGRESS" && (
                    <button
                      onClick={() => setShowResolutionBox(true)}
                      disabled={updating}
                      className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
                    >
                      Resolver Chamado
                    </button>
                  )}

                  {canChangeStatus() && finalized && (
                    <button
                      onClick={() => updateTicket({ status: "OPEN" }, "Chamado reaberto com sucesso.")}
                      disabled={updating}
                      className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:opacity-60"
                    >
                      Reabrir Chamado
                    </button>
                  )}

                  {canAssignResponsible() && !finalized && (
                    <select
                      defaultValue=""
                      disabled={updating || responsibleUsers.length === 0}
                      onChange={(e) => {
                        if (!e.target.value) return;

                        updateTicket(
                          { assignedToUserId: e.target.value },
                          "Responsável atribuído com sucesso.",
                        );

                        e.target.value = "";
                      }}
                      className="h-11 w-full rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:ring-4 focus:ring-[#256D3C]/10 disabled:opacity-60"
                    >
                      <option value="">Atribuir Responsável</option>
                      {responsibleUsers.map((usuario) => (
                        <option key={usuario.id} value={usuario.id}>
                          {usuario.name} — {roleLabel(usuario.role)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </aside>
            </section>
          )}

          {activeTab === "attachments" && (
            <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-[#17211B]">
                    Anexos
                  </h2>
                  <p className="mt-1 text-sm text-[#5E6B63]">
                    Fotos, PDFs, laudos, orçamentos e documentos relacionados ao chamado.
                  </p>
                </div>

                <span className="rounded-full border border-[#DDE5DF] bg-[#F9FBFA] px-3 py-1 text-xs font-semibold text-[#5E6B63]">
                  {attachments.length} anexo(s)
                </span>
              </div>

              {canUploadAttachment() && !finalized ? (
                <div className="mt-5 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                  <label className="text-sm font-semibold text-[#17211B]">
                    Selecionar arquivo
                  </label>
                  <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-center">
                    <input
                      id="ticket-attachment-input"
                      type="file"
                      onChange={(e) =>
                        setSelectedFile(e.target.files?.[0] || null)
                      }
                      className="form-input"
                    />
                    <button
                      onClick={uploadAttachment}
                      disabled={uploading || !selectedFile}
                      className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0] md:min-w-[150px]"
                    >
                      {uploading ? "Enviando..." : "Enviar anexo"}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-[#7A877F]">
                    Permitidos: JPG, PNG, WEBP e PDF. Limite: 10 MB.
                  </p>
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4 text-sm text-[#5E6B63]">
                  {finalized
                    ? "Este chamado está finalizado. Reabra o chamado antes de anexar novos arquivos."
                    : "Este perfil de acesso não possui permissão para anexar arquivos."}
                </div>
              )}

              {attachments.length === 0 ? (
                <p className="mt-5 text-sm text-[#7A877F]">
                  Nenhum anexo enviado para este chamado.
                </p>
              ) : (
                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4"
                    >
                      {isImageAttachment(attachment) && (
                        <a href={attachment.url} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={attachment.url}
                            alt={attachment.originalName}
                            className="mb-3 h-40 w-full rounded-2xl object-cover"
                          />
                        </a>
                      )}

                      <p className="break-words text-sm font-semibold text-[#17211B]">
                        {attachment.originalName}
                      </p>
                      <p className="mt-1 text-xs text-[#7A877F]">
                        {attachment.mimeType} • {formatFileSize(attachment.sizeBytes)}
                      </p>
                      <p className="mt-1 text-xs text-[#7A877F]">
                        Enviado por {attachment.uploadedByUser?.name || "-"} •{" "}
                        {new Date(attachment.createdAt).toLocaleString("pt-BR")}
                      </p>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <a
                          href={attachment.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
                        >
                          Abrir
                        </a>

                        {canDeleteAttachment(attachment) && (
                          <button
                            onClick={() => deleteAttachment(attachment)}
                            disabled={deletingAttachmentId === attachment.id}
                            className="inline-flex h-10 items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                          >
                            {deletingAttachmentId === attachment.id
                              ? "Removendo..."
                              : "Remover"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {activeTab === "communication" && (
            <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-[#17211B]">
                Comunicação do Chamado
              </h2>

              <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
                Use comentário interno para observações da equipe. Use resposta pública quando a mensagem deve aparecer no portal do solicitante.
              </p>

              {finalized ? (
                <div className="mt-5 rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
                  Este chamado está finalizado. Reabra o chamado antes de adicionar novas comunicações.
                </div>
              ) : !canSendInternalComment() && !canSendPublicComment() ? (
                <div className="mt-5 rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-4 text-sm text-[#5E6B63]">
                  Este perfil de acesso não possui ações de comunicação administrativa nesta tela.
                </div>
              ) : (
                <div
                  className={
                    canSendInternalComment() && canSendPublicComment()
                      ? "mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2"
                      : "mt-5 grid grid-cols-1 gap-5"
                  }
                >
                  {canSendInternalComment() && (
                    <div className="rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-4">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-[#17211B]">
                          Comentário Interno
                        </h3>
                        <span className="rounded-full border border-[#DDE5DF] bg-white px-2 py-1 text-[11px] font-semibold text-[#5E6B63]">
                          Não aparece no portal
                        </span>
                      </div>
                      <textarea
                        value={internalComment}
                        onChange={(e) => setInternalComment(e.target.value)}
                        placeholder="Ex.: Verificar com o zelador antes de responder o morador..."
                        rows={6}
                        className="form-input"
                      />
                      <div className="mt-3 flex justify-end">
                        <button
                          onClick={() => submitTicketCommunication("internal")}
                          disabled={savingInternalComment || !internalComment.trim()}
                          className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-700 px-5 text-sm font-semibold text-white transition hover:bg-slate-600 disabled:bg-[#9AA7A0]"
                        >
                          {savingInternalComment ? "Salvando..." : "Salvar Comentário Interno"}
                        </button>
                      </div>
                    </div>
                  )}

                  {canSendPublicComment() && (
                    <div className="rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] p-4">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-[#17211B]">
                          Resposta Pública
                        </h3>
                        <span className="rounded-full border border-[#CFE6D4] bg-white px-2 py-1 text-[11px] font-semibold text-[#256D3C]">
                          Visível no portal
                        </span>
                      </div>
                      <textarea
                        value={publicComment}
                        onChange={(e) => setPublicComment(e.target.value)}
                        placeholder="Ex.: Recebemos sua solicitação. A equipe irá verificar..."
                        rows={6}
                        className="form-input bg-white"
                      />
                      <div className="mt-3 flex justify-end">
                        <button
                          onClick={() => submitTicketCommunication("public")}
                          disabled={savingPublicComment || !publicComment.trim()}
                          className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
                        >
                          {savingPublicComment ? "Enviando..." : "Enviar Resposta Pública"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {activeTab === "history" && (
            <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-[#17211B]">
                Histórico do Chamado
              </h2>

              <p className="mt-1 text-sm text-[#5E6B63]">
                Marcos principais do atendimento. Clique em um marco para ver os detalhes.
              </p>

              {orderedLogs.length === 0 ? (
                <p className="mt-5 text-sm text-[#7A877F]">
                  Nenhum histórico registrado para este chamado.
                </p>
              ) : (
                <>
                  <div className="mt-6 md:hidden">
                    {selectedTimelineLog && (
                      <div className="rounded-[24px] border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              const previousIndex = Math.max(
                                0,
                                selectedTimelineIndex - 1,
                              );

                              setSelectedLogId(orderedLogs[previousIndex]?.id || null);
                            }}
                            disabled={selectedTimelineIndex <= 0}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white text-lg font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:opacity-40"
                            aria-label="Marco anterior"
                          >
                            ‹
                          </button>

                          <div className="min-w-0 flex-1 text-center">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
                              Marco {selectedTimelineIndex + 1} de {orderedLogs.length}
                            </p>

                            <h3 className="mt-1 break-words text-base font-semibold text-[#17211B]">
                              {timelineTitle(selectedTimelineLog)}
                            </h3>

                            <p className="mt-1 text-xs text-[#7A877F]">
                              {new Date(selectedTimelineLog.createdAt).toLocaleString("pt-BR")}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const nextIndex = Math.min(
                                orderedLogs.length - 1,
                                selectedTimelineIndex + 1,
                              );

                              setSelectedLogId(orderedLogs[nextIndex]?.id || null);
                            }}
                            disabled={selectedTimelineIndex >= orderedLogs.length - 1}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white text-lg font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:opacity-40"
                            aria-label="Próximo marco"
                          >
                            ›
                          </button>
                        </div>

                        <div className="mt-4 flex justify-center gap-1.5">
                          {orderedLogs.map((log, index) => (
                            <button
                              key={log.id}
                              type="button"
                              onClick={() => setSelectedLogId(log.id)}
                              className={[
                                "h-2 rounded-full transition",
                                index === selectedTimelineIndex
                                  ? "w-6 bg-[#256D3C]"
                                  : "w-2 bg-[#DDE5DF] hover:bg-[#8ED08E]",
                              ].join(" ")}
                              aria-label={`Selecionar marco ${index + 1}`}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 hidden md:grid md:grid-cols-2 md:gap-3 xl:grid-cols-4">
                    {orderedLogs.map((log, index) => {
                      const isSelected = selectedTimelineLog?.id === log.id;
                      const badge = timelineBadge(log.action);

                      return (
                        <button
                          key={log.id}
                          type="button"
                          onClick={() => setSelectedLogId(log.id)}
                          className={[
                            "rounded-2xl border p-3 text-left transition",
                            isSelected
                              ? "border-[#256D3C] bg-[#EAF7EE] shadow-sm ring-4 ring-[#256D3C]/10"
                              : "border-[#DDE5DF] bg-[#F9FBFA] hover:border-[#256D3C]/50",
                          ].join(" ")}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-white px-2 text-xs font-semibold text-[#256D3C]">
                              {index + 1}
                            </span>

                            {badge && (
                              <span
                                className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${badge.className}`}
                              >
                                {badge.label}
                              </span>
                            )}
                          </div>

                          <p className="mt-3 text-sm font-semibold text-[#17211B]">
                            {timelineTitle(log)}
                          </p>

                          <p className="mt-1 text-xs text-[#7A877F]">
                            {new Date(log.createdAt).toLocaleString("pt-BR")}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {selectedTimelineLog && (
                    <div
                      className={`mt-5 rounded-2xl border border-[#DDE5DF] border-l-4 bg-[#F9FBFA] p-5 ${timelineColor(
                        selectedTimelineLog.action,
                      )}`}
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-[#17211B]">
                            {timelineTitle(selectedTimelineLog)}
                          </h3>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-[#17211B]">
                              {getTimelineActorName(selectedTimelineLog)}
                            </span>
                            <span
                              className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${actorBadgeClass(
                                getTimelineActorRole(selectedTimelineLog),
                              )}`}
                            >
                              {getTimelineActorLabel(selectedTimelineLog)}
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-[#7A877F]">
                          {new Date(selectedTimelineLog.createdAt).toLocaleString("pt-BR")}
                        </p>
                      </div>

                      {selectedTimelineLog.comment ? (
                        <p className="mt-4 whitespace-pre-line text-sm leading-7 text-[#5E6B63]">
                          {selectedTimelineLog.comment}
                        </p>
                      ) : (
                        <p className="mt-4 text-sm text-[#7A877F]">
                          Este marco não possui comentário adicional.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </section>
          )}
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
            transition:
              border-color 0.15s ease,
              box-shadow 0.15s ease,
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
   BOX DE INFORMAÇÃO
   ========================================================= */

function InfoBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-4">
      <p className="text-sm text-[#7A877F]">{label}</p>

      <strong className="break-words text-[#17211B]">{value}</strong>
    </div>
  );
}



/* =========================================================
   LINHA COMPACTA DO CABEÇALHO
   ========================================================= */

function CompactInfoLine({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#EDF2EF] pb-3 last:border-b-0 last:pb-0">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
        {label}
      </p>

      <p className="max-w-[190px] break-words text-right text-sm font-semibold text-[#17211B]">
        {value}
      </p>
    </div>
  );
}

/* =========================================================
   LINHA COMPACTA DO CABEÇALHO
   ========================================================= */

function MiniInfoLine({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
        {label}
      </p>

      <p className="mt-1 break-words text-sm font-semibold text-[#17211B]">
        {value}
      </p>
    </div>
  );
}
