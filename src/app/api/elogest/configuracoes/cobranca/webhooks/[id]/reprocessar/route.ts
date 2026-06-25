import { NextResponse } from "next/server";

import { billingApiError } from "@/lib/billing/api/http";
import { requireBillingSuperAdmin } from "@/lib/billing/api/super-admin";
import { processBillingWebhookEvent } from "@/lib/billing/configuration";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireBillingSuperAdmin();

    const { id } = await context.params;
    const result = await processBillingWebhookEvent(id);

    return NextResponse.json(result);
  } catch (error) {
    return billingApiError(error);
  }
}
