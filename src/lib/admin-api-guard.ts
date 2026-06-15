import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser, isAuthError } from "@/lib/auth-guard";
import {
  canUseAdminAreaAccess,
  getActiveUserAccessFromCookies,
  type ActiveUserAccess,
} from "@/lib/user-access";



/* =========================================================
   ADMIN API GUARD - ELOGEST

   Arquivo:
   src/lib/admin-api-guard.ts

   ETAPA 44 — SUPER ADMIN E MULTIADMINISTRADORA

   Objetivo:
   - Centralizar a proteção das APIs administrativas:
     /api/admin/*
   - Garantir que a área administrativa seja usada apenas por
     perfil ativo ADMINISTRADORA.
   - Bloquear chamadas diretas às APIs quando a administradora
     vinculada estiver INACTIVE.
   - Evitar que o layout /admin seja a única camada de segurança.

   Regra estratégica:
   - SUPER_ADMIN opera em /elogest e /api/elogest/*.
   - ADMINISTRADORA opera em /admin e /api/admin/*,
     somente se a administradora estiver ACTIVE.
   - Perfis de portal operam em /portal e /api/portal/*.

   ETAPA 48 — COMUNICADOS E CONFIRMAÇÃO DE LEITURA

   Atualização:
   - Adicionado helper central para validar módulos comerciais
     da administradora pelo plano e por overrides.
   - Adicionado guard específico para o módulo Comunicados.
   - A regra de plano/módulo fica centralizada aqui, evitando
     duplicação nas rotas /api/admin/comunicados/*.

   Uso recomendado nas rotas /api/admin/*:

   const auth = await requireActiveAdminApiAccess();

   if ("error" in auth) {
     return auth.error;
   }

   const { activeAccess, administratorId } = auth;

   Depois disso, usar administratorId nos filtros Prisma.

   Uso recomendado nas rotas /api/admin/comunicados/*:

   const auth = await requireAdminModuleApiAccess("comunicados");

   if ("error" in auth) {
     return auth.error;
   }

   const { administratorId } = auth;

   ETAPA 53 — FINANCEIRO INICIAL

   Atualização:
   - Adicionado guard específico para o módulo Financeiro.
   - As rotas /api/admin/financeiro/* devem exigir módulo comercial
     Financeiro liberado, além do perfil administrativo ativo.
   ========================================================= */



/* =========================================================
   TIPOS
   ========================================================= */

export type AdminApiGuardUser = {
  id: string;
  role?: string | null;
  name?: string | null;
  email?: string | null;
};



export type ActiveAdminApiAccess = {
  authUser: AdminApiGuardUser;
  activeAccess: ActiveUserAccess;
  administratorId: string;
  administrator: {
    id: string;
    name: string;
    status: string;
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



/* =========================================================
   RESPOSTAS PADRÃO
   ========================================================= */

function unauthorizedResponse() {
  return NextResponse.json(
    {
      error: "Usuário não autenticado.",
    },
    {
      status: 401,
    }
  );
}



function forbiddenResponse(message = "Acesso restrito à administradora.") {
  return NextResponse.json(
    {
      error: message,
    },
    {
      status: 403,
    }
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
    }
  );
}



function moduleNotAvailableResponse(moduleName = "este módulo") {
  return NextResponse.json(
    {
      error: `O módulo ${moduleName} não está liberado para o plano atual da administradora.`,
      code: "MODULE_NOT_AVAILABLE",
      upgradeAvailable: true,
    },
    {
      status: 403,
    }
  );
}



/* =========================================================
   HELPERS INTERNOS - MÓDULOS COMERCIAIS

   Regra consolidada:
   1. Override ativo da administradora tem prioridade.
      - enabled true libera.
      - enabled false bloqueia.
   2. Sem override válido, usa módulos do plano.
   3. Módulo precisa estar ACTIVE.
   4. Vínculo PlanModule precisa estar enabled.
   ========================================================= */

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
  const normalizedModuleSlug = String(moduleSlug || "").trim().toLowerCase();

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

  const activeOverride = administrator.moduleOverrides.find((override) =>
    isDateWindowActive({
      startsAt: override.startsAt,
      expiresAt: override.expiresAt,
      now,
    })
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
        planModule.module.slug === normalizedModuleSlug &&
        planModule.module.status === "ACTIVE"
    );

  return {
    hasAccess: planHasEnabledModule,
    source: planHasEnabledModule ? "PLAN" : "NONE",
    moduleSlug: normalizedModuleSlug,
  };
}



/* =========================================================
   GUARD PRINCIPAL DAS APIs ADMINISTRATIVAS
   ========================================================= */

