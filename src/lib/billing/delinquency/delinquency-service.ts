import {
  AdministratorPlanStatus,
  Prisma,
  Role,
  SubscriptionChargeStatus,
  SubscriptionEventType,
} from "@prisma/client";

import { db } from "@/lib/db";

const DAY_MS = 24 * 60 * 60 * 1000;
const SUSPENSION_WARNING_DAYS = 2;

export type DelinquencyProcessingResult = {
  processedAt: string;
  gracePeriodDays: number;
  chargesMarkedOverdue: number;
  subscriptionsMarkedPastDue: number;
  subscriptionsSuspended: number;
  subscriptionsReactivated: number;
  overdueNotificationsCreated: number;
  suspensionWarningsCreated: number;
  suspensionNotificationsCreated: number;
  reactivationNotificationsCreated: number;
  notificationsCreated: number;
  skippedComplimentary: number;
};

function startOfDay(value: Date) {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  return result;
}

function daysBetween(reference: Date, now: Date) {
  const referenceDay = startOfDay(reference).getTime();
  const nowDay = startOfDay(now).getTime();

  return Math.max(
    Math.floor((nowDay - referenceDay) / DAY_MS),
    0,
  );
}

async function getGracePeriodDays() {
  const configuration =
    await db.billingGatewayConfiguration.findFirst({
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        gracePeriodDays: true,
      },
    });

  return Math.max(
    configuration?.gracePeriodDays ?? 5,
    0,
  );
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

async function getAdministratorUsers(
  administratorId: string,
) {
  return db.user.findMany({
    where: {
      administratorId,
      role: Role.ADMINISTRADORA,
      isActive: true,
    },
    select: {
      id: true,
    },
  });
}

async function notifyOverdue(input: {
  administratorId: string;
  subscriptionId: string;
  oldestChargeId: string;
  oldestDueAt: Date;
  daysOverdue: number;
  gracePeriodDays: number;
}) {
  const users = await getAdministratorUsers(
    input.administratorId,
  );

  const results = await Promise.all(
    users.map((user) =>
      createNotificationOnce({
        userId: user.id,
        type: "SUBSCRIPTION_PAST_DUE",
        title: "Cobrança Da Assinatura Vencida",
        message:
          `Existe cobrança vencida há ${input.daysOverdue} dia(s). ` +
          `O período de tolerância é de ${input.gracePeriodDays} dia(s).`,
        href:
          `/admin/assinatura?charge=${input.oldestChargeId}` +
          "&notice=past-due",
        metadata: {
          notificationScope:
            "ADMINISTRATOR_SUBSCRIPTION",
          notificationAudience: "ADMINISTRADORA",
          notificationGroup:
            "SUBSCRIPTION_DELINQUENCY",
          administratorId: input.administratorId,
          subscriptionId: input.subscriptionId,
          chargeId: input.oldestChargeId,
          subscriptionStatus:
            AdministratorPlanStatus.PAST_DUE,
          oldestDueAt: input.oldestDueAt.toISOString(),
          daysOverdue: input.daysOverdue,
          gracePeriodDays: input.gracePeriodDays,
        },
      }),
    ),
  );

  return results.filter(Boolean).length;
}

async function notifySuspensionWarning(input: {
  administratorId: string;
  subscriptionId: string;
  oldestChargeId: string;
  oldestDueAt: Date;
  daysOverdue: number;
  gracePeriodDays: number;
  daysUntilSuspension: number;
}) {
  const users = await getAdministratorUsers(
    input.administratorId,
  );

  const results = await Promise.all(
    users.map((user) =>
      createNotificationOnce({
        userId: user.id,
        type: "SUBSCRIPTION_SUSPENSION_WARNING",
        title: "Suspensão Da Assinatura Se Aproximando",
        message:
          input.daysUntilSuspension > 0
            ? `Restam ${input.daysUntilSuspension} dia(s) para regularizar a cobrança antes da suspensão dos módulos operacionais.`
            : "A assinatura está sujeita à suspensão no próximo processamento de inadimplência.",
        href:
          `/admin/assinatura?charge=${input.oldestChargeId}` +
          "&notice=suspension-warning",
        metadata: {
          notificationScope:
            "ADMINISTRATOR_SUBSCRIPTION",
          notificationAudience: "ADMINISTRADORA",
          notificationGroup:
            "SUBSCRIPTION_DELINQUENCY",
          administratorId: input.administratorId,
          subscriptionId: input.subscriptionId,
          chargeId: input.oldestChargeId,
          subscriptionStatus:
            AdministratorPlanStatus.PAST_DUE,
          oldestDueAt: input.oldestDueAt.toISOString(),
          daysOverdue: input.daysOverdue,
          gracePeriodDays: input.gracePeriodDays,
          daysUntilSuspension:
            input.daysUntilSuspension,
        },
      }),
    ),
  );

  return results.filter(Boolean).length;
}

