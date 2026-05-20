"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import AdminShell from "@/components/AdminShell";
import PortalShell from "@/components/PortalShell";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";



/* =========================================================
   PREFERÊNCIAS DE NOTIFICAÇÃO - ELOGEST

   ETAPA 42.10.4 — BLOQUEIO E HUMANIZAÇÃO

   Ajustes:
   - Acesso sem sessão redireciona para /login.
   - Acesso sem perfil ativo/autorizado redireciona para /contexto.
   - Bloqueio residual renderiza tela limpa, sem AdminShell/PortalShell.
   - Termos técnicos como TICKET_CREATED deixam de aparecer na interface.
   - "WhatsApp dev" foi humanizado para "WhatsApp teste".

   ETAPA 42.10.6.2 — WHATSAPP DA CONTA / OPT-OUT

   Ajustes desta revisão:
   - Adicionado card "WhatsApp da conta".
   - Usuário pode pausar WhatsApp para a conta inteira.
   - Usuário pode reativar WhatsApp sem mexer no Prisma Studio.
   - Pausa global convive com preferências por evento.
   - Se pausado, nenhum evento envia WhatsApp para este usuário.
   ========================================================= */



interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: string;
}



interface WhatsAppAccountStatus {
  phone?: string | null;
  phoneOptInAt?: string | null;
  phoneOptOutAt?: string | null;
  whatsappPaused: boolean;
  whatsappAvailable: boolean;
}



interface NotificationPreferenceItem {
  eventType: string;
  label: string;
  description: string;

  availableChannels: string[];
  enabledChannels: string[];

  externalReady: boolean;
  userPreferenceEnabled: boolean;

  systemEnabled: boolean;
  emailEnabled: boolean;
  whatsappEnabled: boolean;

  createdAt?: string | null;
  updatedAt?: string | null;
}



const ADMIN_VISIBLE_EVENTS = [
  "TICKET_CREATED",
  "TICKET_ASSIGNED",
  "TICKET_ASSIGNED_PUBLIC",
  "TICKET_PUBLIC_COMMENT",
  "TICKET_INTERNAL_COMMENT",
  "TICKET_STATUS_CHANGED",
  "TICKET_RESOLVED",
  "TICKET_RATED",
];

const SINDICO_VISIBLE_EVENTS = [
  "TICKET_CREATED",
  "TICKET_ASSIGNED_PUBLIC",
  "TICKET_PUBLIC_COMMENT",
  "TICKET_STATUS_CHANGED",
  "TICKET_RESOLVED",
];

const PORTAL_USER_VISIBLE_EVENTS = [
  "TICKET_CREATED",
  "TICKET_ASSIGNED_PUBLIC",
  "TICKET_PUBLIC_COMMENT",
  "TICKET_STATUS_CHANGED",
  "TICKET_RESOLVED",
];

const PREFERENCES_PAGE_ALLOWED_ROLES = [
  "SUPER_ADMIN",
  "ADMINISTRADORA",
  "SINDICO",
  "MORADOR",
  "PROPRIETARIO",
];



/* =========================================================
   HELPERS
   ========================================================= */

function getRoleLabel(user?: CurrentUser | null) {
  if (!user?.role) return "Usuário";

  const labels: Record<string, string> = {
    SUPER_ADMIN: "Super Admin",
    ADMINISTRADORA: "Administradora",
    SINDICO: "Síndico",
    MORADOR: "Morador",
    PROPRIETARIO: "Proprietário",
  };

  return labels[user.role] || user.role;
}



function isPortalUser(user?: CurrentUser | null) {
  return (
    user?.role === "MORADOR" ||
    user?.role === "SINDICO" ||
    user?.role === "PROPRIETARIO"
  );
}



function isPreferencesPageAllowed(user?: CurrentUser | null) {
  if (!user?.role) return false;

  return PREFERENCES_PAGE_ALLOWED_ROLES.includes(user.role);
}



function formatDateTime(value?: string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleString("pt-BR");
}



function maskPhoneForDisplay(phone?: string | null) {
  if (!phone) return "Telefone não informado";

  const onlyNumbers = String(phone).replace(/\D/g, "");

  if (onlyNumbers.length < 8) {
    return phone;
  }

  const start = onlyNumbers.slice(0, 2);
  const end = onlyNumbers.slice(-4);

  return `(${start}) •••••-${end}`;
}



