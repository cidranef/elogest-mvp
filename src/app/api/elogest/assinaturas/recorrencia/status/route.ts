import {
  AdministratorPlanStatus,
  SubscriptionBillingInterval,
  SubscriptionChargeStatus,
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

    const [configuration, subscriptions, generatedCount] =
      await Promise.all([
        db.billingGatewayConfiguration.findFirst({
          orderBy: {
            updatedAt: "desc",
          },
          select: {
            automaticBillingEnabled: true,
            provider: true,
            environment: true,
          },
        }),
        db.administratorSubscription.findMany({
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
            status: true,
            billingInterval: true,
            finalPriceCents: true,
            isComplimentary: true,
            manualBillingOnly: true,
            nextBillingAt: true,
            administrator: {
              select: {
                id: true,
                name: true,
                isDemo: true,
              },
            },
            plan: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: {
            administrator: {
              name: "asc",
            },
          },
        }),
        db.subscriptionCharge.count({
          where: {
            metadata: {
              path: ["source"],
              equals:
                "SUBSCRIPTION_RECURRING_BILLING",
            },
          },
        }),
      ]);

    const items = subscriptions.map(
      (subscription) => {
        const reasons: string[] = [];

        if (subscription.manualBillingOnly) {
          reasons.push("Cobrança Manual");
        }

        if (subscription.isComplimentary) {
          reasons.push("Cortesia");
        }

        if (subscription.administrator.isDemo) {
          reasons.push("Ambiente Demo");
        }

        if (subscription.finalPriceCents <= 0) {
          reasons.push("Valor Não Definido");
        }

        if (!subscription.nextBillingAt) {
          reasons.push("Sem Próxima Cobrança");
        }

        if (
          subscription.billingInterval ===
          SubscriptionBillingInterval.CUSTOM
        ) {
          reasons.push("Periodicidade Personalizada");
        }

        const configurationEligible =
          !subscription.isComplimentary &&
          !subscription.administrator.isDemo &&
          subscription.finalPriceCents > 0 &&
          !!subscription.nextBillingAt &&
          subscription.billingInterval !==
            SubscriptionBillingInterval.CUSTOM;

        const dueNow =
          configurationEligible &&
          !subscription.manualBillingOnly &&
          !!subscription.nextBillingAt &&
          subscription.nextBillingAt <= now;

        return {
          id: subscription.id,
          administrator: subscription.administrator,
          plan: subscription.plan,
          status: subscription.status,
          billingInterval:
            subscription.billingInterval,
          finalPriceCents:
            subscription.finalPriceCents,
          isComplimentary:
            subscription.isComplimentary,
          manualBillingOnly:
            subscription.manualBillingOnly,
          recurringEnabled:
            !subscription.manualBillingOnly,
          nextBillingAt:
            subscription.nextBillingAt,
          configurationEligible,
          dueNow,
          reasons,
        };
      },
    );

    return NextResponse.json({
      generatedAt: now.toISOString(),
      configuration: {
        automaticBillingEnabled:
          configuration?.automaticBillingEnabled ??
          false,
        provider:
          configuration?.provider ?? "MANUAL",
        environment:
          configuration?.environment ?? "DISABLED",
      },
      counters: {
        subscriptions: items.length,
        recurringEnabled: items.filter(
          (item) => item.recurringEnabled,
        ).length,
        eligible: items.filter(
          (item) => item.configurationEligible,
        ).length,
        dueNow: items.filter(
          (item) => item.dueNow,
        ).length,
        generatedCharges: generatedCount,
      },
      subscriptions: items,
      cron: {
        endpoint:
          "/api/cron/billing-recurring",
        authentication:
          "Authorization: Bearer <CRON_SECRET>",
        recommendedFrequency: "DAILY",
      },
    });
  } catch (error) {
    return billingApiError(error);
  }
}
