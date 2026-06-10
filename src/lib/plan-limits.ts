import {
  AdministratorPlanStatus,
  AdministratorProviderStatus,
  Status,
} from "@prisma/client";
import { db } from "@/lib/db";



/* =========================================================
   ELOGEST — ETAPA 47
   Planos, Módulos E Limites

   Arquivo central para validação comercial da plataforma.

   Responsabilidades:
   - Verificar se uma administradora tem acesso a um módulo.
   - Verificar limites por plano.
   - Aplicar overrides manuais por administradora.
   - Calcular uso atual da administradora.
   - Gerar mensagens amigáveis de bloqueio.

   Importante:
   - A segurança real deve ficar nas APIs.
   - A interface pode esconder botões/menus, mas a API deve bloquear.
   ========================================================= */



export const MODULE_SLUGS = {
  CHAMADOS: "chamados",
  CONDOMINIOS: "condominios",
  UNIDADES: "unidades",
  MORADORES: "moradores",
  USUARIOS: "usuarios",
  FORNECEDORES: "fornecedores",
  COMUNICADOS: "comunicados",
  REUNIOES_CONSELHO: "reunioes-conselho",
  ENQUETES: "enquetes",
  ASSEMBLEIAS: "assembleias",
  FINANCEIRO: "financeiro",
  RELATORIOS: "relatorios",
  WHATSAPP: "whatsapp",
  IA: "ia",
} as const;



export type ModuleSlug = (typeof MODULE_SLUGS)[keyof typeof MODULE_SLUGS];



export type AdministratorLimitKey =
  | "maxCondominiums"
  | "maxUnits"
  | "maxUsers"
  | "maxMonthlyTickets"
  | "maxProviders";



export type AdministratorUsage = {
  condominiums: number;
  units: number;
  users: number;
  monthlyTickets: number;
  providers: number;
};



export type EffectiveAdministratorLimits = {
  maxCondominiums: number | null;
  maxUnits: number | null;
  maxUsers: number | null;
  maxMonthlyTickets: number | null;
  maxProviders: number | null;
};



export type ModuleAccessResult = {
  allowed: boolean;
  moduleSlug: ModuleSlug | string;
  source:
    | "PLAN"
    | "OVERRIDE_ALLOW"
    | "OVERRIDE_BLOCK"
    | "NO_PLAN"
    | "PLAN_INACTIVE"
    | "ADMINISTRATOR_INACTIVE"
    | "MODULE_NOT_FOUND"
    | "PLAN_STATUS_BLOCKED";
  message: string;
};



export type LimitCheckResult = {
  allowed: boolean;
  limitKey: AdministratorLimitKey;
  currentUsage: number;
  limit: number | null;
  remaining: number | null;
  message: string;
};



export class PlanAccessError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(message: string, code = "PLAN_ACCESS_DENIED", statusCode = 403, details?: unknown) {
    super(message);
    this.name = "PlanAccessError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}



export class PlanLimitError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(message: string, code = "PLAN_LIMIT_REACHED", statusCode = 403, details?: unknown) {
    super(message);
    this.name = "PlanLimitError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}



/* =========================================================
   Labels E Mensagens
   ========================================================= */

export function getModuleLabel(moduleSlug: string) {
  const labels: Record<string, string> = {
    chamados: "Chamados",
    condominios: "Condomínios",
    unidades: "Unidades",
    moradores: "Moradores",
    usuarios: "Usuários",
    fornecedores: "Fornecedores",
    comunicados: "Comunicados",
    "reunioes-conselho": "Reuniões De Conselho",
    enquetes: "Enquetes",
    assembleias: "Assembleias",
    financeiro: "Financeiro",
    relatorios: "Relatórios",
    whatsapp: "WhatsApp",
    ia: "IA",
  };

  return labels[moduleSlug] ?? moduleSlug;
}



export function getLimitLabel(limitKey: AdministratorLimitKey) {
  const labels: Record<AdministratorLimitKey, string> = {
    maxCondominiums: "Condomínios",
    maxUnits: "Unidades",
    maxUsers: "Usuários",
    maxMonthlyTickets: "Chamados Mensais",
    maxProviders: "Fornecedores",
  };

  return labels[limitKey];
}



function getUsageKeyByLimitKey(limitKey: AdministratorLimitKey): keyof AdministratorUsage {
  const map: Record<AdministratorLimitKey, keyof AdministratorUsage> = {
    maxCondominiums: "condominiums",
    maxUnits: "units",
    maxUsers: "users",
    maxMonthlyTickets: "monthlyTickets",
    maxProviders: "providers",
  };

  return map[limitKey];
}



function isAllowedPlanStatus(planStatus: AdministratorPlanStatus) {
  const allowedStatuses: AdministratorPlanStatus[] = [
    AdministratorPlanStatus.ACTIVE,
    AdministratorPlanStatus.TRIALING,
    AdministratorPlanStatus.PAST_DUE,
  ];

  return allowedStatuses.includes(planStatus);
}



function isDateWindowActive(startsAt?: Date | null, expiresAt?: Date | null) {
  const now = new Date();

  if (startsAt && startsAt > now) {
    return false;
  }

  if (expiresAt && expiresAt < now) {
    return false;
  }

  return true;
}



function getCurrentMonthRange(referenceDate = new Date()) {
  const start = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    1,
    0,
    0,
    0,
    0,
  );

