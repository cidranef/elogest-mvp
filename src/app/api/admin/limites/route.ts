import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActiveAdminApiAccess } from "@/lib/admin-api-guard";
import {
  getAdministratorUsage,
  getEffectiveAdministratorLimits,
} from "@/lib/plan-limits";



/* =========================================================
   API ADMIN - LIMITES DO PLANO

   Rota:
   GET /api/admin/limites

   ETAPA 47 — UX Comercial De Limite Atingido

   Objetivo:
   - Permitir que o front-end valide limites antes de abrir
     formulários de cadastro.
   - Retornar plano atual, uso, limites efetivos e próximo plano
     recomendado.
   - A segurança principal continua nas APIs de criação.
   ========================================================= */

export const dynamic = "force-dynamic";



const PLAN_ORDER = [
  "free",
  "essential",
  "professional",
  "premium",
  "enterprise",
];



function getRemaining(currentUsage: number, limit: number | null) {
  if (limit === null) {
    return null;
  }

  return Math.max(limit - currentUsage, 0);
}



function getReached(currentUsage: number, limit: number | null) {
  if (limit === null) {
    return false;
  }

  return currentUsage >= limit;
}



async function getNextPlan(currentPlanSlug?: string | null) {
  const plans = await db.plan.findMany({
    where: {
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
      slug: true,
      maxProviders: true,
      maxCondominiums: true,
      maxUnits: true,
      maxUsers: true,
      maxMonthlyTickets: true,
    },
  });

  const orderedPlans = plans.sort((a, b) => {
    const indexA = PLAN_ORDER.indexOf(a.slug);
    const indexB = PLAN_ORDER.indexOf(b.slug);

    return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
  });

  if (!currentPlanSlug) {
    return orderedPlans[0] || null;
  }

  const currentIndex = orderedPlans.findIndex((plan) => plan.slug === currentPlanSlug);

  if (currentIndex === -1) {
    return orderedPlans[0] || null;
  }

  return orderedPlans[currentIndex + 1] || null;
}



export async function GET() {
  try {
    const adminApiAccess = await requireActiveAdminApiAccess();

    if ("error" in adminApiAccess) {
      return adminApiAccess.error;
    }

    const { administratorId } = adminApiAccess;

    const [administrator, limits, usage] = await Promise.all([
      db.administrator.findUnique({
        where: {
          id: administratorId,
        },
        select: {
          id: true,
          name: true,
          planStatus: true,
          plan: {
            select: {
              id: true,
              name: true,
              slug: true,
              maxProviders: true,
              maxCondominiums: true,
              maxUnits: true,
              maxUsers: true,
              maxMonthlyTickets: true,
            },
          },
        },
      }),
      getEffectiveAdministratorLimits(administratorId),
      getAdministratorUsage(administratorId),
    ]);

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

    const nextPlan = await getNextPlan(administrator.plan?.slug);

    return NextResponse.json({
      administrator: {
        id: administrator.id,
        name: administrator.name,
        planStatus: administrator.planStatus,
      },
      plan: administrator.plan,
      nextPlan,
      usage,
      effectiveLimits: limits,
      limits: {
        providers: {
          currentUsage: usage.providers,
          limit: limits.maxProviders,
          remaining: getRemaining(usage.providers, limits.maxProviders),
          reached: getReached(usage.providers, limits.maxProviders),
        },
        condominiums: {
          currentUsage: usage.condominiums,
          limit: limits.maxCondominiums,
          remaining: getRemaining(usage.condominiums, limits.maxCondominiums),
          reached: getReached(usage.condominiums, limits.maxCondominiums),
        },
        units: {
          currentUsage: usage.units,
          limit: limits.maxUnits,
          remaining: getRemaining(usage.units, limits.maxUnits),
          reached: getReached(usage.units, limits.maxUnits),
        },
        users: {
          currentUsage: usage.users,
          limit: limits.maxUsers,
          remaining: getRemaining(usage.users, limits.maxUsers),
          reached: getReached(usage.users, limits.maxUsers),
        },
        monthlyTickets: {
          currentUsage: usage.monthlyTickets,
          limit: limits.maxMonthlyTickets,
          remaining: getRemaining(usage.monthlyTickets, limits.maxMonthlyTickets),
          reached: getReached(usage.monthlyTickets, limits.maxMonthlyTickets),
        },
      },
      canCreate: {
        providers: !getReached(usage.providers, limits.maxProviders),
        condominiums: !getReached(usage.condominiums, limits.maxCondominiums),
        units: !getReached(usage.units, limits.maxUnits),
        users: !getReached(usage.users, limits.maxUsers),
        monthlyTickets: !getReached(usage.monthlyTickets, limits.maxMonthlyTickets),
      },
    });
  } catch (error) {
    console.error("ERRO AO BUSCAR LIMITES DO PLANO:", error);

    return NextResponse.json(
      {
        error: "Não foi possível buscar os limites do plano.",
      },
      {
        status: 500,
      }
    );
  }
}
