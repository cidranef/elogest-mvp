"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/* =========================================================
   ACTIVE ACCESS BADGE - ELOGEST

   ETAPA 39.16 — BADGE COMPACTO DE PERFIL ATIVO

   Atualização:
   - Badge deixa de ocupar muito espaço na topbar.
   - Remove texto fixo "Perfil ativo" da área principal.
   - Exibe ícone pequeno + perfil + label truncada.
   - "Trocar perfil" passa a ficar dentro do dropdown.
   - Mantém rota técnica /contexto.
   - Mantém leitura defensiva da quantidade de perfis.
   - Evita sobrepor elementos da topbar em telas menores.

   Visual:
   [ ícone ] Síndico • Condomínio X [v]

   Dropdown:
   - Perfil ativo
   - Contexto/label
   - Trocar perfil, apenas se houver mais de um perfil

   ETAPA 43.1 — REFINAMENTO VISUAL DO CONTEXTO ATIVO

   Ajustes desta revisão:
   - Badge passa a exibir papel + contexto de forma mais clara.
   - No modo compacto, a topbar também mostra a identificação
     principal do condomínio/carteira/unidade quando houver label.
   - Dropdown remove a frase "Você está acessando como" para evitar
     excesso de texto.
   - O campo explicativo passa a comunicar diretamente o contexto:
     "Você está acessando o condomínio/carteira/unidade...".
   - Incluídos campos formais de vínculo no tipo ActiveAccess.
   ========================================================= */

interface PlanLimitValue {
  currentUsage: number;
  limit: number | null;
  remaining: number | null;
  reached: boolean;
}

interface AdminPlanLimitResponse {
  error?: string;
  plan?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  nextPlan?: {
    id: string;
    name: string;
    slug: string;
    maxProviders?: number | null;
  } | null;
  limits?: {
    providers?: PlanLimitValue;
  };
}

interface ActiveAccess {
  accessId?: string | null;
  role?: string | null;
  label?: string | null;
  administratorId?: string | null;
  condominiumId?: string | null;
  unitId?: string | null;
  residentId?: string | null;
  unitPersonLinkId?: string | null;
  linkType?: string | null;
  canVote?: boolean | null;
  canOpenTickets?: boolean | null;
  receivesNotifications?: boolean | null;
  source?: string | null;
}

function roleLabel(role?: string | null) {
  if (role === "SUPER_ADMIN") return "Super Admin";
  if (role === "ADMINISTRADORA") return "Administradora";
  if (role === "SINDICO") return "Síndico";
  if (role === "MORADOR") return "Morador";
  if (role === "PROPRIETARIO") return "Proprietário";
  if (role === "CONSELHEIRO") return "Conselheiro";

  return "Usuário";
}

