import {
  AdministratorPlanStatus,
  SubscriptionBillingInterval,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import {
  changeSubscriptionPlan,
  setSubscriptionStatus,
} from "@/lib/billing/subscriptions";
import {
  billingApiError,
  getAdministratorSubscription,
  optionalDate,
  optionalInteger,
  optionalString,
  requireBillingSuperAdmin,
  requireString,
} from "@/lib/billing/api";
import { InvalidSubscriptionOperationError } from "@/lib/billing/subscriptions";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    await requireBillingSuperAdmin();
    const { id } = await context.params;
    const subscription = await getAdministratorSubscription(id);

    if (!subscription) {
      return NextResponse.json(
        { error: "Assinatura não encontrada." },
        { status: 404 },
      );
    }

    return NextResponse.json({ subscription });
  } catch (error) {
    return billingApiError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const userId = await requireBillingSuperAdmin();
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const action = requireString(body.action, "action");

    if (action === "change_plan") {
      const subscription = await changeSubscriptionPlan({
        subscriptionId: id,
        newPlanId: requireString(body.newPlanId, "newPlanId"),
        billingInterval: body.billingInterval
          ? (body.billingInterval as SubscriptionBillingInterval)
          : undefined,
        basePriceCents: optionalInteger(body.basePriceCents, "basePriceCents"),
        discountCents: optionalInteger(body.discountCents, "discountCents"),
        nextBillingAt: optionalDate(body.nextBillingAt, "nextBillingAt"),
        reason: optionalString(body.reason),
        updatedByUserId: userId,
      });
      return NextResponse.json({ subscription });
    }

    if (action === "set_status") {
      const status = requireString(
        body.status,
        "status",
      ) as AdministratorPlanStatus;
      const subscription = await setSubscriptionStatus({
        subscriptionId: id,
        status,
        description: optionalString(body.reason),
        updatedByUserId: userId,
      });
      return NextResponse.json({ subscription });
    }

    throw new InvalidSubscriptionOperationError(
      "A ação informada não é suportada.",
    );
  } catch (error) {
    return billingApiError(error);
  }
}
