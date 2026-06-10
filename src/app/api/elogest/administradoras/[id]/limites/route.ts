import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireEloGestSuperAdmin } from "@/lib/elogest-api-guard";
import {
  getAdministratorUsage,
  getEffectiveAdministratorLimits,
} from "@/lib/plan-limits";



/* =========================================================
   API ELOGEST - OVERRIDE DE LIMITES DA ADMINISTRADORA

   Rota:
   GET    /api/elogest/administradoras/[id]/limites
   PATCH  /api/elogest/administradoras/[id]/limites
   DELETE /api/elogest/administradoras/[id]/limites

   ETAPA 47 — PLANOS, MÓDULOS E LIMITES

   Objetivo:
   - Permitir que o Super Admin EloGest visualize limites efetivos,
     uso atual e override de limites da administradora.
   - Permitir ajuste manual dos limites comerciais por administradora.
   - Permitir remoção do override para voltar a usar os limites do plano.

   Regras:
   - Endpoint exclusivo para SUPER_ADMIN.
   - Null representa limite herdado do plano quando usado no override.
   - Null no plano representa limite personalizado/ilimitado.

   Correção técnica:
   - Normalização de limites passa a retornar somente:
     number | null | undefined.
   - Valores inválidos disparam erro controlado antes de chegar ao Prisma.
   - Evita erro TypeScript ao fazer upsert de campos Int? no Prisma.
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



type RequestBody = {
  maxCondominiums?: unknown;
  maxUnits?: unknown;
  maxUsers?: unknown;
  maxMonthlyTickets?: unknown;
  maxProviders?: unknown;
  reason?: unknown;
};



type NormalizedLimitValue = number | null | undefined;



class InvalidLimitValueError extends Error {
  constructor() {
    super("INVALID_LIMIT_VALUE");
    this.name = "InvalidLimitValueError";
  }
}



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



function normalizeNullableLimit(value: unknown): NormalizedLimitValue {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
    return null;
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new InvalidLimitValueError();
  }

  return Math.floor(numberValue);
}



async function getRouteId(context: RouteContext) {
  const params = await Promise.resolve(context.params);

  return params.id;
}



async function buildLimitsPayload(administratorId: string) {
  const administrator = await db.administrator.findUnique({
    where: {
      id: administratorId,
    },
    select: {
      id: true,
      name: true,
      status: true,
      planStatus: true,
      customLimitsEnabled: true,
      plan: {
        select: {
          id: true,
          name: true,
          slug: true,
          maxCondominiums: true,
          maxUnits: true,
          maxUsers: true,
          maxMonthlyTickets: true,
          maxProviders: true,
        },
      },
      limitOverride: true,
    },
  });

  if (!administrator) {
    return null;
  }

  const [effectiveLimits, usage] = await Promise.all([
    getEffectiveAdministratorLimits(administratorId),
    getAdministratorUsage(administratorId),
  ]);

  return {
    administrator,
    planLimits: administrator.plan
      ? {
          maxCondominiums: administrator.plan.maxCondominiums,
          maxUnits: administrator.plan.maxUnits,
          maxUsers: administrator.plan.maxUsers,
          maxMonthlyTickets: administrator.plan.maxMonthlyTickets,
          maxProviders: administrator.plan.maxProviders,
        }
      : null,
    override: administrator.limitOverride,
    effectiveLimits,
    usage,
  };
}



function buildInvalidLimitResponse() {
  return NextResponse.json(
    {
      error:
        "Os limites devem ser números inteiros positivos, zero ou vazio para herdar do plano.",
    },
    {
      status: 400,
    }
  );
}



/* =========================================================
   GET - CONSULTAR LIMITES
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

    const payload = await buildLimitsPayload(administratorId);

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
    console.error("Erro ao buscar limites da administradora:", error);

    return NextResponse.json(
      {
        error: "Não foi possível buscar os limites da administradora.",
      },
      {
        status: 500,
      }
    );
  }
}



/* =========================================================
   PATCH - CRIAR/ATUALIZAR OVERRIDE DE LIMITES
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

    const administrator = await db.administrator.findUnique({
      where: {
        id: administratorId,
      },
      select: {
        id: true,
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

    const body = (await request.json()) as RequestBody;

    let maxCondominiums: NormalizedLimitValue;
    let maxUnits: NormalizedLimitValue;
    let maxUsers: NormalizedLimitValue;
    let maxMonthlyTickets: NormalizedLimitValue;
    let maxProviders: NormalizedLimitValue;

    try {
      maxCondominiums = normalizeNullableLimit(body.maxCondominiums);
      maxUnits = normalizeNullableLimit(body.maxUnits);
      maxUsers = normalizeNullableLimit(body.maxUsers);
      maxMonthlyTickets = normalizeNullableLimit(body.maxMonthlyTickets);
      maxProviders = normalizeNullableLimit(body.maxProviders);
    } catch (error) {
      if (error instanceof InvalidLimitValueError) {
        return buildInvalidLimitResponse();
      }

      throw error;
    }

    const reason = cleanOptionalText(body.reason);

    await db.$transaction(async (tx) => {
      await tx.administrator.update({
        where: {
          id: administratorId,
        },
        data: {
          customLimitsEnabled: true,
        },
      });

      await tx.administratorLimitOverride.upsert({
        where: {
          administratorId,
        },
        update: {
          maxCondominiums,
          maxUnits,
          maxUsers,
          maxMonthlyTickets,
          maxProviders,
          reason,
        },
        create: {
          administratorId,
          maxCondominiums: maxCondominiums ?? null,
          maxUnits: maxUnits ?? null,
          maxUsers: maxUsers ?? null,
          maxMonthlyTickets: maxMonthlyTickets ?? null,
          maxProviders: maxProviders ?? null,
          reason,
        },
      });
    });

    const payload = await buildLimitsPayload(administratorId);

    return NextResponse.json({
      message: "Limites personalizados atualizados com sucesso.",
      ...payload,
    });
  } catch (error) {
    console.error("Erro ao salvar limites da administradora:", error);

    return NextResponse.json(
      {
        error: "Não foi possível salvar os limites personalizados.",
      },
      {
        status: 500,
      }
    );
  }
}



/* =========================================================
   DELETE - REMOVER OVERRIDE DE LIMITES
   ========================================================= */

export async function DELETE(_request: NextRequest, context: RouteContext) {
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

    await db.$transaction(async (tx) => {
      await tx.administratorLimitOverride.deleteMany({
        where: {
          administratorId,
        },
      });

      await tx.administrator.update({
        where: {
          id: administratorId,
        },
        data: {
          customLimitsEnabled: false,
        },
      });
    });

    const payload = await buildLimitsPayload(administratorId);

    return NextResponse.json({
      message:
        "Limites personalizados removidos. A administradora voltou a usar os limites do plano.",
      ...payload,
    });
  } catch (error) {
    console.error("Erro ao remover limites personalizados:", error);

    return NextResponse.json(
      {
        error: "Não foi possível remover os limites personalizados.",
      },
      {
        status: 500,
      }
    );
  }
}
