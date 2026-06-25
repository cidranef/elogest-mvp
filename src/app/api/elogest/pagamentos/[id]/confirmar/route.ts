import { NextRequest, NextResponse } from "next/server";

import { confirmManualSubscriptionPayment } from "@/lib/billing/subscriptions";
import {
  billingApiError,
  requireBillingSuperAdmin,
} from "@/lib/billing/api";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  try {
    const userId = await requireBillingSuperAdmin();
    const { id } = await context.params;

    const payment = await confirmManualSubscriptionPayment({
      paymentId: id,
      confirmedByUserId: userId,
    });

    return NextResponse.json({ payment });
  } catch (error) {
    return billingApiError(error);
  }
}
