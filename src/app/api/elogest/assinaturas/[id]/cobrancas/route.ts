import { NextRequest, NextResponse } from "next/server";

import { createManualSubscriptionCharge } from "@/lib/billing/subscriptions";
import {
  billingApiError,
  optionalDate,
  optionalInteger,
  optionalString,
  requireBillingSuperAdmin,
  requireDate,
  requireString,
} from "@/lib/billing/api";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const userId = await requireBillingSuperAdmin();
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;

    const charge = await createManualSubscriptionCharge({
      subscriptionId: id,
      description: requireString(body.description, "description"),
      amountCents: optionalInteger(body.amountCents, "amountCents"),
      dueAt: requireDate(body.dueAt, "dueAt"),
      referenceMonth: optionalInteger(body.referenceMonth, "referenceMonth"),
      referenceYear: optionalInteger(body.referenceYear, "referenceYear"),
      periodStart: optionalDate(body.periodStart, "periodStart"),
      periodEnd: optionalDate(body.periodEnd, "periodEnd"),
      notes: optionalString(body.notes),
      createdByUserId: userId,
    });

    return NextResponse.json({ charge }, { status: 201 });
  } catch (error) {
    return billingApiError(error);
  }
}
