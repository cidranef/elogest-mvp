import { NextResponse } from "next/server";

import { requireActiveAdminApiAccess } from "@/lib/admin-api-guard";
import {
  createCancellationRequest,
  createCycleReviewRequest,
  createPlanChangeRequest,
  listAdministratorSubscriptionRequests,
  listAvailableRequestPlans,
} from "@/lib/billing/admin";

function text(value: unknown) {
  return String(value ?? "").trim();
}

export async function GET() {
  const auth = await requireActiveAdminApiAccess({
    allowSuspendedSubscription: true,
  });

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const [requests, plans] = await Promise.all([
      listAdministratorSubscriptionRequests(auth.administratorId),
      listAvailableRequestPlans(),
    ]);

    return NextResponse.json({
      requests,
      plans,
    });
  } catch (error) {
    console.error("Erro ao listar solicitações comerciais:", error);

    return NextResponse.json(
      {
        error: "Não foi possível carregar as solicitações comerciais.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireActiveAdminApiAccess({
    allowSuspendedSubscription: true,
  });

  if ("error" in auth) {
    return auth.error;
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const action = text(body.action);
    const reason = text(body.reason);

    if (action === "PLAN_CHANGE") {
      const targetPlanId = text(body.targetPlanId);

      if (!targetPlanId) {
        return NextResponse.json(
          { error: "Selecione o plano desejado." },
          { status: 400 },
        );
      }

      const created = await createPlanChangeRequest({
        administratorId: auth.administratorId,
        targetPlanId,
        reason,
        requestedByUserId: auth.authUser.id,
      });

      return NextResponse.json({ request: created }, { status: 201 });
    }

    if (action === "CANCELLATION") {
      const created = await createCancellationRequest({
        administratorId: auth.administratorId,
        reason,
        requestedByUserId: auth.authUser.id,
      });

      return NextResponse.json({ request: created }, { status: 201 });
    }

    if (action === "CYCLE_REVIEW") {
      const created = await createCycleReviewRequest({
        administratorId: auth.administratorId,
        reason,
        requestedByUserId: auth.authUser.id,
      });

      return NextResponse.json({ request: created }, { status: 201 });
    }

    return NextResponse.json(
      { error: "Ação comercial inválida." },
      { status: 400 },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível criar a solicitação.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
