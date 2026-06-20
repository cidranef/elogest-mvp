import { NextRequest, NextResponse } from "next/server";
import {
  expireDueTrials,
  getTrialSummary,
} from "@/lib/trial-lifecycle";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest) {
  const configuredSecret = process.env.CRON_SECRET;

  if (!configuredSecret) {
    return false;
  }

  const bearerToken = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();

  const headerSecret = request.headers.get("x-cron-secret")?.trim();

  return bearerToken === configuredSecret || headerSecret === configuredSecret;
}

async function execute(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        error: "Execução não autorizada.",
      },
      {
        status: 401,
      },
    );
  }

  try {
    const result = await expireDueTrials();
    const trials = await getTrialSummary();

    const expiringSoon = trials
      .filter((item) => item.lifecycle.expiringSoon)
      .map((item) => ({
        id: item.id,
        name: item.name,
        planStatus: item.planStatus,
        planExpiresAt: item.planExpiresAt,
        daysRemaining: item.lifecycle.daysRemaining,
        plan: item.plan,
      }));

    return NextResponse.json({
      ok: true,
      message:
        result.expiredCount > 0
          ? `${result.expiredCount} trial(is) expirado(s).`
          : "Nenhum trial vencido encontrado.",
      checkedAt: result.checkedAt,
      expiredCount: result.expiredCount,
      expiredAdministrators: result.administrators,
      expiringSoon,
    });
  } catch (error) {
    console.error("[EloGest][Trial] Falha ao processar expiração:", error);

    return NextResponse.json(
      {
        error: "Não foi possível processar a expiração dos trials.",
      },
      {
        status: 500,
      },
    );
  }
}

export async function GET(request: NextRequest) {
  return execute(request);
}

export async function POST(request: NextRequest) {
  return execute(request);
}
