import { NextRequest, NextResponse } from "next/server";
import {
  AdministratorPlanStatus,
  Prisma,
  Status,
} from "@prisma/client";
import { db } from "@/lib/db";
import { requireEloGestSuperAdmin } from "@/lib/elogest-api-guard";
import {
  getAdministratorUsage,
  getEffectiveAdministratorLimits,
} from "@/lib/plan-limits";



/* =========================================================
   API ELOGEST - DETALHE DA ADMINISTRADORA

   Rotas:
   GET   /api/elogest/administradoras/[id]
   PATCH /api/elogest/administradoras/[id]

   ETAPA 44 — SUPER ADMIN E MULTIADMINISTRADORA

   ETAPA 47 — PLANOS, MÓDULOS E LIMITES
   - GET passa a retornar plano atual, limites efetivos,
     uso atual, módulos liberados e overrides da administradora.
   - PATCH fica preparado para alteração de plano/status comercial
     quando a tela liberar essa ação.
   - Mantém endpoint exclusivo para SUPER_ADMIN.
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



type ModuleAccessView = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  allowed: boolean;
  source: "PLAN" | "OVERRIDE_ALLOW" | "OVERRIDE_BLOCK";
  reason: string | null;
  startsAt: Date | null;
  expiresAt: Date | null;
};



function normalizeText(value: unknown) {
  return String(value || "").trim();
}



function normalizeOptional(value: unknown) {
  const normalized = normalizeText(value);

  return normalized || null;
}



function onlyNumbers(value: unknown) {
  return String(value || "").replace(/\D/g, "");
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

  return fallback;
}



function normalizeDateOrNull(value: unknown) {
  const text = normalizeText(value);

  if (!text) {
    return null;
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}



function normalizeAdministratorPlanStatus(
  value: unknown
): AdministratorPlanStatus | null {
  const status = normalizeText(value).toUpperCase();

  if (
    status === AdministratorPlanStatus.ACTIVE ||
    status === AdministratorPlanStatus.TRIALING ||
    status === AdministratorPlanStatus.PAST_DUE ||
    status === AdministratorPlanStatus.SUSPENDED ||
    status === AdministratorPlanStatus.CANCELED ||
    status === AdministratorPlanStatus.EXPIRED
  ) {
    return status as AdministratorPlanStatus;
  }

  return null;
}



async function getRouteId(context: RouteContext) {
  const params = await Promise.resolve(context.params);

  return params.id;
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



function buildModuleAccessView(
  administrator: Prisma.AdministratorGetPayload<{
    select: ReturnType<typeof administratorDetailSelect>;
  }>
) {
  const modules = new Map<string, ModuleAccessView>();

  for (const planModule of administrator.plan?.modules || []) {
    if (!planModule.enabled || planModule.module.status !== Status.ACTIVE) {
      continue;
    }

    modules.set(planModule.module.slug, {
      id: planModule.module.id,
      slug: planModule.module.slug,
      name: planModule.module.name,
      description: planModule.module.description,
      allowed: true,
      source: "PLAN",
      reason: null,
      startsAt: null,
      expiresAt: null,
    });
  }

  for (const override of administrator.moduleOverrides) {
    if (
      override.module.status !== Status.ACTIVE ||
      !isDateWindowActive(override.startsAt, override.expiresAt)
    ) {
      continue;
    }

    modules.set(override.module.slug, {
      id: override.module.id,
      slug: override.module.slug,
      name: override.module.name,
      description: override.module.description,
      allowed: override.enabled,
      source: override.enabled ? "OVERRIDE_ALLOW" : "OVERRIDE_BLOCK",
      reason: override.reason,
      startsAt: override.startsAt,
      expiresAt: override.expiresAt,
    });
  }

  return Array.from(modules.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR")
  );
}



function administratorDetailSelect() {
  return {
    id: true,
    name: true,
    cnpj: true,
    email: true,
    phone: true,
    status: true,

    /* =====================================================
       ETAPA 47 - PLANO COMERCIAL
       ===================================================== */

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
          select: {
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
        },
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
            description: true,
            status: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    },

    createdAt: true,
    updatedAt: true,
    condominiums: {
      select: {
        id: true,
        name: true,
        city: true,
        state: true,
        status: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    },
    users: {
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: {
        name: "asc",
      },
    },
    _count: {
      select: {
        condominiums: true,
        users: true,
        administratorProviders: true,
      },
    },
  } as const;
}



async function getAdministratorDetail(id: string) {
  const administrator = await db.administrator.findUnique({
    where: {
      id,
    },
    select: administratorDetailSelect(),
  });

  if (!administrator) {
    return null;
  }

  const [limits, usage] = await Promise.all([
    getEffectiveAdministratorLimits(administrator.id),
    getAdministratorUsage(administrator.id),
  ]);

  const modules = buildModuleAccessView(administrator);

  return {
    ...administrator,
    commercial: {
      plan: administrator.plan,
      planId: administrator.planId,
      planStatus: administrator.planStatus,
      planStartedAt: administrator.planStartedAt,
      planExpiresAt: administrator.planExpiresAt,
      customLimitsEnabled: administrator.customLimitsEnabled,
      limits,
      usage,
      modules,
      limitOverride: administrator.limitOverride,
      moduleOverrides: administrator.moduleOverrides,
    },

    /* =====================================================
       Campos redundantes intencionais para facilitar o front.
       ===================================================== */

    limits,
    usage,
    modules,
  };
}