function getWhatsAppAccountMessage(account?: WhatsAppAccountStatus | null) {
  if (!account?.whatsappAvailable) {
    return "Cadastre um telefone no seu usuário para habilitar notificações por WhatsApp quando o canal estiver ativo.";
  }

  if (account.whatsappPaused) {
    return "O WhatsApp está pausado para esta conta. Nenhum alerta será enviado por WhatsApp até a reativação.";
  }

  return "O WhatsApp está liberado para esta conta e seguirá as preferências configuradas por tipo de alerta.";
}



function canShowPreferenceForRole(
  user: CurrentUser | null,
  eventType: string
) {
  if (!user?.role) return false;

  if (user.role === "SUPER_ADMIN" || user.role === "ADMINISTRADORA") {
    return ADMIN_VISIBLE_EVENTS.includes(eventType);
  }

  if (user.role === "SINDICO") {
    return SINDICO_VISIBLE_EVENTS.includes(eventType);
  }

  if (user.role === "MORADOR" || user.role === "PROPRIETARIO") {
    return PORTAL_USER_VISIBLE_EVENTS.includes(eventType);
  }

  return false;
}



function getPreferenceSectionDescription(user?: CurrentUser | null) {
  if (user?.role === "SUPER_ADMIN" || user?.role === "ADMINISTRADORA") {
    return "Eventos operacionais da administradora, incluindo chamados, atribuições, comentários, alterações de status e avaliações.";
  }

  if (user?.role === "SINDICO") {
    return "Eventos relacionados ao acompanhamento dos chamados do condomínio no portal.";
  }

  if (user?.role === "MORADOR" || user?.role === "PROPRIETARIO") {
    return "Eventos relacionados ao acompanhamento dos seus próprios chamados e atualizações públicas do atendimento.";
  }

  return "Eventos disponíveis para o seu perfil de acesso.";
}



function getFriendlyEventLabel(preference: NotificationPreferenceItem) {
  const labels: Record<string, string> = {
    TICKET_CREATED: "Chamado criado",
    TICKET_ASSIGNED: "Chamado atribuído",
    TICKET_ASSIGNED_PUBLIC: "Responsável definido",
    TICKET_PUBLIC_COMMENT: "Nova resposta pública",
    TICKET_INTERNAL_COMMENT: "Comunicado interno",
    TICKET_STATUS_CHANGED: "Status alterado",
    TICKET_RESOLVED: "Chamado resolvido",
    TICKET_RATED: "Chamado avaliado",
    EMAIL_PENDING: "E-mail pendente",
    WHATSAPP_PENDING: "WhatsApp pendente",
    GENERAL: "Alerta geral",
  };

  return labels[preference.eventType] || preference.label || "Alerta";
}



function getFriendlyEventDescription(preference: NotificationPreferenceItem) {
  const descriptions: Record<string, string> = {
    TICKET_CREATED:
      "Aviso quando um novo chamado relacionado ao seu perfil de acesso for criado.",
    TICKET_ASSIGNED:
      "Aviso operacional quando um chamado for atribuído a um responsável.",
    TICKET_ASSIGNED_PUBLIC:
      "Aviso quando um responsável for definido para o chamado.",
    TICKET_PUBLIC_COMMENT:
      "Aviso quando uma nova mensagem pública for adicionada ao chamado.",
    TICKET_INTERNAL_COMMENT:
      "Aviso para comunicações internas da equipe administrativa.",
    TICKET_STATUS_CHANGED:
      "Aviso quando o status de um chamado for alterado.",
    TICKET_RESOLVED:
      "Aviso quando um chamado for finalizado como resolvido.",
    TICKET_RATED:
      "Aviso quando um atendimento for avaliado pelo morador.",
  };

  return descriptions[preference.eventType] || preference.description;
}



function channelLabel(channel: "system" | "email" | "whatsapp") {
  const labels: Record<string, string> = {
    system: "Notificação no sistema",
    email: "E-mail",
    whatsapp: "WhatsApp",
  };

  return labels[channel] || channel;
}



function channelShortLabel(channel: "system" | "email" | "whatsapp") {
  const labels: Record<string, string> = {
    system: "Sistema",
    email: "E-mail",
    whatsapp: "WhatsApp",
  };

  return labels[channel] || channel;
}



