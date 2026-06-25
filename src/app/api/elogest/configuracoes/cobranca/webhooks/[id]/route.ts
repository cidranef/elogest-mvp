import { NextResponse } from "next/server";

import { billingApiError } from "@/lib/billing/api/http";
import { requireBillingSuperAdmin } from "@/lib/billing/api/super-admin";
import { getBillingWebhookEventById } from "@/lib/billing/configuration";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireBillingSuperAdmin();

    const { id } = await context.params;
    const event = await getBillingWebhookEventById(id);

    if (!event) {
      return NextResponse.json(
        { error: "Evento de webhook não encontrado." },
        { status: 404 },
      );
    }

    return NextResponse.json({ event });
  } catch (error) {
    return billingApiError(error);
  }
}
