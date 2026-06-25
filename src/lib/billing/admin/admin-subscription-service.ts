import {
  AdministratorPlanStatus,
  Prisma,
  SubscriptionChargeStatus,
  SubscriptionPaymentStatus,
} from "@prisma/client";

import { db } from "@/lib/db";

const OPEN_STATUSES: AdministratorPlanStatus[] = [
  AdministratorPlanStatus.TRIALING,
  AdministratorPlanStatus.ACTIVE,
  AdministratorPlanStatus.PAST_DUE,
  AdministratorPlanStatus.SUSPENDED,
];

export async function getAdministratorSubscriptionView(
  administratorId: string,
) {
  const administrator = await db.administrator.findUnique({
    where: {
      id: administratorId,
    },
    select: {
      id: true,
      name: true,
      status: true,
      isDemo: true,
      planId: true,
      planStatus: true,
      planStartedAt: true,
      planExpiresAt: true,
    },
  });

  if (!administrator) {
    return null;
  }

  const openSubscription =
    await db.administratorSubscription.findFirst({
      where: {
        administratorId,
        status: {
          in: OPEN_STATUSES,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        plan: {
          select: {
            id: true,
            name: true,
            slug: true,
            monthlyPriceCents: true,
            annualPriceCents: true,
            maxCondominiums: true,
            maxUsers: true,
            maxProviders: true,
          },
        },
        charges: {
          orderBy: {
            dueAt: "desc",
          },
          take: 24,
          include: {
            payments: {
              orderBy: {
                paidAt: "desc",
              },
              select: {
                id: true,
                status: true,
                method: true,
                amountCents: true,
                paidAt: true,
                confirmedAt: true,
                referenceCode: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

  const subscription =
    openSubscription ??
    (await db.administratorSubscription.findFirst({
      where: {
        administratorId,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        plan: {
          select: {
            id: true,
            name: true,
            slug: true,
            monthlyPriceCents: true,
            annualPriceCents: true,
            maxCondominiums: true,
            maxUsers: true,
            maxProviders: true,
          },
        },
        charges: {
          orderBy: {
            dueAt: "desc",
          },
          take: 24,
          include: {
            payments: {
              orderBy: {
                paidAt: "desc",
              },
              select: {
                id: true,
                status: true,
                method: true,
                amountCents: true,
                paidAt: true,
                confirmedAt: true,
                referenceCode: true,
                createdAt: true,
              },
            },
          },
        },
      },
    }));

  const [
    condominiums,
    users,
    providers,
    requests,
    gatewayConfiguration,
  ] = await Promise.all([
    db.condominium.count({
      where: {
        administratorId,
      },
    }),
    db.user.count({
      where: {
        administratorId,
      },
    }),
    db.administratorProvider.count({
      where: {
        administratorId,
      },
    }),
    db.subscriptionRequest.findMany({
      where: {
        administratorId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 20,
      include: {
        targetPlan: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    }),
    db.billingGatewayConfiguration.findFirst({
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        gracePeriodDays: true,
      },
    }),
  ]);

  if (!subscription) {
    return {
      administrator,
      subscription: null,
      usage: {
        condominiums,
        users,
        providers,
      },
      summary: {
        totalCharges: 0,
        pendingCharges: 0,
        overdueCharges: 0,
        paidCharges: 0,
        totalPaidCents: 0,
      },
      cycleStatus: {
        isOverdue: false,
        daysOverdue: 0,
        gracePeriodDays:
          gatewayConfiguration?.gracePeriodDays ?? 5,
        daysUntilSuspension: null,
        isSuspended: false,
      },
      requests,
    };
  }

  const pendingCharges = subscription.charges.filter(
    (charge) =>
      charge.status === SubscriptionChargeStatus.PENDING,
  );
  const overdueCharges = subscription.charges.filter(
    (charge) =>
      charge.status === SubscriptionChargeStatus.OVERDUE,
  );
  const paidCharges = subscription.charges.filter(
    (charge) =>
      charge.status === SubscriptionChargeStatus.PAID,
  );

  const totalPaidCents = subscription.charges.reduce(
    (total, charge) =>
      total +
      charge.payments
        .filter(
          (payment) =>
            payment.status ===
            SubscriptionPaymentStatus.CONFIRMED,
        )
        .reduce(
          (paymentTotal, payment) =>
            paymentTotal + payment.amountCents,
          0,
        ),
    0,
  );

  const now = new Date();
  const cycleReference =
    subscription.nextBillingAt ?? subscription.currentPeriodEnd;
  const isCycleOverdue = Boolean(
    cycleReference && cycleReference.getTime() < now.getTime(),
  );
  const daysOverdue = cycleReference
    ? Math.max(
        Math.floor(
          (now.getTime() - cycleReference.getTime()) /
            (1000 * 60 * 60 * 24),
        ),
        0,
      )
    : 0;

  return {
    administrator,
    subscription,
    usage: {
      condominiums,
      users,
      providers,
    },
    summary: {
      totalCharges: subscription.charges.length,
      pendingCharges: pendingCharges.length,
      overdueCharges: overdueCharges.length,
      paidCharges: paidCharges.length,
      totalPaidCents,
    },
    cycleStatus: {
      isOverdue: isCycleOverdue,
      daysOverdue,
      gracePeriodDays:
        gatewayConfiguration?.gracePeriodDays ?? 5,
      daysUntilSuspension: isCycleOverdue
        ? Math.max(
            (gatewayConfiguration?.gracePeriodDays ?? 5) -
              daysOverdue,
            0,
          )
        : null,
      isSuspended:
        subscription.status ===
        AdministratorPlanStatus.SUSPENDED,
    },
    requests,
  };
}

export type AdministratorSubscriptionView =
  Prisma.PromiseReturnType<
    typeof getAdministratorSubscriptionView
  >;