async function notifySuspended(input: {
  administratorId: string;
  subscriptionId: string;
  oldestChargeId: string;
  oldestDueAt: Date;
  daysOverdue: number;
  gracePeriodDays: number;
}) {
  const users = await getAdministratorUsers(
    input.administratorId,
  );

  const results = await Promise.all(
    users.map((user) =>
      createNotificationOnce({
        userId: user.id,
        type: "SUBSCRIPTION_SUSPENDED",
        title: "Assinatura Suspensa",
        message:
          "O período de tolerância terminou. Os módulos operacionais foram bloqueados, mas Minha Assinatura permanece disponível para regularização.",
        href:
          `/admin/assinatura?charge=${input.oldestChargeId}` +
          "&notice=suspended",
        metadata: {
          notificationScope:
            "ADMINISTRATOR_SUBSCRIPTION",
          notificationAudience: "ADMINISTRADORA",
          notificationGroup:
            "SUBSCRIPTION_DELINQUENCY",
          administratorId: input.administratorId,
          subscriptionId: input.subscriptionId,
          chargeId: input.oldestChargeId,
          subscriptionStatus:
            AdministratorPlanStatus.SUSPENDED,
          oldestDueAt: input.oldestDueAt.toISOString(),
          daysOverdue: input.daysOverdue,
          gracePeriodDays: input.gracePeriodDays,
        },
      }),
    ),
  );

  return results.filter(Boolean).length;
}

async function notifyReactivation(input: {
  administratorId: string;
  subscriptionId: string;
  processingDate: Date;
}) {
  const users = await getAdministratorUsers(
    input.administratorId,
  );

  const eventKey = input.processingDate
    .toISOString()
    .slice(0, 10);

  const results = await Promise.all(
    users.map((user) =>
      createNotificationOnce({
        userId: user.id,
        type: "SUBSCRIPTION_REACTIVATED",
        title: "Assinatura Reativada",
        message:
          "Todas as cobranças abertas foram regularizadas e os módulos operacionais foram liberados novamente.",
        href:
          `/admin/assinatura?subscription=${input.subscriptionId}` +
          `&reactivated=${eventKey}`,
        metadata: {
          notificationScope:
            "ADMINISTRATOR_SUBSCRIPTION",
          notificationAudience: "ADMINISTRADORA",
          notificationGroup:
            "SUBSCRIPTION_DELINQUENCY",
          administratorId: input.administratorId,
          subscriptionId: input.subscriptionId,
          subscriptionStatus:
            AdministratorPlanStatus.ACTIVE,
          reactivatedAt:
            input.processingDate.toISOString(),
        },
      }),
    ),
  );

  return results.filter(Boolean).length;
}

