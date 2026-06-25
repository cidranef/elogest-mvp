import {
  SubscriptionBillingInterval,
} from "@prisma/client";
import { NextResponse } from "next/server";

import {
  billingApiError,
  optionalDate,
  requireBillingSuperAdmin,
} from "@/lib/billing/api";
import {
  getSubscriptionCommercialConfiguration,
  updateSubscriptionCommercialConfiguration,
} from "@/lib/billing/subscriptions";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  try {
    await requireBillingSuperAdmin();

    const { id } = await context.params;

    const subscription =
      await getSubscriptionCommercialConfiguration(id);

    return NextResponse.json({
      subscription,
    });
  } catch (error) {
    return billingApiError(error);
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext,
) {
  try {
    const userId =
      await requireBillingSuperAdmin();

    const { id } = await context.params;
    const body = (await request.json()) as Record<
      string,
      unknown
    >;

    const contractedValueCents =
      typeof body.contractedValueCents === "number"
        ? body.contractedValueCents
        : Number.NaN;

    const billingInterval =
      body.billingInterval === "ANNUAL"
        ? SubscriptionBillingInterval.ANNUAL
        : body.billingInterval === "MONTHLY"
          ? SubscriptionBillingInterval.MONTHLY
          : null;

    const currentPeriodStart = optionalDate(
      body.currentPeriodStart,
      "currentPeriodStart",
    );

    const currentPeriodEnd = optionalDate(
      body.currentPeriodEnd,
      "currentPeriodEnd",
    );

    const nextBillingAt = optionalDate(
      body.nextBillingAt,
      "nextBillingAt",
    );

    if (
      !Number.isInteger(contractedValueCents) ||
      contractedValueCents < 0
    ) {
      return NextResponse.json(
        {
          error:
            "Informe um valor contratado válido.",
        },
        {
          status: 400,
        },
      );
    }

    if (!billingInterval) {
      return NextResponse.json(
        {
          error:
            "Selecione periodicidade mensal ou anual.",
        },
        {
          status: 400,
        },
      );
    }

    if (!currentPeriodStart || !currentPeriodEnd) {
      return NextResponse.json(
        {
          error:
            "Informe o início e o fim do ciclo.",
        },
        {
          status: 400,
        },
      );
    }

    if (typeof body.recurringEnabled !== "boolean") {
      return NextResponse.json(
        {
          error:
            "Informe se a cobrança será manual ou recorrente.",
        },
        {
          status: 400,
        },
      );
    }

    const reason =
      typeof body.reason === "string"
        ? body.reason
        : "";

    const subscription =
      await updateSubscriptionCommercialConfiguration({
        subscriptionId: id,
        contractedValueCents,
        billingInterval,
        currentPeriodStart,
        currentPeriodEnd,
        nextBillingAt: nextBillingAt ?? null,
        recurringEnabled:
          body.recurringEnabled,
        reason,
        updatedByUserId: userId,
      });

    return NextResponse.json({
      subscription,
    });
  } catch (error) {
    return billingApiError(error);
  }
}
