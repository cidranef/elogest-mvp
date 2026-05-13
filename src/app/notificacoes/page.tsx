"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AdminShell from "@/components/AdminShell";
import PortalShell from "@/components/PortalShell";
import ResponsiveSection from "@/components/ui/ResponsiveSection";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";



/* =========================================================
   ETAPA 23 - CENTRAL DE NOTIFICAÇÕES

   Página centralizada para o usuário consultar o histórico
   de notificações internas.

   Recursos:
   - listar notificações;
   - filtrar todas / não lidas / lidas / arquivadas;
   - marcar uma notificação como lida;
   - marcar todas como lidas;
   - abrir o chamado relacionado;
   - arquivar e desarquivar notificações;
   - executar ações em lote;
   - atualizar manualmente.

   Rota:
   /notificacoes

   ETAPA 39.15 — NOVO VISUAL COM SHELL DINÂMICO

   Atualização:
   - Página passa a usar AdminShell ou PortalShell conforme perfil ativo.
   - Topbar, sino, perfil ativo, logout e footer ficam centralizados no shell.
   - Layout migrado do tema escuro antigo para o padrão claro EloGest.

   ETAPA 40.5 — AUDITORIA VISUAL DA CENTRAL DE NOTIFICAÇÕES E NOTIFICATIONBELL

   Ajustes desta revisão:
   - TICKET_INTERNAL_COMMENT passa a ser exibido como "Comunicado interno".
   - Removidos resquícios visuais do tema escuro antigo.
   - Chips, botões e cards usam padrão claro EloGest.
   - Botões em lote receberam contraste correto.
   - Cards arquivados usam fundo claro e opacity suave.
   - extractAccessCount considera apenas perfis ativos.
   - Atualizar recarrega notificações e quantidade de perfis.
   - Estado de erro recebeu botão de tentativa.
   - Mantida a central única /notificacoes.
   ========================================================= */



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



interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: string;
  activeAccess?: ActiveAccess | null;
}



interface NotificationItem {
  id: string;
  userId: string;
  ticketId?: string | null;
  channel: string;
  status: "UNREAD" | "READ" | "ARCHIVED" | string;
  type: string;
  title: string;
  message: string;
  href?: string | null;
  createdAt: string;
  readAt?: string | null;

  ticket?: {
    id: string;
    title: string;
    status: string;
    priority?: string | null;
    scope?: string | null;
    condominiumId?: string | null;
    unitId?: string | null;
    residentId?: string | null;

    condominium?: {
      id: string;
      name: string;
    } | null;

    unit?: {
      id: string;
      block?: string | null;
      unitNumber: string;
    } | null;

    resident?: {
      id: string;
      name: string;
    } | null;
  } | null;
}



type NotificationFilter = "ALL" | "UNREAD" | "READ" | "ARCHIVED";
type NotificationTypeFilter = "ALL" | string;
type BulkAction = "MARK_READ" | "ARCHIVE" | "ARCHIVE_READ";



/* =========================================================
   HELPERS
   ========================================================= */

function formatDateTime(value?: string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleString("pt-BR");
}



function notificationTypeLabel(type?: string | null) {
  const labels: Record<string, string> = {
    GENERAL: "Geral",
    TICKET_CREATED: "Chamado criado",
    TICKET_ASSIGNED: "Chamado atribuído",
    TICKET_ASSIGNED_PUBLIC: "Responsável definido",
    TICKET_PUBLIC_COMMENT: "Resposta pública",
    TICKET_INTERNAL_COMMENT: "Comunicado interno",
    TICKET_STATUS_CHANGED: "Status alterado",
    TICKET_RESOLVED: "Chamado resolvido",
    TICKET_RATED: "Chamado avaliado",
    EMAIL_PENDING: "E-mail pendente",
    WHATSAPP_PENDING: "WhatsApp pendente",
  };

  return labels[type || ""] || type || "Notificação";
}



function notificationToneClass(type?: string | null) {
  if (type === "TICKET_ASSIGNED_PUBLIC" || type === "TICKET_PUBLIC_COMMENT" || type === "TICKET_RESOLVED") {
    return "border-[#CFE6D4] bg-white text-[#256D3C]";
  }

  if (type === "TICKET_CREATED" || type === "EMAIL_PENDING") {
    return "border-[#DDE5DF] bg-white text-[#17211B]";
  }

  if (type === "TICKET_INTERNAL_COMMENT" || type === "TICKET_ASSIGNED") {
    return "border-[#DDE5DF] bg-white text-[#5E6B63]";
  }

  if (type === "TICKET_STATUS_CHANGED" || type === "TICKET_RATED") {
    return "border-[#DDE5DF] bg-white text-[#5E6B63]";
  }

  if (type === "WHATSAPP_PENDING") {
    return "border-[#CFE6D4] bg-white text-[#256D3C]";
  }

  return "border-[#DDE5DF] bg-white text-[#5E6B63]";
}



