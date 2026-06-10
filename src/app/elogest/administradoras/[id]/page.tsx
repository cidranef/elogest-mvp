"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import EloGestShell from "@/components/EloGestShell";



/* =========================================================
   ELOGEST - DETALHE DA ADMINISTRADORA

   Rota:
   /elogest/administradoras/[id]

   ETAPA 44 — SUPER ADMIN E MULTIADMINISTRADORA

   Objetivo:
   - Visualizar dados da administradora.
   - Editar dados principais.
   - Ativar/Inativar administradora.
   - Exibir condomínios e usuários vinculados.
   - Deixar claro que administradora INACTIVE bloqueia
     a área administrativa e as rotinas operacionais
   - Manter a área exclusiva da EloGest separada do AdminShell.

   Regras consolidadas:
   - Esta página pertence à área interna da EloGest.
   - A proteção principal fica no layout /elogest.
   - Administradora ativa pode operar em /admin.
   - Administradora inativa fica bloqueada operacionalmente,
     mesmo que usuários e UserAccess continuem ativos.
   ========================================================= */



type Status = "ACTIVE" | "INACTIVE";





type PlanLimitKey =
  | "maxCondominiums"
  | "maxUnits"
  | "maxUsers"
  | "maxMonthlyTickets"
  | "maxProviders";



type PlanLimits = Partial<Record<PlanLimitKey, number | null>>;



type PlanUsage = Partial<{
  condominiums: number;
  units: number;
  users: number;
  monthlyTickets: number;
  providers: number;
}>;



type PlanModuleInfo = {
  id?: string;
  name: string;
  slug: string;
  enabled?: boolean;
  description?: string | null;
};



type ModuleOverrideItem = {
  id: string;
  moduleId: string;
  name: string;
  slug: string;
  description?: string | null;
  enabledByPlan: boolean;
  hasOverride: boolean;
  enabledByOverride: boolean | null;
  enabledEffective: boolean;
  source: "PLAN" | "NOT_INCLUDED" | "OVERRIDE_ALLOW" | "OVERRIDE_BLOCK" | string;
  override?: {
    id: string;
    enabled: boolean;
    reason?: string | null;
    startsAt?: string | null;
    expiresAt?: string | null;
  } | null;
};



type ModulesApiResponse = {
  error?: string;
  items?: ModuleOverrideItem[];
  totals?: {
    total: number;
    enabledByPlan: number;
    enabledEffective: number;
    overrides: number;
    manualAllows: number;
    manualBlocks: number;
  };
};



type LimitsApiResponse = {
  error?: string;
  planLimits?: PlanLimits | null;
  override?: (PlanLimits & { reason?: string | null }) | null;
  effectiveLimits?: PlanLimits;
  usage?: PlanUsage;
};



type PlanInfo = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  status?: string;
  monthlyPriceCents?: number | null;
  annualPriceCents?: number | null;
  maxCondominiums?: number | null;
  maxUnits?: number | null;
  maxUsers?: number | null;
  maxMonthlyTickets?: number | null;
  maxProviders?: number | null;
  modules?: PlanModuleInfo[];
};



type PlanApiResponse = {
  error?: unknown;
  administrator?: {
    id?: string;
    planId?: string | null;
    planStatus?: string | null;
    planStartedAt?: string | null;
    planExpiresAt?: string | null;
    customLimitsEnabled?: boolean | null;
    plan?: PlanInfo | null;
  };
  plan?: PlanInfo | null;
  currentPlan?: PlanInfo | null;
  availablePlans?: PlanInfo[];
  plans?: PlanInfo[];
  effectiveLimits?: PlanLimits;
  limits?: PlanLimits;
  usage?: PlanUsage;
  modules?: PlanModuleInfo[];
  enabledModules?: PlanModuleInfo[];
  moduleOverrides?: unknown[];
  limitOverride?: PlanLimits | null;
};



type PlanManagementData = {
  currentPlan: PlanInfo | null;
  availablePlans: PlanInfo[];
  effectiveLimits: PlanLimits;
  usage: PlanUsage;
  modules: PlanModuleInfo[];
  moduleOverrides: unknown[];
  limitOverride: PlanLimits | null;
  planStatus: string;
  planStartedAt: string | null;
  planExpiresAt: string | null;
  customLimitsEnabled: boolean;
};


type AdministratorDetail = {
  id: string;
  name: string;
  cnpj?: string | null;
  email?: string | null;
  phone?: string | null;
  status: Status;
  createdAt: string;
  updatedAt: string;
  condominiums: {
    id: string;
    name: string;
    city?: string | null;
    state?: string | null;
    status: Status;
    createdAt: string;
  }[];
  users: {
    id: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
    createdAt: string;
  }[];
};



/* =========================================================
   HELPERS
   ========================================================= */

function onlyNumbers(value: string) {
  return value.replace(/\D/g, "");
}



function statusLabel(status: string) {
  if (status === "ACTIVE") return "Ativa";
  if (status === "INACTIVE") return "Inativa";

  return status;
}



function statusClasses(status: string) {
  if (status === "ACTIVE") {
    return "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]";
  }

  return "border-yellow-200 bg-yellow-50 text-yellow-800";
}



function formatDate(value?: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}



function formatCnpj(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");

  if (digits.length !== 14) {
    return value || "CNPJ não informado";
  }

  return digits.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    "$1.$2.$3/$4-$5"
  );
}



function formatPhone(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");

  if (!digits) {
    return "Telefone não informado";
  }

  if (digits.length === 11) {
    return digits.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  }

  if (digits.length === 10) {
    return digits.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  }

  return value || digits;
}





function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}



function formatLimit(value?: number | null) {
  if (value === null || value === undefined) {
    return "Ilimitado";
  }

  return formatNumber(value);
}



function formatDateInput(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}



function planStatusLabel(status: string) {
  const labels: Record<string, string> = {
    ACTIVE: "Ativo",
    TRIALING: "Em Avaliação",
    PAST_DUE: "Pendente",
    SUSPENDED: "Suspenso",
    CANCELED: "Cancelado",
    EXPIRED: "Expirado",
  };

  return labels[status] || status;
}



function planStatusClasses(status: string) {
  if (status === "ACTIVE" || status === "TRIALING") {
    return "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]";
  }

  if (status === "PAST_DUE") {
    return "border-yellow-200 bg-yellow-50 text-yellow-800";
  }

  return "border-red-200 bg-red-50 text-red-800";
}



function usagePercent(current?: number, limit?: number | null) {
  if (limit === null || limit === undefined || limit <= 0) {
    return 0;
  }

  return Math.min(Math.round(((current || 0) / limit) * 100), 100);
}



function normalizePlanPayload(data: PlanApiResponse): PlanManagementData {
  const administrator = data.administrator;

  const currentPlan =
    data.currentPlan ||
    data.plan ||
    administrator?.plan ||
    null;

  const availablePlans = data.availablePlans || data.plans || [];

  const modules =
    data.modules ||
    data.enabledModules ||
    currentPlan?.modules ||
    [];

  return {
    currentPlan,
    availablePlans,
    effectiveLimits: data.effectiveLimits || data.limits || {},
    usage: data.usage || {},
    modules,
    moduleOverrides: data.moduleOverrides || [],
    limitOverride: data.limitOverride || null,
    planStatus: administrator?.planStatus || "ACTIVE",
    planStartedAt: administrator?.planStartedAt || null,
    planExpiresAt: administrator?.planExpiresAt || null,
    customLimitsEnabled: Boolean(administrator?.customLimitsEnabled),
  };
}



