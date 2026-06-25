import {
  AdministratorPlanStatus,
  Prisma,
  Status,
  SubscriptionBillingInterval,
  SubscriptionEventType,
} from "@prisma/client";

import { db } from "@/lib/db";

import {
  InvalidSubscriptionOperationError,
  SubscriptionNotFoundError,
} from "./subscription-errors";
import { changeSubscriptionPlan } from "./subscription-service";

const OPEN_STATUSES: AdministratorPlanStatus[] = [
  AdministratorPlanStatus.TRIALING,
  AdministratorPlanStatus.ACTIVE,
  AdministratorPlanStatus.PAST_DUE,
  AdministratorPlanStatus.SUSPENDED,
];

type PlanLimitKey =
  | "maxCondominiums"
  | "maxUsers"
  | "maxProviders";

type PlanUsage = {
  condominiums: number;
  users: number;
  providers: number;
};

type LimitViolation = {
  key: PlanLimitKey;
  label: string;
  used: number;
  limit: number;
};

function ensureReason(reason: string | null | undefined) {
  const normalized = reason?.trim();

  if (!normalized) {
    throw new InvalidSubscriptionOperationError(
      "Informe o motivo da operação.",
    );
  }

  return normalized;
}

async function getSubscriptionOrThrow(
  tx: Prisma.TransactionClient,
  subscriptionId: string,
) {
  const subscription = await tx.administratorSubscription.findUnique({
    where: { id: subscriptionId },
    select: {
      id: true,
      administratorId: true,
      planId: true,
      status: true,
      billingInterval: true,
      currentPeriodEnd: true,
      cancelAtPeriodEnd: true,
      cancellationScheduledAt: true,
      canceledAt: true,
      endedAt: true,
      isComplimentary: true,
    },
  });

  if (!subscription) {
    throw new SubscriptionNotFoundError(subscriptionId);
  }

  return subscription;
}

const COMMERCIAL_PLAN_RANK: Record<string, number> = {
  free: 0,
  essencial: 1,
  profissional: 2,
  premium: 3,
  enterprise: 4,
};

function normalizePlanSlug(value: string) {
  return value.trim().toLowerCase();
}

function hasLowerLimit(
  currentLimit: number | null,
  newLimit: number | null,
) {
  if (currentLimit === null) {
    return newLimit !== null;
  }

  if (newLimit === null) {
    return false;
  }

  return newLimit < currentLimit;
}

function determineIsDowngrade(input: {
  currentPlan: {
    slug: string;
    sortOrder: number;
    monthlyPriceCents: number | null;
    maxCondominiums: number | null;
    maxUsers: number | null;
    maxProviders: number | null;
  };
  newPlan: {
    slug: string;
    sortOrder: number;
    monthlyPriceCents: number | null;
    maxCondominiums: number | null;
    maxUsers: number | null;
    maxProviders: number | null;
  };
}) {
  const currentRank =
    COMMERCIAL_PLAN_RANK[
      normalizePlanSlug(input.currentPlan.slug)
    ];
  const newRank =
    COMMERCIAL_PLAN_RANK[
      normalizePlanSlug(input.newPlan.slug)
    ];

  if (currentRank !== undefined && newRank !== undefined) {
    return newRank < currentRank;
  }

  const hasReducedCapacity =
    hasLowerLimit(
      input.currentPlan.maxCondominiums,
      input.newPlan.maxCondominiums,
    ) ||
    hasLowerLimit(
      input.currentPlan.maxUsers,
      input.newPlan.maxUsers,
    ) ||
    hasLowerLimit(
      input.currentPlan.maxProviders,
      input.newPlan.maxProviders,
    );

  if (hasReducedCapacity) {
    return true;
  }

  if (
    input.currentPlan.monthlyPriceCents !== null &&
    input.newPlan.monthlyPriceCents !== null &&
    input.newPlan.monthlyPriceCents <
      input.currentPlan.monthlyPriceCents
  ) {
    return true;
  }

  return false;
}

