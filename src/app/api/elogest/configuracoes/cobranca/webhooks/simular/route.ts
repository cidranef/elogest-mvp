import { NextResponse } from "next/server";

import {
  optionalInteger,
  optionalString,
  requireString,
  billingApiError,
} from "@/lib/billing/api/http";
import { requireBillingSuperAdmin } from "@/lib/billing/api/super-admin";
import {
  isMockWebhookType,
  simulateBillingWebhook,
} from "@/lib/billing/configuration";

export async function POST(request: Request) {
  try {
    await requireBillingSuperAdmin();

    const body = (await request.json()) as Record<string, unknown>;
    const type = requireString(body.type, "tipo");

    if (!isMockWebhookType(type)) {
      return NextResponse.json(
        { error: "Tipo de evento Mock inválido." },
        { status: 400 },
      );
    }

    const amountCents = optionalInteger(body.amountCents, "valor");

    if (amountCents !== undefined && amountCents < 0) {
      return NextResponse.json(
        { error: "O valor do evento não pode ser negativo." },
        { status: 400 },
      );
    }

    const result = await simulateBillingWebhook({
      type,
      externalChargeId: optionalString(body.externalChargeId),
      externalPaymentId: optionalString(body.externalPaymentId),
      amountCents,
    });

    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return billingApiError(error);
  }
}
