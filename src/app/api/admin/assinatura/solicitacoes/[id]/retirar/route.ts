import { NextResponse } from "next/server";

import { requireActiveAdminApiAccess } from "@/lib/admin-api-guard";
import { withdrawSubscriptionRequest } from "@/lib/billing/admin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(
  _request: Request,
  context: RouteContext,
) {
  const auth = await requireActiveAdminApiAccess({
    allowSuspendedSubscription: true,
  });

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const { id } = await context.params;

    const request = await withdrawSubscriptionRequest({
      administratorId: auth.administratorId,
      requestId: id,
      requestedByUserId: auth.authUser.id,
    });

    return NextResponse.json({ request });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível retirar a solicitação.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
