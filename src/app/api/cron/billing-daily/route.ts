import { NextResponse } from "next/server";

import { processDailyBillingCycle } from "@/lib/billing/automation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return false;
  }

  return (
    request.headers.get("authorization") ===
    `Bearer ${secret}`
  );
}

async function run(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      {
        error: "Não autorizado.",
      },
      {
        status: 401,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  try {
    const result =
      await processDailyBillingCycle();

    return NextResponse.json(
      {
        ok: true,
        message:
          "Ciclo diário de cobrança concluído.",
        result,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error(
      "Erro ao executar o ciclo diário de cobrança:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Não foi possível executar o ciclo diário de cobrança.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
