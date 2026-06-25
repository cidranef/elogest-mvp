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
      pendingExpired,
      overdueCharges,
      pastDueSubscriptions,
      suspendedSubscriptions,
      lastProcessingEvent,
    ] = await Promise.all([
      db.billingGatewayConfiguration.findFirst({
        orderBy: {
          updatedAt: "desc",
        },
        select: {
          gracePeriodDays: true,
          automaticBillingEnabled: true,
          provider: true,
          environment: true,
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
            AdministratorPlanStatus.PAST_DUE,
        },
      }),
      db.administratorSubscription.count({
        where: {
          status:
            AdministratorPlanStatus.SUSPENDED,
        },
      }),
      db.subscriptionEvent.findFirst({
        where: {
          type: {
            in: [
              SubscriptionEventType
                .CHARGE_MARKED_OVERDUE,
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
          createdAt: true,
          description: true,
        },
      }),
    ]);

    return NextResponse.json({
      generatedAt: now.toISOString(),
      configuration: {
        gracePeriodDays:
          configuration?.gracePeriodDays ?? 5,
        automaticBillingEnabled:
          configuration?.automaticBillingEnabled ??
          false,
        provider:
          configuration?.provider ?? "MANUAL",
        environment:
          configuration?.environment ?? "DISABLED",
      },
      counters: {
        pendingExpired,
        overdueCharges,
        pastDueSubscriptions,
        suspendedSubscriptions,
      },
      lastProcessingEvent,
      cron: {
        endpoint:
          "/api/cron/billing-delinquency",
        authentication:
          "Authorization: Bearer <CRON_SECRET>",
        recommendedFrequency: "DAILY",
      },
    });
  } catch (error) {
    return billingApiError(error);
  }
}
