import type {
  BillingGatewayEnvironmentName,
  BillingGatewayProviderName,
  BillingGatewayRuntimeConfig,
} from "./types";

const PROVIDERS: BillingGatewayProviderName[] = [
  "MANUAL",
  "MOCK",
  "ASAAS",
  "MERCADO_PAGO",
  "PAGARME",
  "STRIPE",
  "OTHER",
];

const ENVIRONMENTS: BillingGatewayEnvironmentName[] = [
  "DISABLED",
  "SANDBOX",
  "PRODUCTION",
];

function readBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return value.trim().toLowerCase() === "true";
}

function readEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  if (!value) return fallback;
  const normalized = value.trim().toUpperCase() as T;
  return allowed.includes(normalized) ? normalized : fallback;
}

export function getBillingGatewayRuntimeConfig(): BillingGatewayRuntimeConfig {
  const provider = readEnum(
    process.env.BILLING_GATEWAY_PROVIDER,
    PROVIDERS,
    "MANUAL",
  );
  const environment = readEnum(
    process.env.BILLING_GATEWAY_ENV,
    ENVIRONMENTS,
    "DISABLED",
  );

  const automaticBillingEnabled = readBoolean(
    process.env.BILLING_AUTOMATIC_ENABLED,
    false,
  );

  if (environment === "PRODUCTION" && provider === "MOCK") {
    throw new Error("O gateway MOCK não pode ser usado em produção.");
  }

  if (automaticBillingEnabled && provider === "MANUAL") {
    throw new Error(
      "A cobrança automática não pode ser habilitada com o provider MANUAL.",
    );
  }

  return {
    provider,
    environment,
    automaticBillingEnabled,
    pixEnabled: readBoolean(process.env.BILLING_PIX_ENABLED, false),
    boletoEnabled: readBoolean(process.env.BILLING_BOLETO_ENABLED, false),
    cardEnabled: readBoolean(process.env.BILLING_CARD_ENABLED, false),
    apiKeyConfigured: Boolean(process.env.BILLING_GATEWAY_API_KEY),
    webhookSecretConfigured: Boolean(process.env.BILLING_GATEWAY_WEBHOOK_SECRET),
  };
}
