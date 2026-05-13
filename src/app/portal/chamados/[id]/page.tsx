"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import PortalContextGuard from "@/components/PortalContextGuard";
import PortalShell from "@/components/PortalShell";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";



/* =========================================================
   PORTAL - DETALHE DO CHAMADO

   ETAPA 35.7 — AJUSTE DE ATRIBUIÇÃO DE RESPONSÁVEL

   Regras importantes:
   - COMMENT_INTERNAL nunca aparece no portal.
   - COMMENT_PUBLIC aparece no portal.
   - ASSIGNED aparece no portal de forma amigável.
   - ASSIGNED não expõe IDs técnicos.
   - Somente chamado RESOLVED pode ser avaliado.
   - Somente quem anexou pode excluir o próprio anexo.
   - Chamado finalizado não recebe nova mensagem/anexo.
   - Histórico público permanece preservado.

   ETAPA 39.15.1 — NOVO VISUAL COM PORTALSHELL

   Atualização:
   - Página passa a usar PortalShell.
   - Removidos LogoutButton, NotificationBell e ActiveAccessBadge da página.
   - Topbar, sidebar, sino, perfil ativo, logout e footer ficam no shell.
   - Removidos botões globais duplicados do topo:
     Dashboard portal, Notificações, Trocar perfil.
   - Mantida apenas a ação contextual: voltar para a lista de chamados.
   - Layout migrado do tema escuro antigo para o padrão claro EloGest.
   - Cards, histórico, anexos, avaliação e mensagens recebem visual novo.
   - Mantida toda a lógica funcional já existente.

   ETAPA 39.17.1 — PADRONIZAÇÃO DO LOADING

   Atualização:
   - Loading passa a usar EloGestLoadingScreen.
   - Evita montar PortalShell durante carregamento inicial.
   - Remove roleLabel do PortalShell, pois o perfil ativo agora fica
     centralizado no ActiveAccessBadge compacto da topbar.

   ETAPA 40.7.2 — NOVA REGRA DE AVALIAÇÃO POR HIERARQUIA

   ETAPA 41.5.4 — SOLICITADO POR SEM REDUNDÂNCIA

   Ajustes desta revisão:
   - Campo Solicitante foi substituído por Solicitado por.
   - Solicitado por passa a exibir o tipo da solicitação: Unidade ou Síndico.
   - Criado por permanece exibindo o nome de quem abriu o chamado.
   - Local do chamado passa a exibir condomínio + unidade/área comum.
   - Abas do portal foram alinhadas ao padrão visual do detalhe admin.
   - Ícones, labels curtas no mobile e espaçamentos foram padronizados.
   - Contadores de anexos e histórico foram adicionados às abas.
   - Interface TicketRating passa a reconhecer o alvo avaliado.
   - Avaliação registrada exibe quem foi avaliado.
   - Texto antes de avaliar explica se a nota vai para síndico
     ou administradora.
   - Síndico passa a poder avaliar chamado resolvido do condomínio,
     direcionando a avaliação para a administradora.
   ========================================================= */



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
    name?: string;
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
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdAt: string;
  uploadedByUser?: {
    id?: string;
    name?: string;
  };
}



interface TicketRating {
  id: string;
  ticketId: string;
  userId: string;
  rating: number;
  comment?: string | null;

  ratedTargetType?:
    | "ADMINISTRADORA"
    | "SINDICO"
    | "ELOGEST"
    | "FORNECEDOR"
    | string
    | null;
  ratedUserId?: string | null;
  ratedAdministratorId?: string | null;
  ratedCondominiumId?: string | null;
  ratedProviderId?: string | null;
  ratedLabel?: string | null;
  ratedMetadata?: any;

  createdAt: string;
  updatedAt?: string;
  user?: {
    id?: string;
    name?: string;
    email?: string;
    role?: string;
  };
}



interface TicketRatingStatus {
  hasRating: boolean;
  canViewRating: boolean;
  canSubmitRating: boolean;
  canAccessRatingArea?: boolean;
  hiddenByPrivacy?: boolean;
  openingRole?: string | null;
  message?: string | null;
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
  firstResponseAt?: string | null;
  resolvedAt?: string | null;

  condominium?: {
    name: string;
  };

  unit?: {
    id?: string;
    block?: string | null;
    unitNumber: string;
  } | null;

  resident?: {
    name?: string;
  } | null;

  createdByUser?: {
    name?: string;
  };

  assignedToUser?: {
    name?: string;
    role?: string;
  } | null;

  logs?: TicketLog[];
  attachments?: TicketAttachment[];

  rating?: TicketRating | null;
  ratingStatus?: TicketRatingStatus | null;
}



interface PortalUser {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  unitId?: string | null;
}



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
   PÁGINA
   ========================================================= */