function statusToneClass(status?: string | null) {
  if (status === "UNREAD") {
    return "border-[#256D3C] bg-[#EAF7EE] text-[#256D3C]";
  }

  if (status === "READ") {
    return "border-[#DDE5DF] bg-white text-[#5E6B63]";
  }

  if (status === "ARCHIVED") {
    return "border-[#DDE5DF] bg-[#F6F8F7] text-[#7A877F]";
  }

  return "border-[#DDE5DF] bg-white text-[#5E6B63]";
}



function statusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    UNREAD: "Não lida",
    READ: "Lida",
    ARCHIVED: "Arquivada",
  };

  return labels[status || ""] || status || "-";
}



function ticketStatusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    OPEN: "Aberto",
    IN_PROGRESS: "Em andamento",
    RESOLVED: "Resolvido",
    CANCELED: "Cancelado",
  };

  return labels[status || ""] || status || "-";
}



function getUnitLabel(notification: NotificationItem) {
  const unit = notification.ticket?.unit;

  if (!unit) return null;

  return `${unit.block ? unit.block + " - " : ""}${unit.unitNumber}`;
}



function isPortalRole(role?: string | null) {
  return (
    role === "MORADOR" ||
    role === "PROPRIETARIO" ||
    role === "SINDICO"
  );
}



function getEffectiveRole(user?: CurrentUser | null) {
  return user?.activeAccess?.role || user?.role || null;
}



function getHomeHref(user?: CurrentUser | null) {
  const role = getEffectiveRole(user);

  if (isPortalRole(role)) {
    return "/portal/dashboard";
  }

  return "/admin/dashboard";
}



function getProfileDescription(user?: CurrentUser | null) {
  const role = getEffectiveRole(user);

  if (role === "SUPER_ADMIN") {
    return "Notificações do perfil Super Admin.";
  }

  if (role === "ADMINISTRADORA") {
    return "Notificações da carteira administrativa ativa.";
  }

  if (role === "SINDICO") {
    return "Notificações do condomínio vinculado ao perfil de síndico.";
  }

  if (role === "MORADOR") {
    return "Notificações do morador e da unidade ativa.";
  }

  if (role === "PROPRIETARIO") {
    return "Notificações do proprietário e da unidade ativa.";
  }

  return "Notificações conforme o perfil de acesso selecionado.";
}



function filterLabel(filter: NotificationFilter) {
  if (filter === "ALL") return "Todas";
  if (filter === "UNREAD") return "Não lidas";
  if (filter === "READ") return "Lidas";
  if (filter === "ARCHIVED") return "Arquivadas";

  return filter;
}


