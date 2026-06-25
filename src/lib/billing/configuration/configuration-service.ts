import { randomUUID } from "node:crypto";

import {
  BillingGatewayConnectionStatus,
  BillingGatewayEnvironment,
  BillingGatewayProvider,
  Prisma,
} from "@prisma/client";

import { db } from "@/lib/db";
import { getBillingGatewayRuntimeConfig } from "@/lib/billing/config";
import type {
  BillingGatewayEnvironmentName,
  BillingGatewayProviderName,
} from "@/lib/billing/types";

const IMPLEMENTED_PROVIDERS = new Set<BillingGatewayProviderName>([
  "MANUAL",
  "MOCK",
]);

export interface UpdateBillingGatewayConfigurationInput {
  provider: BillingGatewayProvider;
  environment: BillingGatewayEnvironment;
  automaticBillingEnabled: boolean;
  pixEnabled: boolean;
  boletoEnabled: boolean;
  cardEnabled: boolean;
  gracePeriodDays: number;
  retryLimit: number;
  updatedByUserId: string;
}

function validateConfiguration(
  input: UpdateBillingGatewayConfigurationInput,
): void {
  if (!Number.isInteger(input.gracePeriodDays) || input.gracePeriodDays < 0 || input.gracePeriodDays > 90) {
    throw new Error("O período de tolerância deve estar entre 0 e 90 dias.");
  }

  if (!Number.isInteger(input.retryLimit) || input.retryLimit < 0 || input.retryLimit > 20) {
    throw new Error("O limite de tentativas deve estar entre 0 e 20.");
  }

  if (input.provider === BillingGatewayProvider.MANUAL) {
    if (input.environment !== BillingGatewayEnvironment.DISABLED) {
      throw new Error("O provider MANUAL deve permanecer com o ambiente desabilitado.");
    }

    if (input.automaticBillingEnabled) {
      throw new Error("A cobrança automática não pode ser ativada no modo manual.");
    }
  }

  if (
    input.provider === BillingGatewayProvider.MOCK &&
    input.environment === BillingGatewayEnvironment.PRODUCTION
  ) {
    throw new Error("O provider MOCK não pode ser usado em produção.");
  }

  if (
    !IMPLEMENTED_PROVIDERS.has(input.provider as BillingGatewayProviderName) &&
    input.environment !== BillingGatewayEnvironment.DISABLED
  ) {
    throw new Error(
      "Este gateway ainda não possui adaptador. Mantenha o ambiente desabilitado até a integração específica.",
    );
  }
}

function buildWebhookUrl(
  provider: BillingGatewayProvider,
  publicId: string,
): string | null {
  const appUrl = (process.env.APP_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
  if (!appUrl) return null;

  return `${appUrl}/api/webhooks/billing/${provider.toLowerCase()}/${publicId}`;
}

export async function getOrCreateBillingGatewayConfiguration(
  userId?: string,
) {
  const existing = await db.billingGatewayConfiguration.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (existing) {
    return existing;
  }

  const runtime = getBillingGatewayRuntimeConfig();
  const publicId = randomUUID().replace(/-/g, "");

  return db.billingGatewayConfiguration.create({
    data: {
      provider: runtime.provider as BillingGatewayProvider,
      environment: runtime.environment as BillingGatewayEnvironment,
      status:
        runtime.environment === "DISABLED"
          ? BillingGatewayConnectionStatus.DISABLED
          : BillingGatewayConnectionStatus.NOT_CONFIGURED,
      automaticBillingEnabled: runtime.automaticBillingEnabled,
      pixEnabled: runtime.pixEnabled,
      boletoEnabled: runtime.boletoEnabled,
      cardEnabled: runtime.cardEnabled,
      webhookPublicId: publicId,
      webhookUrl: buildWebhookUrl(
        runtime.provider as BillingGatewayProvider,
        publicId,
      ),
      createdByUserId: userId,
      updatedByUserId: userId,
    },
  });
}

export async function getBillingGatewayConfigurationView(userId?: string) {
  const configuration = await getOrCreateBillingGatewayConfiguration(userId);
  const runtime = getBillingGatewayRuntimeConfig();

  return {
    configuration,
    runtime,
    implementedProviders: Array.from(IMPLEMENTED_PROVIDERS),
    credentials: {
      apiKeyConfigured: runtime.apiKeyConfigured,
      webhookSecretConfigured: runtime.webhookSecretConfigured,
    },
  };
}

export async function updateBillingGatewayConfiguration(
  input: UpdateBillingGatewayConfigurationInput,
) {
  validateConfiguration(input);

  const current = await getOrCreateBillingGatewayConfiguration(
    input.updatedByUserId,
  );
  const publicId = current.webhookPublicId || randomUUID().replace(/-/g, "");

  const status =
    input.environment === BillingGatewayEnvironment.DISABLED
      ? BillingGatewayConnectionStatus.DISABLED
      : BillingGatewayConnectionStatus.CONFIGURED;

  return db.billingGatewayConfiguration.update({
    where: { id: current.id },
    data: {
      provider: input.provider,
      environment: input.environment,
      status,
      automaticBillingEnabled: input.automaticBillingEnabled,
      pixEnabled: input.pixEnabled,
      boletoEnabled: input.boletoEnabled,
      cardEnabled: input.cardEnabled,
      gracePeriodDays: input.gracePeriodDays,
      retryLimit: input.retryLimit,
      webhookPublicId: publicId,
      webhookUrl: buildWebhookUrl(input.provider, publicId),
      updatedByUserId: input.updatedByUserId,
      lastErrorAt: null,
      lastErrorMessage: null,
      metadata: {
        ...(typeof current.metadata === "object" && current.metadata !== null
          ? (current.metadata as Prisma.JsonObject)
          : {}),
        lastConfiguredAt: new Date().toISOString(),
      },
    },
  });
}

export function isBillingProviderImplemented(
  provider: BillingGatewayProvider | BillingGatewayProviderName,
): boolean {
  return IMPLEMENTED_PROVIDERS.has(provider as BillingGatewayProviderName);
}

export function toGatewayProviderName(
  provider: BillingGatewayProvider,
): BillingGatewayProviderName {
  return provider as BillingGatewayProviderName;
}

export function toGatewayEnvironmentName(
  environment: BillingGatewayEnvironment,
): BillingGatewayEnvironmentName {
  return environment as BillingGatewayEnvironmentName;
}
