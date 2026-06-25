import { NextResponse } from "next/server";

import {
  billingApiError,
  getAdministratorSubscriptionSummary,
  requireBillingSuperAdmin,
} from "@/lib/billing/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireBillingSuperAdmin();
    const summary = await getAdministratorSubscriptionSummary();
    return NextResponse.json({ summary });
  } catch (error) {
    return billingApiError(error);
  }
}
