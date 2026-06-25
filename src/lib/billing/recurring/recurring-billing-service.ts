import {
  AdministratorPlanStatus,
  Prisma,
  Role,
  SubscriptionBillingInterval,
  SubscriptionChargeStatus,
  SubscriptionEventType,
} from "@prisma/client";

import { db } from "@/lib/db";

const MAX_CYCLES_PER_SUBSCRIPTION = 24;

export type RecurringBillingProcessingResult = {
  processedAt: string;
  automaticBillingEnabled: boolean;
  subscriptionsExamined: number;
  subscriptionsEligible: number;
  subscriptionsSkippedManual: number;
  subscriptionsSkippedComplimentary: number;
  subscriptionsSkippedDemo: number;
  subscriptionsSkippedWithoutPrice: number;
  subscriptionsSkippedWithoutDate: number;
  subscriptionsSkippedCustomInterval: number;
  chargesCreated: number;
  duplicateCyclesSkipped: number;
  notificationsCreated: number;
};

function addMonthsKeepingDay(value: Date, months: number) {
  const result = new Date(value);
  const originalDay = result.getDate();

  result.setDate(1);
  result.setMonth(result.getMonth() + months);

  const lastDay = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0,
  ).getDate();

  result.setDate(Math.min(originalDay, lastDay));

  return result;
}

function getNextCycleDate(
  value: Date,
  interval: SubscriptionBillingInterval,
) {
  if (interval === SubscriptionBillingInterval.MONTHLY) {
    return addMonthsKeepingDay(value, 1);
  }

  if (interval === SubscriptionBillingInterval.ANNUAL) {
    return addMonthsKeepingDay(value, 12);
  }

  return null;
}

function formatReference(
  value: Date,
  interval: SubscriptionBillingInterval,
) {
  const month = String(value.getMonth() + 1).padStart(
    2,
    "0",
  );
  const year = value.getFullYear();

  return interval === SubscriptionBillingInterval.ANNUAL
    ? String(year)
    : `${month}/${year}`;
}

async function createNotificationOnce(input: {
  userId: string;
  type: string;
  title: string;
  message: string;
  href: string;
  metadata: Prisma.InputJsonObject;
}) {
  const existing = await db.notification.findFirst({
    where: {
      userId: input.userId,
      type: input.type,
      href: input.href,
    },
    select: {
      id: true,
    },
  });

  if (existing) {
    return false;
  }

  await db.notification.create({
    data: {
      userId: input.userId,
      channel: "SYSTEM",
      status: "UNREAD",
      type: input.type,
      title: input.title,
      message: input.message,
      href: input.href,
      metadata: input.metadata,
    },
  });

  return true;
}

async function notifyGeneratedCharge(input: {
  administratorId: string;
  subscriptionId: string;
  chargeId: string;
  description: string;
  amountCents: number;
  dueAt: Date;
}) {
  const users = await db.user.findMany({
    where: {
      administratorId: input.administratorId,
      role: Role.ADMINISTRADORA,
      isActive: true,
    },
    select: {
      id: true,
    },
  });

  const amount = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(input.amountCents / 100);

  const dueAt = new Intl.DateTimeFormat("pt-BR").format(
    input.dueAt,
  );

  const results = await Promise.all(
    users.map((user) =>
      createNotificationOnce({
        userId: user.id,
        type: "SUBSCRIPTION_RECURRING_CHARGE_CREATED",
        title: "Nova Cobrança Da Assinatura",
        message:
          `${input.description} foi gerada no valor de ${amount}, ` +
          `com vencimento em ${dueAt}.`,
        href:
          `/admin/assinatura?charge=${input.chargeId}` +
          "&source=recurring",
        metadata: {
          notificationScope:
            "ADMINISTRATOR_SUBSCRIPTION",
          notificationAudience: "ADMINISTRADORA",
          notificationGroup:
            "SUBSCRIPTION_RECURRING_BILLING",
          administratorId: input.administratorId,
          subscriptionId: input.subscriptionId,
          chargeId: input.chargeId,
          amountCents: input.amountCents,
          dueAt: input.dueAt.toISOString(),
        },
      }),
    ),
  );

  return results.filter(Boolean).length;
}

async function getAutomaticBillingEnabled() {
  const configuration =
    await db.billingGatewayConfiguration.findFirst({
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        automaticBillingEnabled: true,
      },
    });

  return (
    configuration?.automaticBillingEnabled ?? false
  );
}