function formatDisplayTitle(value?: string | null) {
  const text = String(value || "").trim();

  if (!text) return "-";

  const smallWords = new Set([
    "a", "à", "ao", "as", "às", "o", "os", "de", "da", "das", "do", "dos",
    "e", "em", "no", "na", "nos", "nas", "com", "para", "por", "sem", "sob", "sobre",
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



/* =========================================================
   EXTRAIR QUANTIDADE DE PERFIS DISPONÍVEIS

   Considera apenas perfis ativos para exibir "Trocar perfil".
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
   CARD DE MÉTRICA
   ========================================================= */

function MetricCard({
  title,
  value,
  tone = "default",
}: {
  title: string;
  value: number;
  tone?: "default" | "green" | "red" | "gray";
}) {
  const valueClass =
    tone === "green"
      ? "text-[#256D3C]"
      : tone === "red"
        ? "text-[#17211B]"
        : tone === "gray"
          ? "text-[#5E6B63]"
          : "text-[#17211B]";

  return (
    <div className="rounded-[24px] border border-[#DDE5DF] bg-white p-5 shadow-sm">
      <p className="text-sm text-[#5E6B63]">{title}</p>

      <strong className={`mt-1 block text-4xl font-semibold tracking-tight ${valueClass}`}>
        {value}
      </strong>
    </div>
  );
}



/* =========================================================
   BOX DE INFORMAÇÃO COMPACTO
   ========================================================= */

function InfoBox({
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
   SHELL DINÂMICO DA CENTRAL
   ========================================================= */

function NotificationPageShell({
  user,
  canSwitchProfile,
  children,
}: {
  user: CurrentUser | null;
  canSwitchProfile: boolean;
  children: React.ReactNode;
}) {
  const role = getEffectiveRole(user);
  const title = "Notificações";
  const description =
    "Consulte alertas, respostas, mudanças de status e movimentações importantes.";

  if (isPortalRole(role)) {
    return (
      <PortalShell
        title={title}
        description={description}
        canSwitchProfile={canSwitchProfile}
      >
        {children}
      </PortalShell>
    );
  }

  return (
    <AdminShell
      title={title}
      description={description}
      current="dashboard"
    >
      {children}
    </AdminShell>
  );
}



/* =========================================================
   PÁGINA
   ========================================================= */

export default function NotificacoesPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const [accessCount, setAccessCount] = useState(0);

  const [filter, setFilter] = useState<NotificationFilter>("ALL");
  const [typeFilter, setTypeFilter] = useState<NotificationTypeFilter>("ALL");

  const [searchTerm, setSearchTerm] = useState("");

  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [unarchivingId, setUnarchivingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const canSwitchProfile = accessCount > 1;



  /* =========================================================
     CARREGAR NOTIFICAÇÕES

     A central usa status=ALL para receber também arquivadas.
     A API já filtra pelo perfil de acesso ativo.
     ========================================================= */

  async function loadNotifications() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/notifications?status=ALL&take=100", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Não foi possível carregar as notificações.");
        setCurrentUser(null);
        setNotifications([]);
        setUnreadCount(0);
        return;
      }

      setCurrentUser(data.user || null);
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadCount(Number(data.unreadCount || 0));
    } catch (err) {
      console.error(err);
      setError("Erro ao carregar notificações.");
      setCurrentUser(null);
      setNotifications([]);
      setUnreadCount(0);
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



  async function refreshPageData() {
    await Promise.all([
      loadNotifications(),
      loadAccessCount(),
    ]);
  }



  /* =========================================================
     MARCAR UMA COMO LIDA
     ========================================================= */

  async function markAsRead(notification: NotificationItem) {
    if (notification.status !== "UNREAD") {
      return;
    }

    try {
      setUpdating(true);

      const res = await fetch(`/api/notifications/${notification.id}/read`, {
        method: "PATCH",
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error || "Não foi possível marcar a notificação como lida.");
        return;
      }

      setUnreadCount(Number(data.unreadCount || 0));

      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id
            ? {
                ...item,
                status: "READ",
                readAt: new Date().toISOString(),
              }
            : item
        )
      );
    } catch (err) {
      console.error(err);
      alert("Erro ao marcar notificação como lida.");
    } finally {
      setUpdating(false);
    }
  }



  /* =========================================================
     MARCAR TODAS COMO LIDAS
     ========================================================= */

  async function markAllAsRead() {
    if (unreadCount === 0) return;

    try {
      setUpdating(true);

      const res = await fetch("/api/notifications", {
        method: "PATCH",
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error || "Não foi possível marcar as notificações como lidas.");
        return;
      }

      setUnreadCount(Number(data.unreadCount || 0));

      setNotifications((current) =>
        current.map((item) => {
          if (item.status !== "UNREAD") {
            return item;
          }

          return {
            ...item,
            status: "READ",
            readAt: item.readAt || new Date().toISOString(),
          };
        })
      );
    } catch (err) {
      console.error(err);
      alert("Erro ao marcar notificações como lidas.");
    } finally {
      setUpdating(false);
    }
  }



  /* =========================================================
     ARQUIVAR NOTIFICAÇÃO INDIVIDUAL
     ========================================================= */

  async function archiveNotification(notification: NotificationItem) {
    if (notification.status === "ARCHIVED") {
      return;
    }

    const confirmed = confirm(
      `Deseja arquivar esta notificação?\n\n${notification.title}`
    );

    if (!confirmed) return;

    try {
      setArchivingId(notification.id);

      const res = await fetch(`/api/notifications/${notification.id}/archive`, {
        method: "PATCH",
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error || "Não foi possível arquivar a notificação.");
        return;
      }

      setUnreadCount(Number(data.unreadCount || 0));

      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id
            ? {
                ...item,
                status: "ARCHIVED",
                readAt: item.readAt || new Date().toISOString(),
              }
            : item
        )
      );
    } catch (err) {
      console.error(err);
      alert("Erro ao arquivar notificação.");
    } finally {
      setArchivingId(null);
    }
  }



  /* =========================================================
     DESARQUIVAR NOTIFICAÇÃO
     ========================================================= */

  async function unarchiveNotification(notification: NotificationItem) {
    if (notification.status !== "ARCHIVED") {
      return;
    }

    try {
      setUnarchivingId(notification.id);

      const res = await fetch(`/api/notifications/${notification.id}/unarchive`, {
        method: "PATCH",
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error || "Não foi possível desarquivar a notificação.");
        return;
      }

      setUnreadCount(Number(data.unreadCount || 0));

      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id
            ? {
                ...item,
                status: "READ",
                readAt: item.readAt || new Date().toISOString(),
              }
            : item
        )
      );
    } catch (err) {
      console.error(err);
      alert("Erro ao desarquivar notificação.");
    } finally {
      setUnarchivingId(null);
    }
  }



  /* =========================================================
     AÇÕES EM LOTE
     ========================================================= */

  async function executeBulkAction({
    action,
    ids = [],
  }: {
    action: BulkAction;
    ids?: string[];
  }) {
    try {
      setBulkUpdating(true);

      const res = await fetch("/api/notifications/bulk", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          ids,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error || "Não foi possível concluir a ação em lote.");
        return;
      }

      setUnreadCount(Number(data.unreadCount || 0));

      const now = new Date().toISOString();

      if (action === "MARK_READ") {
        const idSet = new Set(ids);

        setNotifications((current) =>
          current.map((item) => {
            if (!idSet.has(item.id) || item.status !== "UNREAD") {
              return item;
            }

            return {
              ...item,
              status: "READ",
              readAt: item.readAt || now,
            };
          })
        );
      }

      if (action === "ARCHIVE") {
        const idSet = new Set(ids);

        setNotifications((current) =>
          current.map((item) => {
            if (!idSet.has(item.id) || item.status === "ARCHIVED") {
              return item;
            }

            return {
              ...item,
              status: "ARCHIVED",
              readAt: item.readAt || now,
            };
          })
        );
      }

      if (action === "ARCHIVE_READ") {
        setNotifications((current) =>
          current.map((item) => {
            if (item.status !== "READ") {
              return item;
            }

            return {
              ...item,
              status: "ARCHIVED",
              readAt: item.readAt || now,
            };
          })
        );
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao concluir ação em lote.");
    } finally {
      setBulkUpdating(false);
    }
  }



  async function markFilteredAsRead() {
    const ids = filteredNotifications
      .filter((notification) => notification.status === "UNREAD")
      .map((notification) => notification.id);

    if (ids.length === 0) {
      alert("Não há notificações não lidas no filtro atual.");
      return;
    }

    await executeBulkAction({
      action: "MARK_READ",
      ids,
    });
  }



  async function archiveFilteredNotifications() {
    const ids = filteredNotifications
      .filter((notification) => notification.status !== "ARCHIVED")
      .map((notification) => notification.id);

    if (ids.length === 0) {
      alert("Não há notificações para arquivar no filtro atual.");
      return;
    }

    const confirmed = confirm(
      `Deseja arquivar ${ids.length} notificação(ões) do filtro atual?`
    );

    if (!confirmed) return;

    await executeBulkAction({
      action: "ARCHIVE",
      ids,
    });
  }



  async function archiveReadNotifications() {
    const readCount = notifications.filter(
      (notification) => notification.status === "READ"
    ).length;

    if (readCount === 0) {
      alert("Não há notificações lidas para arquivar.");
      return;
    }

    const confirmed = confirm(
      `Deseja arquivar todas as ${readCount} notificação(ões) lidas deste perfil de acesso?`
    );

    if (!confirmed) return;

    await executeBulkAction({
      action: "ARCHIVE_READ",
    });
  }



  /* =========================================================
     LIMPAR FILTROS
     ========================================================= */

  function clearFilters() {
    setFilter("ALL");
    setTypeFilter("ALL");
    setSearchTerm("");
  }



  /* =========================================================
     INIT
     ========================================================= */

  useEffect(() => {
    refreshPageData();
  }, []);



  /* =========================================================
     OPÇÕES DO FILTRO POR TIPO
     ========================================================= */

  const typeOptions = useMemo(() => {
    const types = notifications
      .map((notification) => notification.type)
      .filter((type): type is string => !!type);

    return Array.from(new Set(types)).sort((a, b) =>
      notificationTypeLabel(a).localeCompare(notificationTypeLabel(b), "pt-BR")
    );
  }, [notifications]);



  /* =========================================================
     FILTROS
     ========================================================= */

  const filteredNotifications = useMemo(() => {
    let result = [...notifications];

    if (filter !== "ALL") {
      result = result.filter((notification) => notification.status === filter);
    }

    if (typeFilter !== "ALL") {
      result = result.filter((notification) => notification.type === typeFilter);
    }

    const term = searchTerm.trim().toLowerCase();

    if (term) {
      result = result.filter((notification) => {
        const searchableText = [
          notification.title,
          notification.message,
          notification.type,
          notificationTypeLabel(notification.type),
          notification.status,
          statusLabel(notification.status),
          notification.ticket?.title,
          notification.ticket?.condominium?.name,
          notification.ticket?.resident?.name,
          getUnitLabel(notification),
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
  }, [notifications, filter, typeFilter, searchTerm]);



  const metrics = useMemo(() => {
    const total = notifications.length;

    const unread = notifications.filter(
      (notification) => notification.status === "UNREAD"
    ).length;

    const read = notifications.filter(
      (notification) => notification.status === "READ"
    ).length;

    const archived = notifications.filter(
      (notification) => notification.status === "ARCHIVED"
    ).length;

    return {
      total,
      unread,
      read,
      archived,
    };
  }, [notifications]);



  const filteredMetrics = useMemo(() => {
    const total = filteredNotifications.length;

    const unread = filteredNotifications.filter(
      (notification) => notification.status === "UNREAD"
    ).length;

    const read = filteredNotifications.filter(
      (notification) => notification.status === "READ"
    ).length;

    const archivable = filteredNotifications.filter(
      (notification) => notification.status !== "ARCHIVED"
    ).length;

    return {
      total,
      unread,
      read,
      archivable,
    };
  }, [filteredNotifications]);



  const typeMetrics = useMemo(() => {
    const map = new Map<string, number>();

    notifications.forEach((notification) => {
      const type = notification.type || "GENERAL";
      map.set(type, (map.get(type) || 0) + 1);
    });

    return Array.from(map.entries())
      .map(([type, total]) => ({
        type,
        total,
        label: notificationTypeLabel(type),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [notifications]);



  const activeFilterSummary = useMemo(() => {
    const items: string[] = [];

    if (filter !== "ALL") {
      items.push(`Status: ${filterLabel(filter)}`);
    }

    if (typeFilter !== "ALL") {
      items.push(`Tipo: ${notificationTypeLabel(typeFilter)}`);
    }

    if (searchTerm.trim()) {
      items.push(`Busca: "${searchTerm.trim()}"`);
    }

    return items;
  }, [filter, typeFilter, searchTerm]);



  const homeHref = getHomeHref(currentUser);

  const isBusy =
    updating || bulkUpdating || !!archivingId || !!unarchivingId;

  const hasAnyFilter =
    filter !== "ALL" || typeFilter !== "ALL" || searchTerm.trim() !== "";



  const centralSummary =
    metrics.total === 0
      ? "Nenhuma notificação encontrada para este perfil de acesso."
      : `Este perfil possui ${metrics.total} notificação(ões), sendo ${metrics.unread} não lida(s), ${metrics.read} lida(s) e ${metrics.archived} arquivada(s).`;



  const recommendedAction =
    metrics.unread > 0
      ? "Revise as notificações não lidas e marque como lidas após acompanhar os itens importantes."
      : metrics.read > 0
        ? "Você não possui notificações pendentes. Se desejar organizar a central, arquive as notificações já lidas."
        : metrics.archived > 0
          ? "As notificações ativas estão em dia. Use o filtro de arquivadas caso precise recuperar algum histórico."
          : "Nenhuma ação necessária no momento.";



  /* =========================================================
     ESTADO DE CARREGAMENTO
     ========================================================= */

  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando notificações..."
        description="Aguarde enquanto identificamos seu perfil de acesso e carregamos a central de notificações."
      />
    );
  }



  /* =========================================================
     RENDER
     ========================================================= */

  return (
    <NotificationPageShell user={currentUser} canSwitchProfile={canSwitchProfile}>
      <div className="space-y-6">
        {/* =====================================================
            TOPO
            ===================================================== */}

        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#256D3C]">
              Central de notificações
            </p>

            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17211B] md:text-4xl">
              Notificações
            </h1>

            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#5E6B63]">
              Consulte alertas, respostas, mudanças de status e movimentações importantes.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/notificacoes/preferencias"
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5A32]"
            >
              Preferências
            </Link>

            <button
              type="button"
              onClick={refreshPageData}
              disabled={isBusy}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#17211B] shadow-sm transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:opacity-50"
            >
              Atualizar
            </button>
          </div>
        </header>



        {/* =====================================================
            ERRO
            ===================================================== */}

        {error && (
          <div className="rounded-[24px] border border-red-200 bg-red-50 p-5 text-sm text-red-800">
            <p className="font-semibold">Não foi possível carregar a central.</p>

            <p className="mt-1">{error}</p>

            <button
              type="button"
              onClick={refreshPageData}
              className="mt-4 inline-flex h-10 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-red-700 ring-1 ring-red-200 transition hover:bg-red-100"
            >
              Tentar novamente
            </button>
          </div>
        )}



        {/* =====================================================
            VISÃO DA CENTRAL
            ===================================================== */}

        <section className="overflow-hidden rounded-[32px] border border-[#DDE5DF] bg-white shadow-sm">
          <div className="border-b border-[#DDE5DF] bg-[linear-gradient(135deg,#FFFFFF_0%,#F8FAF9_62%,#EAF7EE_135%)] p-6">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-[#17211B] md:text-3xl">
                  Visão da Central
                </h2>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5E6B63]">
                  {centralSummary}
                </p>

                <p className="mt-1 text-sm leading-6 text-[#7A877F]">
                  {getProfileDescription(currentUser)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:min-w-[560px] xl:grid-cols-4">
                <MetricCard title="Total" value={metrics.total} />
                <MetricCard title="Não lidas" value={metrics.unread} tone="red" />
                <MetricCard title="Lidas" value={metrics.read} tone="green" />
                <MetricCard title="Arquivadas" value={metrics.archived} tone="gray" />
              </div>
            </div>
          </div>

          <div className="grid gap-0 divide-y divide-[#DDE5DF] md:grid-cols-3 md:divide-x md:divide-y-0">
            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                Orientação recomendada
              </p>

              <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                {recommendedAction}
              </p>
            </div>

            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                Perfil ativo
              </p>

              <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                {currentUser?.activeAccess?.label || currentUser?.name || "Perfil de acesso atual"}
              </p>
            </div>

            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                Resultado atual
              </p>

              <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                Exibindo <strong className="text-[#17211B]">{filteredNotifications.length}</strong>{" "}
                notificação(ões) conforme filtros aplicados.
              </p>
            </div>
          </div>
        </section>



        {/* =====================================================
            RESUMO POR TIPO
            ===================================================== */}

        {typeMetrics.length > 0 && (
          <ResponsiveSection
            title="Resumo por tipo"
            description="Tipos de notificações mais frequentes neste perfil de acesso."
            defaultOpenMobile={false}
          >
            <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-sm">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {typeMetrics.map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => setTypeFilter(item.type)}
                    className="rounded-2xl border border-[#DDE5DF] bg-white p-4 text-left text-[#17211B] transition hover:border-[#256D3C] hover:bg-[#F9FBFA]"
                  >
                    <p className="text-xs opacity-80">{item.label}</p>

                    <strong className="text-2xl">{item.total}</strong>
                  </button>
                ))}
              </div>
            </section>
          </ResponsiveSection>
        )}



        {/* =====================================================
            FILTROS
            ===================================================== */}

        <ResponsiveSection
          title="Filtros da central"
          description="Refine a lista por busca, status ou tipo de notificação."
          defaultOpenMobile={hasAnyFilter}
        >
          <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-[#17211B]">
                Filtros da central
              </h2>

              <p className="mt-1 text-sm text-[#5E6B63]">
                Refine a lista por busca, status ou tipo de notificação.
              </p>
            </div>

            {hasAnyFilter && (
              <button
                type="button"
                onClick={clearFilters}
                disabled={isBusy}
                className="rounded-2xl border border-[#DDE5DF] bg-white px-5 py-3 font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:opacity-50"
              >
                Limpar filtros
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <label className="text-sm text-[#5E6B63]">Buscar</label>

              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por título, mensagem, condomínio, chamado..."
                className="mt-1 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 py-3 text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
              />
            </div>

            <div>
              <label className="text-sm text-[#5E6B63]">Status</label>

              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as NotificationFilter)}
                className="mt-1 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 py-3 text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
              >
                <option value="ALL">Todas</option>
                <option value="UNREAD">Não lidas</option>
                <option value="READ">Lidas</option>
                <option value="ARCHIVED">Arquivadas</option>
              </select>
            </div>

            <div>
              <label className="text-sm text-[#5E6B63]">Tipo</label>

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 py-3 text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
              >
                <option value="ALL">Todos os tipos</option>

                {typeOptions.map((type) => (
                  <option key={type} value={type}>
                    {notificationTypeLabel(type)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={markAllAsRead}
                disabled={isBusy || unreadCount === 0}
                className="w-full rounded-2xl bg-[#256D3C] px-5 py-3 font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
              >
                Marcar como lidas
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm text-[#5E6B63]">
                Exibindo{" "}
                <strong className="text-[#17211B]">{filteredNotifications.length}</strong>{" "}
                notificação(ões) de{" "}
                <strong className="text-[#17211B]">{notifications.length}</strong>{" "}
                carregada(s).
              </p>

              {activeFilterSummary.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {activeFilterSummary.map((item) => (
                    <span
                      key={item}
                      className="inline-flex rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-1 text-xs font-semibold text-[#256D3C]"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={refreshPageData}
              disabled={isBusy}
              className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:opacity-50"
            >
              Atualizar
            </button>
          </div>
          </section>
        </ResponsiveSection>




        {/* =====================================================
            AÇÕES EM LOTE
            ===================================================== */}

        <ResponsiveSection
          title="Ações em lote"
          description="Aplique ações nas notificações exibidas pelos filtros atuais."
          defaultOpenMobile={false}
        >
          <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-[#17211B]">
                Ações em lote
              </h2>

              <p className="mt-1 text-sm text-[#5E6B63]">
                Aplique ações nas notificações exibidas pelos filtros atuais.
              </p>

              <p className="mt-2 text-xs text-[#7A877F]">
                Filtro atual: {filteredMetrics.total} total ·{" "}
                {filteredMetrics.unread} não lida(s) · {filteredMetrics.read} lida(s) ·{" "}
                {filteredMetrics.archivable} arquivável(is)
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:min-w-[720px]">
              <button
                onClick={markFilteredAsRead}
                disabled={isBusy || filteredMetrics.unread === 0}
                className="rounded-2xl border border-[#DDE5DF] bg-white px-5 py-3 font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:bg-[#F6F8F7] disabled:text-[#9AA7A0]"
              >
                {bulkUpdating ? "Processando..." : "Marcar filtradas como lidas"}
              </button>

              <button
                onClick={archiveFilteredNotifications}
                disabled={isBusy || filteredMetrics.archivable === 0}
                className="rounded-2xl border border-[#DDE5DF] bg-white px-5 py-3 font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:bg-[#F6F8F7] disabled:text-[#9AA7A0]"
              >
                {bulkUpdating ? "Processando..." : "Arquivar notificações filtradas"}
              </button>

              <button
                onClick={archiveReadNotifications}
                disabled={isBusy || metrics.read === 0}
                className="rounded-2xl border border-[#DDE5DF] bg-white px-5 py-3 font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:bg-[#F6F8F7] disabled:text-[#9AA7A0]"
              >
                {bulkUpdating ? "Processando..." : "Arquivar notificações lidas"}
              </button>
            </div>
          </div>
          </section>
        </ResponsiveSection>



        {/* =====================================================
            LISTA COMPACTA / EXPANSÍVEL
            ===================================================== */}

        <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-sm">
          <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-[#17211B]">
                Histórico de notificações
              </h2>

              <p className="text-sm text-[#5E6B63]">
                Visualização compacta. Abra “Mais informações” apenas quando precisar consultar os detalhes.
              </p>
            </div>
          </div>

          {filteredNotifications.length === 0 ? (
            <div className="rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-6 text-[#5E6B63]">
              {hasAnyFilter
                ? "Nenhuma notificação encontrada com os filtros atuais. Ajuste os filtros ou clique em limpar filtros."
                : "Nenhuma notificação disponível para este perfil de acesso."}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredNotifications.map((notification) => {
                const href = notification.href || homeHref;
                const unitLabel = getUnitLabel(notification);
                const isArchived = notification.status === "ARCHIVED";
                const isUnread = notification.status === "UNREAD";
                const relatedTicketTitle = notification.ticket?.title
                  ? formatDisplayTitle(notification.ticket.title)
                  : null;

                return (
                  <article
                    key={notification.id}
                    className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:border-[#256D3C]/40 ${
                      isUnread
                        ? "border-[#256D3C]"
                        : isArchived
                          ? "border-[#DDE5DF] opacity-80"
                          : "border-[#DDE5DF]"
                    }`}
                  >
                    <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-semibold ${notificationToneClass(
                              notification.type
                            )}`}
                          >
                            {notificationTypeLabel(notification.type)}
                          </span>

                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusToneClass(
                              notification.status
                            )}`}
                          >
                            {statusLabel(notification.status)}
                          </span>

                          <span className="text-xs font-semibold text-[#7A877F]">
                            {formatDateTime(notification.createdAt)}
                          </span>
                        </div>

                        <h3 className="truncate text-lg font-semibold text-[#17211B]">
                          {notification.title}
                        </h3>

                        <p className="mt-1 truncate text-sm text-[#5E6B63]">
                          {notification.message}
                        </p>

                        <p className="mt-1 truncate text-xs text-[#7A877F]">
                          {relatedTicketTitle
                            ? `Chamado: ${relatedTicketTitle}`
                            : getProfileDescription(currentUser)}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                        <Link
                          href={href}
                          onClick={() => markAsRead(notification)}
                          className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-4 text-sm font-semibold text-white transition hover:bg-[#1F5A32]"
                        >
                          Abrir
                        </Link>

                        {notification.status === "UNREAD" && (
                          <button
                            onClick={() => markAsRead(notification)}
                            disabled={isBusy}
                            className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:opacity-50"
                          >
                            Marcar lida
                          </button>
                        )}
                      </div>
                    </div>

                    <details className="group border-t border-[#EEF2EF] bg-[#F9FBFA]">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-[#17211B] transition hover:bg-[#F6F8F7]">
                        <span>Mais informações</span>
                        <span className="text-[#7A877F] transition group-open:rotate-180">
                          ▾
                        </span>
                      </summary>

                      <div className="border-t border-[#DDE5DF] p-4">
                        <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
                          <InfoBox
                            label="Data"
                            value={formatDateTime(notification.createdAt)}
                          />

                          <InfoBox
                            label="Condomínio"
                            value={notification.ticket?.condominium?.name || "-"}
                          />

                          <InfoBox
                            label="Chamado"
                            value={relatedTicketTitle || "-"}
                          />

                          <InfoBox
                            label="Unidade"
                            value={unitLabel || "-"}
                          />

                          <InfoBox
                            label="Morador"
                            value={notification.ticket?.resident?.name || "-"}
                          />

                          <InfoBox
                            label="Status do chamado"
                            value={
                              notification.ticket?.status
                                ? ticketStatusLabel(notification.ticket.status)
                                : "-"
                            }
                          />
                        </div>

                        <div className="mt-4 rounded-2xl border border-[#DDE5DF] bg-white p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
                            Mensagem completa
                          </p>

                          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#5E6B63]">
                            {notification.message || "-"}
                          </p>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <Link
                            href={href}
                            onClick={() => markAsRead(notification)}
                            className="inline-flex h-10 items-center justify-center rounded-2xl bg-[#256D3C] px-4 text-sm font-semibold text-white transition hover:bg-[#1F5A32]"
                          >
                            Abrir destino
                          </Link>

                          {!isArchived && (
                            <button
                              onClick={() => archiveNotification(notification)}
                              disabled={
                                archivingId === notification.id ||
                                !!unarchivingId ||
                                updating ||
                                bulkUpdating
                              }
                              className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:bg-[#F6F8F7] disabled:text-[#9AA7A0]"
                            >
                              {archivingId === notification.id
                                ? "Arquivando..."
                                : "Arquivar"}
                            </button>
                          )}

                          {isArchived && (
                            <button
                              onClick={() => unarchiveNotification(notification)}
                              disabled={
                                unarchivingId === notification.id ||
                                !!archivingId ||
                                updating ||
                                bulkUpdating
                              }
                              className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:bg-[#F6F8F7] disabled:text-[#9AA7A0]"
                            >
                              {unarchivingId === notification.id
                                ? "Desarquivando..."
                                : "Desarquivar"}
                            </button>
                          )}
                        </div>
                      </div>
                    </details>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </NotificationPageShell>
  );
}