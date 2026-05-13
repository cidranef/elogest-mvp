"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";



/* =========================================================
   SINO DE NOTIFICAÇÕES REUTILIZÁVEL - ELOGEST

   Usado em:
   - área administrativa;
   - portal do síndico;
   - portal do morador;
   - central de notificações.

   Consome:
   GET   /api/notifications
   PATCH /api/notifications
   PATCH /api/notifications/[id]/read

   ETAPA 39.6.1 — AJUSTE PARA NOVO ADMINSHELL

   Atualização:
   - Mantida toda a lógica funcional já existente.
   - Visual migrado do padrão escuro para o padrão claro EloGest.
   - Botão do sino passa a encaixar na topbar clara do AdminShell.
   - Dropdown passa a usar cards brancos, bordas suaves e verde institucional.
   - Mantida central única /notificacoes.
   - Mantida leitura por perfil de acesso ativo.

   ETAPA 40.5 — AUDITORIA VISUAL DA CENTRAL DE NOTIFICAÇÕES E NOTIFICATIONBELL

   Ajustes desta revisão:
   - TICKET_INTERNAL_COMMENT passa a ser exibido como "Comunicado interno".
   - Removida bolinha verde quando não há notificações não lidas.
   - Adicionado aria-expanded e aria-haspopup no botão do sino.
   - Adicionado estado de erro amigável no dropdown.
   - Botão Atualizar recarrega activeAccess e notificações.
   - Mantida rota /notificacoes como central.
   ========================================================= */



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



interface NotificationBellProps {
  fallbackHref?: string;
}



/* =========================================================
   HELPERS
   ========================================================= */

function formatNotificationDate(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  const now = new Date();

  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);

  if (diffMinutes < 1) return "Agora";
  if (diffMinutes < 60) return `${diffMinutes} min atrás`;
  if (diffHours < 24) return `${diffHours} h atrás`;

  return date.toLocaleString("pt-BR");
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

  return labels[type || ""] || "Notificação";
}



function notificationToneClass(type?: string | null) {
  if (type === "TICKET_ASSIGNED") {
    return "border-purple-200 bg-purple-50 text-purple-700";
  }

  if (type === "TICKET_ASSIGNED_PUBLIC") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (type === "TICKET_CREATED") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  if (type === "TICKET_PUBLIC_COMMENT") {
    return "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]";
  }

  if (type === "TICKET_INTERNAL_COMMENT") {
    return "border-slate-200 bg-slate-50 text-slate-700";
  }

  if (type === "TICKET_STATUS_CHANGED") {
    return "border-yellow-200 bg-yellow-50 text-yellow-700";
  }

  if (type === "TICKET_RESOLVED") {
    return "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]";
  }

  if (type === "TICKET_RATED") {
    return "border-yellow-200 bg-yellow-50 text-yellow-700";
  }

  if (type === "EMAIL_PENDING") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  if (type === "WHATSAPP_PENDING") {
    return "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]";
  }

  return "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]";
}



function isPortalRole(role?: string | null) {
  return role === "SINDICO" || role === "MORADOR" || role === "PROPRIETARIO";
}



function isAdminRole(role?: string | null) {
  return role === "SUPER_ADMIN" || role === "ADMINISTRADORA";
}



function BellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}