export async function processRecurringSubscriptionCharges(
  processingDate = new Date(),
  options: {
    ignoreGlobalAutomaticBillingFlag?: boolean;
  } = {},
): Promise<RecurringBillingProcessingResult> {
  const automaticBillingEnabled =
    await getAutomaticBillingEnabled();

  const result: RecurringBillingProcessingResult = {
    processedAt: processingDate.toISOString(),
    automaticBillingEnabled,
    subscriptionsExamined: 0,
    subscriptionsEligible: 0,
    subscriptionsSkippedManual: 0,
    subscriptionsSkippedComplimentary: 0,
    subscriptionsSkippedDemo: 0,
    subscriptionsSkippedWithoutPrice: 0,
    subscriptionsSkippedWithoutDate: 0,
    subscriptionsSkippedCustomInterval: 0,
    chargesCreated: 0,
    duplicateCyclesSkipped: 0,
    notificationsCreated: 0,
  };

  if (
    !automaticBillingEnabled &&
    options.ignoreGlobalAutomaticBillingFlag !== true
  ) {
    return result;
  }

  const subscriptions =
    await db.administratorSubscription.findMany({
      where: {
        status: {
          in: [
            AdministratorPlanStatus.ACTIVE,
            AdministratorPlanStatus.PAST_DUE,
            AdministratorPlanStatus.SUSPENDED,
          ],
        },
      },
      select: {
        id: true,
        administratorId: true,
        planId: true,
        status: true,
        billingInterval: true,
        currency: true,
        finalPriceCents: true,
        isComplimentary: true,
        manualBillingOnly: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        nextBillingAt: true,
        administrator: {
          select: {
            name: true,
            isDemo: true,
          },
        },
        plan: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        nextBillingAt: "asc",
      },
    });

  result.subscriptionsExamined = subscriptions.length;

  for (const subscription of subscriptions) {
    if (subscription.manualBillingOnly) {
      result.subscriptionsSkippedManual += 1;
      continue;
    }

    if (subscription.isComplimentary) {
      result.subscriptionsSkippedComplimentary += 1;
      continue;
    }

    if (subscription.administrator.isDemo) {
      result.subscriptionsSkippedDemo += 1;
      continue;
    }

    if (subscription.finalPriceCents <= 0) {
      result.subscriptionsSkippedWithoutPrice += 1;
      continue;
    }

    if (!subscription.nextBillingAt) {
      result.subscriptionsSkippedWithoutDate += 1;
      continue;
    }

    if (
      subscription.billingInterval ===
      SubscriptionBillingInterval.CUSTOM
    ) {
      result.subscriptionsSkippedCustomInterval += 1;
      continue;
    }

    if (subscription.nextBillingAt > processingDate) {
      continue;
    }

    result.subscriptionsEligible += 1;

    let cycleStart = new Date(
      subscription.nextBillingAt,
    );
    let generatedCycles = 0;

    while (
      cycleStart <= processingDate &&
      generatedCycles <
        MAX_CYCLES_PER_SUBSCRIPTION
    ) {
      const nextCycleDate = getNextCycleDate(
        cycleStart,
        subscription.billingInterval,
      );

      if (!nextCycleDate) {
        break;
      }

      const referenceMonth =
        cycleStart.getMonth() + 1;
      const referenceYear =
        cycleStart.getFullYear();

      const existing =
        await db.subscriptionCharge.findFirst({
          where: {
            subscriptionId: subscription.id,
            referenceMonth,
            referenceYear,
          },
          select: {
            id: true,
          },
        });

      if (existing) {
        result.duplicateCyclesSkipped += 1;

        await db.administratorSubscription.update({
          where: {
            id: subscription.id,
          },
          data: {
            currentPeriodStart: cycleStart,
            currentPeriodEnd: nextCycleDate,
            nextBillingAt: nextCycleDate,
          },
        });

        cycleStart = nextCycleDate;
        generatedCycles += 1;
        continue;
      }

      const reference = formatReference(
        cycleStart,
        subscription.billingInterval,
      );

      const description =
        subscription.billingInterval ===
        SubscriptionBillingInterval.ANNUAL
          ? `Assinatura Anual EloGest — ${reference}`
          : `Mensalidade EloGest — ${reference}`;

      const created = await db.$transaction(
        async (tx) => {
          const charge =
            await tx.subscriptionCharge.create({
              data: {
                subscriptionId: subscription.id,
                administratorId:
                  subscription.administratorId,
                status:
                  SubscriptionChargeStatus.PENDING,
                description,
                currency: subscription.currency,
                amountCents:
                  subscription.finalPriceCents,
                referenceMonth,
                referenceYear,
                periodStart: cycleStart,
                periodEnd: nextCycleDate,
                dueAt: cycleStart,
                metadata: {
                  source:
                    "SUBSCRIPTION_RECURRING_BILLING",
                  generatedAt:
                    processingDate.toISOString(),
                  billingInterval:
                    subscription.billingInterval,
                  planId: subscription.planId,
                  planName: subscription.plan.name,
                },
              },
            });

          await tx.administratorSubscription.update({
            where: {
              id: subscription.id,
            },
            data: {
              currentPeriodStart: cycleStart,
              currentPeriodEnd: nextCycleDate,
              nextBillingAt: nextCycleDate,
            },
          });

          await tx.subscriptionEvent.create({
            data: {
              subscriptionId: subscription.id,
              type:
                SubscriptionEventType.CHARGE_CREATED,
              description:
                `Cobrança recorrente criada: ${description}.`,
              metadata: {
                source:
                  "SUBSCRIPTION_RECURRING_BILLING",
                chargeId: charge.id,
                referenceMonth,
                referenceYear,
                amountCents:
                  subscription.finalPriceCents,
                dueAt: cycleStart.toISOString(),
                nextBillingAt:
                  nextCycleDate.toISOString(),
                generatedAt:
                  processingDate.toISOString(),
              },
            },
          });

          return charge;
        },
      );

      result.chargesCreated += 1;

      result.notificationsCreated +=
        await notifyGeneratedCharge({
          administratorId:
            subscription.administratorId,
          subscriptionId: subscription.id,
          chargeId: created.id,
          description,
          amountCents:
            subscription.finalPriceCents,
          dueAt: cycleStart,
        });

      cycleStart = nextCycleDate;
      generatedCycles += 1;
    }
  }

  return result;
}
