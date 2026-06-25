import {
  BillingGatewayEnvironment,
  BillingGatewayProvider,
  BillingWebhookEventStatus,
  Prisma,
} from "@prisma/client";

import { db } from "@/lib/db";
import { createBillingGatewayByProvider } from "./gateway-service";
import { getOrCreateBillingGatewayConfiguration } from "./configuration-service";

function normalizeProvider(value: string): BillingGatewayProvider | null {
  const normalized = value.trim().toUpperCase().replace(/-/g, "_");

  if (
    Object.values(BillingGatewayProvider).includes(
      normalized as BillingGatewayProvider,
    )
  ) {
    return normalized as BillingGatewayProvider;
  }

  return null;
}

export async function receiveBillingWebhook(input: {
  providerParam: string;
  publicId: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
}) {
  const provider = normalizeProvider(input.providerParam);
  if (!provider) {
    throw new Error("Provider de cobrança inválido.");
  }

  const configuration = await getOrCreateBillingGatewayConfiguration();

  if (
    configuration.provider !== provider ||
    configuration.webhookPublicId !== input.publicId
  ) {
    throw new Error("Webhook de cobrança não reconhecido.");
  }

  if (configuration.environment === BillingGatewayEnvironment.DISABLED) {
    throw new Error("O webhook está desabilitado na configuração atual.");
  }

  const gateway = createBillingGatewayByProvider(provider);
  const normalized = await gateway.parseWebhook({
    headers: input.headers,
    rawBody: input.rawBody,
  });

  const payload = normalized.raw as Prisma.InputJsonValue;
  const normalizedData = {
    type: normalized.type,
    occurredAt: normalized.occurredAt.toISOString(),
    externalCustomerId: normalized.externalCustomerId ?? null,
    externalSubscriptionId: normalized.externalSubscriptionId ?? null,
    externalChargeId: normalized.externalChargeId ?? null,
    externalPaymentId: normalized.externalPaymentId ?? null,
    amountCents: normalized.amountCents ?? null,
  } satisfies Prisma.InputJsonObject;

  const existing = await db.billingWebhookEvent.findUnique({
    where: {
      provider_externalEventId: {
        provider,
        externalEventId: normalized.externalEventId,
      },
    },
  });

  if (existing) {
    return { event: existing, duplicate: true };
  }

  const event = await db.$transaction(async (tx) => {
    const created = await tx.billingWebhookEvent.create({
      data: {
        provider,
        externalEventId: normalized.externalEventId,
        eventType: normalized.type,
        status: BillingWebhookEventStatus.RECEIVED,
        payload,
        normalizedData,
      },
    });

    await tx.billingGatewayConfiguration.update({
      where: { id: configuration.id },
      data: {
        lastWebhookAt: new Date(),
        lastErrorAt: null,
        lastErrorMessage: null,
      },
    });

    return created;
  });

  return { event, duplicate: false };
}