function roleTone(role?: string | null) {
  if (role === "SUPER_ADMIN") {
    return {
      icon: "border-red-100 bg-red-50 text-red-700",
      badge: "border-red-200 bg-red-50 text-red-700",
    };
  }

  if (role === "ADMINISTRADORA") {
    return {
      icon: "border-blue-100 bg-blue-50 text-blue-700",
      badge: "border-blue-200 bg-blue-50 text-blue-700",
    };
  }

  if (role === "SINDICO") {
    return {
      icon: "border-purple-100 bg-purple-50 text-purple-700",
      badge: "border-purple-200 bg-purple-50 text-purple-700",
    };
  }

  if (role === "MORADOR") {
    return {
      icon: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
      badge: "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
    };
  }

  if (role === "PROPRIETARIO") {
    return {
      icon: "border-emerald-100 bg-emerald-50 text-emerald-700",
      badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  if (role === "CONSELHEIRO") {
    return {
      icon: "border-yellow-100 bg-yellow-50 text-yellow-700",
      badge: "border-yellow-200 bg-yellow-50 text-yellow-700",
    };
  }

  return {
    icon: "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]",
    badge: "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]",
  };
}

function formatLimitValue(value?: number | null) {
  if (value === null || value === undefined) {
    return "Ilimitado";
  }

  return new Intl.NumberFormat("pt-BR").format(value);
}

function getProviderLimit(planLimitData: AdminPlanLimitResponse | null) {
  return planLimitData?.limits?.providers || null;
}

function getPlanTone(slug?: string | null) {
  if (slug === "premium") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (slug === "enterprise") {
    return "border-slate-300 bg-slate-50 text-slate-800";
  }

  if (slug === "professional") {
    return "border-blue-200 bg-blue-50 text-blue-800";
  }

  if (slug === "essential") {
    return "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]";
  }

  return "border-[#DDE5DF] bg-[#F6F8F7] text-[#5E6B63]";
}

function getPlanIconType(slug?: string | null) {
  if (slug === "premium") return "star";
  if (slug === "enterprise") return "network";
  if (slug === "professional") return "chart";
  if (slug === "essential") return "building";

  return "leaf";
}

function normalizeContextLabel(value?: string | null) {
  const text = String(value || "").trim();

  if (!text) {
    return "Perfil de acesso ativo";
  }

  return text;
}

function removeRolePrefixFromLabel({
  role,
  label,
}: {
  role?: string | null;
  label?: string | null;
}) {
  let text = normalizeContextLabel(label);

  const rolePrefixes: Record<string, string[]> = {
    SUPER_ADMIN: ["SUPER_ADMIN", "SUPER ADMIN", "Super Admin"],
    ADMINISTRADORA: ["ADMINISTRADORA", "Administradora"],
    SINDICO: ["SINDICO", "SÍNDICO", "Sindico", "Síndico"],
    MORADOR: ["MORADOR", "Morador"],
    PROPRIETARIO: [
      "PROPRIETARIO",
      "PROPRIETÁRIO",
      "Proprietario",
      "Proprietário",
    ],
    CONSELHEIRO: ["CONSELHEIRO", "Conselheiro"],
  };

  const prefixes = role ? rolePrefixes[role] || [] : [];

  prefixes.forEach((prefix) => {
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`^${escapedPrefix}\\s*[-–—•:]\\s*`, "i");

    text = text.replace(regex, "").trim();
  });

  return text || normalizeContextLabel(label);
}

function getAccessSummary(role?: string | null, label?: string | null) {
  const roleText = roleLabel(role);
  const contextText = removeRolePrefixFromLabel({ role, label });

  if (!label) {
    return roleText;
  }

  return `${roleText} · ${contextText}`;
}

function getAccessExplanation({
  role,
  label,
}: {
  role?: string | null;
  label?: string | null;
}) {
  const contextText = removeRolePrefixFromLabel({ role, label });

  if (role === "SUPER_ADMIN") {
    return "Você está acessando o ambiente interno da plataforma EloGest.";
  }

  if (role === "ADMINISTRADORA") {
    return `Você está acessando a carteira ${contextText}.`;
  }

  if (role === "SINDICO") {
    return `Você está acessando o condomínio ${contextText}.`;
  }

  if (role === "MORADOR") {
    return `Você está acessando a unidade ${contextText}.`;
  }

  if (role === "PROPRIETARIO") {
    return `Você está acessando a unidade ${contextText}.`;
  }

  if (role === "CONSELHEIRO") {
    return `Você está acompanhando o condomínio ${contextText}.`;
  }

  return `Você está acessando ${contextText}.`;
}

/* =========================================================
   EXTRAIR QUANTIDADE DE PERFIS DISPONÍVEIS
   ========================================================= */

function isActiveAccessItem(item: unknown) {
  if (typeof item !== "object" || item === null) {
    return false;
  }

  return (item as { isActive?: boolean | null }).isActive !== false;
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

  if (Array.isArray(value?.accesses)) {
    return value.accesses.filter(isActiveAccessItem).length;
  }

  if (Array.isArray(value?.user?.accesses)) {
    return value.user.accesses.filter(isActiveAccessItem).length;
  }

  if (Array.isArray(value?.availableAccesses)) {
    return value.availableAccesses.filter(isActiveAccessItem).length;
  }

  if (Array.isArray(value?.items)) {
    return value.items.filter(isActiveAccessItem).length;
  }

  return 0;
}

/* =========================================================
   ÍCONE
   ========================================================= */

function ProfileIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className || "h-4 w-4"}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 3.5 18 6v5.2c0 3.8-2.4 7.3-6 8.6-3.6-1.3-6-4.8-6-8.6V6l6-2.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="m9.5 12 1.6 1.6 3.7-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className || "h-4 w-4"}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m7 10 5 5 5-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlanIcon({
  type,
  className = "",
}: {
  type: "leaf" | "building" | "chart" | "star" | "network";
  className?: string;
}) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg
      viewBox="0 0 24 24"
      className={className || "h-4 w-4"}
      fill="none"
      aria-hidden="true"
    >
      {type === "leaf" && (
        <>
          <path {...common} d="M12 20V10" />
          <path
            {...common}
            d="M12 10c-3.8-3.4-7.2-3.4-9.2-1.8 1 4.2 4.6 6.5 9.2 5.4"
          />
          <path
            {...common}
            d="M12 10c3.8-3.4 7.2-3.4 9.2-1.8-1 4.2-4.6 6.5-9.2 5.4"
          />
          <path
            {...common}
            d="M5.5 18.5c2.1 1 4.2 1.5 6.5 1.5s4.4-.5 6.5-1.5"
          />
          <path {...common} d="M8 10.7c1.2.1 2.5.7 4 1.8" />
          <path {...common} d="M16 10.7c-1.2.1-2.5.7-4 1.8" />
        </>
      )}

      {type === "building" && (
        <>
          <path {...common} d="M4 20h16" />
          <path {...common} d="M6 20V7.2c0-.7.5-1.2 1.2-1.2h7.1V20" />
          <path {...common} d="M14.3 11h3.5c.7 0 1.2.5 1.2 1.2V20" />
          <path {...common} d="M8.8 9h2" />
          <path {...common} d="M8.8 12.5h2" />
          <path {...common} d="M8.8 16h2" />
          <path {...common} d="M15.8 14h1.1" />
          <path {...common} d="M15.8 17h1.1" />
          <path {...common} d="M8.5 6V4.5h5V6" />
          <path {...common} d="M10 20v-2.8h3.2V20" />
        </>
      )}

      {type === "chart" && (
        <>
          <path {...common} d="M4 19V5" />
          <path {...common} d="M4 19h16" />
          <path {...common} d="M7 19v-4" />
          <path {...common} d="M11 19v-7" />
          <path {...common} d="M15 19v-10" />
          <path {...common} d="M19 19V7" />
          <path {...common} d="M7 13.5l3.5-3 3 2 5.5-6.5" />
          <path {...common} d="M16.5 6h2.5v2.5" />
        </>
      )}

      {type === "star" && (
        <>
          <path
            {...common}
            d="m12 3.2 2.5 5.1 5.6.8-4.1 4 1 5.6-5-2.6-5 2.6 1-5.6-4.1-4 5.6-.8L12 3.2Z"
          />
          <path {...common} d="M12 6.8v7.5" />
          <path {...common} d="M8.8 18.1c2.1.8 4.3.8 6.4 0" />
          <path {...common} d="M4.5 5.5h.1" />
          <path {...common} d="M19.4 5.5h.1" />
          <path {...common} d="M5.8 20.2h.1" />
          <path {...common} d="M18.1 20.2h.1" />
        </>
      )}

      {type === "network" && (
        <>
          <circle {...common} cx="12" cy="12" r="2.4" />
          <circle {...common} cx="5" cy="12" r="2" />
          <circle {...common} cx="19" cy="7" r="2" />
          <circle {...common} cx="19" cy="17" r="2" />
          <circle {...common} cx="8" cy="5" r="1.6" />
          <circle {...common} cx="8" cy="19" r="1.6" />
          <path {...common} d="M7 12h2.6" />
          <path {...common} d="M13.9 10.7 17.2 8.2" />
          <path {...common} d="M13.9 13.3 17.2 15.8" />
          <path {...common} d="M9.1 6.2 11 9.8" />
          <path {...common} d="M9.1 17.8 11 14.2" />
          <path {...common} d="M8.5 5c2.6-1.1 5.6-.9 8 .6" />
          <path {...common} d="M8.5 19c2.6 1.1 5.6.9 8-.6" />
        </>
      )}
    </svg>
  );
}