function NotificationStatusIcon({
  unread,
}: {
  unread: boolean;
}) {
  if (unread) {
    return (
      <span className="h-2.5 w-2.5 rounded-full bg-[#256D3C]" />
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}



/* =========================================================
   COMPONENTE
   ========================================================= */

export default function NotificationBell({
  fallbackHref,
}: NotificationBellProps) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const [activeAccess, setActiveAccess] = useState<ActiveAccess | null>(null);

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [markingAllAsRead, setMarkingAllAsRead] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const dropdownRef = useRef<HTMLDivElement | null>(null);



  /* =========================================================
     CENTRAL DE NOTIFICAÇÕES
     ========================================================= */

  const notificationsCenterHref = useMemo(() => {
    return "/notificacoes";
  }, []);



  /* =========================================================
     FALLBACK INTELIGENTE
     ========================================================= */

  const safeFallbackHref = useMemo(() => {
    if (fallbackHref && fallbackHref.trim()) {
      return fallbackHref;
    }

    if (isPortalRole(activeAccess?.role)) {
      return "/portal/dashboard";
    }

    if (isAdminRole(activeAccess?.role)) {
      return "/admin/dashboard";
    }

    return "/contexto";
  }, [fallbackHref, activeAccess]);



  /* =========================================================
     CARREGAR PERFIL DE ACESSO ATIVO
     ========================================================= */

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
      console.error("Erro ao carregar perfil de acesso ativo:", err);
      setActiveAccess(null);
    }
  }



  /* =========================================================
     CARREGAR NOTIFICAÇÕES DO SINO
     ========================================================= */

  async function loadNotifications() {
    try {
      setLoadingNotifications(true);
      setErrorMessage("");

      const res = await fetch("/api/notifications?take=10", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setNotifications([]);
        setUnreadCount(0);
        setErrorMessage(
          data?.error || "Não foi possível carregar suas notificações."
        );
        return;
      }

      const activeNotifications = Array.isArray(data.notifications)
        ? data.notifications.filter(
            (notification: NotificationItem) =>
              notification.status !== "ARCHIVED"
          )
        : [];

      setNotifications(activeNotifications);
      setUnreadCount(Number(data.unreadCount || 0));
    } catch (err) {
      console.error("Erro ao carregar notificações:", err);
      setNotifications([]);
      setUnreadCount(0);
      setErrorMessage("Erro ao carregar notificações.");
    } finally {
      setLoadingNotifications(false);
    }
  }



  /* =========================================================
     ATUALIZAR TUDO
     ========================================================= */

  async function refreshNotifications() {
    await Promise.all([
      loadActiveAccess(),
      loadNotifications(),
    ]);
  }



  /* =========================================================
     ABRIR / FECHAR DROPDOWN
     ========================================================= */

  function toggleNotifications() {
    setNotificationsOpen((currentValue) => {
      const nextValue = !currentValue;

      if (nextValue) {
        refreshNotifications();
      }

      return nextValue;
    });
  }



  /* =========================================================
     MARCAR UMA NOTIFICAÇÃO COMO LIDA
     ========================================================= */

  async function markNotificationAsRead(notification: NotificationItem) {
    if (notification.status !== "UNREAD") {
      return;
    }

    try {
      const res = await fetch(`/api/notifications/${notification.id}/read`, {
        method: "PATCH",
      });

      const data = await res.json();

      if (!res.ok) {
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
      console.error("Erro ao marcar notificação como lida:", err);
    }
  }



  /* =========================================================
     MARCAR TODAS COMO LIDAS
     ========================================================= */

  async function markAllAsRead() {
    try {
      setMarkingAllAsRead(true);
      setErrorMessage("");

      const res = await fetch("/api/notifications", {
        method: "PATCH",
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(
          data?.error || "Não foi possível marcar as notificações como lidas."
        );
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
      console.error("Erro ao marcar todas como lidas:", err);
      setErrorMessage("Erro ao marcar notificações como lidas.");
    } finally {
      setMarkingAllAsRead(false);
    }
  }



  /* =========================================================
     FECHAR DROPDOWN AO CLICAR FORA
     ========================================================= */

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!dropdownRef.current) return;

      if (!dropdownRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }

    document.addEventListener("click", handleClickOutside);

    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, []);



  /* =========================================================
     ATUALIZAR AO VOLTAR PARA A ABA
     ========================================================= */

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        refreshNotifications();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);



  /* =========================================================
     INIT
     ========================================================= */

  useEffect(() => {
    refreshNotifications();
  }, []);



  /* =========================================================
     RENDER
     ========================================================= */

  return (
    <div
      className="relative"
      ref={dropdownRef}
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      <button
        type="button"
        onClick={toggleNotifications}
        className={[
          "relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white text-[#17211B] shadow-sm transition",
          notificationsOpen
            ? "border-[#256D3C] text-[#256D3C] ring-4 ring-[#256D3C]/10"
            : "hover:border-[#256D3C] hover:text-[#256D3C]",
        ].join(" ")}
        title="Notificações"
        aria-label={
          unreadCount > 0
            ? `Abrir notificações. ${unreadCount} não lida(s).`
            : "Abrir notificações"
        }
        aria-haspopup="menu"
        aria-expanded={notificationsOpen}
      >
        <BellIcon />

        {unreadCount > 0 && (
          <span className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-red-600 px-1.5 text-xs font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {notificationsOpen && (
        <div
          className="absolute right-0 z-[9999] mt-3 w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[28px] border border-[#DDE5DF] bg-white shadow-2xl"
          role="menu"
          aria-label="Lista de notificações"
        >
          <div className="border-b border-[#DDE5DF] bg-[#F6F8F7] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-[#17211B]">
                  Notificações
                </h3>

                <p className="mt-1 text-xs text-[#5E6B63]">
                  {unreadCount > 0
                    ? `${unreadCount} não lida(s)`
                    : "Nenhuma notificação não lida"}
                </p>
              </div>

              <button
                type="button"
                onClick={markAllAsRead}
                disabled={markingAllAsRead || unreadCount === 0}
                className="rounded-2xl border border-[#DDE5DF] bg-white px-3 py-2 text-xs font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:cursor-not-allowed disabled:bg-[#F6F8F7] disabled:text-[#9AA7A0]"
              >
                {markingAllAsRead ? "Marcando..." : "Marcar como lidas"}
              </button>
            </div>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {loadingNotifications ? (
              <div className="p-5 text-sm text-[#5E6B63]">
                Carregando...
              </div>
            ) : errorMessage ? (
              <div className="p-5">
                <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4">
                  <p className="text-sm font-semibold text-yellow-800">
                    Não foi possível carregar
                  </p>

                  <p className="mt-1 text-sm leading-5 text-yellow-800/80">
                    {errorMessage}
                  </p>

                  <button
                    type="button"
                    onClick={refreshNotifications}
                    className="mt-3 inline-flex rounded-2xl border border-yellow-300 bg-white px-3 py-2 text-xs font-semibold text-yellow-800 transition hover:bg-yellow-100"
                  >
                    Tentar novamente
                  </button>
                </div>
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-5 text-sm text-[#5E6B63]">
                Nenhuma notificação ativa.
              </div>
            ) : (
              <div className="divide-y divide-[#DDE5DF]">
                {notifications.map((notification) => {
                  const href = notification.href || safeFallbackHref;
                  const unread = notification.status === "UNREAD";

                  return (
                    <Link
                      key={notification.id}
                      href={href}
                      onClick={() => {
                        markNotificationAsRead(notification);
                        setNotificationsOpen(false);
                      }}
                      className={[
                        "block p-4 transition hover:bg-[#F6F8F7]",
                        unread ? "bg-[#EAF7EE]/55" : "bg-white",
                      ].join(" ")}
                      role="menuitem"
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs ${notificationToneClass(
                            notification.type
                          )}`}
                        >
                          <NotificationStatusIcon unread={unread} />
                        </span>

                        <div className="min-w-0">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-[#17211B]">
                              {notification.title}
                            </p>

                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${notificationToneClass(
                                notification.type
                              )}`}
                            >
                              {notificationTypeLabel(notification.type)}
                            </span>
                          </div>

                          <p className="line-clamp-2 text-sm leading-5 text-[#5E6B63]">
                            {notification.message}
                          </p>

                          {notification.ticket?.condominium?.name && (
                            <p className="mt-2 text-xs text-[#7A877F]">
                              {notification.ticket.condominium.name}
                            </p>
                          )}

                          <p className="mt-1 text-xs text-[#7A877F]">
                            {formatNotificationDate(notification.createdAt)}
                          </p>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-[#DDE5DF] bg-[#F6F8F7] p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={refreshNotifications}
                className="inline-flex w-full items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-4 py-2 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
              >
                Atualizar
              </button>

              <Link
                href={notificationsCenterHref}
                onClick={() => setNotificationsOpen(false)}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-[#256D3C] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1F5A32]"
              >
                Central de notificações
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}