function getPlanLimitFromPlan(plan: PlanInfo | null, key: PlanLimitKey) {
  if (!plan) {
    return null;
  }

  return plan[key] ?? null;
}



function getPlanModulesFromSelection(plan: PlanInfo | null): PlanModuleInfo[] {
  return (plan?.modules || [])
    .map((module) => ({
      id: module.id || module.slug,
      name: module.name || module.slug,
      slug: module.slug,
      description: module.description || null,
    }))
    .filter((module) => Boolean(module.slug || module.name));
}



function moduleSourceLabel(source: string) {
  const labels: Record<string, string> = {
    PLAN: "Liberado Pelo Plano",
    NOT_INCLUDED: "Fora Do Plano",
    OVERRIDE_ALLOW: "Liberado Manualmente",
    OVERRIDE_BLOCK: "Bloqueado Manualmente",
  };

  return labels[source] || source;
}



function moduleSourceClasses(source: string) {
  if (source === "PLAN" || source === "OVERRIDE_ALLOW") {
    return "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]";
  }

  if (source === "OVERRIDE_BLOCK") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  return "border-[#DDE5DF] bg-[#F7F9F8] text-[#64736A]";
}



function limitInputValue(value?: number | null) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}



function parseLimitInput(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.floor(parsed);
}



function roleLabel(role: string) {
  const labels: Record<string, string> = {
    SUPER_ADMIN: "Super Admin",
    ADMINISTRADORA: "Administradora",
    SINDICO: "Síndico",
    MORADOR: "Morador",
    PROPRIETARIO: "Proprietário",
    CONSELHEIRO: "Conselheiro",
  };

  return labels[role] || role;
}



/* =========================================================
   COMPONENTES INTERNOS
   ========================================================= */

function InfoCard({
  title,
  value,
  description,
  tone = "default",
}: {
  title: string;
  value: string | number;
  description: string;
  tone?: "default" | "success" | "warning";
}) {
  const toneClasses = {
    default: "border-[#DDE5DF] bg-white/92",
    success: "border-[#CFE6D4] bg-[#F7FBF8]",
    warning: "border-yellow-200 bg-yellow-50",
  };

  return (
    <div
      className={[
        "rounded-[26px] border p-5 shadow-[0_16px_48px_rgba(23,33,27,0.06)]",
        toneClasses[tone],
      ].join(" ")}
    >
      <p className="text-sm font-semibold text-[#64736A]">
        {title}
      </p>

      <p className="mt-3 text-3xl font-semibold tracking-[-0.045em] text-[#17211B]">
        {value}
      </p>

      <p className="mt-2 text-sm leading-6 text-[#7A877F]">
        {description}
      </p>
    </div>
  );
}