  const end = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth() + 1,
    1,
    0,
    0,
    0,
    0,
  );

  return {
    start,
    end,
  };
}



/* =========================================================
   Consulta Central Do Plano Da Administradora
   ========================================================= */

export async function getAdministratorPlanAccess(administratorId: string) {
  const administrator = await db.administrator.findUnique({
    where: {
      id: administratorId,
    },
    include: {
      plan: {
        include: {
          modules: {
            include: {
              module: true,
            },
          },
        },
      },
      moduleOverrides: {
        include: {
          module: true,
        },
      },
      limitOverride: true,
    },
  });

  if (!administrator) {
    throw new PlanAccessError(
      "Administradora não encontrada.",
      "ADMINISTRATOR_NOT_FOUND",
      404,
    );
  }

  return administrator;
}



/* =========================================================
   Limites Efetivos

   Regra:
   - Primeiro usa o limite específico da administradora, se existir.
   - Se não existir, usa o limite do plano.
   - Null representa ilimitado/customizado.
   ========================================================= */

export async function getEffectiveAdministratorLimits(
  administratorId: string,
): Promise<EffectiveAdministratorLimits> {
  const administrator = await getAdministratorPlanAccess(administratorId);

  const plan = administrator.plan;
  const override = administrator.limitOverride;

  return {
    maxCondominiums:
      override?.maxCondominiums ?? plan?.maxCondominiums ?? null,

    maxUnits:
      override?.maxUnits ?? plan?.maxUnits ?? null,

    maxUsers:
      override?.maxUsers ?? plan?.maxUsers ?? null,

    maxMonthlyTickets:
      override?.maxMonthlyTickets ?? plan?.maxMonthlyTickets ?? null,

    maxProviders:
      override?.maxProviders ?? plan?.maxProviders ?? null,
  };
}



/* =========================================================
   Uso Atual Da Administradora
   ========================================================= */

export async function getAdministratorUsage(
  administratorId: string,
): Promise<AdministratorUsage> {
  const { start, end } = getCurrentMonthRange();



  const [
    condominiums,
    units,
    monthlyTickets,
    providers,
    accessUsers,
    legacyUsers,
  ] = await Promise.all([
    db.condominium.count({
      where: {
        administratorId,
        status: Status.ACTIVE,
      },
    }),

    db.unit.count({
      where: {
        status: Status.ACTIVE,
        condominium: {
          administratorId,
          status: Status.ACTIVE,
        },
      },
    }),

    db.ticket.count({
      where: {
        openedAt: {
          gte: start,
          lt: end,
        },
        condominium: {
          administratorId,
        },
      },
    }),

    db.administratorProvider.count({
      where: {
        administratorId,
        status: {
          in: [
            AdministratorProviderStatus.IN_REVIEW,
            AdministratorProviderStatus.HOMOLOGATED,
            AdministratorProviderStatus.ACTIVE,
          ],
        },
      },
    }),

    db.userAccess.findMany({
      where: {
        isActive: true,
        OR: [
          {
            administratorId,
          },
          {
            condominium: {
              administratorId,
            },
          },
        ],
      },
      select: {
        userId: true,
      },
      distinct: ["userId"],
    }),

    db.user.findMany({
      where: {
        administratorId,
        isActive: true,
      },
      select: {
        id: true,
      },
    }),
  ]);



  const uniqueUserIds = new Set<string>();

  for (const user of accessUsers) {
    uniqueUserIds.add(user.userId);
  }

  for (const user of legacyUsers) {
    uniqueUserIds.add(user.id);
  }



  return {
    condominiums,
    units,
    users: uniqueUserIds.size,
    monthlyTickets,
    providers,
  };
}



/* =========================================================
   Acesso A Módulo
   ========================================================= */

