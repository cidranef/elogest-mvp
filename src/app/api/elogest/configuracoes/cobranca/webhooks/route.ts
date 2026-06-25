import {
  BillingGatewayProvider,
  BillingWebhookEventStatus,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { billingApiError } from "@/lib/billing/api/http";
import { requireBillingSuperAdmin } from "@/lib/billing/api/super-admin";
import {
  getBillingWebhookSummary,
  listBillingWebhookEvents,
} from "@/lib/billing/configuration";

function parseEnum<T extends Record<string, string>>(
  values: T,
  value: string | null,
): T[keyof T] | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toUpperCase();

  return Object.values(values).includes(normalized as T[keyof T])
    ? (normalized as T[keyof T])
    : undefined;
}

export async function GET(request: NextRequest) {
  try {
    await requireBillingSuperAdmin();

    const status = parseEnum(
      BillingWebhookEventStatus,
      request.nextUrl.searchParams.get("status"),
    );
    const provider = parseEnum(
      BillingGatewayProvider,
      request.nextUrl.searchParams.get("provider"),
    );
    const takeParam = Number(request.nextUrl.searchParams.get("take") ?? "50");
    const take = Number.isInteger(takeParam) ? takeParam : 50;

    const [events, summary] = await Promise.all([
      listBillingWebhookEvents({
        status,
        provider,
        take,
      }),
      getBillingWebhookSummary(),
    ]);

    return NextResponse.json({
      events,
      summary,
    });
  } catch (error) {
    return billingApiError(error);
  }
}