export async function requireActiveAdminApiAccess(): Promise<AdminApiGuardResult> {
  try {
    const authUser = (await getAuthUser()) as AdminApiGuardUser;

    const activeAccess = await getActiveUserAccessFromCookies({
      userId: authUser.id,
    });

    /*
       Correção importante para TypeScript e segurança:
       primeiro validamos explicitamente se activeAccess existe.
       Assim, depois desta condição, o TypeScript entende que
       activeAccess não é mais null.
    */
    if (!activeAccess) {
      return {
        error: forbiddenResponse(
          "Não foi possível identificar o perfil administrativo ativo."
        ),
      };
    }

    /*
       /api/admin/* é área da administradora cliente.

       SUPER_ADMIN não deve operar por aqui.
       A visão global e as rotas globais pertencem a /api/elogest/*.
    */
    if (!canUseAdminAreaAccess(activeAccess)) {
      return {
        error: forbiddenResponse(
          "Acesso restrito à área administrativa da administradora."
        ),
      };
    }

    const administratorId = activeAccess.administratorId || null;

    if (!administratorId) {
      return {
        error: forbiddenResponse(
          "Perfil administrativo sem administradora vinculada."
        ),
      };
    }

    /*
       ETAPA 44 — BLOQUEIO POR STATUS DA ADMINISTRADORA

       Mesmo que o usuário e o UserAccess estejam ativos, a administradora
       cliente pode ter sido inativada pelo Super Admin EloGest.

       Neste caso, as APIs /api/admin/* também devem bloquear.
    */
    const administrator = await db.administrator.findUnique({
      where: {
        id: administratorId,
      },
      select: {
        id: true,
        name: true,
        status: true,
      },
    });

    if (!administrator) {
      return {
        error: forbiddenResponse(
          "Administradora vinculada ao perfil não foi encontrada."
        ),
      };
    }

    if (administrator.status !== "ACTIVE") {
      return {
        error: inactiveAdministratorResponse(),
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

    console.error("Erro ao validar acesso administrativo:", error);

    return {
      error: NextResponse.json(
        {
          error: "Não foi possível validar o acesso administrativo.",
        },
        {
          status: 500,
        }
      ),
    };
  }
}



/* =========================================================
   GUARD DE MÓDULO ADMINISTRATIVO

   Use este helper quando uma rota /api/admin/* depender
   de um módulo comercial específico do plano.

   Exemplo:
   const auth = await requireAdminModuleApiAccess("comunicados");
   ========================================================= */

export async function requireAdminModuleApiAccess(
  moduleSlug: string,
  moduleName = "solicitado"
): Promise<AdminModuleApiGuardResult> {
  const auth = await requireActiveAdminApiAccess();

  if ("error" in auth) {
    return auth;
  }

  try {
    const moduleAccess = await getAdministratorModuleAccess({
      administratorId: auth.administratorId,
      moduleSlug,
    });

    if (!moduleAccess.hasAccess) {
      return {
        error: moduleNotAvailableResponse(moduleName),
      };
    }

    return {
      ...auth,
      module: {
        slug: moduleAccess.moduleSlug,
        enabled: true,
        source: moduleAccess.source === "OVERRIDE" ? "OVERRIDE" : "PLAN",
      },
    };
  } catch (error) {
    console.error("Erro ao validar módulo administrativo:", error);

    return {
      error: NextResponse.json(
        {
          error: "Não foi possível validar o módulo da administradora.",
        },
        {
          status: 500,
        }
      ),
    };
  }
}



/* =========================================================
   GUARD ESPECÍFICO - COMUNICADOS

   Etapa 48:
   Centraliza a validação do módulo Comunicados.
   ========================================================= */

export async function requireAnnouncementsAdminApiAccess(): Promise<AdminModuleApiGuardResult> {
  return requireAdminModuleApiAccess("comunicados", "Comunicados");
}



/* =========================================================
   GUARD ESPECÍFICO - FINANCEIRO

   Etapa 53:
   Centraliza a validação do módulo Financeiro.
   Todas as rotas /api/admin/financeiro/* devem usar este helper.
   ========================================================= */

export async function requireFinancialAdminApiAccess(): Promise<AdminModuleApiGuardResult> {
  return requireAdminModuleApiAccess("financeiro", "Financeiro");
}



/* =========================================================
   HELPERS COMPLEMENTARES

   Usar quando a rota já executou requireActiveAdminApiAccess()
   e precisa comparar escopo de carteira com segurança.
   ========================================================= */

export function getAdminApiAdministratorId(auth: ActiveAdminApiAccess) {
  return auth.administratorId;
}



export function assertSameAdministratorScope(
  auth: ActiveAdminApiAccess,
  administratorId?: string | null
) {
  return !!administratorId && administratorId === auth.administratorId;
}



export function adminScopeForbiddenResponse() {
  return forbiddenResponse(
    "Acesso negado para dados de outra administradora."
  );
}
