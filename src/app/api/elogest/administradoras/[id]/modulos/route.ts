import { NextRequest, NextResponse } from "next/server";
import { Status } from "@prisma/client";
import { db } from "@/lib/db";
import { requireEloGestSuperAdmin } from "@/lib/elogest-api-guard";



/* =========================================================
   API ELOGEST - OVERRIDES DE MÓDULOS DA ADMINISTRADORA

   Rotas:
   GET    /api/elogest/administradoras/[id]/modulos
   PATCH  /api/elogest/administradoras/[id]/modulos
   DELETE /api/elogest/administradoras/[id]/modulos

   ETAPA 47 — PLANOS, MÓDULOS E LIMITES

   Objetivo:
   - Listar todos os módulos da plataforma para uma administradora.
   - Mostrar se o módulo está liberado pelo plano.
   - Mostrar se existe override manual da EloGest.
   - Permitir liberar/bloquear manualmente um módulo.
   - Permitir remover override e voltar à regra do plano.

   Correção:
   - Não usa include.planModules dentro de PlatformModule.
   - Os vínculos do plano são buscados diretamente em planModule.
   - Isso evita erro de TypeScript quando a relação no model
     PlatformModule não se chama planModules.
   - Evita variável local chamada "module", conforme regra do Next:
     @next/next/no-assign-module-variable.
   ========================================================= */

export const dynamic = "force-dynamic";



type RouteContext = {
  params:
    | Promise<{
        id: string;
      }>
    | {
        id: string;
      };
};



type RequestBody = Record<string, unknown>;



/* =========================================================
   HELPERS
   ========================================================= */

function cleanText(value: unknown) {
  return String(value || "").trim();
}



function cleanOptionalText(value: unknown) {
  const text = cleanText(value);

  return text || null;
}



function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "1", "yes", "sim", "s"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "no", "nao", "não", "n"].includes(normalized)) {
      return false;
    }
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  return null;
}



function normalizeOptionalDate(value: unknown) {
  const text = cleanText(value);

  if (!text) {
    return null;
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}



async function getRouteId(context: RouteContext) {
  const params = await Promise.resolve(context.params);

  return params.id;
}



async function getAdministratorOrResponse(administratorId: string) {
  if (!administratorId) {
    return {
      error: NextResponse.json(
        {
          error: "Administradora não identificada.",
        },
        {
          status: 400,
        }
      ),
    };
  }

  const administrator = await db.administrator.findUnique({
    where: {
      id: administratorId,
    },
    select: {
      id: true,
      name: true,
      status: true,
      planId: true,
      planStatus: true,
      planStartedAt: true,
      planExpiresAt: true,
      customLimitsEnabled: true,
      plan: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
        },
      },
    },
  });

  if (!administrator) {
    return {
      error: NextResponse.json(
        {
          error: "Administradora não encontrada.",
        },
        {
          status: 404,
        }
      ),
    };
  }

  return {
    administrator,
  };
}



async function getPlatformModuleByBody(body: RequestBody) {
  const moduleId = cleanText(body.moduleId);
  const moduleSlug = cleanText(body.moduleSlug || body.slug);

  if (!moduleId && !moduleSlug) {
    return null;
  }

  return db.platformModule.findFirst({
    where: {
      OR: [
        ...(moduleId
          ? [
              {
                id: moduleId,
              },
            ]
          : []),
        ...(moduleSlug
          ? [
              {
                slug: moduleSlug,
              },
            ]
          : []),
      ],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
    },
  });
}



function buildDateInput(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
    return null;
  }

  return normalizeOptionalDate(value);
}