export async function getSubscriptionPlanChangeAssessment(params: {
  subscriptionId: string;
  newPlanId: string;
}) {
  const subscription = await db.administratorSubscription.findUnique({
    where: { id: params.subscriptionId },
    select: {
      id: true,
      administratorId: true,
      planId: true,
      plan: {
        select: {
          id: true,
          name: true,
          slug: true,
          sortOrder: true,
          monthlyPriceCents: true,
          annualPriceCents: true,
          maxCondominiums: true,
          maxUsers: true,
          maxProviders: true,
        },
      },
    },
  });

  if (!subscription) {
    throw new SubscriptionNotFoundError(params.subscriptionId);
  }

  const newPlan = await db.plan.findUnique({
    where: { id: params.newPlanId },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      sortOrder: true,
      monthlyPriceCents: true,
      annualPriceCents: true,
      maxCondominiums: true,
      maxUsers: true,
      maxProviders: true,
    },
  });

  if (!newPlan || newPlan.status !== Status.ACTIVE) {
    throw new InvalidSubscriptionOperationError(
      "O plano de destino não está disponível.",
    );
  }

  const [condominiums, users, providers] = await Promise.all([
    db.condominium.count({
      where: {
        administratorId: subscription.administratorId,
      },
    }),
    db.user.count({
      where: {
        administratorId: subscription.administratorId,
      },
    }),
    db.administratorProvider.count({
      where: {
        administratorId: subscription.administratorId,
      },
    }),
  ]);

  const usage: PlanUsage = {
    condominiums,
    users,
    providers,
  };

  const violations: LimitViolation[] = [];

  const checks: Array<{
    key: PlanLimitKey;
    label: string;
    used: number;
    limit: number | null;
  }> = [
    {
      key: "maxCondominiums",
      label: "Condomínios",
      used: usage.condominiums,
      limit: newPlan.maxCondominiums,
    },
    {
      key: "maxUsers",
      label: "Usuários",
      used: usage.users,
      limit: newPlan.maxUsers,
    },
    {
      key: "maxProviders",
      label: "Fornecedores",
      used: usage.providers,
      limit: newPlan.maxProviders,
    },
  ];

  for (const check of checks) {
    if (check.limit !== null && check.used > check.limit) {
      violations.push({
        key: check.key,
        label: check.label,
        used: check.used,
        limit: check.limit,
      });
    }
  }

  const isDowngrade = determineIsDowngrade({
    currentPlan: subscription.plan,
    newPlan,
  });

  return {
    subscriptionId: subscription.id,
    currentPlan: subscription.plan,
    newPlan,
    usage,
    violations,
    allowed: violations.length === 0,
    isDowngrade,
  };
}

export async function changeSubscriptionPlanWithValidation(params: {
  subscriptionId: string;
  newPlanId: string;
  billingInterval?: SubscriptionBillingInterval;
  basePriceCents?: number | null;
  discountCents?: number | null;
  nextBillingAt?: Date | null;
  reason?: string | null;
  updatedByUserId?: string | null;
}) {
  const reason = ensureReason(params.reason);
  const assessment = await getSubscriptionPlanChangeAssessment({
    subscriptionId: params.subscriptionId,
    newPlanId: params.newPlanId,
  });

  if (!assessment.allowed) {
    const details = assessment.violations
      .map(
        (violation) =>
          `${violation.label}: ${violation.used} em uso para limite ${violation.limit}`,
      )
      .join("; ");

    throw new InvalidSubscriptionOperationError(
      `O plano de destino não comporta o uso atual. ${details}.`,
    );
  }

  const subscription = await changeSubscriptionPlan({
    subscriptionId: params.subscriptionId,
    newPlanId: params.newPlanId,
    billingInterval: params.billingInterval,
    basePriceCents: params.basePriceCents ?? undefined,
    discountCents: params.discountCents ?? undefined,
    nextBillingAt: params.nextBillingAt ?? undefined,
    reason,
    updatedByUserId: params.updatedByUserId ?? undefined,
  });

  return {
    subscription,
    assessment,
  };
}

export async function scheduleSubscriptionCancellation(params: {
  subscriptionId: string;
  reason?: string | null;
  updatedByUserId?: string | null;
}) {
  const reason = ensureReason(params.reason);

  return db.$transaction(async (tx) => {
    const subscription = await getSubscriptionOrThrow(
      tx,
      params.subscriptionId,
    );

    if (!OPEN_STATUSES.includes(subscription.status)) {
      throw new InvalidSubscriptionOperationError(
        "Somente assinaturas abertas podem ter cancelamento agendado.",
      );
    }

    if (!subscription.currentPeriodEnd) {
      throw new InvalidSubscriptionOperationError(
        "Defina o final do ciclo atual antes de agendar o cancelamento.",
      );
    }

    if (subscription.cancelAtPeriodEnd) {
      throw new InvalidSubscriptionOperationError(
        "O cancelamento ao final do ciclo já está agendado.",
      );
    }

    const now = new Date();

    const updated = await tx.administratorSubscription.update({
      where: { id: subscription.id },
      data: {
        cancelAtPeriodEnd: true,
        cancellationScheduledAt: now,
        cancellationReason: reason,
        updatedByUserId: params.updatedByUserId ?? null,
      },
    });

    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: subscription.id,
        type: SubscriptionEventType.CANCELLATION_SCHEDULED,
        description: reason,
        createdByUserId: params.updatedByUserId ?? null,
        metadata: {
          currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
        },
      },
    });

    return updated;
  });
}

