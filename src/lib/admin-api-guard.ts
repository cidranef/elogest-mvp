import {
  AdministratorPlanStatus,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getAuthUser, isAuthError } from "@/lib/auth-guard";
import {
  canUseAdminAreaAccess,
  getActiveUserAccessFromCookies,
  type ActiveUserAccess,
} from "@/lib/user-access";

export type AdminApiGuardUser = {
  id: string;
  role?: string | null;
  name?: string | null;
  email?: string | null;
};

export type AdminApiAccessOptions = {
  allowSuspendedSubscription?: boolean;
};

export type ActiveAdminApiAccess = {
  authUser: AdminApiGuardUser;
  activeAccess: ActiveUserAccess;
  administratorId: string;
  administrator: {
    id: string;
    name: string;
    status: string;
    planStatus: AdministratorPlanStatus;
  };
};

export type AdminModuleApiAccess = ActiveAdminApiAccess & {
  module: {
    slug: string;
    enabled: boolean;
    source: "PLAN" | "OVERRIDE";
  };
};

export type AdminApiGuardResult =
  | ActiveAdminApiAccess
  | {
      error: NextResponse;
    };

export type AdminModuleApiGuardResult =
  | AdminModuleApiAccess
  | {
      error: NextResponse;
    };

type AdministratorModuleAccessInfo = {
  hasAccess: boolean;
  source: "PLAN" | "OVERRIDE" | "NONE";
  moduleSlug: string;
};

function unauthorizedResponse() {
  return NextResponse.json(
    {
      error: "Usuário não autenticado.",
    },
    {
      status: 401,
    },
  );
}

function forbiddenResponse(
  message = "Acesso restrito à administradora.",
) {
  return NextResponse.json(
    {
      error: message,
    },
    {
      status: 403,
    },
  );
}

function inactiveAdministratorResponse() {
  return NextResponse.json(
    {
      error:
        "A administradora vinculada a este perfil está inativa. O acesso às rotinas administrativas foi bloqueado.",
      code: "ADMINISTRATOR_INACTIVE",
    },
    {
      status: 403,
    },
  );
}

function suspendedSubscriptionResponse() {
  return NextResponse.json(
    {
      error:
        "A assinatura está suspensa. Regularize as cobranças em Minha Assinatura para restabelecer os módulos operacionais.",
      code: "SUBSCRIPTION_SUSPENDED",
      subscriptionAreaAvailable: true,
      href: "/admin/assinatura",
    },
    {
      status: 403,
    },
  );
}

function moduleNotAvailableResponse(
  moduleName = "este módulo",
) {
  return NextResponse.json(
    {
      error: `O módulo ${moduleName} não está liberado para o plano atual da administradora.`,
      code: "MODULE_NOT_AVAILABLE",
      upgradeAvailable: true,
    },
    {
      status: 403,
    },
  );
}

function isDateWindowActive({
  startsAt,
  expiresAt,
  now,
}: {
  startsAt?: Date | null;
  expiresAt?: Date | null;
  now: Date;
}) {
  if (startsAt && startsAt > now) {
    return false;
  }

  if (expiresAt && expiresAt < now) {
    return false;
  }

  return true;
}