function channelDescription(
  channel: "system" | "email" | "whatsapp",
  user?: CurrentUser | null,
  activeNow?: boolean
) {
  if (channel === "system") {
    if (user?.role === "SUPER_ADMIN" || user?.role === "ADMINISTRADORA") {
      return "Receba este aviso no sino de notificações da área administrativa.";
    }

    if (user?.role === "SINDICO") {
      return "Receba este aviso no sino de notificações do portal do condomínio.";
    }

    if (user?.role === "MORADOR" || user?.role === "PROPRIETARIO") {
      return "Receba este aviso no sino de notificações do portal.";
    }

    return "Receba este aviso no sino de notificações da plataforma.";
  }

  if (channel === "email") {
    if (activeNow) {
      return "Receba este aviso também por e-mail quando houver configuração de envio ativa.";
    }

    return "Canal preparado para uma etapa futura. O envio por e-mail ainda não está ativo para este alerta.";
  }

  if (channel === "whatsapp") {
    if (activeNow) {
      return "Canal em modo de teste. Ao ativar, o sistema registra a mensagem simulada que seria enviada por WhatsApp.";
    }

    return "Canal preparado para uma etapa futura. O envio por WhatsApp ainda não está ativo para este alerta.";
  }

  return "";
}



function getPreferencesSummary(metrics: {
  total: number;
  systemEnabled: number;
  emailEnabled: number;
  whatsappEnabled: number;
}) {
  if (metrics.total === 0) {
    return "Nenhuma preferência configurável foi encontrada para este perfil de acesso.";
  }

  return `Este perfil possui ${metrics.total} alerta(s) configurável(is), com ${metrics.systemEnabled} ativo(s) no sistema, ${metrics.emailEnabled} por e-mail e ${metrics.whatsappEnabled} por WhatsApp em modo de teste.`;
}



function getRecommendedAction(metrics: {
  total: number;
  systemEnabled: number;
  emailEnabled: number;
  whatsappEnabled: number;
}) {
  if (metrics.total === 0) {
    return "Nenhuma ação necessária no momento.";
  }

  if (metrics.systemEnabled < metrics.total) {
    return "Recomendamos manter as notificações no sistema ativas para todos os alertas importantes.";
  }

  if (metrics.emailEnabled === 0) {
    return "Mantenha o e-mail ativo para alertas importantes de chamados.";
  }

  if (metrics.whatsappEnabled === 0) {
    return "O WhatsApp está preparado para teste. Ative nos alertas desejados para validar o comportamento antes da integração real.";
  }

  return "As preferências estão preparadas para esta fase do MVP, incluindo WhatsApp em modo de teste.";
}



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



function getEnabledChannelsLabel(preference: NotificationPreferenceItem) {
  const enabled = [
    preference.systemEnabled ? "Sistema" : null,
    preference.emailEnabled ? "E-mail" : null,
    preference.whatsappEnabled ? "WhatsApp teste" : null,
  ].filter(Boolean);

  return enabled.length > 0 ? enabled.join(" • ") : "Nenhum canal ativo";
}



function isChannelAvailable(
  preference: NotificationPreferenceItem,
  channel: "SYSTEM" | "EMAIL" | "WHATSAPP"
) {
  return Array.isArray(preference.availableChannels)
    ? preference.availableChannels.includes(channel)
    : false;
}



function isChannelEnabledNow(
  preference: NotificationPreferenceItem,
  channel: "SYSTEM" | "EMAIL" | "WHATSAPP"
) {
  return Array.isArray(preference.enabledChannels)
    ? preference.enabledChannels.includes(channel)
    : false;
}



function isChannelFutureOnly(
  preference: NotificationPreferenceItem,
  channel: "SYSTEM" | "EMAIL" | "WHATSAPP"
) {
  return (
    isChannelAvailable(preference, channel) &&
    !isChannelEnabledNow(preference, channel)
  );
}



/* =========================================================
   SHELL DINÂMICO
   ========================================================= */

