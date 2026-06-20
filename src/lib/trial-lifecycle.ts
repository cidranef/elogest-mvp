import {
  AdministratorPlanStatus,
  Prisma,
  Status,
} from "@prisma/client";
import { db } from "@/lib/db";

/* =========================================================
   ELOGEST — ETAPA 56.10.6
   CICLO DE VIDA DO TRIAL

   Responsabilidades:
   - Detectar trial vencido.
   - Alterar TRIALING para EXPIRED.
   - Calcular dias restantes.
   - Permitir sincronização individual e em lote.
   - Manter a administradora cadastrada, bloqueando o plano.
   ========================================================= */

export const TRIAL_WARNING_DAYS = 3;

export type TrialLifecycleStatus =
  | "NOT_TRIAL"
  | "ACTIVE_TRIAL"
  | "EXPIRING_SOON"
  | "EXPIRED"
  | "INVALID_TRIAL";

function startOfUtcDay(date: Date) {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
}

export function getTrialDaysRemaining(
  expiresAt: Date | null | undefined,
  referenceDate = new Date(),
) {
  if (!expiresAt) {
    return null;
  }

  const currentDay = startOfUtcDay(referenceDate);
  const expirationDay = startOfUtcDay(expiresAt);
  const milliseconds = expirationDay.getTime() - currentDay.getTime();

  return Math.ceil(milliseconds / 86_400_000);
}

export function getTrialLifecycleStatus(params: {
  planStatus: AdministratorPlanStatus;
  planExpiresAt?: Date | null;
  referenceDate?: Date;
}): {
  status: TrialLifecycleStatus;
  daysRemaining: number | null;
  expired: boolean;
  expiringSoon: boolean;
} {
  const referenceDate = params.referenceDate ?? new Date();

  if (params.planStatus === AdministratorPlanStatus.EXPIRED) {
    return {
      status: "EXPIRED",
      daysRemaining: getTrialDaysRemaining(
        params.planExpiresAt,
        referenceDate,
      ),
      expired: true,
      expiringSoon: false,
    };
  }

  if (params.planStatus !== AdministratorPlanStatus.TRIALING) {
    return {
      status: "NOT_TRIAL",
      daysRemaining: null,
      expired: false,
      expiringSoon: false,
    };
  }

  if (!params.planExpiresAt) {
    return {
      status: "INVALID_TRIAL",
      daysRemaining: null,
      expired: false,
      expiringSoon: false,
    };
  }

  const daysRemaining = getTrialDaysRemaining(
    params.planExpiresAt,
    referenceDate,
  );

  if (params.planExpiresAt.getTime() <= referenceDate.getTime()) {
    return {
      status: "EXPIRED",
      daysRemaining,
      expired: true,
      expiringSoon: false,
    };
  }

  if (
    daysRemaining !== null &&
    daysRemaining >= 0 &&
    daysRemaining <= TRIAL_WARNING_DAYS
  ) {
    return {
      status: "EXPIRING_SOON",
      daysRemaining,
      expired: false,
      expiringSoon: true,
    };
  }

  return {
    status: "ACTIVE_TRIAL",
    daysRemaining,
    expired: false,
    expiringSoon: false,
  };
}

export async function synchronizeAdministratorTrial(
  administratorId: string,
  referenceDate = new Date(),
) {
  const administrator = await db.administrator.findUnique({
    where: { id: administratorId },
    select: {
      id: true,
      status: true,
      planStatus: true,
      planStartedAt: true,
      planExpiresAt: true,
      updatedAt: true,
    },
  });

  if (!administrator) {
    return null;
  }

  const lifecycle = getTrialLifecycleStatus({
    planStatus: administrator.planStatus,
    planExpiresAt: administrator.planExpiresAt,
    referenceDate,
  });

  if (
    administrator.planStatus === AdministratorPlanStatus.TRIALING &&
    lifecycle.expired
  ) {
    const updated = await db.administrator.update({
      where: {
        id: administrator.id,
      },
      data: {
        planStatus: AdministratorPlanStatus.EXPIRED,
      },
      select: {
        id: true,
        status: true,
        planStatus: true,
        planStartedAt: true,
        planExpiresAt: true,
        updatedAt: true,
      },
    });

    console.info("[EloGest][Trial] Trial expirado automaticamente", {
      administratorId: updated.id,
      planExpiresAt: updated.planExpiresAt?.toISOString() ?? null,
      expiredAt: referenceDate.toISOString(),
    });

    return {
      administrator: updated,
      lifecycle: getTrialLifecycleStatus({
        planStatus: updated.planStatus,
        planExpiresAt: updated.planExpiresAt,
        referenceDate,
      }),
      changed: true,
    };
  }

  return {
    administrator,
    lifecycle,
    changed: false,
  };
}

