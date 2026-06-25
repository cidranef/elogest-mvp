import { NextResponse } from "next/server";

import { requireBillingSuperAdmin } from "@/lib/billing/api/super-admin";
import { billingApiError } from "@/lib/billing/api/http";
import { reviewSubscriptionRequest } from "@/lib/billing/admin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(
  request: Request,
  context: RouteContext,
) {
  try {
    const userId = await requireBillingSuperAdmin();
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;

    const decision =
      String(body.decision ?? "").trim().toUpperCase();
    const reviewNotes = String(body.reviewNotes ?? "").trim();

    if (decision !== "APPROVE" && decision !== "REJECT") {
      return NextResponse.json(
        { error: "Informe uma decisão válida." },
        { status: 400 },
      );
    }

    const reviewed = await reviewSubscriptionRequest({
      requestId: id,
      decision,
      reviewNotes,
      reviewedByUserId: userId,
    });

    return NextResponse.json({ request: reviewed });
  } catch (error) {
    return billingApiError(error);
  }
}
