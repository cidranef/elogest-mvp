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

function validateCommercialConfiguration(input: {
  contractedValueCents: number;
  billingInterval: SubscriptionBillingInterval;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  nextBillingAt: Date | null;
  recurringEnabled: boolean;
  isComplimentary: boolean;
  isDemo: boolean;
}) {
  if (
    !Number.isInteger(input.contractedValueCents) ||
    input.contractedValueCents < 0
  ) {
    throw new InvalidSubscriptionOperationError(
      "Informe um valor contratado válido.",
    );
  }

  if (
    input.billingInterval !==
      SubscriptionBillingInterval.MONTHLY &&
    input.billingInterval !==
      SubscriptionBillingInterval.ANNUAL
  ) {
    throw new InvalidSubscriptionOperationError(
      "Selecione periodicidade mensal ou anual.",
    );
  }

  if (input.currentPeriodEnd <= input.currentPeriodStart) {
    throw new InvalidSubscriptionOperationError(
      "O fim do ciclo deve ser posterior ao início.",
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

  if (input.recurringEnabled) {
    if (input.isComplimentary) {
      throw new InvalidSubscriptionOperationError(
        "Assinaturas cortesia não podem ter cobrança recorrente.",
      );
    }

    if (input.isDemo) {
      throw new InvalidSubscriptionOperationError(
        "O ambiente Demo não pode ter cobrança recorrente.",
      );
    }

    if (input.contractedValueCents <= 0) {
      throw new InvalidSubscriptionOperationError(
        "Defina um valor contratado maior que zero antes de habilitar a recorrência.",
      );
    }

    if (!input.nextBillingAt) {
      throw new InvalidSubscriptionOperationError(
        "Defina a próxima cobrança antes de habilitar a recorrência.",
      );
    }
  }
}

export async function getSubscriptionCommercialConfiguration(
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
        basePriceCents: true,
        discountCents: true,
        finalPriceCents: true,
        implementationFeeCents: true,
        isComplimentary: true,
        manualBillingOnly: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        nextBillingAt: true,
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

export async function updateSubscriptionCommercialConfiguration(
  input: {
    subscriptionId: string;
    contractedValueCents: number;
    billingInterval: SubscriptionBillingInterval;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    nextBillingAt: Date | null;
    recurringEnabled: boolean;
    reason: string;
    updatedByUserId: string;
  },
) {
  const reason = input.reason.trim();

  if (!reason) {
    throw new InvalidSubscriptionOperationError(
      "Informe a justificativa da alteração comercial.",
    );
  }

  return db.$transaction(async (tx) => {
    const current =
      await tx.administratorSubscription.findUnique({
        where: {
          id: input.subscriptionId,
        },
        select: {
          id: true,
          administratorId: true,
          status: true,
          billingInterval: true,
          basePriceCents: true,
          discountCents: true,
          finalPriceCents: true,
          implementationFeeCents: true,
          isComplimentary: true,
          manualBillingOnly: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          nextBillingAt: true,
          administrator: {
            select: {
              isDemo: true,
            },
          },
        },
      });

    if (!current) {
      throw new SubscriptionNotFoundError(
        input.subscriptionId,
      );
    }

    if (
      current.status ===
        AdministratorPlanStatus.CANCELED ||
      current.status ===
        AdministratorPlanStatus.EXPIRED
    ) {
      throw new InvalidSubscriptionOperationError(
        "Não é possível alterar a configuração comercial de uma assinatura encerrada.",
      );
    }

    validateCommercialConfiguration({
      contractedValueCents:
        input.contractedValueCents,
      billingInterval: input.billingInterval,
      currentPeriodStart:
        input.currentPeriodStart,
      currentPeriodEnd: input.currentPeriodEnd,
      nextBillingAt: input.nextBillingAt,
      recurringEnabled: input.recurringEnabled,
      isComplimentary: current.isComplimentary,
      isDemo: current.administrator.isDemo,
    });

    const nextBillingAt = current.isComplimentary
      ? null
      : input.nextBillingAt;

    const updated =
      await tx.administratorSubscription.update({
        where: {
          id: current.id,
        },
        data: {
          billingInterval: input.billingInterval,
          basePriceCents:
            input.contractedValueCents,
          discountCents: 0,
          finalPriceCents:
            input.contractedValueCents,
          currentPeriodStart:
            input.currentPeriodStart,
          currentPeriodEnd:
            input.currentPeriodEnd,
          nextBillingAt,
          manualBillingOnly:
            !input.recurringEnabled,
          updatedByUserId:
            input.updatedByUserId,
        },
      });

    await tx.administrator.update({
      where: {
        id: current.administratorId,
      },
      data: {
        planExpiresAt: input.currentPeriodEnd,
      },
    });

    const priceChanged =
      current.finalPriceCents !==
      input.contractedValueCents;

    const cycleChanged =
      current.billingInterval !==
        input.billingInterval ||
      current.currentPeriodStart?.getTime() !==
        input.currentPeriodStart.getTime() ||
      current.currentPeriodEnd?.getTime() !==
        input.currentPeriodEnd.getTime() ||
      current.nextBillingAt?.getTime() !==
        nextBillingAt?.getTime();

    const recurringChanged =
      current.manualBillingOnly ===
      input.recurringEnabled;

    const eventType = priceChanged
      ? SubscriptionEventType.PRICE_CHANGED
      : cycleChanged
        ? SubscriptionEventType.BILLING_DATE_CHANGED
        : SubscriptionEventType.NOTES_UPDATED;

    await tx.subscriptionEvent.create({
      data: {
        subscriptionId: current.id,
        type: eventType,
        description: reason,
        createdByUserId:
          input.updatedByUserId,
        metadata: {
          source:
            "SUBSCRIPTION_COMMERCIAL_CONFIGURATION",
          previous: {
            contractedValueCents:
              current.finalPriceCents,
            billingInterval:
              current.billingInterval,
            currentPeriodStart:
              current.currentPeriodStart?.toISOString() ??
              null,
            currentPeriodEnd:
              current.currentPeriodEnd?.toISOString() ??
              null,
            nextBillingAt:
              current.nextBillingAt?.toISOString() ??
              null,
            recurringEnabled:
              !current.manualBillingOnly,
          },
          current: {
            contractedValueCents:
              input.contractedValueCents,
            billingInterval:
              input.billingInterval,
            currentPeriodStart:
              input.currentPeriodStart.toISOString(),
            currentPeriodEnd:
              input.currentPeriodEnd.toISOString(),
            nextBillingAt:
              nextBillingAt?.toISOString() ?? null,
            recurringEnabled:
              input.recurringEnabled,
          },
          changes: {
            priceChanged,
            cycleChanged,
            recurringChanged,
          },
        },
      },
    });

    return updated;
  });
}
