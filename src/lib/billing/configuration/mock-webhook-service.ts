import { randomUUID } from "node:crypto";
import { BillingGatewayEnvironment, BillingGatewayProvider } from "@prisma/client";

import { getOrCreateBillingGatewayConfiguration } from "./configuration-service";
import { receiveBillingWebhook } from "./webhook-service";

const ALLOWED_MOCK_TYPES = [
  "CHARGE_CREATED",
  "CHARGE_PAID",
  "CHARGE_OVERDUE",
  "CHARGE_CANCELED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_REFUNDED",
] as const;

export type MockWebhookType = (typeof ALLOWED_MOCK_TYPES)[number];

export function isMockWebhookType(value: unknown): value is MockWebhookType {
  return (
    typeof value === "string" &&
    ALLOWED_MOCK_TYPES.includes(value as MockWebhookType)
  );
}

export async function simulateBillingWebhook(input: {
  type: MockWebhookType;
  externalChargeId?: string | null;
  externalPaymentId?: string | null;
  amountCents?: number | null;
}) {
  const configuration = await getOrCreateBillingGatewayConfiguration();

  if (configuration.provider !== BillingGatewayProvider.MOCK) {
    throw new Error(
      "Selecione o provider Simulado antes de gerar eventos de teste.",
    );
  }

  if (configuration.environment !== BillingGatewayEnvironment.SANDBOX) {
    throw new Error(
      "A simulação de webhooks exige o ambiente Sandbox.",
    );
  }

  const now = new Date();
  const payload = {
    id: `mock_event_${randomUUID()}`,
    type: input.type,
    occurredAt: now.toISOString(),
    externalChargeId:
      input.externalChargeId?.trim() || `mock_charge_${randomUUID()}`,
    externalPaymentId:
      input.externalPaymentId?.trim() ||
      (input.type.includes("PAYMENT") || input.type === "CHARGE_PAID"
        ? `mock_payment_${randomUUID()}`
        : null),
    amountCents:
      typeof input.amountCents === "number" ? input.amountCents : null,
  };

  if (!configuration.webhookPublicId) {
    throw new Error(
      "A configuração de cobrança ainda não possui um identificador público de webhook.",
    );
  }

  return receiveBillingWebhook({
    providerParam: "mock",
    publicId: configuration.webhookPublicId,
    headers: {
      "content-type": "application/json",
      "x-elogest-mock": "true",
    },
    rawBody: JSON.stringify(payload),
  });
}