export async function processSubscriptionDelinquency(
  processingDate = new Date(),
): Promise<DelinquencyProcessingResult> {
  const gracePeriodDays =
    await getGracePeriodDays();

  const result: DelinquencyProcessingResult = {
    processedAt: processingDate.toISOString(),
    gracePeriodDays,
    chargesMarkedOverdue: 0,
    subscriptionsMarkedPastDue: 0,
    subscriptionsSuspended: 0,
    subscriptionsReactivated: 0,
    overdueNotificationsCreated: 0,
    suspensionWarningsCreated: 0,
    suspensionNotificationsCreated: 0,
    reactivationNotificationsCreated: 0,
    notificationsCreated: 0,
    skippedComplimentary: 0,
  };

  const processingDayStart = startOfDay(processingDate);

  const sameDayOverdueCharges =
    await db.subscriptionCharge.findMany({
      where: {
        status: SubscriptionChargeStatus.OVERDUE,
        dueAt: {
          gte: processingDayStart,
        },
      },
      select: {
        id: true,
        subscriptionId: true,
        dueAt: true,
        amountCents: true,
        paidAmountCents: true,
      },
    });

  for (const charge of sameDayOverdueCharges) {
    if (charge.paidAmountCents >= charge.amountCents) {
      continue;
    }

    await db.$transaction(async (tx) => {
      await tx.subscriptionCharge.update({
        where: {
          id: charge.id,
        },
        data: {
          status: SubscriptionChargeStatus.PENDING,
          overdueAt: null,
        },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: charge.subscriptionId,
          type: SubscriptionEventType.NOTES_UPDATED,
          description:
            "Cobrança retornada automaticamente para pendente porque o vencimento ainda ocorre na data atual.",
          metadata: {
            source:
              "SUBSCRIPTION_DELINQUENCY_DATE_NORMALIZATION",
            chargeId: charge.id,
            dueAt: charge.dueAt.toISOString(),
            processedAt: processingDate.toISOString(),
          },
        },
      });
    });
  }

  const pendingCharges =
    await db.subscriptionCharge.findMany({
      where: {
        status: SubscriptionChargeStatus.PENDING,
        dueAt: {
          lt: processingDayStart,
        },
      },
      select: {
        id: true,
        subscriptionId: true,
        dueAt: true,
        amountCents: true,
        paidAmountCents: true,
      },
    });

  const pendingOpenCharges = pendingCharges.filter(
    (charge) =>
      charge.paidAmountCents < charge.amountCents,
  );

  for (const charge of pendingOpenCharges) {
    await db.$transaction(async (tx) => {
      await tx.subscriptionCharge.update({
        where: {
          id: charge.id,
        },
        data: {
          status: SubscriptionChargeStatus.OVERDUE,
          overdueAt: processingDate,
        },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: charge.subscriptionId,
          type:
            SubscriptionEventType.CHARGE_MARKED_OVERDUE,
          description:
            "Cobrança marcada automaticamente como vencida.",
          metadata: {
            chargeId: charge.id,
            dueAt: charge.dueAt.toISOString(),
            processedAt:
              processingDate.toISOString(),
          },
        },
      });
    });

    result.chargesMarkedOverdue += 1;
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
        status: true,
        isComplimentary: true,
        administrator: {
          select: {
            isDemo: true,
          },
        },
        charges: {
          where: {
            status:
              SubscriptionChargeStatus.OVERDUE,
          },
          orderBy: {
            dueAt: "asc",
          },
          select: {
            id: true,
            dueAt: true,
            amountCents: true,
            paidAmountCents: true,
          },
        },
      },
    });

  for (const subscription of subscriptions) {
    if (
      subscription.isComplimentary ||
      subscription.administrator.isDemo
    ) {
      result.skippedComplimentary += 1;
      continue;
    }

    const overdueCharges =
      subscription.charges.filter(
        (charge) =>
          charge.paidAmountCents <
          charge.amountCents,
      );

    if (overdueCharges.length === 0) {
      if (
        subscription.status ===
          AdministratorPlanStatus.PAST_DUE ||
        subscription.status ===
          AdministratorPlanStatus.SUSPENDED
      ) {
        await db.$transaction(async (tx) => {
          await tx.administratorSubscription.update({
            where: {
              id: subscription.id,
            },
            data: {
              status:
                AdministratorPlanStatus.ACTIVE,
            },
          });

          await tx.administrator.update({
            where: {
              id: subscription.administratorId,
            },
            data: {
              planStatus:
                AdministratorPlanStatus.ACTIVE,
            },
          });

          await tx.subscriptionEvent.create({
            data: {
              subscriptionId: subscription.id,
              type:
                SubscriptionEventType.REACTIVATED,
              description:
                "Assinatura reativada automaticamente após regularização de todas as cobranças abertas.",
              metadata: {
                source:
                  "SUBSCRIPTION_DELINQUENCY_PROCESSOR",
                processedAt:
                  processingDate.toISOString(),
              },
            },
          });
        });

        result.subscriptionsReactivated += 1;

        const created = await notifyReactivation({
          administratorId:
            subscription.administratorId,
          subscriptionId: subscription.id,
          processingDate,
        });

        result.reactivationNotificationsCreated +=
          created;
        result.notificationsCreated += created;
      }

      continue;
    }

    const oldestCharge = overdueCharges[0];
    const oldestDueAt = oldestCharge.dueAt;
    const daysOverdue = daysBetween(
      oldestDueAt,
      processingDate,
    );
    const daysUntilSuspension = Math.max(
      gracePeriodDays - daysOverdue,
      0,
    );

    const targetStatus =
      daysOverdue > gracePeriodDays
        ? AdministratorPlanStatus.SUSPENDED
        : AdministratorPlanStatus.PAST_DUE;

    if (subscription.status !== targetStatus) {
      await db.$transaction(async (tx) => {
        await tx.administratorSubscription.update({
          where: {
            id: subscription.id,
          },
          data: {
            status: targetStatus,
          },
        });

        await tx.administrator.update({
          where: {
            id: subscription.administratorId,
          },
          data: {
            planStatus: targetStatus,
          },
        });

        await tx.subscriptionEvent.create({
          data: {
            subscriptionId: subscription.id,
            type:
              targetStatus ===
              AdministratorPlanStatus.SUSPENDED
                ? SubscriptionEventType.SUSPENDED
                : SubscriptionEventType.PAST_DUE,
            description:
              targetStatus ===
              AdministratorPlanStatus.SUSPENDED
                ? "Assinatura suspensa automaticamente após o período de tolerância."
                : "Assinatura marcada automaticamente como inadimplente.",
            metadata: {
              source:
                "SUBSCRIPTION_DELINQUENCY_PROCESSOR",
              oldestChargeId: oldestCharge.id,
              oldestDueAt:
                oldestDueAt.toISOString(),
              daysOverdue,
              gracePeriodDays,
              processedAt:
                processingDate.toISOString(),
            },
          },
        });
      });

      if (
        targetStatus ===
        AdministratorPlanStatus.SUSPENDED
      ) {
        result.subscriptionsSuspended += 1;
      } else {
        result.subscriptionsMarkedPastDue += 1;
      }
    }

    if (
      targetStatus ===
      AdministratorPlanStatus.SUSPENDED
    ) {
      const created = await notifySuspended({
        administratorId:
          subscription.administratorId,
        subscriptionId: subscription.id,
        oldestChargeId: oldestCharge.id,
        oldestDueAt,
        daysOverdue,
        gracePeriodDays,
      });

      result.suspensionNotificationsCreated +=
        created;
      result.notificationsCreated += created;
      continue;
    }

    const overdueCreated = await notifyOverdue({
      administratorId:
        subscription.administratorId,
      subscriptionId: subscription.id,
      oldestChargeId: oldestCharge.id,
      oldestDueAt,
      daysOverdue,
      gracePeriodDays,
    });

    result.overdueNotificationsCreated +=
      overdueCreated;
    result.notificationsCreated += overdueCreated;

    if (
      daysUntilSuspension <=
      SUSPENSION_WARNING_DAYS
    ) {
      const warningCreated =
        await notifySuspensionWarning({
          administratorId:
            subscription.administratorId,
          subscriptionId: subscription.id,
          oldestChargeId: oldestCharge.id,
          oldestDueAt,
          daysOverdue,
          gracePeriodDays,
          daysUntilSuspension,
        });

      result.suspensionWarningsCreated +=
        warningCreated;
      result.notificationsCreated += warningCreated;
    }
  }

  return result;
}