export async function hasModuleAccess(params: {
  administratorId: string;
  moduleSlug: ModuleSlug | string;
}): Promise<ModuleAccessResult> {
  const { administratorId, moduleSlug } = params;

  const administrator = await getAdministratorPlanAccess(administratorId);

  if (administrator.status !== Status.ACTIVE) {
    return {
      allowed: false,
      moduleSlug,
      source: "ADMINISTRATOR_INACTIVE",
      message:
        "Esta administradora está inativa. O acesso aos módulos administrativos está bloqueado.",
    };
  }

  if (!isAllowedPlanStatus(administrator.planStatus)) {
    return {
      allowed: false,
      moduleSlug,
      source: "PLAN_STATUS_BLOCKED",
      message:
        "O plano desta administradora não está ativo. Para continuar, regularize ou atualize o plano.",
    };
  }

  if (!administrator.plan) {
    return {
      allowed: false,
      moduleSlug,
      source: "NO_PLAN",
      message:
        "Esta administradora ainda não possui um plano vinculado. Defina um plano antes de acessar este módulo.",
    };
  }

  if (administrator.plan.status !== Status.ACTIVE) {
    return {
      allowed: false,
      moduleSlug,
      source: "PLAN_INACTIVE",
      message:
        "O plano vinculado a esta administradora está inativo. Escolha outro plano ativo para continuar.",
    };
  }



  /* =========================================================
     1. Override Manual Da Administradora

     O override tem prioridade sobre o plano.
     - enabled true: libera manualmente.
     - enabled false: bloqueia manualmente.
     ========================================================= */

  const override = administrator.moduleOverrides.find((item) => {
    return (
      item.module.slug === moduleSlug &&
      item.module.status === Status.ACTIVE &&
      isDateWindowActive(item.startsAt, item.expiresAt)
    );
  });

  if (override) {
    if (override.enabled) {
      return {
        allowed: true,
        moduleSlug,
        source: "OVERRIDE_ALLOW",
        message: `O módulo ${getModuleLabel(moduleSlug)} foi liberado manualmente para esta administradora.`,
      };
    }

    return {
      allowed: false,
      moduleSlug,
      source: "OVERRIDE_BLOCK",
      message: `O módulo ${getModuleLabel(moduleSlug)} está bloqueado manualmente para esta administradora.`,
    };
  }



  /* =========================================================
     2. Regra Do Plano
     ========================================================= */

  const planModule = administrator.plan.modules.find((item) => {
    return (
      item.enabled === true &&
      item.module.slug === moduleSlug &&
      item.module.status === Status.ACTIVE
    );
  });

  if (!planModule) {
    return {
      allowed: false,
      moduleSlug,
      source: "MODULE_NOT_FOUND",
      message: `O módulo ${getModuleLabel(moduleSlug)} não está incluído no plano atual desta administradora.`,
    };
  }

  return {
    allowed: true,
    moduleSlug,
    source: "PLAN",
    message: `O módulo ${getModuleLabel(moduleSlug)} está liberado pelo plano atual.`,
  };
}



export async function requireModuleAccess(params: {
  administratorId: string;
  moduleSlug: ModuleSlug | string;
}) {
  const result = await hasModuleAccess(params);

  if (!result.allowed) {
    throw new PlanAccessError(
      result.message,
      "MODULE_ACCESS_DENIED",
      403,
      result,
    );
  }

  return result;
}



/* =========================================================
   Verificação De Limite
   ========================================================= */

export async function checkAdministratorLimit(params: {
  administratorId: string;
  limitKey: AdministratorLimitKey;
  increment?: number;
}): Promise<LimitCheckResult> {
  const { administratorId, limitKey, increment = 1 } = params;

  const [limits, usage] = await Promise.all([
    getEffectiveAdministratorLimits(administratorId),
    getAdministratorUsage(administratorId),
  ]);

  const usageKey = getUsageKeyByLimitKey(limitKey);
  const currentUsage = usage[usageKey];
  const limit = limits[limitKey];



  /* =========================================================
     Null significa limite ilimitado/customizado.
     ========================================================= */

  if (limit === null) {
    return {
      allowed: true,
      limitKey,
      currentUsage,
      limit,
      remaining: null,
      message: `${getLimitLabel(limitKey)} possui limite personalizado ou ilimitado neste plano.`,
    };
  }



  const nextUsage = currentUsage + increment;
  const remaining = Math.max(limit - currentUsage, 0);

  if (nextUsage > limit) {
    return {
      allowed: false,
      limitKey,
      currentUsage,
      limit,
      remaining,
      message: `O limite de ${getLimitLabel(limitKey)} do plano atual foi atingido. Uso atual: ${currentUsage} de ${limit}. Para continuar, solicite ampliação do plano.`,
    };
  }

  return {
    allowed: true,
    limitKey,
    currentUsage,
    limit,
    remaining: Math.max(limit - nextUsage, 0),
    message: `${getLimitLabel(limitKey)} dentro do limite do plano atual. Uso atual: ${currentUsage} de ${limit}.`,
  };
}