function PlanBadge({
  planLimitData,
  compact = false,
}: {
  planLimitData: AdminPlanLimitResponse | null;
  compact?: boolean;
}) {
  if (!planLimitData?.plan) {
    return null;
  }

  const providerLimit = getProviderLimit(planLimitData);
  const planSlug = planLimitData.plan.slug;
  const planName = planLimitData.plan.name;
  const planTone = getPlanTone(planSlug);
  const planIcon = getPlanIconType(planSlug);
  const reached = Boolean(providerLimit?.reached);

  return (
    <span
      className={[
        "inline-flex min-w-0 items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        reached ? "border-yellow-200 bg-yellow-50 text-yellow-800" : planTone,
      ].join(" ")}
      title={`Plano ${planName}`}
    >
      <PlanIcon type={planIcon} className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">
        {compact ? planName : `Plano ${planName}`}
      </span>
    </span>
  );
}

/* =========================================================
   COMPONENTE
   ========================================================= */

export default function ActiveAccessBadge({
  compact = false,
}: {
  compact?: boolean;
}) {
  const [activeAccess, setActiveAccess] = useState<ActiveAccess | null>(null);
  const [planLimitData, setPlanLimitData] =
    useState<AdminPlanLimitResponse | null>(null);
  const [accessCount, setAccessCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const wrapperRef = useRef<HTMLDivElement | null>(null);

  /* =========================================================
     CARREGAR PERFIL ATIVO + QUANTIDADE DE PERFIS
     ========================================================= */

  async function loadActiveAccess() {
    try {
      setLoading(true);

      const [activeAccessResult, accessesResult] = await Promise.allSettled([
        fetch("/api/user/active-access", {
          cache: "no-store",
        }),
        fetch("/api/user/accesses", {
          cache: "no-store",
        }),
      ]);

      if (activeAccessResult.status === "fulfilled") {
        const activeAccessResponse = activeAccessResult.value;
        const activeAccessData = await activeAccessResponse.json();

        if (activeAccessResponse.ok) {
          const nextActiveAccess = activeAccessData?.activeAccess || null;

          setActiveAccess(nextActiveAccess);

          if (nextActiveAccess?.role === "ADMINISTRADORA") {
            const limitsResponse = await fetch("/api/admin/limites", {
              cache: "no-store",
            });

            if (limitsResponse.ok) {
              const limitsData =
                (await limitsResponse.json()) as AdminPlanLimitResponse;

              setPlanLimitData(limitsData);
            } else {
              setPlanLimitData(null);
            }
          } else {
            setPlanLimitData(null);
          }
        } else {
          setActiveAccess(null);
          setPlanLimitData(null);
        }
      } else {
        setActiveAccess(null);
      }

      if (accessesResult.status === "fulfilled") {
        const accessesResponse = accessesResult.value;
        const accessesData = await accessesResponse.json();

        if (accessesResponse.ok) {
          setAccessCount(extractAccessCount(accessesData));
        } else {
          setAccessCount(0);
        }
      } else {
        setAccessCount(0);
      }
    } catch (err) {
      console.error(err);
      setActiveAccess(null);
      setPlanLimitData(null);
      setAccessCount(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadActiveAccess();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!wrapperRef.current) return;

      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  const canSwitchProfile = accessCount > 1;
  const tone = roleTone(activeAccess?.role);
  const currentRoleLabel = roleLabel(activeAccess?.role);
  const contextLabel = removeRolePrefixFromLabel({
    role: activeAccess?.role,
    label: activeAccess?.label,
  });
  const accessSummary = getAccessSummary(
    activeAccess?.role,
    activeAccess?.label,
  );
  const accessExplanation = getAccessExplanation({
    role: activeAccess?.role,
    label: activeAccess?.label,
  });
  const providerLimit = getProviderLimit(planLimitData);
  const hasPlanInfo =
    activeAccess?.role === "ADMINISTRADORA" && Boolean(planLimitData?.plan);
  const shouldHighlightUpgrade = Boolean(
    providerLimit?.reached && planLimitData?.nextPlan,
  );

  if (loading) {
    return (
      <div className="inline-flex h-12 max-w-[280px] items-center gap-3 rounded-2xl border border-[#DDE5DF] bg-white px-3 text-sm text-[#7A877F] shadow-sm">
        <span className="h-8 w-8 animate-pulse rounded-xl bg-[#EAF7EE]" />
        <span className="hidden animate-pulse sm:inline">
          Carregando perfil...
        </span>
      </div>
    );
  }

  if (!activeAccess) {
    return (
      <div className="inline-flex h-12 max-w-[320px] items-center gap-3 rounded-2xl border border-yellow-200 bg-yellow-50 px-3 text-sm text-yellow-800 shadow-sm">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-yellow-200 bg-white">
          <ProfileIcon className="h-4 w-4" />
        </span>

        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">Nenhum perfil ativo</p>

          <Link
            href="/contexto"
            className="text-xs font-semibold underline hover:text-yellow-900"
          >
            Selecionar perfil
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={[
          "inline-flex h-12 items-center gap-3 rounded-2xl border border-[#DDE5DF] bg-white px-3 shadow-sm transition",
          "hover:border-[#256D3C] hover:shadow-md focus:outline-none focus:ring-4 focus:ring-[#256D3C]/10",
          compact ? "max-w-[320px]" : "max-w-[420px]",
        ].join(" ")}
        title={
          hasPlanInfo
            ? `${accessSummary} · Plano ${planLimitData?.plan?.name}`
            : accessSummary
        }
      >
        <span
          className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${tone.icon}`}
        >
          <ProfileIcon className="h-4 w-4" />

          {hasPlanInfo && (
            <span
              className={[
                "absolute -bottom-1 -right-1 flex h-[18px] w-[18px] items-center justify-center rounded-full border bg-white shadow-sm",
                providerLimit?.reached
                  ? "border-yellow-200 text-yellow-800"
                  : getPlanTone(planLimitData?.plan?.slug),
              ].join(" ")}
            >
              <PlanIcon
                type={getPlanIconType(planLimitData?.plan?.slug)}
                className="h-2.5 w-2.5"
              />
            </span>
          )}
        </span>

        <span className="min-w-0 text-left">
          <span className="block truncate text-sm font-semibold leading-5 text-[#17211B]">
            {currentRoleLabel}
          </span>

          {activeAccess.label && (
            <span className="block max-w-[190px] truncate text-[11px] font-medium leading-4 text-[#5E6B63]">
              {contextLabel}
              {hasPlanInfo ? ` · ${planLimitData?.plan?.name}` : ""}
            </span>
          )}
        </span>

        <ChevronIcon
          className={[
            "h-4 w-4 shrink-0 text-[#7A877F] transition",
            open ? "rotate-180" : "",
          ].join(" ")}
        />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[320px] max-w-[calc(100vw-2rem)] rounded-3xl border border-[#DDE5DF] bg-white p-4 shadow-2xl">
          <div className="mb-3 flex items-start gap-3">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${tone.icon}`}
            >
              <ProfileIcon className="h-5 w-5" />
            </span>

            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                Perfil ativo
              </p>

              <p className="mt-1 truncate text-base font-semibold text-[#17211B]">
                {currentRoleLabel}
              </p>

              <p className="mt-1 break-words text-sm leading-5 text-[#5E6B63]">
                {contextLabel}
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${tone.badge}`}
            >
              {currentRoleLabel}
            </span>

            <span className="inline-flex rounded-full border border-[#DDE5DF] bg-[#F6F8F7] px-3 py-1 text-xs font-semibold text-[#5E6B63]">
              Perfil de acesso
            </span>

            <PlanBadge planLimitData={planLimitData} compact />
          </div>

          <p className="mt-3 rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] p-3 text-xs leading-5 text-[#5E6B63]">
            {accessExplanation}
          </p>

          {hasPlanInfo && (
            <div className="mt-3 rounded-2xl border border-[#DDE5DF] bg-white p-3">
              <div className="flex items-start gap-3">
                <span
                  className={[
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
                    providerLimit?.reached
                      ? "border-yellow-200 bg-yellow-50 text-yellow-800"
                      : getPlanTone(planLimitData?.plan?.slug),
                  ].join(" ")}
                >
                  <PlanIcon
                    type={getPlanIconType(planLimitData?.plan?.slug)}
                    className="h-4 w-4"
                  />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7A877F]">
                    Plano da carteira
                  </p>

                  <p className="mt-1 text-sm font-semibold text-[#17211B]">
                    Plano {planLimitData?.plan?.name}
                  </p>

                  {providerLimit && (
                    <p
                      className={[
                        "mt-1 text-xs leading-5",
                        providerLimit.reached
                          ? "font-semibold text-yellow-800"
                          : "text-[#5E6B63]",
                      ].join(" ")}
                    >
                      {formatLimitValue(providerLimit.currentUsage)} de{" "}
                      {formatLimitValue(providerLimit.limit)} fornecedores
                      {providerLimit.reached
                        ? " · limite atingido"
                        : " disponíveis no plano"}
                    </p>
                  )}
                </div>
              </div>

              <Link
                href="/admin/configuracoes"
                onClick={() => setOpen(false)}
                className={[
                  "mt-3 inline-flex h-10 w-full items-center justify-center rounded-2xl px-4 text-xs font-semibold transition",
                  shouldHighlightUpgrade
                    ? "bg-[#256D3C] text-white hover:bg-[#1F5A32]"
                    : "border border-[#DDE5DF] bg-[#F9FBFA] text-[#17211B] hover:border-[#256D3C] hover:text-[#256D3C]",
                ].join(" ")}
              >
                Ver planos disponíveis
              </Link>
            </div>
          )}

          {canSwitchProfile && (
            <Link
              href="/contexto"
              onClick={() => setOpen(false)}
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[#256D3C] px-4 text-sm font-semibold text-white transition hover:bg-[#1F5A32]"
            >
              Trocar perfil
            </Link>
          )}

          {!canSwitchProfile && (
            <p className="mt-4 rounded-2xl border border-[#DDE5DF] bg-[#F6F8F7] p-3 text-xs leading-5 text-[#5E6B63]">
              Este usuário possui apenas um perfil de acesso disponível.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