/* =========================================================
   GET - LISTAR MÓDULOS E OVERRIDES
   ========================================================= */

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireEloGestSuperAdmin();

    if ("error" in auth) {
      return auth.error;
    }

    const administratorId = await getRouteId(context);

    const administratorResult = await getAdministratorOrResponse(administratorId);

    if ("error" in administratorResult) {
      return administratorResult.error;
    }

    const { administrator } = administratorResult;



    /* =======================================================
       BUSCAS SEPARADAS

       Não usamos include.planModules em PlatformModule porque o nome
       da relação pode ser diferente no schema. Consultar planModule
       diretamente é mais seguro e deixa o TypeScript estável.
       ======================================================= */

    const [platformModules, planModules, overrides] = await Promise.all([
      db.platformModule.findMany({
        where: {
          status: Status.ACTIVE,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: {
          name: "asc",
        },
      }),

      administrator.planId
        ? db.planModule.findMany({
            where: {
              planId: administrator.planId,
            },
            select: {
              id: true,
              planId: true,
              moduleId: true,
              enabled: true,
            },
          })
        : Promise.resolve([]),

      db.administratorModuleOverride.findMany({
        where: {
          administratorId: administrator.id,
        },
        select: {
          id: true,
          administratorId: true,
          moduleId: true,
          enabled: true,
          reason: true,
          startsAt: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true,
          module: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      }),
    ]);

    const planModuleByModuleId = new Map(
      planModules.map((planModule) => [planModule.moduleId, planModule])
    );

    const overrideByModuleId = new Map(
      overrides.map((override) => [override.moduleId, override])
    );

    const items = platformModules.map((platformModule) => {
      const planModule = planModuleByModuleId.get(platformModule.id);
      const override = overrideByModuleId.get(platformModule.id);

      const enabledByPlan = !!planModule?.enabled;
      const hasOverride = !!override;
      const enabledEffective = hasOverride ? !!override?.enabled : enabledByPlan;

      return {
        id: platformModule.id,
        moduleId: platformModule.id,
        name: platformModule.name,
        slug: platformModule.slug,
        description: platformModule.description,
        status: platformModule.status,

        plan: administrator.plan
          ? {
              id: administrator.plan.id,
              name: administrator.plan.name,
              slug: administrator.plan.slug,
              status: administrator.plan.status,
            }
          : null,

        enabledByPlan,
        hasOverride,
        enabledByOverride: override?.enabled ?? null,
        enabledEffective,
        source: hasOverride
          ? override?.enabled
            ? "OVERRIDE_ALLOW"
            : "OVERRIDE_BLOCK"
          : enabledByPlan
            ? "PLAN"
            : "NOT_INCLUDED",

        override: override
          ? {
              id: override.id,
              enabled: override.enabled,
              reason: override.reason,
              startsAt: override.startsAt,
              expiresAt: override.expiresAt,
              createdAt: override.createdAt,
              updatedAt: override.updatedAt,
            }
          : null,
      };
    });

    return NextResponse.json({
      administrator: {
        id: administrator.id,
        name: administrator.name,
        status: administrator.status,
        planStatus: administrator.planStatus,
        planStartedAt: administrator.planStartedAt,
        planExpiresAt: administrator.planExpiresAt,
        customLimitsEnabled: administrator.customLimitsEnabled,
        plan: administrator.plan,
      },
      items,
      totals: {
        total: items.length,
        enabledByPlan: items.filter((item) => item.enabledByPlan).length,
        enabledEffective: items.filter((item) => item.enabledEffective).length,
        overrides: items.filter((item) => item.hasOverride).length,
        manualAllows: items.filter((item) => item.source === "OVERRIDE_ALLOW").length,
        manualBlocks: items.filter((item) => item.source === "OVERRIDE_BLOCK").length,
      },
    });
  } catch (error) {
    console.error("Erro ao listar módulos da administradora:", error);

    return NextResponse.json(
      {
        error: "Não foi possível listar os módulos da administradora.",
      },
      {
        status: 500,
      }
    );
  }
}



