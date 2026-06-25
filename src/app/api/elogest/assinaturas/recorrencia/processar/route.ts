import { NextResponse } from "next/server";

import {
  billingApiError,
  requireBillingSuperAdmin,
} from "@/lib/billing/api";
import { processRecurringSubscriptionCharges } from "@/lib/billing/recurring";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await requireBillingSuperAdmin();

    const result =
      await processRecurringSubscriptionCharges();

    return NextResponse.json({
      ok: true,
      message:
        result.automaticBillingEnabled
          ? "Processamento de cobranças recorrentes concluído."
          : "A cobrança automática global está desabilitada.",
      result,
    });
  } catch (error) {
    return billingApiError(error);
  }
}
