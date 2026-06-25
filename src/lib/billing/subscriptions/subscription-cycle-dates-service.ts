import {
  AdministratorPlanStatus,
  SubscriptionBillingInterval,
  SubscriptionEventType,
} from "@prisma/client";

import { db } from "@/lib/db";

import {
  InvalidSubscriptionOperationError,
  SubscriptionNotFoundError,
} from "./subscription-errors";

function validateCycleDates(input: {
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  nextBillingAt: Date | null;
}) {
  if (input.currentPeriodEnd <= input.currentPeriodStart) {
    throw new InvalidSubscriptionOperationError(
      "O fim do ciclo deve ser posterior ao início do ciclo.",
    );
  }

  if (
    input.nextBillingAt &&
    input.nextBillingAt < input.currentPeriodStart
  ) {
    throw new InvalidSubscriptionOperationError(
      "A próxima cobrança não pode ser anterior ao início do ciclo.",
    );
  }
}

export async function getSubscriptionCycleDates(
  subscriptionId: string,
) {
  const subscription =
    await db.administratorSubscription.findUnique({
      where: {
        id: subscriptionId,
      },
      select: {
        id: true,
        status: true,
        billingInterval: true,
        isComplimentary: true,
        startedAt: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        nextBillingAt: true,
        cancelAtPeriodEnd: true,
        cancellationScheduledAt: true,
        administrator: {
          select: {
            id: true,
            name: true,
            isDemo: true,
          },
        },
      },
    });

  if (!subscription) {
    throw new SubscriptionNotFoundError(subscriptionId);
  }

  return subscription;
}

export async function updateSubscriptionCycleDates(input: {
  subscriptionId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  nextBillingAt?: Date | null;
  reason?: string | null;
  updatedByUserId?: string | null;
}) {
  const reason = input.reason?.trim();

  if (!reason) {
    throw new InvalidSubscriptionOperationError(
      "Informe o motivo da alteração das datas.",
    );
  }

  return db.$transaction(async (tx) => {
    const subscription =
      await tx.administratorSubscription.findUnique({
        where: {
          id: input.subscriptionId,
        },
        select: {
          id: true,
          administratorId: true,
          status: true,
          isComplimentary: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          nextBillingAt: true,
          cancelAtPeriodEnd: true,
        },
      });

    if (!subscription) {
      throw new SubscriptionNotFoundError(input.subscriptionId);
    }

    if (
      subscription.status ===
        AdministratorPlanStatus.CANCELED ||
      subscription.status ===
        AdministratorPlanStatus.EXPIRED
    ) {
      throw new InvalidSubscriptionOperationError(
        "Não é possível alterar o ciclo de uma assinatura encerrada.",
      );
    }

    const nextBillingAt = subscription.isComplimentary
      ? null
      : input.nextBillingAt ?? input.currentPeriodEnd;

    validateCycleDates({
      currentPeriodStart: input.currentPeriodStart,
      currentPeriodEnd: input.currentPeriodEnd,
      nextBillingAt,
    });

    const updated =
      await tx.administratorSubscription.update({
        where: {
          id: subscription.id,
        },
        data: {
          currentPeriodStart: input.currentPeriodStart,
          currentPeriodEnd: input.currentPeriodEnd,
          nextBillingAt,
          updatedByUserId: input.updatedByUserId ?? null,
        },
      });

    await tx.administrator.update({
      where: {
        id: subscription.administratorId,
      },
      data: {
        planExpiresAt: input.currentPeriodEnd,
      },
    });

    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: subscription.id,
        type: SubscriptionEventType.BILLING_DATE_CHANGED,
        description: reason,
        createdByUserId: input.updatedByUserId ?? null,
        metadata: {
          previous: {
            currentPeriodStart:
              subscription.currentPeriodStart?.toISOString() ??
              null,
            currentPeriodEnd:
              subscription.currentPeriodEnd?.toISOString() ??
              null,
            nextBillingAt:
              subscription.nextBillingAt?.toISOString() ?? null,
          },
          current: {
            currentPeriodStart:
              input.currentPeriodStart.toISOString(),
            currentPeriodEnd:
              input.currentPeriodEnd.toISOString(),
            nextBillingAt:
              nextBillingAt?.toISOString() ?? null,
          },
        },
      },
    });

    return updated;
  });
}

export function calculateSuggestedCycleDates(input: {
  startedAt: Date;
  billingInterval: SubscriptionBillingInterval;
}) {
  const currentPeriodStart = new Date(input.startedAt);
  const currentPeriodEnd = new Date(input.startedAt);

  if (
    input.billingInterval ===
    SubscriptionBillingInterval.ANNUAL
  ) {
    currentPeriodEnd.setFullYear(
      currentPeriodEnd.getFullYear() + 1,
    );
  } else {
    currentPeriodEnd.setMonth(
      currentPeriodEnd.getMonth() + 1,
    );
  }

  return {
    currentPeriodStart,
    currentPeriodEnd,
    nextBillingAt: currentPeriodEnd,
  };
}
