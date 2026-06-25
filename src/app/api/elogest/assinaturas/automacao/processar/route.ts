import { NextResponse } from "next/server";

import {
  billingApiError,
  requireBillingSuperAdmin,
} from "@/lib/billing/api";
import { processDailyBillingCycle } from "@/lib/billing/automation";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await requireBillingSuperAdmin();

    const result =
      await processDailyBillingCycle();

    return NextResponse.json({
      ok: true,
      message:
        "Ciclo diário de cobrança concluído.",
      result,
    });
  } catch (error) {
    return billingApiError(error);
  }
}