export async function expireDueTrials(referenceDate = new Date()) {
  const dueTrials = await db.administrator.findMany({
    where: {
      status: Status.ACTIVE,
      planStatus: AdministratorPlanStatus.TRIALING,
      planExpiresAt: {
        lte: referenceDate,
      },
    },
    select: {
      id: true,
      name: true,
      planExpiresAt: true,
    },
  });

  if (dueTrials.length === 0) {
    return {
      checkedAt: referenceDate,
      expiredCount: 0,
      administrators: [],
    };
  }

  const ids = dueTrials.map((administrator) => administrator.id);

  const updateResult = await db.administrator.updateMany({
    where: {
      id: {
        in: ids,
      },
      planStatus: AdministratorPlanStatus.TRIALING,
      planExpiresAt: {
        lte: referenceDate,
      },
    },
    data: {
      planStatus: AdministratorPlanStatus.EXPIRED,
    },
  });

  console.info("[EloGest][Trial] Expiração em lote concluída", {
    checkedAt: referenceDate.toISOString(),
    expiredCount: updateResult.count,
    administratorIds: ids,
  });

  return {
    checkedAt: referenceDate,
    expiredCount: updateResult.count,
    administrators: dueTrials,
  };
}

export async function getTrialSummary(referenceDate = new Date()) {
  const trials = await db.administrator.findMany({
    where: {
      status: Status.ACTIVE,
      planStatus: {
        in: [
          AdministratorPlanStatus.TRIALING,
          AdministratorPlanStatus.EXPIRED,
        ],
      },
    },
    select: {
      id: true,
      name: true,
      planStatus: true,
      planStartedAt: true,
      planExpiresAt: true,
      plan: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
    orderBy: [
      {
        planExpiresAt: "asc",
      },
      {
        name: "asc",
      },
    ],
  });

  return trials.map((administrator) => ({
    ...administrator,
    lifecycle: getTrialLifecycleStatus({
      planStatus: administrator.planStatus,
      planExpiresAt: administrator.planExpiresAt,
      referenceDate,
    }),
  }));
}

export async function activateAdministratorPlan(params: {
  administratorId: string;
  planId?: string | null;
  activatedAt?: Date;
}) {
  const activatedAt = params.activatedAt ?? new Date();

  return db.$transaction(async (tx) => {
    const administrator = await tx.administrator.findUnique({
      where: {
        id: params.administratorId,
      },
      select: {
        id: true,
        name: true,
        planId: true,
        planStatus: true,
        planExpiresAt: true,
      },
    });

    if (!administrator) {
      throw new Error("ADMINISTRATOR_NOT_FOUND");
    }

    let planId = params.planId || administrator.planId;

    if (!planId) {
      const freePlan = await tx.plan.findFirst({
        where: {
          slug: "free",
          status: Status.ACTIVE,
        },
        select: {
          id: true,
        },
      });

      if (!freePlan) {
        throw new Error("ACTIVE_PLAN_NOT_FOUND");
      }

      planId = freePlan.id;
    }

    const plan = await tx.plan.findUnique({
      where: {
        id: planId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!plan || plan.status !== Status.ACTIVE) {
      throw new Error("ACTIVE_PLAN_NOT_FOUND");
    }

    return tx.administrator.update({
      where: {
        id: administrator.id,
      },
      data: {
        planId,
        planStatus: AdministratorPlanStatus.ACTIVE,
        planStartedAt: activatedAt,
        planExpiresAt: null,
      },
      select: {
        id: true,
        name: true,
        status: true,
        planStatus: true,
        planStartedAt: true,
        planExpiresAt: true,
        plan: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });
  });
}
