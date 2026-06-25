import {
  AdministratorPlanStatus,
  SubscriptionBillingInterval,
  SubscriptionOrigin,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import {
  createAdministratorSubscription,
} from "@/lib/billing/subscriptions";
import {
  billingApiError,
  listAdministratorSubscriptions,
  optionalBoolean,
  optionalDate,
  optionalInteger,
  optionalString,
  requireBillingSuperAdmin,
  requireString,
} from "@/lib/billing/api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireBillingSuperAdmin();
    const params = request.nextUrl.searchParams;
    const statusValue = params.get("status");

    const result = await listAdministratorSubscriptions({
      search: params.get("search") ?? undefined,
      status: statusValue
        ? (statusValue as AdministratorPlanStatus)
        : undefined,
      planId: params.get("planId") ?? undefined,
      page: Number(params.get("page") ?? 1),
      pageSize: Number(params.get("pageSize") ?? 20),
    });

    return NextResponse.json(result);
  } catch (error) {
    return billingApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireBillingSuperAdmin();
    const body = (await request.json()) as Record<string, unknown>;

    const subscription = await createAdministratorSubscription({
      administratorId: requireString(body.administratorId, "administratorId"),
      planId: requireString(body.planId, "planId"),
      commercialProposalId: optionalString(body.commercialProposalId),
      status: body.status
        ? (body.status as AdministratorPlanStatus)
        : undefined,
      billingInterval: body.billingInterval
        ? (body.billingInterval as SubscriptionBillingInterval)
        : undefined,
      origin: body.origin ? (body.origin as SubscriptionOrigin) : undefined,
      currency: optionalString(body.currency) ?? undefined,
      basePriceCents: optionalInteger(body.basePriceCents, "basePriceCents"),
      discountCents: optionalInteger(body.discountCents, "discountCents"),
      implementationFeeCents: optionalInteger(
        body.implementationFeeCents,
        "implementationFeeCents",
      ),
      isComplimentary: optionalBoolean(body.isComplimentary),
      manualBillingOnly: optionalBoolean(body.manualBillingOnly),
      startedAt: optionalDate(body.startedAt, "startedAt") ?? undefined,
      trialEndsAt: optionalDate(body.trialEndsAt, "trialEndsAt"),
      currentPeriodStart: optionalDate(
        body.currentPeriodStart,
        "currentPeriodStart",
      ),
      currentPeriodEnd: optionalDate(body.currentPeriodEnd, "currentPeriodEnd"),
      nextBillingAt: optionalDate(body.nextBillingAt, "nextBillingAt"),
      notes: optionalString(body.notes),
      createdByUserId: userId,
    });

    return NextResponse.json({ subscription }, { status: 201 });
  } catch (error) {
    return billingApiError(error);
  }
}