function PreferencesPageShell({
  user,
  canSwitchProfile,
  children,
}: {
  user: CurrentUser | null;
  canSwitchProfile: boolean;
  children: React.ReactNode;
}) {
  const title = "Preferências de Notificação";
  const description =
    "Configure como deseja receber alertas e movimentações importantes dos chamados.";

  if (isPortalUser(user)) {
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
   TELA LIMPA DE BLOQUEIO

   Importante:
   - Não usa AdminShell.
   - Não usa PortalShell.
   - Evita parecer que o usuário está dentro de uma área autorizada.
   ========================================================= */

function CleanAccessDeniedScreen({
  message,
}: {
  message: string;
}) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#F7FBF8_0%,#FFFFFF_46%,#F4F8F5_100%)] px-6 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-80px)] max-w-4xl items-center justify-center">
        <section className="w-full rounded-[32px] border border-[#DDE5DF] bg-white p-8 shadow-sm md:p-10">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EAF7EE] text-[#256D3C]">
              <span className="text-xl font-bold">!</span>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#256D3C]">
                Acesso restrito
              </p>

              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#17211B] md:text-3xl">
                Preferências indisponíveis
              </h1>
            </div>
          </div>

          <p className="mt-5 text-sm leading-6 text-[#5E6B63]">
            {message}
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/contexto"
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-6 text-sm font-semibold text-white transition hover:bg-[#1F5A32]"
            >
              Selecionar perfil
            </Link>

            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-6 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C]"
            >
              Voltar ao login
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}



/* =========================================================
   CARD DO WHATSAPP DA CONTA
   ========================================================= */

function WhatsAppAccountCard({
  account,
  saving,
  onToggle,
}: {
  account: WhatsAppAccountStatus | null;
  saving: boolean;
  onToggle: () => void;
}) {
  const paused = !!account?.whatsappPaused;
  const available = !!account?.whatsappAvailable;

  return (
    <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
              Controle da Conta
            </p>

            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                paused
                  ? "border-red-200 bg-red-50 text-red-700"
                  : available
                  ? "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]"
                  : "border-[#DDE5DF] bg-[#F6F8F7] text-[#7A877F]"
              }`}
            >
              {paused ? "WhatsApp pausado" : available ? "WhatsApp ativo" : "Sem telefone"}
            </span>
          </div>

          <h2 className="mt-2 text-xl font-semibold text-[#17211B]">
            WhatsApp da conta
          </h2>

          <p className="mt-2 max-w-4xl text-sm leading-6 text-[#5E6B63]">
            {getWhatsAppAccountMessage(account)}
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
            <InfoBox
              label="Telefone"
              value={maskPhoneForDisplay(account?.phone)}
            />

            <InfoBox
              label="Status global"
              value={paused ? "Pausado" : available ? "Ativo" : "Indisponível"}
            />

            <InfoBox
              label={paused ? "Pausado em" : "Última reativação"}
              value={
                paused
                  ? formatDateTime(account?.phoneOptOutAt || null)
                  : formatDateTime(account?.phoneOptInAt || null)
              }
            />
          </div>
        </div>

        <div className="lg:w-[260px]">
          <button
            type="button"
            onClick={onToggle}
            disabled={saving || !available}
            className={
              paused
                ? "inline-flex h-12 w-full items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
                : "inline-flex h-12 w-full items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#17211B] transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            }
          >
            {saving
              ? "Atualizando..."
              : paused
              ? "Reativar WhatsApp"
              : "Pausar WhatsApp"}
          </button>

          <p className="mt-3 text-xs leading-5 text-[#7A877F]">
            Este controle bloqueia ou libera o WhatsApp para a conta inteira. As preferências por alerta continuam preservadas.
          </p>
        </div>
      </div>
    </section>
  );
}



/* =========================================================
   SWITCH
   ========================================================= */

function PreferenceSwitch({
  checked,
  disabled,
  label,
  description,
  future,
  testMode,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  description: string;
  future?: boolean;
  testMode?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={`w-full rounded-2xl border p-4 text-left transition ${
        checked
          ? "border-[#CFE6D4] bg-[#EAF7EE]"
          : "border-[#DDE5DF] bg-[#F9FBFA]"
      } ${
        disabled
          ? "cursor-not-allowed opacity-60"
          : "hover:border-[#256D3C] hover:bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-[#17211B]">{label}</p>

            {testMode && (
              <span className="rounded-full border border-[#CFE6D4] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#256D3C]">
                Teste
              </span>
            )}

            {future && (
              <span className="rounded-full border border-[#DDE5DF] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#7A877F]">
                Futuro
              </span>
            )}

            {disabled && future && !checked && (
              <span className="rounded-full border border-[#DDE5DF] bg-[#F6F8F7] px-2 py-0.5 text-[10px] font-semibold text-[#7A877F]">
                Indisponível agora
              </span>
            )}
          </div>

          <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
            {description}
          </p>
        </div>

        <span
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition ${
            checked
              ? "border-[#256D3C] bg-[#256D3C]"
              : "border-[#C7D3CC] bg-[#DDE5DF]"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-white transition ${
              checked ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </span>
      </div>
    </button>
  );
}



/* =========================================================
   PÁGINA
   ========================================================= */

export default function NotificationPreferencesPage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferenceItem[]>([]);
  const [whatsappAccount, setWhatsappAccount] =
    useState<WhatsAppAccountStatus | null>(null);

  const [accessCount, setAccessCount] = useState(0);

  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);

  const [savingKey, setSavingKey] = useState("");
  const [savingWhatsAppAccount, setSavingWhatsAppAccount] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [blockedMessage, setBlockedMessage] = useState("");

  const canSwitchProfile = accessCount > 1;



  async function loadPreferences() {
    try {
      setLoading(true);
      setError("");
      setSuccessMessage("");
      setBlockedMessage("");

      const res = await fetch("/api/notifications/preferences", {
        cache: "no-store",
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        setRedirecting(true);
        router.replace("/login");
        return;
      }

      if (res.status === 403) {
        setRedirecting(true);
        router.replace("/contexto");
        return;
      }

      if (!res.ok) {
        setBlockedMessage(
          data?.error ||
            "Não foi possível acessar as preferências de notificação para este perfil."
        );
        setCurrentUser(data?.user || null);
        setPreferences([]);
        setWhatsappAccount(data?.whatsappAccount || null);
        return;
      }

      const user = data.user || null;
      const items = Array.isArray(data.preferences) ? data.preferences : [];

      setCurrentUser(user);
      setPreferences(items);
      setWhatsappAccount(data.whatsappAccount || null);

      if (!isPreferencesPageAllowed(user)) {
        setBlockedMessage(
          "Este perfil de acesso não possui preferências de notificação configuráveis."
        );
      }
    } catch (err) {
      console.error(err);
      setError("Erro ao carregar preferências.");
      setCurrentUser(null);
      setPreferences([]);
      setWhatsappAccount(null);
    } finally {
      setLoading(false);
    }
  }



  async function loadAccessCount() {
    try {
      const res = await fetch("/api/user/accesses", {
        cache: "no-store",
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        return;
      }

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



  async function updatePreference({
    preference,
    field,
    value,
  }: {
    preference: NotificationPreferenceItem;
    field: "systemEnabled" | "emailEnabled" | "whatsappEnabled";
    value: boolean;
  }) {
    const key = `${preference.eventType}:${field}`;

    try {
      setSavingKey(key);
      setError("");
      setSuccessMessage("");

      setPreferences((current) =>
        current.map((item) =>
          item.eventType === preference.eventType
            ? {
                ...item,
                [field]: value,
              }
            : item
        )
      );

      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventType: preference.eventType,
          [field]: value,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        setRedirecting(true);
        router.replace("/login");
        return;
      }

      if (res.status === 403) {
        setRedirecting(true);
        router.replace("/contexto");
        return;
      }

      if (!res.ok) {
        setError(data?.error || "Não foi possível atualizar a preferência.");
        await loadPreferences();
        return;
      }

      setPreferences(Array.isArray(data.preferences) ? data.preferences : []);
      if (data.whatsappAccount) {
        setWhatsappAccount(data.whatsappAccount);
      }
      setSuccessMessage("Preferência atualizada com sucesso.");
    } catch (err) {
      console.error(err);
      setError("Erro ao atualizar preferência.");
      await loadPreferences();
    } finally {
      setSavingKey("");
    }
  }



  async function toggleWhatsAppAccount() {
    const paused = !!whatsappAccount?.whatsappPaused;

    const confirmAction = confirm(
      paused
        ? "Deseja reativar o WhatsApp para sua conta? As preferências por alerta continuarão sendo respeitadas."
        : "Deseja pausar o WhatsApp para sua conta? Nenhum alerta será enviado por WhatsApp até a reativação."
    );

    if (!confirmAction) return;

    try {
      setSavingWhatsAppAccount(true);
      setError("");
      setSuccessMessage("");

      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: paused ? "RESUME_WHATSAPP" : "PAUSE_WHATSAPP",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        setRedirecting(true);
        router.replace("/login");
        return;
      }

      if (res.status === 403) {
        setRedirecting(true);
        router.replace("/contexto");
        return;
      }

      if (!res.ok) {
        setError(data?.error || "Não foi possível atualizar o WhatsApp da conta.");
        await loadPreferences();
        return;
      }

      setPreferences(Array.isArray(data.preferences) ? data.preferences : []);
      setWhatsappAccount(data.whatsappAccount || null);
      setSuccessMessage(data?.message || "WhatsApp da conta atualizado com sucesso.");
    } catch (err) {
      console.error(err);
      setError("Erro ao atualizar WhatsApp da conta.");
      await loadPreferences();
    } finally {
      setSavingWhatsAppAccount(false);
    }
  }



  const visiblePreferences = useMemo(() => {
    return preferences.filter((preference) =>
      canShowPreferenceForRole(currentUser, preference.eventType)
    );
  }, [preferences, currentUser]);



  async function enableAllSystem() {
    const confirmAction = confirm(
      "Deseja ativar as notificações no sistema para todos os alertas exibidos?"
    );

    if (!confirmAction) return;

    for (const preference of visiblePreferences) {
      if (!preference.systemEnabled) {
        await updatePreference({
          preference,
          field: "systemEnabled",
          value: true,
        });
      }
    }

    await loadPreferences();
  }



  async function restoreRecommendedDefaults() {
    const confirmAction = confirm(
      "Deseja restaurar o padrão recomendado? As notificações no sistema ficarão ativas, o e-mail ficará ativo quando disponível, e o WhatsApp ficará ativo em modo de teste quando estiver habilitado para o alerta."
    );

    if (!confirmAction) return;

    for (const preference of visiblePreferences) {
      if (!preference.systemEnabled) {
        await updatePreference({
          preference,
          field: "systemEnabled",
          value: true,
        });
      }

      const emailRecommended = isChannelEnabledNow(preference, "EMAIL");

      if (preference.emailEnabled !== emailRecommended) {
        await updatePreference({
          preference,
          field: "emailEnabled",
          value: emailRecommended,
        });
      }

      const whatsappRecommended = isChannelEnabledNow(preference, "WHATSAPP");

      if (preference.whatsappEnabled !== whatsappRecommended) {
        await updatePreference({
          preference,
          field: "whatsappEnabled",
          value: whatsappRecommended,
        });
      }
    }

    await loadPreferences();
  }



  useEffect(() => {
    loadPreferences();
    loadAccessCount();
  }, []);



  const metrics = useMemo(() => {
    const total = visiblePreferences.length;

    const systemEnabled = visiblePreferences.filter(
      (preference) => preference.systemEnabled
    ).length;

    const emailEnabled = visiblePreferences.filter(
      (preference) => preference.emailEnabled
    ).length;

    const whatsappEnabled = visiblePreferences.filter(
      (preference) => preference.whatsappEnabled
    ).length;

    return {
      total,
      systemEnabled,
      emailEnabled,
      whatsappEnabled,
    };
  }, [visiblePreferences]);



  const summaryText = getPreferencesSummary(metrics);
  const recommendedAction = getRecommendedAction(metrics);

  const shouldBlockWithoutShell =
    !!blockedMessage ||
    (!loading &&
      currentUser !== null &&
      isPreferencesPageAllowed(currentUser) &&
      visiblePreferences.length === 0);



  if (loading || redirecting) {
    return (
      <EloGestLoadingScreen
        title={redirecting ? "Redirecionando..." : "Carregando preferências..."}
        description={
          redirecting
            ? "Aguarde enquanto encaminhamos você para a área correta."
            : "Aguarde enquanto identificamos seu perfil de acesso e carregamos suas preferências de notificação."
        }
      />
    );
  }



  if (shouldBlockWithoutShell) {
    return (
      <CleanAccessDeniedScreen
        message={
          blockedMessage ||
          "Não há preferências configuráveis para o perfil ativo. Verifique o perfil selecionado antes de continuar."
        }
      />
    );
  }



  return (
    <PreferencesPageShell user={currentUser} canSwitchProfile={canSwitchProfile}>
      <div className="space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#256D3C]">
              Notificações
            </p>

            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#17211B] md:text-4xl">
              Preferências de Notificação
            </h1>

            <p className="mt-2 max-w-4xl text-sm leading-6 text-[#5E6B63]">
              Configure como deseja receber alertas e movimentações importantes dos chamados.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/notificacoes"
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#256D3C] px-6 text-sm font-semibold text-white transition hover:bg-[#1F5A32]"
            >
              Central de notificações
            </Link>

            <button
              type="button"
              onClick={loadPreferences}
              disabled={!!savingKey}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-6 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:opacity-50"
            >
              Atualizar
            </button>
          </div>
        </header>



        <section className="overflow-hidden rounded-[32px] border border-[#DDE5DF] bg-white shadow-sm">
          <div className="border-b border-[#DDE5DF] bg-[linear-gradient(135deg,#FFFFFF_0%,#F8FAF9_62%,#EAF7EE_135%)] p-6">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-[#17211B] md:text-3xl">
                  Preferências do Perfil
                </h2>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5E6B63]">
                  {summaryText}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full border border-[#CFE6D4] bg-white px-3 py-1 text-xs font-semibold text-[#256D3C]">
                    Perfil: {getRoleLabel(currentUser)}
                  </span>

                  <span className="rounded-full border border-[#DDE5DF] bg-white px-3 py-1 text-xs font-semibold text-[#5E6B63]">
                    Sistema: {metrics.systemEnabled}/{metrics.total}
                  </span>

                  {metrics.whatsappEnabled > 0 && (
                    <span className="rounded-full border border-[#CFE6D4] bg-white px-3 py-1 text-xs font-semibold text-[#256D3C]">
                      WhatsApp em teste
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 xl:min-w-[520px] xl:grid-cols-4">
                <MetricCard title="Alertas" value={metrics.total} />
                <MetricCard title="Sistema" value={metrics.systemEnabled} tone="green" />
                <MetricCard title="E-mail" value={metrics.emailEnabled} />
                <MetricCard title="WhatsApp" value={metrics.whatsappEnabled} />
              </div>
            </div>
          </div>

          <div className="grid gap-0 divide-y divide-[#DDE5DF] md:grid-cols-2 md:divide-x md:divide-y-0">
            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                Orientação Recomendada
              </p>

              <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                {recommendedAction}
              </p>
            </div>

            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                Canais Externos
              </p>

              <p className="mt-2 text-sm leading-6 text-[#5E6B63]">
                Nesta fase, notificações no sistema e e-mail seguem ativas. O WhatsApp pode ser testado em modo simulado antes da integração real.
              </p>
            </div>
          </div>
        </section>



        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] p-4 text-sm font-semibold text-[#256D3C]">
            {successMessage}
          </div>
        )}



        <WhatsAppAccountCard
          account={whatsappAccount}
          saving={savingWhatsAppAccount}
          onToggle={toggleWhatsAppAccount}
        />



        <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-[#17211B]">
                Ações Rápidas
              </h2>

              <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
                Aplique ajustes gerais somente aos alertas exibidos para o perfil atual.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:min-w-[520px]">
              <button
                type="button"
                onClick={enableAllSystem}
                disabled={!!savingKey || visiblePreferences.length === 0}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 text-sm font-semibold text-white transition hover:bg-[#1F5A32] disabled:bg-[#9AA7A0]"
              >
                Ativar avisos no sistema
              </button>

              <button
                type="button"
                onClick={restoreRecommendedDefaults}
                disabled={!!savingKey || visiblePreferences.length === 0}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 text-sm font-semibold text-[#17211B] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:opacity-50"
              >
                Restaurar padrão
              </button>
            </div>
          </div>
        </section>



        <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-sm">
          <div className="mb-5">
            <h2 className="text-xl font-semibold text-[#17211B]">
              Alertas Configuráveis
            </h2>

            <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
              {getPreferenceSectionDescription(currentUser)}
            </p>
          </div>

          <div className="space-y-3">
            {visiblePreferences.map((preference) => {
              const systemKey = `${preference.eventType}:systemEnabled`;
              const emailKey = `${preference.eventType}:emailEnabled`;
              const whatsappKey = `${preference.eventType}:whatsappEnabled`;

              const emailActiveNow = isChannelEnabledNow(preference, "EMAIL");
              const whatsappActiveNow = isChannelEnabledNow(preference, "WHATSAPP");

              const emailDisabled =
                savingKey === emailKey || !emailActiveNow;
              const whatsappDisabled =
                savingKey === whatsappKey || !whatsappActiveNow;

              const emailFuture =
                isChannelFutureOnly(preference, "EMAIL") || !emailActiveNow;
              const whatsappFuture =
                isChannelFutureOnly(preference, "WHATSAPP") || !whatsappActiveNow;

              const whatsappTest = whatsappActiveNow && !whatsappFuture;

              return (
                <details
                  key={preference.eventType}
                  className="group rounded-[24px] border border-[#DDE5DF] bg-white shadow-sm transition hover:border-[#256D3C]/30"
                >
                  <summary className="flex cursor-pointer list-none flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="break-words text-lg font-semibold text-[#17211B]">
                          {getFriendlyEventLabel(preference)}
                        </h3>

                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                            preference.systemEnabled
                              ? "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]"
                              : "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]"
                          }`}
                        >
                          Sistema {preference.systemEnabled ? "ativo" : "inativo"}
                        </span>

                        {isChannelEnabledNow(preference, "EMAIL") ? (
                          <span className="rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-1 text-xs font-semibold text-[#256D3C]">
                            E-mail disponível
                          </span>
                        ) : preference.externalReady ? (
                          <span className="rounded-full border border-[#DDE5DF] bg-[#F6F8F7] px-3 py-1 text-xs font-semibold text-[#7A877F]">
                            Canal futuro
                          </span>
                        ) : null}

                        {whatsappActiveNow && (
                          <span className="rounded-full border border-[#CFE6D4] bg-white px-3 py-1 text-xs font-semibold text-[#256D3C]">
                            WhatsApp teste
                          </span>
                        )}
                      </div>

                      <p className="mt-1 line-clamp-1 text-sm leading-6 text-[#5E6B63]">
                        {getFriendlyEventDescription(preference)}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center justify-between gap-3 md:min-w-[260px] md:justify-end">
                      <div className="text-left md:text-right">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
                          Canais
                        </p>

                        <p className="mt-1 text-sm font-semibold text-[#17211B]">
                          {getEnabledChannelsLabel(preference)}
                        </p>
                      </div>

                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63] transition group-open:rotate-180">
                        ▾
                      </span>
                    </div>
                  </summary>

                  <div className="border-t border-[#DDE5DF] p-5">
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                      <PreferenceSwitch
                        checked={preference.systemEnabled}
                        disabled={savingKey === systemKey}
                        label={channelLabel("system")}
                        description={channelDescription("system", currentUser)}
                        onChange={() =>
                          updatePreference({
                            preference,
                            field: "systemEnabled",
                            value: !preference.systemEnabled,
                          })
                        }
                      />

                      <PreferenceSwitch
                        checked={preference.emailEnabled}
                        disabled={emailDisabled}
                        label={channelLabel("email")}
                        description={channelDescription(
                          "email",
                          currentUser,
                          emailActiveNow
                        )}
                        future={emailFuture}
                        onChange={() =>
                          updatePreference({
                            preference,
                            field: "emailEnabled",
                            value: !preference.emailEnabled,
                          })
                        }
                      />

                      <PreferenceSwitch
                        checked={preference.whatsappEnabled}
                        disabled={whatsappDisabled}
                        label={channelLabel("whatsapp")}
                        description={channelDescription(
                          "whatsapp",
                          currentUser,
                          whatsappActiveNow
                        )}
                        future={whatsappFuture}
                        testMode={whatsappTest}
                        onChange={() =>
                          updatePreference({
                            preference,
                            field: "whatsappEnabled",
                            value: !preference.whatsappEnabled,
                          })
                        }
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
                      <InfoBox
                        label="Tipo de alerta"
                        value={getFriendlyEventLabel(preference)}
                      />

                      <InfoBox
                        label="Atualizado em"
                        value={formatDateTime(preference.updatedAt)}
                      />

                      <InfoBox
                        label="Canais ativos"
                        value={[
                          preference.systemEnabled ? channelShortLabel("system") : null,
                          preference.emailEnabled ? channelShortLabel("email") : null,
                          preference.whatsappEnabled ? "WhatsApp teste" : null,
                        ]
                          .filter(Boolean)
                          .join(" • ") || "Nenhum"}
                      />
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      </div>

      <style jsx global>{`
        details > summary::-webkit-details-marker {
          display: none;
        }
      `}</style>
    </PreferencesPageShell>
  );
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
  tone?: "default" | "green";
}) {
  const toneClass =
    tone === "green"
      ? "border-[#CFE6D4] bg-white text-[#256D3C]"
      : "border-[#DDE5DF] bg-white text-[#17211B]";

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${toneClass}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
        {title}
      </p>

      <strong className="mt-2 block text-3xl font-semibold tracking-tight">
        {value}
      </strong>
    </div>
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
    <div className="rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
        {label}
      </p>

      <p className="mt-1 break-words text-sm font-semibold text-[#17211B]">
        {value}
      </p>
    </div>
  );
}