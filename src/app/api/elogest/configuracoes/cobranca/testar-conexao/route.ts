import { NextResponse } from "next/server";

import {
  billingApiError,
  requireBillingSuperAdmin,
} from "@/lib/billing/api";
import {
  getBillingGatewayConfigurationView,
  testConfiguredBillingGateway,
} from "@/lib/billing/configuration";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const userId = await requireBillingSuperAdmin();
    const result = await testConfiguredBillingGateway(userId);
    const view = await getBillingGatewayConfigurationView(userId);
    return NextResponse.json({ result, ...view });
  } catch (error) {
    return billingApiError(error);
  }
}
