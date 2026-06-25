import "dotenv/config";

import {
  AdministratorPlanStatus,
  SubscriptionBillingInterval,
  SubscriptionEventType,
  SubscriptionOrigin,
} from "@prisma/client";

import { db } from "../../src/lib/db";

const OPEN_STATUSES: AdministratorPlanStatus[] = [
  AdministratorPlanStatus.TRIALING,
  AdministratorPlanStatus.ACTIVE,
  AdministratorPlanStatus.PAST_DUE,
  AdministratorPlanStatus.SUSPENDED,
];

async function main(): Promise<void> {
  const administrators = await db.administrator.findMany({
    where: {
      planId: {
        not: null,
      },
    },
    select: {
      id: true,
      name: true,
      isDemo: true,
      planId: true,
      planStatus: true,
      planStartedAt: true,
      planExpiresAt: true,
      plan: {
        select: {
          monthlyPriceCents: true,
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  let created = 0;
  let skipped = 0;

  for (const administrator of administrators) {
    if (!administrator.planId || !administrator.plan) {
      skipped += 1;
      console.log(
        `Ignorada: ${administrator.name} não possui plano válido vinculado.`,
      );
      continue;
    }

    const planId = administrator.planId;
    const plan = administrator.plan;

    const existing = await db.administratorSubscription.findFirst({
      where: {
        administratorId: administrator.id,
        status: {
          in: OPEN_STATUSES,
        },
      },
      select: {
        id: true,
      },
    });

    if (existing) {
      skipped += 1;
      console.log(`Ignorada: ${administrator.name} já possui assinatura.`);
      continue;
    }

    const startedAt = administrator.planStartedAt ?? new Date();
    const isComplimentary = administrator.isDemo;
    const basePriceCents = isComplimentary
      ? 0
      : plan.monthlyPriceCents ?? 0;

    await db.$transaction(async (tx) => {
      const subscription = await tx.administratorSubscription.create({
        data: {
          administratorId: administrator.id,
          planId,
          status: administrator.planStatus,
          billingInterval: SubscriptionBillingInterval.MONTHLY,
          origin: SubscriptionOrigin.MIGRATION,
          currency: "BRL",
          basePriceCents,
          discountCents: 0,
          finalPriceCents: basePriceCents,
          implementationFeeCents: 0,
          isComplimentary,
          manualBillingOnly: true,
          startedAt,
          trialEndsAt:
            administrator.planStatus === AdministratorPlanStatus.TRIALING
              ? administrator.planExpiresAt
              : null,
          currentPeriodStart: startedAt,
          currentPeriodEnd: administrator.planExpiresAt,
          nextBillingAt: isComplimentary
            ? null
            : administrator.planExpiresAt,
          notes: "Assinatura criada pela migração inicial da Etapa 58.",
          metadata: {
            migratedFromAdministratorPlanFields: true,
          },
        },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          type:
            administrator.planStatus === AdministratorPlanStatus.TRIALING
              ? SubscriptionEventType.TRIAL_STARTED
              : SubscriptionEventType.CREATED,
          description: "Assinatura criada pela migração inicial da Etapa 58.",
          metadata: {
            source: "seed-etapa58-subscriptions",
          },
        },
      });
    });

    created += 1;
    console.log(`Criada: ${administrator.name}`);
  }

  console.log("\nResumo da migração:");
  console.log(`- Assinaturas criadas: ${created}`);
  console.log(`- Administradoras ignoradas: ${skipped}`);
}

main()
  .catch((error) => {
    console.error("Falha ao migrar as assinaturas existentes:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
