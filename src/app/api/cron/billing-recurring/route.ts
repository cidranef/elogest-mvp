import { NextResponse } from "next/server";

import { processRecurringSubscriptionCharges } from "@/lib/billing/recurring";

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
      await processRecurringSubscriptionCharges();

    return NextResponse.json(
      {
        ok: true,
        message:
          result.automaticBillingEnabled
            ? "Cobranças recorrentes processadas."
            : "A cobrança automática global está desabilitada.",
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
      "Erro ao processar cobranças recorrentes:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Não foi possível processar as cobranças recorrentes.",
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