async function getAdministratorModuleAccess({
  administratorId,
  moduleSlug,
}: {
  administratorId: string;
  moduleSlug: string;
}): Promise<AdministratorModuleAccessInfo> {
  const normalizedModuleSlug = String(moduleSlug || "")
    .trim()
    .toLowerCase();

  if (!normalizedModuleSlug) {
    return {
      hasAccess: false,
      source: "NONE",
      moduleSlug: normalizedModuleSlug,
    };
  }

  const now = new Date();

  const administrator = await db.administrator.findUnique({
    where: {
      id: administratorId,
    },
    select: {
      id: true,
      planId: true,
      plan: {
        select: {
          id: true,
          status: true,
          modules: {
            where: {
              enabled: true,
              module: {
                slug: normalizedModuleSlug,
                status: "ACTIVE",
              },
            },
            select: {
              id: true,
              enabled: true,
              module: {
                select: {
                  id: true,
                  slug: true,
                  status: true,
                },
              },
            },
          },
        },
      },
      moduleOverrides: {
        where: {
          module: {
            slug: normalizedModuleSlug,
            status: "ACTIVE",
          },
        },
        select: {
          id: true,
          enabled: true,
          startsAt: true,
          expiresAt: true,
          module: {
            select: {
              id: true,
              slug: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!administrator) {
    return {
      hasAccess: false,
      source: "NONE",
      moduleSlug: normalizedModuleSlug,
    };
  }

  const activeOverride =
    administrator.moduleOverrides.find((override) =>
      isDateWindowActive({
        startsAt: override.startsAt,
        expiresAt: override.expiresAt,
        now,
      }),
    );

  if (activeOverride) {
    return {
      hasAccess: activeOverride.enabled === true,
      source: "OVERRIDE",
      moduleSlug: normalizedModuleSlug,
    };
  }

  const planHasEnabledModule =
    administrator.plan?.status === "ACTIVE" &&
    administrator.plan.modules.some(
      (planModule) =>
        planModule.enabled === true &&
        planModule.module.slug ===
          normalizedModuleSlug &&
        planModule.module.status === "ACTIVE",
    );

  return {
    hasAccess: planHasEnabledModule,
    source: planHasEnabledModule ? "PLAN" : "NONE",
    moduleSlug: normalizedModuleSlug,
  };
}

export async function requireActiveAdminApiAccess(
  options: AdminApiAccessOptions = {},
): Promise<AdminApiGuardResult> {
  try {
    const authUser =
      (await getAuthUser()) as AdminApiGuardUser;

    const activeAccess =
      await getActiveUserAccessFromCookies({
        userId: authUser.id,
      });

    if (!activeAccess) {
      return {
        error: forbiddenResponse(
          "Não foi possível identificar o perfil administrativo ativo.",
        ),
      };
    }

    if (!canUseAdminAreaAccess(activeAccess)) {
      return {
        error: forbiddenResponse(
          "Acesso restrito à área administrativa da administradora.",
        ),
      };
    }

    const administratorId =
      activeAccess.administratorId || null;

    if (!administratorId) {
      return {
        error: forbiddenResponse(
          "Perfil administrativo sem administradora vinculada.",
        ),
      };
    }

    const administrator =
      await db.administrator.findUnique({
        where: {
          id: administratorId,
        },
        select: {
          id: true,
          name: true,
          status: true,
          planStatus: true,
        },
      });

    if (!administrator) {
      return {
        error: forbiddenResponse(
          "Administradora vinculada ao perfil não foi encontrada.",
        ),
      };
    }

    if (administrator.status !== "ACTIVE") {
      return {
        error: inactiveAdministratorResponse(),
      };
    }

    if (
      administrator.planStatus ===
        AdministratorPlanStatus.SUSPENDED &&
      options.allowSuspendedSubscription !== true
    ) {
      return {
        error: suspendedSubscriptionResponse(),
      };
    }

    return {
      authUser,
      activeAccess,
      administratorId,
      administrator,
    };
  } catch (error) {
    if (isAuthError(error)) {
      return {
        error: unauthorizedResponse(),
      };
    }

    console.error(
      "Erro ao validar acesso administrativo:",
      error,
    );

    return {
      error: NextResponse.json(
        {
          error:
            "Não foi possível validar o acesso administrativo.",
        },
        {
          status: 500,
        },
      ),
    };
  }
}

export async function requireAdminModuleApiAccess(
  moduleSlug: string,
  moduleName = "solicitado",
): Promise<AdminModuleApiGuardResult> {
  const auth = await requireActiveAdminApiAccess();

  if ("error" in auth) {
    return auth;
  }

  try {
    const moduleAccess =
      await getAdministratorModuleAccess({
        administratorId: auth.administratorId,
        moduleSlug,
      });

    if (!moduleAccess.hasAccess) {
      return {
        error:
          moduleNotAvailableResponse(moduleName),
      };
    }

    return {
      ...auth,
      module: {
        slug: moduleAccess.moduleSlug,
        enabled: true,
        source:
          moduleAccess.source === "OVERRIDE"
            ? "OVERRIDE"
            : "PLAN",
      },
    };
  } catch (error) {
    console.error(
      "Erro ao validar módulo administrativo:",
      error,
    );

    return {
      error: NextResponse.json(
        {
          error:
            "Não foi possível validar o módulo da administradora.",
        },
        {
          status: 500,
        },
      ),
    };
  }
}

export async function requireAnnouncementsAdminApiAccess(): Promise<AdminModuleApiGuardResult> {
  return requireAdminModuleApiAccess(
    "comunicados",
    "Comunicados",
  );
}

export async function requireFinancialAdminApiAccess(): Promise<AdminModuleApiGuardResult> {
  return requireAdminModuleApiAccess(
    "financeiro",
    "Financeiro",
  );
}

export function getAdminApiAdministratorId(
  auth: ActiveAdminApiAccess,
) {
  return auth.administratorId;
}

export function assertSameAdministratorScope(
  auth: ActiveAdminApiAccess,
  administratorId?: string | null,
) {
  return (
    !!administratorId &&
    administratorId === auth.administratorId
  );
}

export function adminScopeForbiddenResponse() {
  return forbiddenResponse(
    "Acesso negado para dados de outra administradora.",
  );
}
