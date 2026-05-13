"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AdminShell from "@/components/AdminShell";
import PortalShell from "@/components/PortalShell";
import EloGestLoadingScreen from "@/components/EloGestLoadingScreen";



/* =========================================================
   PREFERÊNCIAS DE NOTIFICAÇÃO - ELOGEST

   Revisão premium compacta:
   - Título fora do card principal.
   - Card superior mais limpo.
   - Lista de eventos em linha compacta.
   - Canais e detalhes ficam em “Mais informações”.
   - Menos cores fortes.
   - Mantida toda a lógica funcional existente.

   ETAPA 42.3.4 — E-MAIL ATIVO PARA EVENTOS DE CHAMADOS

   Ajustes desta revisão:
   - O canal E-mail deixa de ser tratado como "Futuro" quando
     estiver presente em enabledChannels.
   - O switch de E-mail passa a poder ser ligado/desligado quando
     o canal estiver ativo para o evento.
   - WhatsApp continua como futuro/indisponível até a integração.
   - Textos de resumo e orientação deixam de dizer que E-mail ainda
     não envia mensagens reais.
   - O botão "Restaurar padrão" passa a manter E-mail ativo quando
     ele estiver habilitado na matriz do evento.
   ========================================================= */



interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: string;
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



function isAdminUser(user?: CurrentUser | null) {
  return user?.role === "SUPER_ADMIN" || user?.role === "ADMINISTRADORA";
}



function isPortalUser(user?: CurrentUser | null) {
  return (
    user?.role === "MORADOR" ||
    user?.role === "SINDICO" ||
    user?.role === "PROPRIETARIO"
  );
}



function formatDateTime(value?: string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleString("pt-BR");
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
    TICKET_INTERNAL_COMMENT: "Comentário interno",
    TICKET_STATUS_CHANGED: "Status alterado",
    TICKET_RESOLVED: "Chamado resolvido",
    TICKET_RATED: "Chamado avaliado",
  };

  return labels[preference.eventType] || preference.label;
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

    return "Canal preparado para uma etapa futura. O envio por e-mail ainda não está ativo para este evento.";
  }

  if (channel === "whatsapp") {
    if (activeNow) {
      return "Receba este aviso também por WhatsApp quando a integração estiver configurada.";
    }

    return "Canal preparado para uma etapa futura. O envio por WhatsApp ainda não está ativo.";
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

  return `Este perfil possui ${metrics.total} evento(s) configurável(is), com ${metrics.systemEnabled} ativo(s) no sistema e ${metrics.emailEnabled} ativo(s) por e-mail.`;
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
    return "Recomendamos manter as notificações no sistema ativas para todos os eventos importantes.";
  }

  if (metrics.emailEnabled === 0) {
    return "Quando disponível, mantenha o e-mail ativo para eventos importantes de chamados.";
  }

  if (metrics.whatsappEnabled > 0) {
    return "WhatsApp ainda depende da integração própria. Mantenha esse canal desligado até a ativação oficial.";
  }

  return "As preferências estão no padrão recomendado para esta fase do MVP.";
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
    preference.whatsappEnabled ? "WhatsApp" : null,
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
  return isChannelAvailable(preference, channel) && !isChannelEnabledNow(preference, channel);
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
   SWITCH
   ========================================================= */

function PreferenceSwitch({
  checked,
  disabled,
  label,
  description,
  future,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  description: string;
  future?: boolean;
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
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferenceItem[]>([]);

  const [accessCount, setAccessCount] = useState(0);

  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const canSwitchProfile = accessCount > 1;



  async function loadPreferences() {
    try {
      setLoading(true);
      setError("");
      setSuccessMessage("");

      const res = await fetch("/api/notifications/preferences", {
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Não foi possível carregar as preferências.");
        setCurrentUser(null);
        setPreferences([]);
        return;
      }

      setCurrentUser(data.user || null);
      setPreferences(Array.isArray(data.preferences) ? data.preferences : []);
    } catch (err) {
      console.error(err);
      setError("Erro ao carregar preferências.");
      setCurrentUser(null);
      setPreferences([]);
    } finally {
      setLoading(false);
    }
  }



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

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Não foi possível atualizar a preferência.");
        await loadPreferences();
        return;
      }

      setPreferences(Array.isArray(data.preferences) ? data.preferences : []);
      setSuccessMessage("Preferência atualizada com sucesso.");
    } catch (err) {
      console.error(err);
      setError("Erro ao atualizar preferência.");
      await loadPreferences();
    } finally {
      setSavingKey("");
    }
  }



  const visiblePreferences = useMemo(() => {
    return preferences.filter((preference) =>
      canShowPreferenceForRole(currentUser, preference.eventType)
    );
  }, [preferences, currentUser]);



  async function enableAllSystem() {
    const confirmAction = confirm(
      "Deseja ativar as notificações no sistema para todos os eventos exibidos?"
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
      "Deseja restaurar o padrão recomendado? As notificações no sistema ficarão ativas, o e-mail ficará ativo quando disponível para o evento, e WhatsApp ficará desativado."
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

      if (preference.whatsappEnabled) {
        await updatePreference({
          preference,
          field: "whatsappEnabled",
          value: false,
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



  if (loading) {
    return (
      <EloGestLoadingScreen
        title="Carregando preferências..."
        description="Aguarde enquanto identificamos seu perfil de acesso e carregamos suas preferências de notificação."
      />
    );
  }



  return (
    <PreferencesPageShell user={currentUser} canSwitchProfile={canSwitchProfile}>
      <div className="space-y-6">
        {/* =====================================================
            TÍTULO DA PÁGINA
            ===================================================== */}

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



        {/* =====================================================
            VISÃO DAS PREFERÊNCIAS
            ===================================================== */}

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

                  {(metrics.emailEnabled > 0 || metrics.whatsappEnabled > 0) && (
                    <span className="rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-700">
                      Canais futuros ligados
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 xl:min-w-[520px] xl:grid-cols-4">
                <MetricCard title="Eventos" value={metrics.total} />
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
                Nesta fase, notificações no sistema e e-mail podem ser usados para eventos importantes. WhatsApp permanece preparado para ativação futura.
              </p>
            </div>
          </div>
        </section>



        {/* =====================================================
            ALERTAS
            ===================================================== */}

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



        {/* =====================================================
            AÇÕES RÁPIDAS
            ===================================================== */}

        <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-[#17211B]">
                Ações Rápidas
              </h2>

              <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
                Aplique ajustes gerais somente aos eventos exibidos para o perfil atual.
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



        {/* =====================================================
            LISTA COMPACTA DE PREFERÊNCIAS
            ===================================================== */}

        <section className="rounded-[28px] border border-[#DDE5DF] bg-white p-5 shadow-sm">
          <div className="mb-5">
            <h2 className="text-xl font-semibold text-[#17211B]">
              Eventos Configuráveis
            </h2>

            <p className="mt-1 text-sm leading-6 text-[#5E6B63]">
              {getPreferenceSectionDescription(currentUser)}
            </p>
          </div>

          {visiblePreferences.length === 0 ? (
            <div className="rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-6 text-sm leading-6 text-[#5E6B63]">
              Nenhuma preferência disponível para este perfil de acesso. Verifique se o perfil ativo está correto ou fale com a administradora.
            </div>
          ) : (
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
                              Externo futuro
                            </span>
                          ) : null}
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
                          label="Evento"
                          value={preference.eventType}
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
                            preference.whatsappEnabled ? channelShortLabel("whatsapp") : null,
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
          )}
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
