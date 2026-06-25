import { NextResponse } from "next/server";

import {
  billingApiError,
  requireBillingSuperAdmin,
} from "@/lib/billing/api";
import { processSubscriptionDelinquency } from "@/lib/billing/delinquency";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await requireBillingSuperAdmin();

    const result =
      await processSubscriptionDelinquency();

    return NextResponse.json({
      ok: true,
      message:
        "Processamento de inadimplência concluído.",
      result,
    });
  } catch (error) {
    return billingApiError(error);
  }
}
