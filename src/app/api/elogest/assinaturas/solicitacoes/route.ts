import { NextResponse } from "next/server";

import { requireBillingSuperAdmin } from "@/lib/billing/api/super-admin";
import { billingApiError } from "@/lib/billing/api/http";
import { listPendingSubscriptionRequests } from "@/lib/billing/admin";

export async function GET() {
  try {
    await requireBillingSuperAdmin();

    const requests = await listPendingSubscriptionRequests();

    return NextResponse.json({ requests });
  } catch (error) {
    return billingApiError(error);
  }
}
