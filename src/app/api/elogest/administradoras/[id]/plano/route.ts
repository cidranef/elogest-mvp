import { NextRequest, NextResponse } from "next/server";
import {
  AdministratorPlanStatus,
  Status,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireEloGestSuperAdmin } from "@/lib/elogest-api-guard";
import {
  getAdministratorUsage,
  getEffectiveAdministratorLimits,
} from "@/lib/plan-limits";



/* =========================================================
   API ELOGEST - PLANO DA ADMINISTRADORA

   Rota:
   GET   /api/elogest/administradoras/[id]/plano
   PATCH /api/elogest/administradoras/[id]/plano

   ETAPA 47 — PLANOS, MÓDULOS E LIMITES

   Objetivo:
   - Consultar o plano comercial atual da administradora.
   - Listar planos disponíveis para seleção pelo Super Admin.
   - Alterar plano da administradora.
   - Alterar status comercial do plano.
   - Atualizar datas de início e expiração do plano.
   - Retornar uso atual, limites efetivos e módulos liberados.

   Segurança:
   - Endpoint exclusivo para SUPER_ADMIN EloGest.
   - A administradora operacional não altera o próprio plano.
   - A validação real de limites permanece centralizada em
     src/lib/plan-limits.ts e nas APIs operacionais.

   Observação:
   - Overrides de módulos e limites personalizados ficam preparados
     no retorno, mas a edição detalhada deve ser feita em bloco futuro.
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



function normalizeOptionalText(value: unknown) {
  const text = cleanText(value);

  return text || null;
}



function normalizeBoolean(value: unknown, fallback: boolean) {
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

  return fallback;
}



function normalizeOptionalDate(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return "INVALID_DATE" as const;
  }

  return date;
}



function normalizePlanStatus(value: unknown) {
  const status = cleanText(value).toUpperCase();

  const validStatuses: AdministratorPlanStatus[] = [
    AdministratorPlanStatus.ACTIVE,
    AdministratorPlanStatus.TRIALING,
    AdministratorPlanStatus.PAST_DUE,
    AdministratorPlanStatus.SUSPENDED,
    AdministratorPlanStatus.CANCELED,
  ];

  const matchedStatus = validStatuses.find((item) => item === status);

  return matchedStatus || null;
}



async function getRouteId(context: RouteContext) {
  const params = await Promise.resolve(context.params);

  return params.id;
}



async function getAdministratorPlanPayload(administratorId: string) {
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
          description: true,
          status: true,
          monthlyPriceCents: true,
          annualPriceCents: true,
          maxCondominiums: true,
          maxUnits: true,
          maxUsers: true,
          maxMonthlyTickets: true,
          maxProviders: true,
          modules: {
            where: {
              enabled: true,
              module: {
                status: Status.ACTIVE,
              },
            },
            select: {
              id: true,
              enabled: true,
              module: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  description: true,
                  status: true,
                },
              },
            },
            orderBy: {
              module: {
                name: "asc",
              },
            },
          },
        },
      },
      moduleOverrides: {
        select: {
          id: true,
          enabled: true,
          reason: true,
          startsAt: true,
          expiresAt: true,
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
      },
      limitOverride: {
        select: {
          id: true,
          maxCondominiums: true,
          maxUnits: true,
          maxUsers: true,
          maxMonthlyTickets: true,
          maxProviders: true,
          reason: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!administrator) {
    return null;
  }

  const [effectiveLimits, usage, availablePlans] = await Promise.all([
    getEffectiveAdministratorLimits(administrator.id),
    getAdministratorUsage(administrator.id),
    db.plan.findMany({
      where: {
        status: Status.ACTIVE,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        status: true,
        monthlyPriceCents: true,
        annualPriceCents: true,
        maxCondominiums: true,
        maxUnits: true,
        maxUsers: true,
        maxMonthlyTickets: true,
        maxProviders: true,
        modules: {
          where: {
            enabled: true,
            module: {
              status: Status.ACTIVE,
            },
          },
          select: {
            id: true,
            enabled: true,
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
            module: {
              name: "asc",
            },
          },
        },
      },
      orderBy: [
        {
          monthlyPriceCents: "asc",
        },
        {
          name: "asc",
        },
      ],
    }),
  ]);

  return {
    administrator,
    plan: administrator.plan,
    effectiveLimits,
    usage,
    availablePlans,
  };
}



/* =========================================================
   GET - CONSULTAR PLANO DA ADMINISTRADORA
   ========================================================= */

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireEloGestSuperAdmin();

    if ("error" in auth) {
      return auth.error;
    }

    const administratorId = await getRouteId(context);

    if (!administratorId) {
      return NextResponse.json(
        {
          error: "Administradora não identificada.",
        },
        {
          status: 400,
        }
      );
    }

    const payload = await getAdministratorPlanPayload(administratorId);

    if (!payload) {
      return NextResponse.json(
        {
          error: "Administradora não encontrada.",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Erro ao consultar plano da administradora:", error);

    return NextResponse.json(
      {
        error: "Não foi possível consultar o plano da administradora.",
      },
      {
        status: 500,
      }
    );
  }
}



/* =========================================================
   PATCH - ALTERAR PLANO DA ADMINISTRADORA
   ========================================================= */

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireEloGestSuperAdmin();

    if ("error" in auth) {
      return auth.error;
    }

    const administratorId = await getRouteId(context);

    if (!administratorId) {
      return NextResponse.json(
        {
          error: "Administradora não identificada.",
        },
        {
          status: 400,
        }
      );
    }

    const body = (await request.json()) as RequestBody;

    const planId = normalizeOptionalText(body.planId);
    const planSlug = normalizeOptionalText(body.planSlug);
    const requestedPlanStatus = body.planStatus !== undefined
      ? normalizePlanStatus(body.planStatus)
      : null;
    const planStartedAt = body.planStartedAt !== undefined
      ? normalizeOptionalDate(body.planStartedAt)
      : undefined;
    const planExpiresAt = body.planExpiresAt !== undefined
      ? normalizeOptionalDate(body.planExpiresAt)
      : undefined;
    const customLimitsEnabled = body.customLimitsEnabled !== undefined
      ? normalizeBoolean(body.customLimitsEnabled, false)
      : undefined;

    if (body.planStatus !== undefined && !requestedPlanStatus) {
      return NextResponse.json(
        {
          error:
            "Status do plano inválido. Use ACTIVE, TRIALING, PAST_DUE, SUSPENDED ou CANCELED.",
        },
        {
          status: 400,
        }
      );
    }

    if (planStartedAt === "INVALID_DATE") {
      return NextResponse.json(
        {
          error: "Data de início do plano inválida.",
        },
        {
          status: 400,
        }
      );
    }

    if (planExpiresAt === "INVALID_DATE") {
      return NextResponse.json(
        {
          error: "Data de expiração do plano inválida.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      planStartedAt instanceof Date &&
      planExpiresAt instanceof Date &&
      planExpiresAt < planStartedAt
    ) {
      return NextResponse.json(
        {
          error: "A data de expiração não pode ser anterior à data de início.",
        },
        {
          status: 400,
        }
      );
    }

    const administrator = await db.administrator.findUnique({
      where: {
        id: administratorId,
      },
      select: {
        id: true,
        planId: true,
      },
    });

    if (!administrator) {
      return NextResponse.json(
        {
          error: "Administradora não encontrada.",
        },
        {
          status: 404,
        }
      );
    }

    let nextPlanId = planId || administrator.planId;

    if (planSlug) {
      const plan = await db.plan.findUnique({
        where: {
          slug: planSlug,
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (!plan || plan.status !== Status.ACTIVE) {
        return NextResponse.json(
          {
            error: "Plano informado não encontrado ou inativo.",
          },
          {
            status: 404,
          }
        );
      }

      nextPlanId = plan.id;
    }

    if (planId) {
      const plan = await db.plan.findUnique({
        where: {
          id: planId,
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (!plan || plan.status !== Status.ACTIVE) {
        return NextResponse.json(
          {
            error: "Plano informado não encontrado ou inativo.",
          },
          {
            status: 404,
          }
        );
      }
    }

    if (!nextPlanId) {
      return NextResponse.json(
        {
          error: "Informe um plano ativo para a administradora.",
        },
        {
          status: 400,
        }
      );
    }

    const planChanged = nextPlanId !== administrator.planId;

    await db.administrator.update({
      where: {
        id: administrator.id,
      },
      data: {
        planId: nextPlanId,
        ...(requestedPlanStatus
          ? {
              planStatus: requestedPlanStatus,
            }
          : {}),
        ...(planStartedAt !== undefined
          ? {
              planStartedAt,
            }
          : planChanged
            ? {
                planStartedAt: new Date(),
              }
            : {}),
        ...(planExpiresAt !== undefined
          ? {
              planExpiresAt,
            }
          : {}),
        ...(customLimitsEnabled !== undefined
          ? {
              customLimitsEnabled,
            }
          : {}),
      },
    });

    const payload = await getAdministratorPlanPayload(administrator.id);

    return NextResponse.json({
      message: "Plano da administradora atualizado com sucesso.",
      ...payload,
    });
  } catch (error) {
    console.error("Erro ao atualizar plano da administradora:", error);

    return NextResponse.json(
      {
        error: "Não foi possível atualizar o plano da administradora.",
      },
      {
        status: 500,
      }
    );
  }
}
