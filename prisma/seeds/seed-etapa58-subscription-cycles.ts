import "dotenv/config";

import {
  AdministratorPlanStatus,
  SubscriptionBillingInterval,
  SubscriptionEventType,
} from "@prisma/client";

import { db } from "../../src/lib/db";

const OPEN_STATUSES: AdministratorPlanStatus[] = [
  AdministratorPlanStatus.TRIALING,
  AdministratorPlanStatus.ACTIVE,
  AdministratorPlanStatus.PAST_DUE,
  AdministratorPlanStatus.SUSPENDED,
];

function addBillingPeriod(
  date: Date,
  interval: SubscriptionBillingInterval,
) {
  const result = new Date(date);

  if (interval === SubscriptionBillingInterval.ANNUAL) {
    result.setFullYear(result.getFullYear() + 1);
  } else {
    result.setMonth(result.getMonth() + 1);
  }

  return result;
}

async function main() {
  const subscriptions =
    await db.administratorSubscription.findMany({
      where: {
        status: {
          in: OPEN_STATUSES,
        },
        OR: [
          { currentPeriodStart: null },
          { currentPeriodEnd: null },
        ],
      },
      select: {
        id: true,
        startedAt: true,
        billingInterval: true,
        isComplimentary: true,
        administrator: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

  let updated = 0;

  for (const subscription of subscriptions) {
    const currentPeriodStart =
      subscription.startedAt ?? new Date();

    const currentPeriodEnd = addBillingPeriod(
      currentPeriodStart,
      subscription.billingInterval,
    );

    await db.$transaction(async (tx) => {
      await tx.administratorSubscription.update({
        where: {
          id: subscription.id,
        },
        data: {
          currentPeriodStart,
          currentPeriodEnd,
          nextBillingAt: subscription.isComplimentary
            ? null
            : currentPeriodEnd,
        },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          type: SubscriptionEventType.BILLING_DATE_CHANGED,
          description:
            "Datas do ciclo preenchidas pela regularização inicial da Etapa 58.",
          metadata: {
            source:
              "seed-etapa58-subscription-cycles",
            currentPeriodStart:
              currentPeriodStart.toISOString(),
            currentPeriodEnd:
              currentPeriodEnd.toISOString(),
            nextBillingAt: subscription.isComplimentary
              ? null
              : currentPeriodEnd.toISOString(),
          },
        },
      });
    });

    updated += 1;
    console.log(
      `Atualizada: ${subscription.administrator.name}`,
    );
  }

  console.log("\nResumo da regularização:");
  console.log(`- Assinaturas atualizadas: ${updated}`);
  console.log(
    `- Assinaturas sem necessidade de ajuste: ${
      subscriptions.length === 0 ? "todas" : "demais"
    }`,
  );
}

main()
  .catch((error) => {
    console.error(
      "Falha ao regularizar os ciclos das assinaturas:",
      error,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