function AlertBox({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[24px] border border-yellow-200 bg-yellow-50 p-5 text-yellow-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/70">
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <path
              d="M12 9v4"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2"
            />
            <path
              d="M12 17h.01"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2"
            />
            <path
              d="M10.3 4.3 2.8 17.2A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.8L13.7 4.3a2 2 0 0 0-3.4 0Z"
              fill="none"
              stroke="currentColor"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
        </div>

        <div>
          <p className="text-sm font-semibold">
            {title}
          </p>

          <p className="mt-1 text-sm leading-6 opacity-80">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}



function OperationRule({
  title,
  description,
  active,
}: {
  title: string;
  description: string;
  active: boolean;
}) {
  return (
    <div
      className={[
        "rounded-2xl border p-4",
        active
          ? "border-[#CFE6D4] bg-[#F7FBF8]"
          : "border-[#DDE5DF] bg-[#F7F9F8]",
      ].join(" ")}
    >
      <p className="text-sm font-semibold text-[#17211B]">
        {title}
      </p>

      <p className="mt-1 text-sm leading-6 text-[#64736A]">
        {description}
      </p>
    </div>
  );
}





function UsageLimitCard({
  title,
  current,
  limit,
  description,
}: {
  title: string;
  current?: number;
  limit?: number | null;
  description: string;
}) {
  const percent = usagePercent(current, limit);
  const isUnlimited = limit === null || limit === undefined;
  const isNearLimit = !isUnlimited && percent >= 80;

  return (
    <div className="rounded-2xl border border-[#DDE5DF] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#17211B]">
            {title}
          </p>

          <p className="mt-1 text-xs leading-5 text-[#64736A]">
            {description}
          </p>
        </div>

        <span
          className={[
            "shrink-0 rounded-full border px-3 py-1 text-xs font-semibold",
            isNearLimit
              ? "border-yellow-200 bg-yellow-50 text-yellow-800"
              : "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]",
          ].join(" ")}
        >
          {formatNumber(current || 0)} / {formatLimit(limit)}
        </span>
      </div>

      {!isUnlimited && (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-[#EEF2EF]">
            <div
              className={[
                "h-full rounded-full",
                isNearLimit ? "bg-yellow-600" : "bg-[#256D3C]",
              ].join(" ")}
              style={{ width: `${percent}%` }}
            />
          </div>

          <p className="mt-2 text-xs font-semibold text-[#7A877F]">
            {percent}% utilizado
          </p>
        </div>
      )}

      {isUnlimited && (
        <p className="mt-4 text-xs font-semibold text-[#256D3C]">
          Limite personalizado ou ilimitado.
        </p>
      )}
    </div>
  );
}



function ModuleChip({ module }: { module: PlanModuleInfo }) {
  const label = module.name || module.slug || "Módulo";

  return (
    <span className="inline-flex rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-1 text-xs font-semibold text-[#256D3C]">
      {label}
    </span>
  );
}



function OverrideModuleCard({
  module,
  saving,
  onAllow,
  onBlock,
  onRemove,
}: {
  module: ModuleOverrideItem;
  saving: boolean;
  onAllow: (module: ModuleOverrideItem) => void;
  onBlock: (module: ModuleOverrideItem) => void;
  onRemove: (module: ModuleOverrideItem) => void;
}) {
  return (
    <div className="rounded-2xl border border-[#DDE5DF] bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-[#17211B]">
              {module.name || module.slug}
            </p>

            <span
              className={[
                "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                moduleSourceClasses(module.source),
              ].join(" ")}
            >
              {moduleSourceLabel(module.source)}
            </span>
          </div>

          <p className="mt-1 text-xs leading-5 text-[#64736A]">
            {module.description || "Módulo controlado por plano e override manual."}
          </p>

          {module.override?.reason && (
            <p className="mt-2 text-xs leading-5 text-[#7A877F]">
              Motivo: {module.override.reason}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => onAllow(module)}
            className="inline-flex min-h-9 items-center justify-center rounded-xl border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-2 text-xs font-semibold text-[#256D3C] transition hover:bg-[#DDF0E3] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Liberar
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => onBlock(module)}
            className="inline-flex min-h-9 items-center justify-center rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Bloquear
          </button>

          {module.hasOverride && (
            <button
              type="button"
              disabled={saving}
              onClick={() => onRemove(module)}
              className="inline-flex min-h-9 items-center justify-center rounded-xl border border-[#DDE5DF] bg-white px-3 py-2 text-xs font-semibold text-[#64736A] transition hover:border-[#256D3C] hover:text-[#256D3C] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Remover Override
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


/* =========================================================
   PÁGINA
   ========================================================= */

export default function EloGestAdministradoraDetalhePage() {
  const router = useRouter();
  const params = useParams();

  const administratorId = useMemo(() => {
    const rawId = params?.id;

    if (Array.isArray(rawId)) {
      return rawId[0] || "";
    }

    return rawId || "";
  }, [params]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [administrator, setAdministrator] = useState<AdministratorDetail | null>(null);

  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<Status>("ACTIVE");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [planData, setPlanData] = useState<PlanManagementData | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [planSaving, setPlanSaving] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [selectedPlanStatus, setSelectedPlanStatus] = useState("ACTIVE");
  const [selectedPlanStartedAt, setSelectedPlanStartedAt] = useState("");
  const [selectedPlanExpiresAt, setSelectedPlanExpiresAt] = useState("");
  const [customLimitsEnabled, setCustomLimitsEnabled] = useState(false);

  const [moduleItems, setModuleItems] = useState<ModuleOverrideItem[]>([]);
  const [moduleTotals, setModuleTotals] = useState<ModulesApiResponse["totals"] | null>(null);
  const [moduleSaving, setModuleSaving] = useState(false);

  const [limitSaving, setLimitSaving] = useState(false);
  const [limitReason, setLimitReason] = useState("");
  const [customLimitValues, setCustomLimitValues] = useState<Record<PlanLimitKey, string>>({
    maxCondominiums: "",
    maxUnits: "",
    maxUsers: "",
    maxMonthlyTickets: "",
    maxProviders: "",
  });



  const willBlockOperation = status === "INACTIVE";
  const isCurrentlyInactive = administrator?.status === "INACTIVE";

  const selectedPlan = useMemo(() => {
    return (
      planData?.availablePlans.find((plan) => plan.id === selectedPlanId) ||
      planData?.currentPlan ||
      null
    );
  }, [planData, selectedPlanId]);

  const effectiveModuleList = useMemo(() => {
    if (moduleItems.length > 0) {
      return moduleItems
        .filter((module) => module.enabledEffective)
        .map((module) => ({
          id: module.moduleId || module.id,
          name: module.name || module.slug,
          slug: module.slug,
          description: module.description || null,
        }));
    }

    if (planData?.modules && planData.modules.length > 0) {
      return planData.modules;
    }

    return getPlanModulesFromSelection(selectedPlan);
  }, [moduleItems, planData, selectedPlan]);



  const planLimitCards = useMemo(
    () => [
      {
        title: "Condomínios",
        usage: planData?.usage.condominiums,
        limit: planData?.effectiveLimits.maxCondominiums ?? getPlanLimitFromPlan(selectedPlan, "maxCondominiums"),
        description: "Carteiras condominiais cadastradas.",
      },
      {
        title: "Unidades",
        usage: planData?.usage.units,
        limit: planData?.effectiveLimits.maxUnits ?? getPlanLimitFromPlan(selectedPlan, "maxUnits"),
        description: "Unidades operacionais cadastradas.",
      },
      {
        title: "Usuários",
        usage: planData?.usage.users,
        limit: planData?.effectiveLimits.maxUsers ?? getPlanLimitFromPlan(selectedPlan, "maxUsers"),
        description: "Usuários vinculados à administradora.",
      },
      {
        title: "Chamados Mensais",
        usage: planData?.usage.monthlyTickets,
        limit: planData?.effectiveLimits.maxMonthlyTickets ?? getPlanLimitFromPlan(selectedPlan, "maxMonthlyTickets"),
        description: "Chamados abertos no mês atual.",
      },
      {
        title: "Fornecedores",
        usage: planData?.usage.providers,
        limit: planData?.effectiveLimits.maxProviders ?? getPlanLimitFromPlan(selectedPlan, "maxProviders"),
        description: "Fornecedores homologados ou ativos.",
      },
    ],
    [planData, selectedPlan]
  );



  async function loadAdministrator() {
    if (!administratorId) {
      setError("Administradora não identificada.");
      setLoading(false);
      setPlanLoading(false);
      return;
    }

    try {
      setLoading(true);
      setPlanLoading(true);
      setError("");
      setSuccess("");

      const [
        administratorResponse,
        planResponse,
        modulesResponse,
        limitsResponse,
      ] = await Promise.all([
        fetch(`/api/elogest/administradoras/${administratorId}`, {
          cache: "no-store",
        }),
        fetch(`/api/elogest/administradoras/${administratorId}/plano`, {
          cache: "no-store",
        }),
        fetch(`/api/elogest/administradoras/${administratorId}/modulos`, {
          cache: "no-store",
        }),
        fetch(`/api/elogest/administradoras/${administratorId}/limites`, {
          cache: "no-store",
        }),
      ]);

      const administratorData = await administratorResponse.json();

      if (!administratorResponse.ok) {
        setError(
          administratorData?.error || "Não foi possível carregar a administradora."
        );
        return;
      }

      const item = administratorData?.administrator as AdministratorDetail;

      setAdministrator(item);
      setName(item.name || "");
      setCnpj(item.cnpj || "");
      setEmail(item.email || "");
      setPhone(item.phone || "");
      setStatus(item.status || "ACTIVE");

      const rawPlanData = (await planResponse.json()) as PlanApiResponse;

      if (!planResponse.ok) {
        setPlanData(null);
        setError(
          rawPlanData && "error" in rawPlanData
            ? String(rawPlanData.error)
            : "Não foi possível carregar o plano da administradora."
        );
        return;
      }

      const normalizedPlanData = normalizePlanPayload(rawPlanData);

      setPlanData(normalizedPlanData);
      setSelectedPlanId(normalizedPlanData.currentPlan?.id || "");
      setSelectedPlanStatus(normalizedPlanData.planStatus || "ACTIVE");
      setSelectedPlanStartedAt(formatDateInput(normalizedPlanData.planStartedAt));
      setSelectedPlanExpiresAt(formatDateInput(normalizedPlanData.planExpiresAt));
      setCustomLimitsEnabled(normalizedPlanData.customLimitsEnabled);

      const modulesData = (await modulesResponse.json()) as ModulesApiResponse;

      if (modulesResponse.ok) {
        setModuleItems(modulesData.items || []);
        setModuleTotals(modulesData.totals || null);
      } else {
        setModuleItems([]);
        setModuleTotals(null);
      }

      const limitsData = (await limitsResponse.json()) as LimitsApiResponse;

      if (limitsResponse.ok) {
        const override = limitsData.override || {};
        setLimitReason(override.reason || "");
        setCustomLimitValues({
          maxCondominiums: limitInputValue(override.maxCondominiums),
          maxUnits: limitInputValue(override.maxUnits),
          maxUsers: limitInputValue(override.maxUsers),
          maxMonthlyTickets: limitInputValue(override.maxMonthlyTickets),
          maxProviders: limitInputValue(override.maxProviders),
        });
      } else {
        setLimitReason("");
        setCustomLimitValues({
          maxCondominiums: "",
          maxUnits: "",
          maxUsers: "",
          maxMonthlyTickets: "",
          maxProviders: "",
        });
      }
    } catch (err) {
      console.error(err);
      setError("Não foi possível carregar a administradora.");
    } finally {
      setLoading(false);
      setPlanLoading(false);
    }
  }



  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadAdministrator();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [administratorId]);



  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving) {
      return;
    }

    const normalizedName = name.trim();
    const normalizedCnpj = onlyNumbers(cnpj);
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = onlyNumbers(phone);

    if (!normalizedName) {
      setError("Informe o nome da administradora.");
      return;
    }

    if (normalizedCnpj && normalizedCnpj.length !== 14) {
      setError("Informe um CNPJ válido com 14 dígitos ou deixe em branco.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const response = await fetch(`/api/elogest/administradoras/${administratorId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: normalizedName,
          cnpj: normalizedCnpj || null,
          email: normalizedEmail || null,
          phone: normalizedPhone || null,
          status,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data?.error || "Não foi possível salvar as alterações.");
        return;
      }

      setAdministrator(data.administrator);
      setSuccess(
        status === "INACTIVE"
          ? "Administradora inativada. O acesso administrativo foi bloqueado."
          : "Administradora atualizada com sucesso."
      );
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Não foi possível salvar as alterações.");
    } finally {
      setSaving(false);
    }
  }



  async function handlePlanSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (planSaving || !administratorId) {
      return;
    }

    if (!selectedPlanId) {
      setError("Selecione um plano para a administradora.");
      return;
    }

    const previousPlanId = planData?.currentPlan?.id || "";
    const planWasChanged = Boolean(previousPlanId && previousPlanId !== selectedPlanId);
    const modulesWithOverrides = planWasChanged
      ? moduleItems.filter((item) => item.hasOverride)
      : [];

    try {
      setPlanSaving(true);
      setError("");
      setSuccess("");

      const response = await fetch(
        `/api/elogest/administradoras/${administratorId}/plano`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            planId: selectedPlanId,
            planStatus: selectedPlanStatus,
            planStartedAt: selectedPlanStartedAt || null,
            planExpiresAt: selectedPlanExpiresAt || null,
            customLimitsEnabled,
          }),
        }
      );

      const data = (await response.json()) as PlanApiResponse & {
        error?: string;
      };

      if (!response.ok) {
        setError(data?.error || "Não foi possível atualizar o plano.");
        return;
      }

      if (modulesWithOverrides.length > 0) {
        const cleanupResponses = await Promise.all(
          modulesWithOverrides.map((item) =>
            fetch(
              `/api/elogest/administradoras/${administratorId}/modulos?moduleId=${encodeURIComponent(
                item.moduleId
              )}`,
              {
                method: "DELETE",
              }
            )
          )
        );

        const cleanupFailed = cleanupResponses.some((cleanupResponse) => !cleanupResponse.ok);

        if (cleanupFailed) {
          setError(
            "O plano foi atualizado, mas não foi possível remover todos os overrides antigos de módulos. Recarregue a página e revise os módulos manualmente."
          );
          await reloadCommercialData();
          return;
        }
      }

      const normalizedPlanData = normalizePlanPayload(data);
      const nextPlanData = {
        ...normalizedPlanData,
        availablePlans:
          normalizedPlanData.availablePlans.length > 0
            ? normalizedPlanData.availablePlans
            : planData?.availablePlans || [],
      };

      setPlanData(nextPlanData);
      setSelectedPlanId(nextPlanData.currentPlan?.id || selectedPlanId);
      setSelectedPlanStatus(nextPlanData.planStatus || selectedPlanStatus);
      setSelectedPlanStartedAt(formatDateInput(nextPlanData.planStartedAt));
      setSelectedPlanExpiresAt(formatDateInput(nextPlanData.planExpiresAt));
      setCustomLimitsEnabled(nextPlanData.customLimitsEnabled);

      await reloadCommercialData();

      setSuccess(
        modulesWithOverrides.length > 0
          ? "Plano atualizado com sucesso. Os overrides antigos de módulos foram removidos para aplicar a regra do novo plano."
          : "Plano da administradora atualizado com sucesso."
      );
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Não foi possível atualizar o plano da administradora.");
    } finally {
      setPlanSaving(false);
    }
  }



  async function reloadCommercialData() {
    if (!administratorId) {
      return;
    }

    const [planResponse, modulesResponse, limitsResponse] = await Promise.all([
      fetch(`/api/elogest/administradoras/${administratorId}/plano`, {
        cache: "no-store",
      }),
      fetch(`/api/elogest/administradoras/${administratorId}/modulos`, {
        cache: "no-store",
      }),
      fetch(`/api/elogest/administradoras/${administratorId}/limites`, {
        cache: "no-store",
      }),
    ]);

    if (planResponse.ok) {
      const planPayload = (await planResponse.json()) as PlanApiResponse;
      const normalizedPlanData = normalizePlanPayload(planPayload);

      setPlanData((current) => ({
        ...normalizedPlanData,
        availablePlans:
          normalizedPlanData.availablePlans.length > 0
            ? normalizedPlanData.availablePlans
            : current?.availablePlans || [],
      }));
    }

    if (modulesResponse.ok) {
      const modulesPayload = (await modulesResponse.json()) as ModulesApiResponse;

      setModuleItems(modulesPayload.items || []);
      setModuleTotals(modulesPayload.totals || null);
    }

    if (limitsResponse.ok) {
      const limitsPayload = (await limitsResponse.json()) as LimitsApiResponse;

      setPlanData((current) =>
        current
          ? {
              ...current,
              effectiveLimits: limitsPayload.effectiveLimits || current.effectiveLimits,
              usage: limitsPayload.usage || current.usage,
              limitOverride: limitsPayload.override || null,
            }
          : current
      );

      const override = limitsPayload.override || {};
      setLimitReason(override.reason || "");
      setCustomLimitValues({
        maxCondominiums: limitInputValue(override.maxCondominiums),
        maxUnits: limitInputValue(override.maxUnits),
        maxUsers: limitInputValue(override.maxUsers),
        maxMonthlyTickets: limitInputValue(override.maxMonthlyTickets),
        maxProviders: limitInputValue(override.maxProviders),
      });
      setCustomLimitsEnabled(Boolean(limitsPayload.override));
    }
  }



  async function handleModuleOverride(module: ModuleOverrideItem, enabled: boolean) {
    if (moduleSaving || !administratorId) {
      return;
    }

    const reason =
      window.prompt(
        enabled
          ? `Motivo para liberar manualmente o módulo ${module.name}?`
          : `Motivo para bloquear manualmente o módulo ${module.name}?`,
        module.override?.reason || ""
      ) || "";

    try {
      setModuleSaving(true);
      setError("");
      setSuccess("");

      const response = await fetch(
        `/api/elogest/administradoras/${administratorId}/modulos`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            moduleId: module.moduleId,
            enabled,
            reason,
          }),
        }
      );

      const data = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        setError(data?.error || "Não foi possível atualizar o módulo.");
        return;
      }

      await reloadCommercialData();
      setSuccess(data.message || "Override de módulo atualizado com sucesso.");
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Não foi possível atualizar o módulo da administradora.");
    } finally {
      setModuleSaving(false);
    }
  }



  async function handleRemoveModuleOverride(module: ModuleOverrideItem) {
    if (moduleSaving || !administratorId) {
      return;
    }

    try {
      setModuleSaving(true);
      setError("");
      setSuccess("");

      const response = await fetch(
        `/api/elogest/administradoras/${administratorId}/modulos?moduleId=${encodeURIComponent(module.moduleId)}`,
        {
          method: "DELETE",
        }
      );

      const data = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        setError(data?.error || "Não foi possível remover o override.");
        return;
      }

      await reloadCommercialData();
      setSuccess(data.message || "Override removido com sucesso.");
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Não foi possível remover o override do módulo.");
    } finally {
      setModuleSaving(false);
    }
  }



  async function handleCustomLimitsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (limitSaving || !administratorId) {
      return;
    }

    try {
      setLimitSaving(true);
      setError("");
      setSuccess("");

      const response = await fetch(
        `/api/elogest/administradoras/${administratorId}/limites`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            maxCondominiums: parseLimitInput(customLimitValues.maxCondominiums),
            maxUnits: parseLimitInput(customLimitValues.maxUnits),
            maxUsers: parseLimitInput(customLimitValues.maxUsers),
            maxMonthlyTickets: parseLimitInput(customLimitValues.maxMonthlyTickets),
            maxProviders: parseLimitInput(customLimitValues.maxProviders),
            reason: limitReason,
          }),
        }
      );

      const data = (await response.json()) as LimitsApiResponse & {
        message?: string;
      };

      if (!response.ok) {
        setError(data?.error || "Não foi possível salvar os limites personalizados.");
        return;
      }

      await reloadCommercialData();
      setSuccess(data.message || "Limites personalizados atualizados com sucesso.");
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Não foi possível salvar os limites personalizados.");
    } finally {
      setLimitSaving(false);
    }
  }



  async function handleRemoveCustomLimits() {
    if (limitSaving || !administratorId) {
      return;
    }

    try {
      setLimitSaving(true);
      setError("");
      setSuccess("");

      const response = await fetch(
        `/api/elogest/administradoras/${administratorId}/limites`,
        {
          method: "DELETE",
        }
      );

      const data = (await response.json()) as LimitsApiResponse & {
        message?: string;
      };

      if (!response.ok) {
        setError(data?.error || "Não foi possível remover os limites personalizados.");
        return;
      }

      await reloadCommercialData();
      setSuccess(
        data.message ||
          "Limites personalizados removidos. A administradora voltou a usar os limites do plano."
      );
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Não foi possível remover os limites personalizados.");
    } finally {
      setLimitSaving(false);
    }
  }




  return (
    <EloGestShell current="administradoras">
      <div className="space-y-8">



        {/* =====================================================
           HEADER
           ===================================================== */}

        <section className="rounded-[34px] border border-[#DDE5DF] bg-white/90 p-6 shadow-[0_24px_80px_rgba(23,33,27,0.08)] backdrop-blur sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap gap-2">
                <div className="inline-flex rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-1 text-xs font-semibold text-[#256D3C]">
                  Detalhe da administradora
                </div>

                {administrator && (
                  <span
                    className={[
                      "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
                      statusClasses(administrator.status),
                    ].join(" ")}
                  >
                    {statusLabel(administrator.status)}
                  </span>
                )}
              </div>

              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.045em] text-[#17211B] sm:text-4xl">
                {administrator?.name || "Administradora"}
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#64736A] sm:text-base sm:leading-7">
                Visualize e atualize os dados principais da administradora,
                acompanhe usuários e condomínios vinculados e controle o status
                operacional da carteira.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/elogest/administradoras"
                className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 py-3 text-sm font-semibold text-[#17211B] shadow-sm transition hover:border-[#256D3C] hover:text-[#256D3C]"
              >
                Voltar
              </Link>

              <Link
                href="/elogest/administradoras/nova"
                className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5A32]"
              >
                Nova administradora
              </Link>
            </div>
          </div>
        </section>



        {loading ? (
          <section className="rounded-[30px] border border-[#DDE5DF] bg-white/92 p-8 text-center shadow-[0_18px_55px_rgba(23,33,27,0.06)]">
            <p className="text-sm font-semibold text-[#64736A]">
              Carregando administradora...
            </p>
          </section>
        ) : error && !administrator ? (
          <section className="rounded-[30px] border border-red-200 bg-red-50 p-8 text-center shadow-[0_18px_55px_rgba(23,33,27,0.06)]">
            <p className="text-sm font-semibold text-red-800">
              {error}
            </p>

            <Link
              href="/elogest/administradoras"
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5A32]"
            >
              Voltar para administradoras
            </Link>
          </section>
        ) : administrator ? (
          <>



            {/* =================================================
               ALERTA DE STATUS INATIVO
               ================================================= */}

            {isCurrentlyInactive && (
              <AlertBox
                title="Administradora inativa"
                description="A operação administrativa desta administradora está bloqueada. Usuários vinculados não conseguem acessar /admin e as APIs administrativas retornam bloqueio até que a administradora seja reativada."
              />
            )}



            {/* =================================================
               KPIS
               ================================================= */}

            <section className="grid gap-4 md:grid-cols-3">
              <InfoCard
                title="Condomínios"
                value={administrator.condominiums.length}
                description="Condomínios vinculados a esta administradora."
              />

              <InfoCard
                title="Usuários"
                value={administrator.users.length}
                description="Usuários operacionais vinculados."
              />

              <InfoCard
                title="Status operacional"
                value={statusLabel(administrator.status)}
                description={
                  administrator.status === "ACTIVE"
                    ? "Carteira liberada para operação administrativa."
                    : "Carteira bloqueada para acesso administrativo."
                }
                tone={administrator.status === "ACTIVE" ? "success" : "warning"}
              />
            </section>



            {/* =================================================
               PLANO, MÓDULOS E LIMITES
               ================================================= */}

            <section className="rounded-[30px] border border-[#DDE5DF] bg-white/92 p-6 shadow-[0_18px_55px_rgba(23,33,27,0.06)] backdrop-blur sm:p-8">
              <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="inline-flex rounded-full border border-[#CFE6D4] bg-[#EAF7EE] px-3 py-1 text-xs font-semibold text-[#256D3C]">
                    Planos, Módulos E Limites
                  </div>

                  <h2 className="mt-3 text-xl font-semibold tracking-[-0.025em] text-[#17211B]">
                    Plano comercial da administradora
                  </h2>

                  <p className="mt-1 max-w-3xl text-sm leading-6 text-[#64736A]">
                    Controle o plano contratado, o status comercial, os módulos
                    liberados e os limites operacionais desta administradora.
                  </p>
                </div>

                {planData?.currentPlan && (
                  <div className="rounded-2xl border border-[#DDE5DF] bg-[#F7F9F8] px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7A877F]">
                      Plano Atual
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold tracking-[-0.025em] text-[#17211B]">
                        {planData.currentPlan.name}
                      </p>

                      <span
                        className={[
                          "rounded-full border px-3 py-1 text-xs font-semibold",
                          planStatusClasses(planData.planStatus),
                        ].join(" ")}
                      >
                        {planStatusLabel(planData.planStatus)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {planLoading ? (
                <div className="rounded-2xl border border-dashed border-[#DDE5DF] bg-[#F7F9F8] px-4 py-8 text-center">
                  <p className="text-sm font-semibold text-[#64736A]">
                    Carregando informações do plano...
                  </p>
                </div>
              ) : !planData ? (
                <div className="rounded-2xl border border-yellow-200 bg-yellow-50 px-4 py-4 text-sm leading-6 text-yellow-900">
                  Não foi possível carregar os dados comerciais desta administradora.
                </div>
              ) : (
                <div className="space-y-6">
                  <form
                    onSubmit={handlePlanSubmit}
                    className="rounded-[26px] border border-[#DDE5DF] bg-[#F7F9F8] p-5"
                  >
                    <div className="grid gap-5 lg:grid-cols-5">
                      <div className="lg:col-span-2">
                        <label
                          htmlFor="planId"
                          className="mb-2 block text-sm font-semibold text-[#17211B]"
                        >
                          Plano
                        </label>

                        <select
                          id="planId"
                          value={selectedPlanId}
                          onChange={(event) => {
                            setSelectedPlanId(event.target.value);
                            setError("");
                            setSuccess("");
                          }}
                          className="h-12 w-full rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:ring-4 focus:ring-[#256D3C]/10"
                        >
                          <option value="">Selecione um plano</option>
                          {planData.availablePlans.map((plan) => (
                            <option key={plan.id} value={plan.id}>
                              {plan.name}
                            </option>
                          ))}
                        </select>

                        <p className="mt-2 text-xs leading-5 text-[#7A877F]">
                          Alterar o plano muda os módulos e limites considerados
                          pelas APIs operacionais.
                        </p>
                      </div>

                      <div>
                        <label
                          htmlFor="planStatus"
                          className="mb-2 block text-sm font-semibold text-[#17211B]"
                        >
                          Status Do Plano
                        </label>

                        <select
                          id="planStatus"
                          value={selectedPlanStatus}
                          onChange={(event) => {
                            setSelectedPlanStatus(event.target.value);
                            setError("");
                            setSuccess("");
                          }}
                          className="h-12 w-full rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:ring-4 focus:ring-[#256D3C]/10"
                        >
                          <option value="ACTIVE">Ativo</option>
                          <option value="TRIALING">Em Avaliação</option>
                          <option value="PAST_DUE">Pendente</option>
                          <option value="SUSPENDED">Suspenso</option>
                          <option value="CANCELED">Cancelado</option>
                          <option value="EXPIRED">Expirado</option>
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor="planStartedAt"
                          className="mb-2 block text-sm font-semibold text-[#17211B]"
                        >
                          Início
                        </label>

                        <input
                          id="planStartedAt"
                          type="date"
                          value={selectedPlanStartedAt}
                          onChange={(event) => {
                            setSelectedPlanStartedAt(event.target.value);
                            setError("");
                            setSuccess("");
                          }}
                          className="h-12 w-full rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:ring-4 focus:ring-[#256D3C]/10"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="planExpiresAt"
                          className="mb-2 block text-sm font-semibold text-[#17211B]"
                        >
                          Expiração
                        </label>

                        <input
                          id="planExpiresAt"
                          type="date"
                          value={selectedPlanExpiresAt}
                          onChange={(event) => {
                            setSelectedPlanExpiresAt(event.target.value);
                            setError("");
                            setSuccess("");
                          }}
                          className="h-12 w-full rounded-2xl border border-[#DDE5DF] bg-white px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:ring-4 focus:ring-[#256D3C]/10"
                        />
                      </div>
                    </div>

                    <div className="mt-5 flex flex-col gap-4 border-t border-[#DDE5DF] pt-5 lg:flex-row lg:items-center lg:justify-between">
                      <div className="rounded-2xl border border-[#DDE5DF] bg-white px-4 py-3">
                        <p className="text-sm font-semibold text-[#17211B]">
                          {customLimitsEnabled
                            ? "Esta carteira possui limites personalizados."
                            : "Esta carteira usa os limites do plano."}
                        </p>

                        <p className="mt-1 text-xs leading-5 text-[#64736A]">
                          Para alterar limites específicos, use o bloco
                          “Limites Personalizados” abaixo. Esta indicação é
                          atualizada automaticamente ao salvar ou remover
                          limites personalizados.
                        </p>
                      </div>

                      <button
                        type="submit"
                        disabled={planSaving}
                        className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5A32] disabled:cursor-not-allowed disabled:bg-[#9AA7A0]"
                      >
                        {planSaving ? "Salvando plano..." : "Salvar plano"}
                      </button>
                    </div>
                  </form>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    {planLimitCards.map((item) => (
                      <UsageLimitCard
                        key={item.title}
                        title={item.title}
                        current={item.usage}
                        limit={item.limit}
                        description={item.description}
                      />
                    ))}
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
                    <div className="rounded-[26px] border border-[#DDE5DF] bg-white p-5">
                      <h3 className="text-lg font-semibold tracking-[-0.025em] text-[#17211B]">
                        Módulos Liberados
                      </h3>

                      <p className="mt-1 text-sm leading-6 text-[#64736A]">
                        Estes módulos consideram o plano selecionado e qualquer
                        override manual aplicado pela EloGest.
                      </p>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {effectiveModuleList.length === 0 ? (
                          <span className="text-sm font-semibold text-[#7A877F]">
                            Nenhum módulo liberado encontrado.
                          </span>
                        ) : (
                          effectiveModuleList.map((module) => (
                            <ModuleChip
                              key={module.id || module.slug}
                              module={module}
                            />
                          ))
                        )}
                      </div>
                    </div>

                    <div className="rounded-[26px] border border-[#DDE5DF] bg-white p-5">
                      <h3 className="text-lg font-semibold tracking-[-0.025em] text-[#17211B]">
                        Resumo Do Plano Selecionado
                      </h3>

                      <div className="mt-4 space-y-3 text-sm leading-6 text-[#64736A]">
                        <p>
                          <strong className="font-semibold text-[#17211B]">
                            Plano:
                          </strong>{" "}
                          {selectedPlan?.name || "Não Selecionado"}
                        </p>

                        <p>
                          <strong className="font-semibold text-[#17211B]">
                            Fornecedores:
                          </strong>{" "}
                          {formatLimit(getPlanLimitFromPlan(selectedPlan, "maxProviders"))}
                        </p>

                        <p>
                          <strong className="font-semibold text-[#17211B]">
                            Condomínios:
                          </strong>{" "}
                          {formatLimit(getPlanLimitFromPlan(selectedPlan, "maxCondominiums"))}
                        </p>

                        <p>
                          <strong className="font-semibold text-[#17211B]">
                            Unidades:
                          </strong>{" "}
                          {formatLimit(getPlanLimitFromPlan(selectedPlan, "maxUnits"))}
                        </p>

                        <p>
                          Overrides de módulos e limites têm prioridade sobre
                          as regras do plano contratado.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[1.2fr_0.9fr]">
                    <div className="rounded-[26px] border border-[#DDE5DF] bg-white p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="text-lg font-semibold tracking-[-0.025em] text-[#17211B]">
                            Overrides De Módulos
                          </h3>

                          <p className="mt-1 text-sm leading-6 text-[#64736A]">
                            Libere ou bloqueie módulos específicos. O override
                            manual tem prioridade sobre o plano contratado.
                          </p>
                        </div>

                        <span className="inline-flex w-fit rounded-full border border-[#DDE5DF] bg-[#F7F9F8] px-3 py-1 text-xs font-semibold text-[#64736A]">
                          {moduleTotals?.overrides || 0} overrides
                        </span>
                      </div>

                      <div className="mt-5 space-y-3">
                        {moduleItems.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-[#DDE5DF] bg-[#F7F9F8] px-4 py-8 text-center">
                            <p className="text-sm font-semibold text-[#64736A]">
                              Nenhum módulo disponível para override.
                            </p>
                          </div>
                        ) : (
                          moduleItems.map((module) => (
                            <OverrideModuleCard
                              key={module.moduleId || module.id}
                              module={module}
                              saving={moduleSaving}
                              onAllow={(item) => void handleModuleOverride(item, true)}
                              onBlock={(item) => void handleModuleOverride(item, false)}
                              onRemove={(item) => void handleRemoveModuleOverride(item)}
                            />
                          ))
                        )}
                      </div>
                    </div>

                    <form
                      onSubmit={handleCustomLimitsSubmit}
                      className="rounded-[26px] border border-[#DDE5DF] bg-white p-5"
                    >
                      <h3 className="text-lg font-semibold tracking-[-0.025em] text-[#17211B]">
                        Limites Personalizados
                      </h3>

                      <p className="mt-1 text-sm leading-6 text-[#64736A]">
                        Preencha apenas os limites que devem sobrescrever o
                        plano. Campos vazios herdam o limite do plano.
                      </p>

                      <div className="mt-5 grid gap-4">
                        {[
                          ["maxCondominiums", "Condomínios"],
                          ["maxUnits", "Unidades"],
                          ["maxUsers", "Usuários"],
                          ["maxMonthlyTickets", "Chamados Mensais"],
                          ["maxProviders", "Fornecedores"],
                        ].map(([key, label]) => (
                          <div key={key}>
                            <label
                              htmlFor={`limit-${key}`}
                              className="mb-2 block text-sm font-semibold text-[#17211B]"
                            >
                              {label}
                            </label>

                            <input
                              id={`limit-${key}`}
                              type="number"
                              min="0"
                              value={customLimitValues[key as PlanLimitKey]}
                              onChange={(event) => {
                                setCustomLimitValues((current) => ({
                                  ...current,
                                  [key]: event.target.value,
                                }));
                                setError("");
                                setSuccess("");
                              }}
                              placeholder={`Herdar Do Plano (${formatLimit(
                                getPlanLimitFromPlan(selectedPlan, key as PlanLimitKey)
                              )})`}
                              className="h-11 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition placeholder:text-[#9AA7A0] focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                            />
                          </div>
                        ))}

                        <div>
                          <label
                            htmlFor="limitReason"
                            className="mb-2 block text-sm font-semibold text-[#17211B]"
                          >
                            Motivo
                          </label>

                          <textarea
                            id="limitReason"
                            value={limitReason}
                            onChange={(event) => {
                              setLimitReason(event.target.value);
                              setError("");
                              setSuccess("");
                            }}
                            rows={3}
                            placeholder="Ex.: Condição comercial negociada para implantação."
                            className="w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 py-3 text-sm font-semibold text-[#17211B] outline-none transition placeholder:text-[#9AA7A0] focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                          />
                        </div>
                      </div>

                      <div className="mt-5 flex flex-col gap-3 border-t border-[#DDE5DF] pt-5 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          disabled={limitSaving}
                          onClick={() => void handleRemoveCustomLimits()}
                          className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 py-3 text-sm font-semibold text-[#64736A] shadow-sm transition hover:border-red-300 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Remover personalizados
                        </button>

                        <button
                          type="submit"
                          disabled={limitSaving}
                          className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[#256D3C] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F5A32] disabled:cursor-not-allowed disabled:bg-[#9AA7A0]"
                        >
                          {limitSaving ? "Salvando..." : "Salvar limites"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </section>



            {/* =================================================
               REGRAS OPERACIONAIS
               ================================================= */}

            <section className="rounded-[30px] border border-[#DDE5DF] bg-white/92 p-6 shadow-[0_18px_55px_rgba(23,33,27,0.06)] backdrop-blur sm:p-8">
              <div className="mb-5">
                <h2 className="text-xl font-semibold tracking-[-0.025em] text-[#17211B]">
                  Impacto do status
                </h2>

                <p className="mt-1 text-sm leading-6 text-[#64736A]">
                  O status da administradora controla a operação da carteira.
                  Usuários podem continuar cadastrados, mas a operação depende
                  da administradora estar ativa.
                </p>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <OperationRule
                  active={administrator.status === "ACTIVE"}
                  title="Área administrativa"
                  description={
                    administrator.status === "ACTIVE"
                      ? "Usuários da administradora acessam o painel operacional da própria carteira."
                      : "O painel operacional fica bloqueado para usuários vinculados."
                  }
                />

                <OperationRule
                  active={administrator.status === "ACTIVE"}
                  title="Rotinas operacionais"
                  description={
                    administrator.status === "ACTIVE"
                      ? "Chamados, cadastros, dashboards e demais operações seguem liberados."
                      : "Chamados, cadastros, dashboards e demais operações ficam bloqueados."
                  }
                />

                <OperationRule
                  active
                  title="Painel EloGest"
                  description="A gestão global permanece disponível para o Super Admin."
                />
              </div>
            </section>



            {/* =================================================
               FORMULÁRIO DE EDIÇÃO
               ================================================= */}

            <section className="rounded-[30px] border border-[#DDE5DF] bg-white/92 p-6 shadow-[0_18px_55px_rgba(23,33,27,0.06)] backdrop-blur sm:p-8">
              <div className="mb-6">
                <h2 className="text-xl font-semibold tracking-[-0.025em] text-[#17211B]">
                  Dados principais
                </h2>

                <p className="mt-1 text-sm leading-6 text-[#64736A]">
                  Atualize os dados cadastrais e o status operacional da administradora.
                </p>
              </div>

              {error && (
                <div
                  className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
                  role="alert"
                >
                  {error}
                </div>
              )}

              {success && (
                <div
                  className="mb-6 rounded-2xl border border-[#CFE6D4] bg-[#EAF7EE] px-4 py-3 text-sm leading-6 text-[#256D3C]"
                  role="status"
                >
                  {success}
                </div>
              )}

              {willBlockOperation && administrator.status !== "INACTIVE" && (
                <div className="mb-6 rounded-2xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm leading-6 text-yellow-900">
                  Ao salvar como inativa, os usuários desta administradora
                  deixarão de acessar o dashboard administrativo e as APIs
                  operacionais da carteira serão bloqueadas.
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label
                      htmlFor="name"
                      className="mb-2 block text-sm font-semibold text-[#17211B]"
                    >
                      Nome da administradora
                    </label>

                    <input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(event) => {
                        setName(event.target.value);
                        setError("");
                        setSuccess("");
                      }}
                      className="h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm text-[#17211B] outline-none transition placeholder:text-[#9AA7A0] focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                      required
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="cnpj"
                      className="mb-2 block text-sm font-semibold text-[#17211B]"
                    >
                      CNPJ
                    </label>

                    <input
                      id="cnpj"
                      type="text"
                      value={cnpj}
                      onChange={(event) => {
                        setCnpj(event.target.value);
                        setError("");
                        setSuccess("");
                      }}
                      placeholder="Somente números"
                      className="h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm text-[#17211B] outline-none transition placeholder:text-[#9AA7A0] focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                    />

                    <p className="mt-2 text-xs leading-5 text-[#7A877F]">
                      Atual: {formatCnpj(administrator.cnpj)}
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="phone"
                      className="mb-2 block text-sm font-semibold text-[#17211B]"
                    >
                      Telefone
                    </label>

                    <input
                      id="phone"
                      type="text"
                      value={phone}
                      onChange={(event) => {
                        setPhone(event.target.value);
                        setError("");
                        setSuccess("");
                      }}
                      placeholder="Ex.: 1132048800"
                      className="h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm text-[#17211B] outline-none transition placeholder:text-[#9AA7A0] focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                    />

                    <p className="mt-2 text-xs leading-5 text-[#7A877F]">
                      Atual: {formatPhone(administrator.phone)}
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="email"
                      className="mb-2 block text-sm font-semibold text-[#17211B]"
                    >
                      E-mail institucional
                    </label>

                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        setError("");
                        setSuccess("");
                      }}
                      placeholder="contato@administradora.com.br"
                      className="h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm text-[#17211B] outline-none transition placeholder:text-[#9AA7A0] focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="status"
                      className="mb-2 block text-sm font-semibold text-[#17211B]"
                    >
                      Status
                    </label>

                    <select
                      id="status"
                      value={status}
                      onChange={(event) => {
                        setStatus(event.target.value as Status);
                        setError("");
                        setSuccess("");
                      }}
                      className="h-12 w-full rounded-2xl border border-[#DDE5DF] bg-[#F9FBFA] px-4 text-sm font-semibold text-[#17211B] outline-none transition focus:border-[#256D3C] focus:bg-white focus:ring-4 focus:ring-[#256D3C]/10"
                    >
                      <option value="ACTIVE">Ativa</option>
                      <option value="INACTIVE">Inativa</option>
                    </select>

                    <p className="mt-2 text-xs leading-5 text-[#7A877F]">
                      Inativar bloqueia o painel administrativo e as rotinas operacionais desta carteira.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
                  <Link
                    href="/elogest/administradoras"
                    className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-[#DDE5DF] bg-white px-5 py-3 text-sm font-semibold text-[#17211B] shadow-sm transition hover:border-[#256D3C] hover:text-[#256D3C]"
                  >
                    Cancelar
                  </Link>

                  <button
                    type="submit"
                    disabled={saving}
                    className={[
                      "inline-flex min-h-11 items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:bg-[#9AA7A0]",
                      willBlockOperation
                        ? "bg-yellow-700 hover:bg-yellow-800"
                        : "bg-[#256D3C] hover:bg-[#1F5A32]",
                    ].join(" ")}
                  >
                    {saving
                      ? "Salvando..."
                      : willBlockOperation
                        ? "Salvar e bloquear operação"
                        : "Salvar alterações"}
                  </button>
                </div>
              </form>
            </section>



            {/* =================================================
               USUÁRIOS E CONDOMÍNIOS
               ================================================= */}

            <section className="grid gap-6 xl:grid-cols-2">
              <div className="rounded-[30px] border border-[#DDE5DF] bg-white/92 p-6 shadow-[0_18px_55px_rgba(23,33,27,0.06)] backdrop-blur">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold tracking-[-0.025em] text-[#17211B]">
                      Usuários vinculados
                    </h2>

                    <p className="mt-1 text-sm leading-6 text-[#64736A]">
                      Usuários administrativos ligados a esta administradora.
                    </p>
                  </div>

                  <Link
                    href={`/elogest/administradoras/${administrator.id}/usuarios/novo`}
                    className="inline-flex w-fit min-h-10 items-center justify-center rounded-2xl bg-[#256D3C] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#1F5A32]"
                  >
                    Novo usuário
                  </Link>
                </div>

                <div className="mt-5 max-h-[420px] divide-y divide-[#EEF2EF] overflow-y-auto">
                  {administrator.users.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[#DDE5DF] bg-[#F7F9F8] px-4 py-8 text-center">
                      <p className="text-sm font-semibold text-[#17211B]">
                        Nenhum usuário vinculado.
                      </p>
                    </div>
                  ) : (
                    administrator.users.map((user) => (
                      <div key={user.id} className="py-4 first:pt-0 last:pb-0">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#17211B]">
                              {user.name}
                            </p>

                            <p className="mt-1 text-xs leading-5 text-[#64736A]">
                              {user.email}
                            </p>

                            <p className="mt-1 text-xs leading-5 text-[#7A877F]">
                              {roleLabel(user.role)} • Criado em {formatDate(user.createdAt)}
                            </p>
                          </div>

                          <span
                            className={[
                              "inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold",
                              user.isActive
                                ? "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]"
                                : "border-[#DDE5DF] bg-[#F7F9F8] text-[#64736A]",
                            ].join(" ")}
                          >
                            {user.isActive ? "Ativo" : "Inativo"}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-[30px] border border-[#DDE5DF] bg-white/92 p-6 shadow-[0_18px_55px_rgba(23,33,27,0.06)] backdrop-blur">
                <h2 className="text-xl font-semibold tracking-[-0.025em] text-[#17211B]">
                  Condomínios vinculados
                </h2>

                <p className="mt-1 text-sm leading-6 text-[#64736A]">
                  Condomínios cadastrados na carteira desta administradora.
                </p>

                <div className="mt-5 max-h-[420px] divide-y divide-[#EEF2EF] overflow-y-auto">
                  {administrator.condominiums.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[#DDE5DF] bg-[#F7F9F8] px-4 py-8 text-center">
                      <p className="text-sm font-semibold text-[#17211B]">
                        Nenhum condomínio vinculado.
                      </p>
                    </div>
                  ) : (
                    administrator.condominiums.map((condominium) => (
                      <div
                        key={condominium.id}
                        className="py-4 first:pt-0 last:pb-0"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#17211B]">
                              {condominium.name}
                            </p>

                            <p className="mt-1 text-xs leading-5 text-[#64736A]">
                              {[condominium.city, condominium.state]
                                .filter(Boolean)
                                .join(" / ") || "Localização não informada"}
                            </p>

                            <p className="mt-1 text-xs leading-5 text-[#7A877F]">
                              Criado em {formatDate(condominium.createdAt)}
                            </p>
                          </div>

                          <span
                            className={[
                              "inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold",
                              condominium.status === "ACTIVE"
                                ? "border-[#CFE6D4] bg-[#EAF7EE] text-[#256D3C]"
                                : "border-[#DDE5DF] bg-[#F7F9F8] text-[#64736A]",
                            ].join(" ")}
                          >
                            {statusLabel(condominium.status)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>



            {/* =================================================
               METADADOS
               ================================================= */}

            <section className="rounded-[26px] border border-[#DDE5DF] bg-[#F7F9F8] p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7A877F]">
                Informações do cadastro
              </p>

              <div className="mt-3 grid gap-3 text-sm text-[#64736A] md:grid-cols-2">
                <p>
                  Criada em:{" "}
                  <strong className="font-semibold text-[#17211B]">
                    {formatDate(administrator.createdAt)}
                  </strong>
                </p>

                <p>
                  Atualizada em:{" "}
                  <strong className="font-semibold text-[#17211B]">
                    {formatDate(administrator.updatedAt)}
                  </strong>
                </p>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </EloGestShell>
  );
}