export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireEloGestSuperAdmin();

    if ("error" in auth) {
      return auth.error;
    }

    const id = await getRouteId(context);

    if (!id) {
      return NextResponse.json(
        {
          error: "Administradora não identificada.",
        },
        {
          status: 400,
        }
      );
    }

    const administrator = await getAdministratorDetail(id);

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

    return NextResponse.json({
      administrator,
    });
  } catch (error) {
    console.error("Erro ao buscar administradora:", error);

    return NextResponse.json(
      {
        error: "Não foi possível buscar a administradora.",
      },
      {
        status: 500,
      }
    );
  }
}



export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireEloGestSuperAdmin();

    if ("error" in auth) {
      return auth.error;
    }

    const id = await getRouteId(context);

    if (!id) {
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

    const name = normalizeText(body?.name);
    const cnpj = onlyNumbers(body?.cnpj) || null;
    const email = normalizeOptional(body?.email);
    const phone = onlyNumbers(body?.phone) || null;
    const status = normalizeText(body?.status);

    if (!name) {
      return NextResponse.json(
        {
          error: "Informe o nome da administradora.",
        },
        {
          status: 400,
        }
      );
    }

    if (cnpj && cnpj.length !== 14) {
      return NextResponse.json(
        {
          error: "Informe um CNPJ válido com 14 dígitos.",
        },
        {
          status: 400,
        }
      );
    }

    if (status !== Status.ACTIVE && status !== Status.INACTIVE) {
      return NextResponse.json(
        {
          error: "Status inválido.",
        },
        {
          status: 400,
        }
      );
    }

    const currentAdministrator = await db.administrator.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
      },
    });

    if (!currentAdministrator) {
      return NextResponse.json(
        {
          error: "Administradora não encontrada.",
        },
        {
          status: 404,
        }
      );
    }

    if (cnpj) {
      const duplicatedCnpj = await db.administrator.findFirst({
        where: {
          cnpj,
          NOT: {
            id,
          },
        },
        select: {
          id: true,
        },
      });

      if (duplicatedCnpj) {
        return NextResponse.json(
          {
            error: "Já existe outra administradora cadastrada com este CNPJ.",
          },
          {
            status: 409,
          }
        );
      }
    }

    const updateData: Prisma.AdministratorUncheckedUpdateInput = {
      name,
      cnpj,
      email,
      phone,
      status: status as Status,
    };



    /* =======================================================
       ETAPA 47 - ATUALIZAÇÃO COMERCIAL OPCIONAL

       A tela atual ainda pode não enviar estes campos. Quando não
       enviados, preservamos o plano/status comercial existentes.
       ======================================================= */

    if (body.planId !== undefined) {
      const planId = normalizeOptional(body.planId);

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

        if (!plan) {
          return NextResponse.json(
            {
              error: "Plano informado não encontrado.",
            },
            {
              status: 404,
            }
          );
        }

        if (plan.status !== Status.ACTIVE) {
          return NextResponse.json(
            {
              error: "Selecione um plano ativo para vincular à administradora.",
            },
            {
              status: 400,
            }
          );
        }
      }

      updateData.planId = planId;

      if (planId && body.planStartedAt === undefined) {
        updateData.planStartedAt = new Date();
      }
    }

    if (body.planStatus !== undefined) {
      const planStatus = normalizeAdministratorPlanStatus(body.planStatus);

      if (!planStatus) {
        return NextResponse.json(
          {
            error:
              "Status do plano inválido. Use ACTIVE, TRIALING, PAST_DUE, SUSPENDED, CANCELED ou EXPIRED.",
          },
          {
            status: 400,
          }
        );
      }

      updateData.planStatus = planStatus;
    }

    if (body.planStartedAt !== undefined) {
      updateData.planStartedAt = normalizeDateOrNull(body.planStartedAt);
    }

    if (body.planExpiresAt !== undefined) {
      updateData.planExpiresAt = normalizeDateOrNull(body.planExpiresAt);
    }

    if (body.customLimitsEnabled !== undefined) {
      updateData.customLimitsEnabled = normalizeBoolean(
        body.customLimitsEnabled,
        false
      );
    }

    await db.administrator.update({
      where: {
        id,
      },
      data: updateData,
    });

    const administrator = await getAdministratorDetail(id);

    return NextResponse.json({
      message: "Administradora atualizada com sucesso.",
      administrator,
    });
  } catch (error) {
    console.error("Erro ao atualizar administradora:", error);

    return NextResponse.json(
      {
        error: "Não foi possível atualizar a administradora.",
      },
      {
        status: 500,
      }
    );
  }
}
