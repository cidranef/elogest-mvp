import {
  SubscriptionBillingInterval,
} from "@prisma/client";
import { NextResponse } from "next/server";

import {
  billingApiError,
  optionalDate,
  optionalInteger,
  optionalString,
  requireBillingSuperAdmin,
  requireString,
} from "@/lib/billing/api";
import {
  cancelSubscriptionImmediately,
  changeSubscriptionPlanWithValidation,
  getSubscriptionPlanChangeAssessment,
  listAvailableSubscriptionPlans,
  reactivateSubscription,
  reverseScheduledCancellation,
  scheduleSubscriptionCancellation,
} from "@/lib/billing/subscriptions";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  request: Request,
  context: RouteContext,
) {
  try {
    await requireBillingSuperAdmin();

    const { id } = await context.params;
    const url = new URL(request.url);
    const newPlanId = url.searchParams.get("newPlanId");

    const plans = await listAvailableSubscriptionPlans();
    const assessment = newPlanId
      ? await getSubscriptionPlanChangeAssessment({
          subscriptionId: id,
          newPlanId,
        })
      : null;

    return NextResponse.json({
      plans,
      assessment,
    });
  } catch (error) {
    return billingApiError(error);
  }
}

export async function POST(
  request: Request,
  context: RouteContext,
) {
  try {
    const userId = await requireBillingSuperAdmin();
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const action = requireString(body.action, "action");

    if (action === "change_plan") {
      const result = await changeSubscriptionPlanWithValidation({
        subscriptionId: id,
        newPlanId: requireString(body.newPlanId, "newPlanId"),
        billingInterval: body.billingInterval
          ? (body.billingInterval as SubscriptionBillingInterval)
          : undefined,
        basePriceCents: optionalInteger(
          body.basePriceCents,
          "basePriceCents",
        ),
        discountCents: optionalInteger(
          body.discountCents,
          "discountCents",
        ),
        nextBillingAt: optionalDate(
          body.nextBillingAt,
          "nextBillingAt",
        ),
        reason: optionalString(body.reason),
        updatedByUserId: userId,
      });

      return NextResponse.json(result);
    }

    if (action === "schedule_cancel") {
      const subscription = await scheduleSubscriptionCancellation({
        subscriptionId: id,
        reason: optionalString(body.reason),
        updatedByUserId: userId,
      });

      return NextResponse.json({ subscription });
    }

    if (action === "reverse_cancel") {
      const subscription = await reverseScheduledCancellation({
        subscriptionId: id,
        reason: optionalString(body.reason),
        updatedByUserId: userId,
      });

      return NextResponse.json({ subscription });
    }

    if (action === "cancel_now") {
      const subscription = await cancelSubscriptionImmediately({
        subscriptionId: id,
        reason: optionalString(body.reason),
        updatedByUserId: userId,
      });

      return NextResponse.json({ subscription });
    }

    if (action === "reactivate") {
      const subscription = await reactivateSubscription({
        subscriptionId: id,
        reason: optionalString(body.reason),
        nextBillingAt: optionalDate(
          body.nextBillingAt,
          "nextBillingAt",
        ),
        updatedByUserId: userId,
      });

      return NextResponse.json({ subscription });
    }

    return NextResponse.json(
      { error: "Ação de ciclo não suportada." },
      { status: 400 },
    );
  } catch (error) {
    return billingApiError(error);
  }
}