export async function requireAdministratorLimit(params: {
  administratorId: string;
  limitKey: AdministratorLimitKey;
  increment?: number;
}) {
  const result = await checkAdministratorLimit(params);

  if (!result.allowed) {
    throw new PlanLimitError(
      result.message,
      "PLAN_LIMIT_REACHED",
      403,
      result,
    );
  }

  return result;
}



/* =========================================================
   Atalhos Semânticos Para APIs
   ========================================================= */

export async function requireCanCreateCondominium(administratorId: string) {
  await requireModuleAccess({
    administratorId,
    moduleSlug: MODULE_SLUGS.CONDOMINIOS,
  });

  return requireAdministratorLimit({
    administratorId,
    limitKey: "maxCondominiums",
  });
}



export async function requireCanCreateUnit(administratorId: string) {
  await requireModuleAccess({
    administratorId,
    moduleSlug: MODULE_SLUGS.UNIDADES,
  });

  return requireAdministratorLimit({
    administratorId,
    limitKey: "maxUnits",
  });
}



export async function requireCanCreateUser(administratorId: string) {
  await requireModuleAccess({
    administratorId,
    moduleSlug: MODULE_SLUGS.USUARIOS,
  });

  return requireAdministratorLimit({
    administratorId,
    limitKey: "maxUsers",
  });
}



export async function requireCanCreateTicket(administratorId: string) {
  await requireModuleAccess({
    administratorId,
    moduleSlug: MODULE_SLUGS.CHAMADOS,
  });

  return requireAdministratorLimit({
    administratorId,
    limitKey: "maxMonthlyTickets",
  });
}



export async function requireCanCreateProvider(administratorId: string) {
  await requireModuleAccess({
    administratorId,
    moduleSlug: MODULE_SLUGS.FORNECEDORES,
  });

  return requireAdministratorLimit({
    administratorId,
    limitKey: "maxProviders",
  });
}



/* =========================================================
   ETAPA 49 — Reuniões De Conselho

   Acesso comercial ao módulo de Reuniões De Conselho.
   A criação/edição das reuniões deve continuar sendo protegida
   nas APIs administrativas por contexto ativo, administradora ativa
   e isolamento por carteira.

   Observação:
   - Este módulo usa a Sala De Reunião EloGest como base central.
   - A mesma base de sala poderá atender Assembleias futuramente.
   ========================================================= */

export async function requireCanAccessCouncilMeetings(administratorId: string) {
  return requireModuleAccess({
    administratorId,
    moduleSlug: MODULE_SLUGS.REUNIOES_CONSELHO,
  });
}



/* =========================================================
   ETAPA 50 — Enquetes

   Acesso comercial ao módulo de consultas rápidas.
   ========================================================= */

export async function requireCanAccessPolls(administratorId: string) {
  return requireModuleAccess({
    administratorId,
    moduleSlug: MODULE_SLUGS.ENQUETES,
  });
}



/* =========================================================
   ETAPA 51 — Assembleias E Votação Pelo Celular

   Acesso comercial ao módulo de deliberações formais.
   A segurança operacional permanece nas APIs administrativas
   e do portal, sempre isoladas pela administradora ativa.
   ========================================================= */

export async function requireCanAccessAssemblies(administratorId: string) {
  return requireModuleAccess({
    administratorId,
    moduleSlug: MODULE_SLUGS.ASSEMBLEIAS,
  });
}



/* =========================================================
   Helpers Para Respostas De API

   Uso sugerido nas rotas:
   catch (error) {
     if (isPlanAccessError(error) || isPlanLimitError(error)) {
       return NextResponse.json(
         { error: error.message, code: error.code, details: error.details },
         { status: error.statusCode }
       );
     }
   }
   ========================================================= */

export function isPlanAccessError(error: unknown): error is PlanAccessError {
  return error instanceof PlanAccessError;
}



export function isPlanLimitError(error: unknown): error is PlanLimitError {
  return error instanceof PlanLimitError;
}



export function getPlanErrorPayload(error: PlanAccessError | PlanLimitError) {
  return {
    error: error.message,
    code: error.code,
    details: error.details,
  };
}