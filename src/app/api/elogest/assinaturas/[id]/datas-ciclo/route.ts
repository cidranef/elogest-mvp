import { NextResponse } from "next/server";

import {
  billingApiError,
  optionalDate,
  optionalString,
  requireBillingSuperAdmin,
} from "@/lib/billing/api";
import {
  getSubscriptionCycleDates,
  updateSubscriptionCycleDates,
} from "@/lib/billing/subscriptions";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  try {
    await requireBillingSuperAdmin();

    const { id } = await context.params;
    const subscription =
      await getSubscriptionCycleDates(id);

    return NextResponse.json({ subscription });
  } catch (error) {
    return billingApiError(error);
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext,
) {
  try {
    const userId = await requireBillingSuperAdmin();

    const { id } = await context.params;
    const body = (await request.json()) as Record<
      string,
      unknown
    >;

    const currentPeriodStart = optionalDate(
      body.currentPeriodStart,
      "currentPeriodStart",
    );
    const currentPeriodEnd = optionalDate(
      body.currentPeriodEnd,
      "currentPeriodEnd",
    );

    if (!currentPeriodStart || !currentPeriodEnd) {
      return NextResponse.json(
        {
          error:
            "Informe o início e o fim do ciclo atual.",
        },
        { status: 400 },
      );
    }

    const subscription =
      await updateSubscriptionCycleDates({
        subscriptionId: id,
        currentPeriodStart,
        currentPeriodEnd,
        nextBillingAt: optionalDate(
          body.nextBillingAt,
          "nextBillingAt",
        ),
        reason: optionalString(body.reason),
        updatedByUserId: userId,
      });

    return NextResponse.json({ subscription });
  } catch (error) {
    return billingApiError(error);
  }
}