export default function PortalChamadoDetalhesPage() {
  const params = useParams();

  const ticketId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [role, setRole] = useState("");
  const [portalUser, setPortalUser] = useState<PortalUser | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);

  const [accessCount, setAccessCount] = useState(0);

  const [comment, setComment] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [ratingValue, setRatingValue] = useState<number>(0);
  const [ratingComment, setRatingComment] = useState("");
  const [savingRating, setSavingRating] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(
    null
  );

  const [activeTab, setActiveTab] = useState<
    "overview" | "attendance" | "attachments" | "messages" | "rating" | "history"
  >("overview");

  const [activeTimelineIndex, setActiveTimelineIndex] = useState(0);

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



  function isFinalizedTicket(currentTicket?: Ticket | null) {
    return (
      currentTicket?.status === "RESOLVED" ||
      currentTicket?.status === "CANCELED"
    );
  }



  /* =========================================================
     CARREGAR CHAMADO
     ========================================================= */

  async function loadTicket() {
    if (!ticketId) return;

    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const res = await fetch(`/api/portal/chamados/${ticketId}`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        showError(data?.error || "Erro ao carregar chamado.");
        setTicket(null);
        return;
      }

      setRole(data.role || "");
      setPortalUser(data.user || null);
      setTicket(data.ticket);
    } catch (err) {
      console.error(err);
      showError("Erro ao carregar chamado.");
      setTicket(null);
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
     RECARREGAR CHAMADO SEM LOADING GERAL
     ========================================================= */

  async function refreshTicket() {
    if (!ticketId) return;

    try {
      const res = await fetch(`/api/portal/chamados/${ticketId}`, {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error || "Erro ao atualizar chamado.");
        return;
      }

      setRole(data.role || "");
      setPortalUser(data.user || null);
      setTicket(data.ticket);
    } catch (err) {
      console.error(err);
      alert("Erro ao atualizar chamado.");
    }
  }



  /* =========================================================
     ENVIAR MENSAGEM PELO PORTAL
     ========================================================= */

  async function submitComment() {
    if (!ticketId || !ticket) return;

    const cleanComment = comment.trim();

    if (!cleanComment) return;

    if (isFinalizedTicket(ticket)) {
      alert("Este chamado está finalizado.");
      return;
    }

    try {
      setUpdating(true);

      const res = await fetch(`/api/portal/chamados/${ticketId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          comment: cleanComment,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error || "Erro ao enviar mensagem.");
        return;
      }

      setComment("");

      await refreshTicket();

      showSuccess("Mensagem enviada com sucesso.");
    } catch (err) {
      console.error(err);
      alert("Erro ao enviar mensagem.");
    } finally {
      setUpdating(false);
    }
  }



  /* =========================================================
     ENVIAR AVALIAÇÃO DO ATENDIMENTO
     ========================================================= */

  async function submitRating() {
    if (!ticketId || !ticket) return;

    if (ticket.status !== "RESOLVED") {
      alert("Somente chamados resolvidos podem ser avaliados.");
      return;
    }

    if (ticket.rating || ticket.ratingStatus?.hasRating) {
      alert("Este chamado já foi avaliado.");
      return;
    }

    if (!ratingValue || ratingValue < 1 || ratingValue > 5) {
      alert("Selecione uma nota de 1 a 5 estrelas.");
      return;
    }

    try {
      setSavingRating(true);

      const res = await fetch(`/api/portal/chamados/${ticketId}/avaliacao`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rating: ratingValue,
          comment: ratingComment.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error || "Erro ao registrar avaliação.");
        return;
      }

      setRatingValue(0);
      setRatingComment("");

      await refreshTicket();

      showSuccess("Avaliação registrada com sucesso.");
    } catch (err) {
      console.error(err);
      alert("Erro ao registrar avaliação.");
    } finally {
      setSavingRating(false);
    }
  }



  /* =========================================================
     UPLOAD DE ANEXO PELO PORTAL
     ========================================================= */

  async function uploadAttachment() {
    if (!ticketId || !ticket) return;

    if (!selectedFile) {
      alert("Selecione um arquivo para anexar.");
      return;
    }

    if (isFinalizedTicket(ticket)) {
      alert("Este chamado está finalizado.");
      return;
    }

    try {
      setUploading(true);

      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await fetch(`/api/portal/chamados/${ticketId}/attachments`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error || "Erro ao enviar anexo.");
        return;
      }

      setSelectedFile(null);

      const fileInput = document.getElementById(
        "portal-ticket-attachment-input"
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
     EXCLUIR ANEXO PELO PORTAL
     ========================================================= */

  async function deleteAttachment(attachment: TicketAttachment) {
    if (!ticketId || !ticket) return;

    if (isFinalizedTicket(ticket)) {
      alert("Este chamado está finalizado.");
      return;
    }

    const confirmed = confirm(
      `Deseja realmente excluir este anexo?\n\n${attachment.originalName}`
    );

    if (!confirmed) return;

    try {
      setDeletingAttachmentId(attachment.id);

      const res = await fetch(
        `/api/portal/chamados/${ticketId}/attachments/${attachment.id}`,
        {
          method: "DELETE",
        }
      );

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error || "Erro ao excluir anexo.");
        return;
      }

      await refreshTicket();

      showSuccess("Anexo excluído com sucesso.");
    } catch (err) {
      console.error(err);
      alert("Erro ao excluir anexo.");
    } finally {
      setDeletingAttachmentId(null);
    }
  }



  /* =========================================================
     INIT
     ========================================================= */

  useEffect(() => {
    loadTicket();
    loadAccessCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);



  useEffect(() => {
    setActiveTimelineIndex(0);
  }, [ticketId]);



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
      OPEN: "border-blue-200 bg-blue-50 text-blue-700",
      IN_PROGRESS: "border-yellow-200 bg-yellow-50 text-yellow-700",
      RESOLVED: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
      CANCELED: "border-red-200 bg-red-50 text-red-700",
    }[status] || "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]");



  const priorityClass = (priority?: string | null) =>
    ({
      LOW: "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]",
      MEDIUM: "border-blue-200 bg-blue-50 text-blue-700",
      HIGH: "border-orange-200 bg-orange-50 text-orange-700",
      URGENT: "border-red-200 bg-red-50 text-red-700",
    }[priority || ""] || "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]");



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



  function getTicketScopeLabel(currentTicket: Ticket) {
    if (currentTicket.scope === "CONDOMINIUM") {
      return "Condomínio";
    }

    return "Unidade";
  }



  function getRequestedByLabel(currentTicket: Ticket) {
    if (currentTicket.scope === "UNIT") {
      return "Unidade";
    }

    return "Síndico";
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

    return "Unidade";
  }



  function getFullLocationLabel(currentTicket: Ticket) {
    const condominiumName =
      currentTicket.condominium?.name || "Condomínio não informado";

    if (currentTicket.scope === "CONDOMINIUM") {
      return `${condominiumName} • Área comum`;
    }

    if (currentTicket.unit) {
      const unitLabel = `Unidade ${
        currentTicket.unit.block ? currentTicket.unit.block + " - " : ""
      }${currentTicket.unit.unitNumber}`;

      return `${condominiumName} • ${unitLabel}`;
    }

    return condominiumName;
  }



  function getRoleLabel(roleValue?: string | null) {
    if (roleValue === "SINDICO") return "Síndico";
    if (roleValue === "MORADOR") return "Morador";
    if (roleValue === "PROPRIETARIO") return "Proprietário";
    return "Usuário";
  }



  function getPortalTicketsLabel() {
    if (role === "SINDICO") {
      return "Chamados do condomínio";
    }

    return "Meus chamados";
  }



  function getPageSubtitle() {
    if (role === "SINDICO") {
      return "Acompanhe o andamento deste chamado do condomínio.";
    }

    if (role === "MORADOR" || role === "PROPRIETARIO") {
      return "Acompanhe as atualizações do seu chamado.";
    }

    return "Acompanhe o andamento desta solicitação.";
  }



  function getSlaLimitHours(priority?: string | null) {
    if (priority === "URGENT") return 4;
    if (priority === "HIGH") return 24;
    if (priority === "MEDIUM") return 48;
    return 72;
  }



  function getSlaInfo(currentTicket: Ticket) {
    const limitHours = getSlaLimitHours(currentTicket.priority);

    if (currentTicket.status === "RESOLVED" || currentTicket.status === "CANCELED") {
      return {
        status: "DONE",
        label: "Encerrado",
        className: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
      };
    }

    const createdAt = new Date(currentTicket.createdAt).getTime();
    const elapsedHours = Math.max(
      0,
      Math.floor((Date.now() - createdAt) / (1000 * 60 * 60))
    );

    const remainingHours = limitHours - elapsedHours;
    const warningThreshold = Math.max(2, Math.ceil(limitHours * 0.25));

    if (remainingHours <= 0) {
      return {
        status: "OVERDUE",
        label:
          role === "SINDICO"
            ? `Prazo vencido há ${Math.abs(remainingHours)}h`
            : "Em atenção",
        className: "border-red-200 bg-red-50 text-red-700",
      };
    }

    if (remainingHours <= warningThreshold) {
      return {
        status: "WARNING",
        label:
          role === "SINDICO"
            ? `Prazo vence em ${remainingHours}h`
            : "Acompanhamento prioritário",
        className: "border-orange-200 bg-orange-50 text-orange-700",
      };
    }

    return {
      status: "OK",
      label: role === "SINDICO" ? "Dentro do prazo" : "Em acompanhamento",
      className: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
    };
  }



  function getNextStepInfo(currentTicket: Ticket) {
    const sla = getSlaInfo(currentTicket);

    if (currentTicket.status === "OPEN") {
      if (currentTicket.assignedToUser?.name) {
        return {
          title: "Aguardando início do atendimento",
          description: `O chamado já possui responsável definido: ${currentTicket.assignedToUser.name}. Acompanhe as próximas movimentações pelo histórico.`,
          toneClass: "border-blue-200 bg-blue-50 text-blue-800",
        };
      }

      return {
        title: "Aguardando responsável",
        description:
          "A administradora ainda vai iniciar a análise deste chamado. Você será notificado quando houver movimentações.",
        toneClass: "border-blue-200 bg-blue-50 text-blue-800",
      };
    }

    if (currentTicket.status === "IN_PROGRESS") {
      if (sla.status === "OVERDUE") {
        return {
          title: role === "SINDICO" ? "Chamado fora do prazo" : "Chamado em atenção",
          description:
            "Este chamado está em acompanhamento e precisa de atenção. Consulte o histórico e envie informações complementares se necessário.",
          toneClass: "border-red-200 bg-red-50 text-red-800",
        };
      }

      if (sla.status === "WARNING") {
        return {
          title: "Acompanhamento prioritário",
          description:
            "Este chamado está em atendimento e próximo de exigir uma nova movimentação. Acompanhe as atualizações pelo histórico.",
          toneClass: "border-orange-200 bg-orange-50 text-orange-800",
        };
      }

      return {
        title: "Chamado em atendimento",
        description:
          "Este chamado já está em acompanhamento. Use o campo de mensagem se precisar complementar alguma informação.",
        toneClass: "border-yellow-200 bg-yellow-50 text-yellow-800",
      };
    }

    if (currentTicket.status === "RESOLVED") {
      return {
        title: "Chamado resolvido",
        description: ticket?.ratingStatus?.hasRating || ticket?.rating
          ? "Este chamado foi finalizado e já possui avaliação registrada."
          : "Este chamado foi finalizado. Se você foi o solicitante vinculado, pode avaliar o atendimento.",
        toneClass: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
      };
    }

    if (currentTicket.status === "CANCELED") {
      return {
        title: "Chamado cancelado",
        description:
          "Este chamado foi encerrado sem continuidade. Caso o problema permaneça, abra um novo chamado.",
        toneClass: "border-red-200 bg-red-50 text-red-800",
      };
    }

    return {
      title: "Acompanhamento do chamado",
      description:
        "Consulte as informações, mensagens públicas, anexos e histórico deste chamado.",
      toneClass: "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]",
    };
  }



  function getAttendanceGuidance(currentTicket: Ticket) {
    const sla = getSlaInfo(currentTicket);

    if (currentTicket.status === "RESOLVED") {
      if (currentTicket.rating) {
        return "Atendimento finalizado e avaliado. O histórico permanece disponível para consulta.";
      }

      if (currentTicket.ratingStatus?.hasRating) {
        return "Atendimento finalizado e já avaliado. A avaliação registrada não está disponível para este perfil de acesso.";
      }

      return "Atendimento finalizado. Quando disponível para o seu perfil, registre uma avaliação para ajudar na melhoria do serviço.";
    }

    if (currentTicket.status === "CANCELED") {
      return "Chamado cancelado. Caso a demanda continue, registre uma nova solicitação.";
    }

    if (sla.status === "OVERDUE") {
      return role === "SINDICO"
        ? "Acompanhe este chamado com prioridade e verifique se há responsável definido."
        : "Acompanhe este chamado com atenção. Se tiver novas informações, envie uma mensagem no campo abaixo.";
    }

    if (sla.status === "WARNING") {
      return "Verifique se há mensagens recentes no histórico e complemente o chamado se necessário.";
    }

    if (!currentTicket.assignedToUser) {
      return "O chamado está aguardando atribuição de responsável pela equipe de atendimento.";
    }

    return "Acompanhe as movimentações pelo histórico. Você também pode enviar mensagem ou anexo enquanto o chamado estiver aberto.";
  }



  function getFinalizedMessage(currentTicket: Ticket) {
    if (currentTicket.status === "RESOLVED") {
      return "Este chamado foi resolvido. Não é possível enviar novas mensagens ou anexos. Caso o problema continue, abra um novo chamado ou entre em contato com a administradora.";
    }

    if (currentTicket.status === "CANCELED") {
      return "Este chamado foi cancelado. Não é possível enviar novas mensagens ou anexos. Caso ainda precise de atendimento, abra um novo chamado.";
    }

    return "Este chamado está finalizado.";
  }



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
      return "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]";
    }

    if (roleValue === "PROPRIETARIO") {
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    }

    if (roleValue === "ADMINISTRADORA") {
      return "border-blue-200 bg-blue-50 text-blue-700";
    }

    if (roleValue === "SUPER_ADMIN") {
      return "border-red-200 bg-red-50 text-red-700";
    }

    return "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]";
  }



  function getAssignedResponsibleName(log: TicketLog) {
    const toValue = String(log.toValue || "").trim();

    if (toValue) {
      return toValue;
    }

    const commentText = String(log.comment || "").trim();

    if (commentText.toLowerCase().startsWith("responsável definido:")) {
      return commentText.replace(/responsável definido:/i, "").trim();
    }

    return "";
  }



  function getTimelineDescription(log: TicketLog) {
    if (log.action === "ASSIGNED") {
      const responsibleName = getAssignedResponsibleName(log);

      if (responsibleName) {
        return `Seu chamado foi encaminhado para acompanhamento com ${responsibleName}.`;
      }

      return "Seu chamado foi encaminhado para acompanhamento por um responsável.";
    }

    return log.comment || "";
  }



  function timelineTitle(log: TicketLog) {
    if (log.action === "CREATED") return "Chamado criado";

    if (log.action === "STATUS_CHANGED") {
      return `${statusLabel(log.fromValue)} → ${statusLabel(log.toValue)}`;
    }

    if (log.action === "ASSIGNED") return "Responsável definido";
    if (log.action === "COMMENT_PUBLIC") return "Mensagem";
    if (log.action === "ATTACHMENT_ADDED") return "Anexo adicionado";
    if (log.action === "ATTACHMENT_REMOVED") return "Anexo removido";

    return log.action;
  }



  function timelineColor(action: string) {
    if (action === "CREATED") return "border-blue-500";
    if (action === "STATUS_CHANGED") return "border-yellow-500";
    if (action === "ASSIGNED") return "border-purple-500";
    if (action === "COMMENT_PUBLIC") return "border-[#256D3C]";
    if (action === "ATTACHMENT_ADDED") return "border-cyan-500";
    if (action === "ATTACHMENT_REMOVED") return "border-red-500";

    return "border-[#DDE5DF]";
  }


  function timelineBadge(action: string) {
    if (action === "ASSIGNED") {
      return {
        label: "Responsável",
        className: "border-purple-200 bg-purple-50 text-purple-700",
      };
    }

    if (action === "COMMENT_PUBLIC") {
      return {
        label: "Mensagem",
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

    return null;
  }



  function formatFileSize(bytes: number) {
    if (!bytes) return "-";

    if (bytes < 1024) return `${bytes} B`;

    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }



  function isImageAttachment(attachment: TicketAttachment) {
    return attachment.mimeType.startsWith("image/");
  }



  function renderStars(value: number) {
    return "★".repeat(value) + "☆".repeat(Math.max(0, 5 - value));
  }



  function ratingTargetTypeLabel(type?: string | null) {
    if (type === "SINDICO") return "Síndico";
    if (type === "ADMINISTRADORA") return "Administradora";
    if (type === "ELOGEST") return "EloGest";
    if (type === "FORNECEDOR") return "Fornecedor";

    return "Atendimento";
  }



  function getRatingTargetLabel(currentTicket: Ticket) {
    if (currentTicket.rating?.ratedLabel) {
      return currentTicket.rating.ratedLabel;
    }

    if (currentTicket.rating?.ratedTargetType) {
      return ratingTargetTypeLabel(currentTicket.rating.ratedTargetType);
    }

    return "Atendimento";
  }



  function getExpectedRatingTargetText(currentTicket: Ticket) {
    if (role === "SINDICO") {
      return "Esta avaliação será direcionada à administradora responsável pelo atendimento.";
    }

    if (role === "MORADOR" || role === "PROPRIETARIO") {
      if (currentTicket.assignedToUser?.role === "SINDICO") {
        return `Esta avaliação será direcionada ao síndico ${
          currentTicket.assignedToUser.name || "responsável"
        }.`;
      }

      if (
        currentTicket.assignedToUser?.role === "ADMINISTRADORA" ||
        currentTicket.assignedToUser?.role === "SUPER_ADMIN"
      ) {
        return "Esta avaliação será direcionada à administradora responsável pelo atendimento.";
      }

      return "Esta avaliação será direcionada à administradora responsável pelo atendimento.";
    }

    return "Esta avaliação será registrada conforme as regras de atendimento do chamado.";
  }



  function canDeleteAttachment(attachment: TicketAttachment) {
    if (!ticket) return false;

    if (isFinalizedTicket(ticket)) {
      return false;
    }

    return !!portalUser?.id && attachment.uploadedByUser?.id === portalUser.id;
  }



  const visibleLogs = useMemo(() => {
    if (!ticket) return [];

    const allowedPortalActions = [
      "CREATED",
      "STATUS_CHANGED",
      "ASSIGNED",
      "COMMENT_PUBLIC",
      "ATTACHMENT_ADDED",
      "ATTACHMENT_REMOVED",
    ];

    return (ticket.logs || []).filter((log) => {
      const belongsToCurrentTicket = !log.ticketId || log.ticketId === ticket.id;
      const isAllowedOnPortal = allowedPortalActions.includes(log.action);

      return belongsToCurrentTicket && isAllowedOnPortal;
    });
  }, [ticket]);



  const attachments = useMemo(() => {
    if (!ticket) return [];

    return (ticket.attachments || []).filter(
      (attachment) => attachment.ticketId === ticket.id
    );
  }, [ticket]);



  const hasRegisteredRating =
    !!ticket?.rating || !!ticket?.ratingStatus?.hasRating;

  const canSubmitRating =
    ticket?.status === "RESOLVED" &&
    !hasRegisteredRating &&
    ticket?.ratingStatus?.canSubmitRating === true;

  const canShowRatingArea =
    ticket?.status === "RESOLVED" &&
    (ticket?.ratingStatus?.canAccessRatingArea === true ||
      ticket?.ratingStatus?.canSubmitRating === true ||
      !!ticket?.rating);



  /* =========================================================
     ESTADOS DE CARREGAMENTO
     ========================================================= */

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando chamado..."
        description="Aguarde enquanto identificamos seu perfil de acesso e carregamos os detalhes da solicitação."
      />
    );
  }

  if (error || !ticket) {
    return (
      <PortalContextGuard
        fallbackTitle="Detalhe do chamado indisponível neste perfil de acesso"
        fallbackDescription="O detalhe do chamado no portal é destinado a síndicos, moradores e proprietários. Para acessar a visão administrativa, utilize a área admin."
      >
        <PortalShell
          current="chamados"
          title="Chamado não encontrado"
          description="Não foi possível carregar os detalhes deste chamado."
          canSwitchProfile={canSwitchProfile}
        >
          <section className="rounded-[32px] border border-red-200 bg-white p-8 shadow-sm">
            <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
              Atenção
            </span>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[#17211B]">
              Chamado não encontrado
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5E6B63]">
              {error || "Chamado não encontrado."}
            </p>

            <div className="mt-6">
              <Link
                href="/portal/chamados"
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-6 text-sm font-semibold text-white transition hover:bg-[#1F5A32]"
              >
                Voltar para {getPortalTicketsLabel()}
              </Link>
            </div>
          </section>
        </PortalShell>
      </PortalContextGuard>
    );
  }



  const nextStepInfo = getNextStepInfo(ticket);
  const sla = getSlaInfo(ticket);
  const attendanceGuidance = getAttendanceGuidance(ticket);

  const tabs: Array<{
    id: "overview" | "attendance" | "attachments" | "messages" | "rating" | "history";
    label: string;
    shortLabel: string;
    icon: string;
  }> = [
    { id: "overview", label: "Visão Geral", shortLabel: "Geral", icon: "◉" },
    { id: "attendance", label: "Atendimento", shortLabel: "Atend.", icon: "✓" },
    {
      id: "attachments",
      label: `Anexos (${attachments.length})`,
      shortLabel: "Anexos",
      icon: "↥",
    },
    { id: "messages", label: "Comunicação", shortLabel: "Com.", icon: "✉" },
    ...(canShowRatingArea
      ? [
          {
            id: "rating" as const,
            label: "Avaliação",
            shortLabel: "Aval.",
            icon: "★",
          },
        ]
      : []),
    {
      id: "history",
      label: `Histórico (${visibleLogs.length})`,
      shortLabel: "Hist.",
      icon: "↺",
    },
  ];

  const activeTimelineLog =
    visibleLogs[activeTimelineIndex] || visibleLogs[0] || null;



  return (
    <PortalContextGuard
      fallbackTitle="Detalhe do chamado indisponível neste perfil de acesso"
      fallbackDescription="O detalhe do chamado no portal é destinado a síndicos, moradores e proprietários. Para acessar a visão administrativa, utilize a área admin."
    >
      <PortalShell
        current="chamados"
        title={formatDisplayTitle(ticket.title)}
        description={getPageSubtitle()}
        canSwitchProfile={canSwitchProfile}
      >
        <div className="space-y-6">
          {/* =====================================================
              TÍTULO DA PÁGINA
              ===================================================== */}

          <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#256D3C]">
                Chamado
              </p>

              <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight text-[#17211B] md:text-4xl">
                {formatDisplayTitle(ticket.title)}
              </h1>

              <p className="mt-2 max-w-4xl text-sm leading-6 text-[#5E6B63]">
                {getFullLocationLabel(ticket)} • Aberto por{" "}
                {ticket.resident?.name || ticket.createdByUser?.name || "usuário"}
              </p>
            </div>

            <Link
              href="/portal/chamados"
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-6 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
            >
              Voltar para {getPortalTicketsLabel()}
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
              CABEÇALHO OPERACIONAL
              ===================================================== */}

          <section className="overflow-hidden rounded-[32px] border border-[#DDE5DF] bg-white shadow-sm">
            <div className="border-b border-[#DDE5DF] bg-[linear-gradient(135deg,#FFFFFF_0%,#F8FAF9_62%,#EAF7EE_135%)] p-6">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(
                        ticket.status
                      )}`}
                    >
                      {statusLabel(ticket.status)}
                    </span>

                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${priorityClass(
                        ticket.priority
                      )}`}
                    >
                      {priorityLabel(ticket.priority)}
                    </span>

                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${sla.className}`}
                    >
                      {sla.label}
                    </span>

                    {!ticket.assignedToUser && !isFinalizedTicket(ticket) && (
                      <span className="rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-700">
                        Aguardando responsável
                      </span>
                    )}

                    {ticket.rating && (
                      <span className="rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-700">
                        Avaliado: {ticket.rating.rating}/5
                      </span>
                    )}
                  </div>

                  <div className="rounded-[26px] border border-[#DDE5DF] bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#256D3C]">
                      Descrição do Chamado
                    </p>

                    <p className="mt-3 whitespace-pre-line text-base leading-7 text-[#17211B]">
                      {ticket.description || "Sem descrição informada."}
                    </p>
                  </div>
                </div>

                <div className="rounded-[26px] border border-[#CFE6D4] bg-[#F9FBFA] p-5 xl:w-[340px]">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#256D3C]">
                    Próxima Orientação
                  </p>

                  <h2 className="mt-2 text-xl font-semibold text-[#17211B]">
                    {nextStepInfo.title}
                  </h2>

                  <p className="mt-3 text-sm leading-6 text-[#5E6B63]">
                    {nextStepInfo.description}
                  </p>

                  <div className="mt-4 rounded-2xl border border-[#DDE5DF] bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
                      Responsável
                    </p>

                    <p className="mt-1 text-sm font-semibold text-[#17211B]">
                      {ticket.assignedToUser?.name || "Aguardando atribuição"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-0 divide-y divide-[#DDE5DF] md:grid-cols-3 md:divide-x md:divide-y-0">
              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Situação
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  {attendanceGuidance}
                </p>
              </div>

              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Local
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  {getFullLocationLabel(ticket)}
                </p>
              </div>

              <div className="p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                  Criado em
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  {new Date(ticket.createdAt).toLocaleString("pt-BR")}
                </p>
              </div>
            </div>
          </section>



          {/* =====================================================
              ABAS
              ===================================================== */}

          <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-2 shadow-sm">
            <div
              className="grid gap-1 sm:gap-2"
              style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
            >
              {tabs.map((tab) => {
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



          {/* =====================================================
              CONTEÚDO DAS ABAS
              ===================================================== */}

          {activeTab === "overview" && (
            <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
              <div className="mb-5">
                <h2 className="text-xl font-semibold text-[#17211B]">
                  Visão Geral
                </h2>

                <p className="mt-1 text-sm text-[#5E6B63]">
                  Dados complementares da solicitação.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-4">
                <InfoBox
                  label="Status"
                  value={statusLabel(ticket.status)}
                />

                <InfoBox
                  label="Prioridade"
                  value={priorityLabel(ticket.priority)}
                />

                <InfoBox
                  label="Prazo"
                  value={sla.label}
                />

                <InfoBox
                  label="Categoria"
                  value={ticket.category || "-"}
                />

                <InfoBox
                  label="Tipo"
                  value={getTicketScopeLabel(ticket)}
                />

                <InfoBox
                  label="Local"
                  value={getFullLocationLabel(ticket)}
                />

                <InfoBox
                  label="Solicitado por"
                  value={getRequestedByLabel(ticket)}
                />

                <InfoBox
                  label="Criado por"
                  value={ticket.createdByUser?.name || "-"}
                />
              </div>
            </section>
          )}



          {activeTab === "attendance" && (
            <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
              <div className="mb-5">
                <h2 className="text-xl font-semibold text-[#17211B]">
                  Atendimento
                </h2>

                <p className="mt-1 text-sm text-[#5E6B63]">
                  Responsável, orientação atual e próximos passos do chamado.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
                <InfoBox
                  label="Responsável"
                  value={ticket.assignedToUser?.name || "Aguardando atribuição"}
                />

                <InfoBox
                  label="Prazo"
                  value={sla.label}
                />

                <InfoBox
                  label="Status"
                  value={statusLabel(ticket.status)}
                />

                <InfoBox
                  label="Prioridade"
                  value={priorityLabel(ticket.priority)}
                />

                <InfoBox
                  label="Criado em"
                  value={new Date(ticket.createdAt).toLocaleString("pt-BR")}
                />

                <InfoBox
                  label="Primeira resposta"
                  value={ticket.firstResponseAt ? new Date(ticket.firstResponseAt).toLocaleString("pt-BR") : "-"}
                />
              </div>

              <div className="mt-5 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
                  Orientação
                </p>

                <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                  {attendanceGuidance}
                </p>
              </div>

              {isFinalizedTicket(ticket) && (
                <div className="mt-5 rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm leading-6 text-yellow-800">
                  {getFinalizedMessage(ticket)}
                </div>
              )}
            </section>
          )}



          {activeTab === "messages" && (
            <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
              <h2 className="mb-2 text-xl font-semibold text-[#17211B]">
                Mensagens
              </h2>

              <p className="mb-4 text-sm leading-6 text-[#5E6B63]">
                Envie informações complementares ou consulte mensagens públicas no histórico.
              </p>

              {isFinalizedTicket(ticket) ? (
                <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
                  {getFinalizedMessage(ticket)}
                </div>
              ) : (
                <>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Escreva sua mensagem..."
                    rows={5}
                    className="form-input min-h-[150px] resize-y"
                  />

                  <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <p className="text-xs text-[#7A877F]">
                      Sua mensagem ficará visível no histórico público deste chamado.
                    </p>

                    <button
                      type="button"
                      onClick={submitComment}
                      disabled={updating || !comment.trim()}
                      className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
                    >
                      {updating ? "Enviando..." : "Enviar mensagem"}
                    </button>
                  </div>
                </>
              )}
            </section>
          )}



          {activeTab === "attachments" && (
            <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-6 shadow-sm">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-[#17211B]">
                    Anexos
                  </h2>

                  <p className="text-sm text-[#5E6B63]">
                    Envie fotos ou documentos que ajudem no atendimento.
                  </p>
                </div>

                <span className="text-sm text-[#7A877F]">
                  {attachments.length} anexo(s)
                </span>
              </div>

              {isFinalizedTicket(ticket) ? (
                <div className="mb-4 rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
                  {getFinalizedMessage(ticket)}
                </div>
              ) : (
                <div className="mb-4 rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-4">
                  <label className="mb-2 block text-sm font-semibold text-[#17211B]">
                    Selecionar arquivo
                  </label>

                  <div className="flex flex-col gap-3 md:flex-row">
                    <input
                      id="portal-ticket-attachment-input"
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setSelectedFile(file);
                      }}
                      className="form-input"
                    />

                    <button
                      type="button"
                      onClick={uploadAttachment}
                      disabled={uploading || !selectedFile}
                      className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
                    >
                      {uploading ? "Enviando..." : "Enviar anexo"}
                    </button>
                  </div>

                  <p className="mt-2 text-xs text-[#7A877F]">
                    Permitidos: JPG, PNG, WEBP e PDF. Limite: 10 MB.
                  </p>
                </div>
              )}

              {attachments.length === 0 ? (
                <p className="text-sm text-[#7A877F]">
                  Nenhum anexo enviado para este chamado.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {attachments.map((attachment) => {
                    const isImage = isImageAttachment(attachment);
                    const canDelete = canDeleteAttachment(attachment);

                    return (
                      <div
                        key={attachment.id}
                        className="overflow-hidden rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7]"
                      >
                        {isImage ? (
                          <a
                            href={attachment.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block bg-[#17211B]"
                          >
                            <img
                              src={attachment.url}
                              alt={attachment.originalName}
                              className="h-44 w-full object-cover"
                            />
                          </a>
                        ) : (
                          <div className="flex h-44 items-center justify-center border-b border-[#DDE5DF] bg-red-50">
                            <div className="text-center">
                              <p className="text-4xl">📄</p>
                              <p className="mt-2 font-semibold text-red-700">PDF</p>
                            </div>
                          </div>
                        )}

                        <div className="p-4">
                          <p className="break-all font-semibold text-[#17211B]">
                            {attachment.originalName}
                          </p>

                          <p className="mt-1 text-xs text-[#7A877F]">
                            {attachment.mimeType} •{" "}
                            {formatFileSize(attachment.sizeBytes)}
                          </p>

                          <p className="mt-1 text-xs text-[#7A877F]">
                            Enviado por{" "}
                            {attachment.uploadedByUser?.name || "Sistema"} •{" "}
                            {new Date(attachment.createdAt).toLocaleString("pt-BR")}
                          </p>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <a
                              href={attachment.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
                            >
                              Abrir
                            </a>

                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => deleteAttachment(attachment)}
                                disabled={deletingAttachmentId === attachment.id}
                                className="inline-flex h-10 items-center justify-center rounded-2xl bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:bg-[#9AA7A0]"
                              >
                                {deletingAttachmentId === attachment.id
                                  ? "Excluindo..."
                                  : "Excluir"}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}



          {activeTab === "rating" && canShowRatingArea && (
            <section className="rounded-[28px] border border-yellow-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="mb-2 text-xl font-semibold text-[#17211B]">
                    Avaliação do Atendimento
                  </h2>

                  <p className="text-sm text-[#5E6B63]">
                    Sua avaliação ajuda a medir a qualidade do atendimento prestado.
                  </p>

                  <p className="mt-2 text-sm font-semibold text-[#17211B]">
                    {getExpectedRatingTargetText(ticket)}
                  </p>
                </div>

                <span className="inline-flex rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-700">
                  Chamado resolvido
                </span>
              </div>

              {ticket.rating ? (
                <div className="rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-5">
                  <p className="mb-2 text-sm text-[#5E6B63]">
                    Este chamado já foi avaliado.
                  </p>

                  <div className="text-3xl tracking-wider text-yellow-500">
                    {renderStars(ticket.rating.rating)}
                  </div>

                  <p className="mt-2 font-semibold text-[#17211B]">
                    Nota {ticket.rating.rating} de 5
                  </p>

                  <div className="mt-3 inline-flex rounded-full border border-[#CFE6D4] bg-white px-3 py-1 text-xs font-semibold text-[#256D3C]">
                    Avaliação referente a: {getRatingTargetLabel(ticket)}
                  </div>

                  {ticket.rating.comment && (
                    <div className="mt-4 rounded-2xl border border-[#DDE5DF] bg-white p-4">
                      <p className="mb-1 text-sm text-[#7A877F]">
                        Comentário da avaliação
                      </p>

                      <p className="whitespace-pre-line text-sm leading-6 text-[#5E6B63]">
                        {ticket.rating.comment}
                      </p>
                    </div>
                  )}

                  <p className="mt-4 text-xs text-[#7A877F]">
                    Avaliado por {ticket.rating.user?.name || "Morador"} •{" "}
                    {new Date(ticket.rating.createdAt).toLocaleString("pt-BR")}
                  </p>
                </div>
              ) : ticket.ratingStatus?.hasRating ? (
                <div className="rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-5">
                  <p className="mb-2 text-sm font-semibold text-[#17211B]">
                    Este chamado já possui avaliação registrada.
                  </p>

                  <p className="text-sm leading-6 text-[#5E6B63]">
                    {ticket.ratingStatus.message ||
                      "A avaliação registrada não está disponível para este perfil de acesso."}
                  </p>

                  <div className="mt-4 rounded-2xl border border-[#CFE6D4] bg-white p-4 text-sm leading-6 text-[#256D3C]">
                    Para preservar a privacidade da avaliação, apenas quem avaliou
                    ou quem foi avaliado pode consultar o conteúdo da nota.
                  </div>
                </div>
              ) : canSubmitRating ? (
                <div className="rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-5">
                  <p className="mb-3 text-sm text-[#5E6B63]">
                    Selecione uma nota para o atendimento:
                  </p>

                  <div className="mb-4 rounded-2xl border border-[#CFE6D4] bg-white p-4 text-sm leading-6 text-[#256D3C]">
                    {getExpectedRatingTargetText(ticket)}
                  </div>

                  <div className="mb-4 flex flex-wrap gap-2">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setRatingValue(value)}
                        className={`h-12 w-12 rounded-2xl border text-2xl font-semibold transition ${
                          ratingValue >= value
                            ? "border-yellow-300 bg-yellow-50 text-yellow-500"
                            : "border-[#DDE5DF] bg-white text-[#9AA7A0] hover:text-yellow-500"
                        }`}
                        aria-label={`Avaliar com ${value} estrela(s)`}
                      >
                        ★
                      </button>
                    ))}
                  </div>

                  <textarea
                    value={ratingComment}
                    onChange={(e) => setRatingComment(e.target.value)}
                    placeholder="Comentário opcional sobre o atendimento..."
                    rows={4}
                    className="form-input min-h-[120px] resize-y"
                  />

                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={submitRating}
                      disabled={savingRating || ratingValue < 1}
                      className="inline-flex h-12 items-center justify-center rounded-2xl bg-yellow-600 px-5 text-sm font-semibold text-white transition hover:bg-yellow-700 disabled:bg-[#9AA7A0]"
                    >
                      {savingRating ? "Enviando..." : "Enviar avaliação"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-5 text-sm text-[#5E6B63]">
                  A avaliação está disponível apenas para morador, proprietário
                  ou síndico com acesso ao chamado resolvido.
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

              {visibleLogs.length === 0 ? (
                <p className="mt-5 text-sm text-[#7A877F]">
                  Nenhum histórico público registrado para este chamado.
                </p>
              ) : (
                <>
                  <div className="mt-6 md:hidden">
                    {activeTimelineLog && (
                      <div className="rounded-[24px] border border-[#DDE5DF] bg-[#F9FBFA] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              setActiveTimelineIndex((current) =>
                                Math.max(0, current - 1)
                              )
                            }
                            disabled={activeTimelineIndex <= 0}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white text-lg font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:opacity-40"
                            aria-label="Marco anterior"
                          >
                            ‹
                          </button>

                          <div className="min-w-0 flex-1 text-center">
                            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
                              Marco {activeTimelineIndex + 1} de {visibleLogs.length}
                            </p>

                            <h3 className="mt-1 break-words text-base font-semibold text-[#17211B]">
                              {timelineTitle(activeTimelineLog)}
                            </h3>

                            <p className="mt-1 text-xs text-[#7A877F]">
                              {new Date(activeTimelineLog.createdAt).toLocaleString("pt-BR")}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setActiveTimelineIndex((current) =>
                                Math.min(visibleLogs.length - 1, current + 1)
                              )
                            }
                            disabled={activeTimelineIndex >= visibleLogs.length - 1}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white text-lg font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:opacity-40"
                            aria-label="Próximo marco"
                          >
                            ›
                          </button>
                        </div>

                        <div className="mt-4 flex justify-center gap-1.5">
                          {visibleLogs.map((log, index) => (
                            <button
                              key={log.id}
                              type="button"
                              onClick={() => setActiveTimelineIndex(index)}
                              className={[
                                "h-2 rounded-full transition",
                                index === activeTimelineIndex
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
                    {visibleLogs.map((log, index) => {
                      const isActive = index === activeTimelineIndex;
                      const badge = timelineBadge(log.action);

                      return (
                        <button
                          key={log.id}
                          type="button"
                          onClick={() => setActiveTimelineIndex(index)}
                          className={[
                            "rounded-2xl border p-3 text-left transition",
                            isActive
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

                  {activeTimelineLog && (
                    <div
                      className={`mt-5 rounded-2xl border border-[#DDE5DF] border-l-4 bg-[#F9FBFA] p-5 ${timelineColor(
                        activeTimelineLog.action
                      )}`}
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-[#17211B]">
                            {timelineTitle(activeTimelineLog)}
                          </h3>

                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-[#17211B]">
                              {getTimelineActorName(activeTimelineLog)}
                            </span>

                            <span
                              className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${actorBadgeClass(
                                getTimelineActorRole(activeTimelineLog)
                              )}`}
                            >
                              {getTimelineActorLabel(activeTimelineLog)}
                            </span>
                          </div>
                        </div>

                        <p className="text-xs text-[#7A877F]">
                          {new Date(activeTimelineLog.createdAt).toLocaleString("pt-BR")}
                        </p>
                      </div>

                      {getTimelineDescription(activeTimelineLog) && (
                        <p className="mt-4 whitespace-pre-line text-sm leading-7 text-[#5E6B63]">
                          {getTimelineDescription(activeTimelineLog)}
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
      </PortalShell>
    </PortalContextGuard>
  );
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