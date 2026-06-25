import {
  AdministratorPlanStatus,
  SubscriptionChargeStatus,
  SubscriptionEventType,
} from "@prisma/client";
import { NextResponse } from "next/server";

import {
  billingApiError,
  requireBillingSuperAdmin,
} from "@/lib/billing/api";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireBillingSuperAdmin();

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const [
      configuration,
      dueRecurringSubscriptions,
      pendingExpiredCharges,
      overdueCharges,
      suspendedSubscriptions,
      lastRecurringCharge,
      lastDelinquencyEvent,
    ] = await Promise.all([
      db.billingGatewayConfiguration.findFirst({
        orderBy: {
          updatedAt: "desc",
        },
        select: {
          automaticBillingEnabled: true,
          provider: true,
          environment: true,
          gracePeriodDays: true,
        },
      }),
      db.administratorSubscription.count({
        where: {
          manualBillingOnly: false,
          isComplimentary: false,
          finalPriceCents: {
            gt: 0,
          },
          nextBillingAt: {
            lte: now,
          },
          status: {
            in: [
              AdministratorPlanStatus.ACTIVE,
              AdministratorPlanStatus.PAST_DUE,
              AdministratorPlanStatus.SUSPENDED,
            ],
          },
          administrator: {
            isDemo: false,
          },
        },
      }),
      db.subscriptionCharge.count({
        where: {
          status:
            SubscriptionChargeStatus.PENDING,
          dueAt: {
            lt: todayStart,
          },
        },
      }),
      db.subscriptionCharge.count({
        where: {
          status:
            SubscriptionChargeStatus.OVERDUE,
        },
      }),
      db.administratorSubscription.count({
        where: {
          status:
            AdministratorPlanStatus.SUSPENDED,
        },
      }),
      db.subscriptionCharge.findFirst({
        where: {
          metadata: {
            path: ["source"],
            equals:
              "SUBSCRIPTION_RECURRING_BILLING",
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          description: true,
          amountCents: true,
          dueAt: true,
          createdAt: true,
          administrator: {
            select: {
              name: true,
            },
          },
        },
      }),
      db.subscriptionEvent.findFirst({
        where: {
          type: {
            in: [
              SubscriptionEventType.PAST_DUE,
              SubscriptionEventType.SUSPENDED,
              SubscriptionEventType.REACTIVATED,
            ],
          },
          metadata: {
            path: ["source"],
            equals:
              "SUBSCRIPTION_DELINQUENCY_PROCESSOR",
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        select: {
          type: true,
          description: true,
          createdAt: true,
        },
      }),
    ]);

    const cronSecretConfigured =
      Boolean(process.env.CRON_SECRET);

    const automaticBillingEnabled =
      configuration?.automaticBillingEnabled ??
      false;

    const ready =
      cronSecretConfigured &&
      automaticBillingEnabled;

    return NextResponse.json({
      generatedAt: now.toISOString(),
      readiness: {
        ready,
        cronSecretConfigured,
        automaticBillingEnabled,
        provider:
          configuration?.provider ?? "MANUAL",
        environment:
          configuration?.environment ?? "DISABLED",
        gracePeriodDays:
          configuration?.gracePeriodDays ?? 5,
      },
      counters: {
        dueRecurringSubscriptions,
        pendingExpiredCharges,
        overdueCharges,
        suspendedSubscriptions,
      },
      lastRecurringCharge,
      lastDelinquencyEvent,
      cron: {
        endpoint:
          "/api/cron/billing-daily",
        method: "POST",
        authentication:
          "Authorization: Bearer <CRON_SECRET>",
        recommendedFrequency: "DAILY",
        recommendedTime:
          "06:00 no fuso operacional do Railway",
        executionOrder: [
          "DELINQUENCY",
          "RECURRING_BILLING",
        ],
      },
    });
  } catch (error) {
    return billingApiError(error);
  }
}
