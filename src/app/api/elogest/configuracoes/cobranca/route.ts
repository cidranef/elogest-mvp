import {
  BillingGatewayEnvironment,
  BillingGatewayProvider,
} from "@prisma/client";
import { NextResponse } from "next/server";

import {
  billingApiError,
  optionalBoolean,
  optionalInteger,
  requireBillingSuperAdmin,
  requireString,
} from "@/lib/billing/api";
import {
  getBillingGatewayConfigurationView,
  updateBillingGatewayConfiguration,
} from "@/lib/billing/configuration";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await requireBillingSuperAdmin();
    const view = await getBillingGatewayConfigurationView(userId);
    return NextResponse.json(view);
  } catch (error) {
    return billingApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await requireBillingSuperAdmin();
    const body = (await request.json()) as Record<string, unknown>;

    const provider = requireString(body.provider, "provider").toUpperCase();
    const environment = requireString(
      body.environment,
      "environment",
    ).toUpperCase();

    if (!Object.values(BillingGatewayProvider).includes(provider as BillingGatewayProvider)) {
      return NextResponse.json({ error: "Provider de cobrança inválido." }, { status: 400 });
    }

    if (!Object.values(BillingGatewayEnvironment).includes(environment as BillingGatewayEnvironment)) {
      return NextResponse.json({ error: "Ambiente de cobrança inválido." }, { status: 400 });
    }

    await updateBillingGatewayConfiguration({
      provider: provider as BillingGatewayProvider,
      environment: environment as BillingGatewayEnvironment,
      automaticBillingEnabled: optionalBoolean(body.automaticBillingEnabled) ?? false,
      pixEnabled: optionalBoolean(body.pixEnabled) ?? false,
      boletoEnabled: optionalBoolean(body.boletoEnabled) ?? false,
      cardEnabled: optionalBoolean(body.cardEnabled) ?? false,
      gracePeriodDays: optionalInteger(body.gracePeriodDays, "gracePeriodDays") ?? 5,
      retryLimit: optionalInteger(body.retryLimit, "retryLimit") ?? 0,
      updatedByUserId: userId,
    });

    const view = await getBillingGatewayConfigurationView(userId);
    return NextResponse.json(view);
  } catch (error) {
    return billingApiError(error);
  }
}