export async function reverseScheduledCancellation(params: {
  subscriptionId: string;
  reason?: string | null;
  updatedByUserId?: string | null;
}) {
  const reason = ensureReason(params.reason);

  return db.$transaction(async (tx) => {
    const subscription = await getSubscriptionOrThrow(
      tx,
      params.subscriptionId,
    );

    if (!subscription.cancelAtPeriodEnd) {
      throw new InvalidSubscriptionOperationError(
        "A assinatura não possui cancelamento agendado.",
      );
    }

    const updated = await tx.administratorSubscription.update({
      where: { id: subscription.id },
      data: {
        cancelAtPeriodEnd: false,
        cancellationScheduledAt: null,
        cancellationReason: null,
        updatedByUserId: params.updatedByUserId ?? null,
      },
    });

    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: subscription.id,
        type: SubscriptionEventType.CANCELLATION_REVERSED,
        description: reason,
        createdByUserId: params.updatedByUserId ?? null,
      },
    });

    return updated;
  });
}

export async function cancelSubscriptionImmediately(params: {
  subscriptionId: string;
  reason?: string | null;
  updatedByUserId?: string | null;
}) {
  const reason = ensureReason(params.reason);

  return db.$transaction(async (tx) => {
    const subscription = await getSubscriptionOrThrow(
      tx,
      params.subscriptionId,
    );

    if (!OPEN_STATUSES.includes(subscription.status)) {
      throw new InvalidSubscriptionOperationError(
        "A assinatura já está encerrada.",
      );
    }

    const now = new Date();

    const updated = await tx.administratorSubscription.update({
      where: { id: subscription.id },
      data: {
        status: AdministratorPlanStatus.CANCELED,
        cancelAtPeriodEnd: false,
        cancellationScheduledAt: null,
        cancellationReason: reason,
        canceledAt: now,
        endedAt: now,
        nextBillingAt: null,
        updatedByUserId: params.updatedByUserId ?? null,
      },
    });

    await tx.administrator.update({
      where: { id: subscription.administratorId },
      data: {
        planStatus: AdministratorPlanStatus.CANCELED,
        planExpiresAt: now,
      },
    });

    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: subscription.id,
        type: SubscriptionEventType.CANCELED,
        description: reason,
        createdByUserId: params.updatedByUserId ?? null,
        metadata: {
          previousStatus: subscription.status,
          immediate: true,
        },
      },
    });

    return updated;
  });
}

export async function reactivateSubscription(params: {
  subscriptionId: string;
  reason?: string | null;
  nextBillingAt?: Date | null;
  updatedByUserId?: string | null;
}) {
  const reason = ensureReason(params.reason);

  return db.$transaction(async (tx) => {
    const subscription = await getSubscriptionOrThrow(
      tx,
      params.subscriptionId,
    );

    if (
      subscription.status !== AdministratorPlanStatus.CANCELED &&
      subscription.status !== AdministratorPlanStatus.EXPIRED &&
      subscription.status !== AdministratorPlanStatus.SUSPENDED &&
      subscription.status !== AdministratorPlanStatus.PAST_DUE
    ) {
      throw new InvalidSubscriptionOperationError(
        "A situação atual não permite reativação.",
      );
    }

    const anotherOpen = await tx.administratorSubscription.findFirst({
      where: {
        administratorId: subscription.administratorId,
        id: { not: subscription.id },
        status: { in: OPEN_STATUSES },
      },
      select: { id: true },
    });

    if (anotherOpen) {
      throw new InvalidSubscriptionOperationError(
        "A administradora já possui outra assinatura aberta.",
      );
    }

    const updated = await tx.administratorSubscription.update({
      where: { id: subscription.id },
      data: {
        status: AdministratorPlanStatus.ACTIVE,
        cancelAtPeriodEnd: false,
        cancellationScheduledAt: null,
        cancellationReason: null,
        canceledAt: null,
        endedAt: null,
        nextBillingAt: subscription.isComplimentary
          ? null
          : params.nextBillingAt,
        updatedByUserId: params.updatedByUserId ?? null,
      },
    });

    await tx.administrator.update({
      where: { id: subscription.administratorId },
      data: {
        planId: subscription.planId,
        planStatus: AdministratorPlanStatus.ACTIVE,
        planExpiresAt: null,
      },
    });

    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: subscription.id,
        type: SubscriptionEventType.REACTIVATED,
        description: reason,
        createdByUserId: params.updatedByUserId ?? null,
        metadata: {
          previousStatus: subscription.status,
        },
      },
    });

    return updated;
  });
}

export async function listAvailableSubscriptionPlans() {
  return db.plan.findMany({
    where: {
      status: Status.ACTIVE,
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      sortOrder: true,
      monthlyPriceCents: true,
      annualPriceCents: true,
      maxCondominiums: true,
      maxUsers: true,
      maxProviders: true,
    },
  });
}
