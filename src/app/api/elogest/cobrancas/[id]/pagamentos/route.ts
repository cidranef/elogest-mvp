import { SubscriptionPaymentMethod } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { recordManualSubscriptionPayment } from "@/lib/billing/subscriptions";
import {
  billingApiError,
  optionalBoolean,
  optionalString,
  requireBillingSuperAdmin,
  requireDate,
  requireInteger,
  requireString,
} from "@/lib/billing/api";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const userId = await requireBillingSuperAdmin();
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;

    const payment = await recordManualSubscriptionPayment({
      chargeId: id,
      amountCents: requireInteger(body.amountCents, "amountCents"),
      paidAt: requireDate(body.paidAt, "paidAt"),
      method: requireString(body.method, "method") as SubscriptionPaymentMethod,
      referenceCode: optionalString(body.referenceCode),
      payerName: optionalString(body.payerName),
      payerDocument: optionalString(body.payerDocument),
      notes: optionalString(body.notes),
      recordedByUserId: userId,
      confirmImmediately: optionalBoolean(body.confirmImmediately),
      confirmedByUserId: userId,
    });

    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) {
    return billingApiError(error);
  }
}