/* =========================================================
   PATCH - CRIAR/ATUALIZAR OVERRIDE DE MÓDULO
   ========================================================= */

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireEloGestSuperAdmin();

    if ("error" in auth) {
      return auth.error;
    }

    const administratorId = await getRouteId(context);

    const administratorResult = await getAdministratorOrResponse(administratorId);

    if ("error" in administratorResult) {
      return administratorResult.error;
    }

    const { administrator } = administratorResult;
    const body = (await request.json()) as RequestBody;

    const platformModule = await getPlatformModuleByBody(body);

    if (!platformModule) {
      return NextResponse.json(
        {
          error: "Módulo não encontrado ou não informado.",
        },
        {
          status: 400,
        }
      );
    }

    const enabled = normalizeBoolean(body.enabled);

    if (enabled === null) {
      return NextResponse.json(
        {
          error: "Informe se o módulo deve ser liberado ou bloqueado.",
        },
        {
          status: 400,
        }
      );
    }

    const startsAt = buildDateInput(body.startsAt);
    const expiresAt = buildDateInput(body.expiresAt);

    if (body.startsAt !== undefined && body.startsAt !== null && body.startsAt !== "" && !startsAt) {
      return NextResponse.json(
        {
          error: "Data de início inválida.",
        },
        {
          status: 400,
        }
      );
    }

    if (body.expiresAt !== undefined && body.expiresAt !== null && body.expiresAt !== "" && !expiresAt) {
      return NextResponse.json(
        {
          error: "Data de expiração inválida.",
        },
        {
          status: 400,
        }
      );
    }

    if (startsAt && expiresAt && expiresAt < startsAt) {
      return NextResponse.json(
        {
          error: "A data de expiração não pode ser anterior à data de início.",
        },
        {
          status: 400,
        }
      );
    }

    const override = await db.administratorModuleOverride.upsert({
      where: {
        administratorId_moduleId: {
          administratorId: administrator.id,
          moduleId: platformModule.id,
        },
      },
      update: {
        enabled,
        reason: cleanOptionalText(body.reason),
        startsAt,
        expiresAt,
      },
      create: {
        administratorId: administrator.id,
        moduleId: platformModule.id,
        enabled,
        reason: cleanOptionalText(body.reason),
        startsAt: startsAt ?? null,
        expiresAt: expiresAt ?? null,
      },
      include: {
        module: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
          },
        },
      },
    });

    return NextResponse.json({
      message: enabled
        ? "Módulo liberado manualmente para a administradora."
        : "Módulo bloqueado manualmente para a administradora.",
      override,
    });
  } catch (error) {
    console.error("Erro ao atualizar override de módulo:", error);

    return NextResponse.json(
      {
        error: "Não foi possível atualizar o módulo da administradora.",
      },
      {
        status: 500,
      }
    );
  }
}



/* =========================================================
   DELETE - REMOVER OVERRIDE DE MÓDULO
   ========================================================= */

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireEloGestSuperAdmin();

    if ("error" in auth) {
      return auth.error;
    }

    const administratorId = await getRouteId(context);

    const administratorResult = await getAdministratorOrResponse(administratorId);

    if ("error" in administratorResult) {
      return administratorResult.error;
    }

    const { administrator } = administratorResult;
    const url = new URL(request.url);

    const moduleId = cleanText(url.searchParams.get("moduleId"));
    const moduleSlug = cleanText(url.searchParams.get("moduleSlug") || url.searchParams.get("slug"));

    if (!moduleId && !moduleSlug) {
      return NextResponse.json(
        {
          error: "Informe o módulo para remover o override.",
        },
        {
          status: 400,
        }
      );
    }

    const platformModule = await db.platformModule.findFirst({
      where: {
        OR: [
          ...(moduleId
            ? [
                {
                  id: moduleId,
                },
              ]
            : []),
          ...(moduleSlug
            ? [
                {
                  slug: moduleSlug,
                },
              ]
            : []),
        ],
      },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });

    if (!platformModule) {
      return NextResponse.json(
        {
          error: "Módulo não encontrado.",
        },
        {
          status: 404,
        }
      );
    }

    const existingOverride = await db.administratorModuleOverride.findUnique({
      where: {
        administratorId_moduleId: {
          administratorId: administrator.id,
          moduleId: platformModule.id,
        },
      },
      select: {
        id: true,
      },
    });

    if (!existingOverride) {
      return NextResponse.json({
        message: "Nenhum override encontrado para este módulo.",
        removed: false,
      });
    }

    await db.administratorModuleOverride.delete({
      where: {
        id: existingOverride.id,
      },
    });

    return NextResponse.json({
      message: "Override removido. O módulo volta a seguir a regra do plano.",
      removed: true,
      module: {
        id: platformModule.id,
        name: platformModule.name,
        slug: platformModule.slug,
      },
    });
  } catch (error) {
    console.error("Erro ao remover override de módulo:", error);

    return NextResponse.json(
      {
        error: "Não foi possível remover o override do módulo.",
      },
      {
        status: 500,
      }
    );
  }
}
