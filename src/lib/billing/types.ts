export type BillingGatewayProviderName =
  | "MANUAL"
  | "MOCK"
  | "ASAAS"
  | "MERCADO_PAGO"
  | "PAGARME"
  | "STRIPE"
  | "OTHER";

export type BillingGatewayEnvironmentName =
  | "DISABLED"
  | "SANDBOX"
  | "PRODUCTION";

export type BillingPaymentMethodName =
  | "PIX"
  | "BANK_TRANSFER"
  | "BOLETO"
  | "CREDIT_CARD"
  | "DEBIT_CARD"
  | "CASH"
  | "OTHER";

export type NormalizedWebhookEventType =
  | "CUSTOMER_CREATED"
  | "SUBSCRIPTION_CREATED"
  | "SUBSCRIPTION_UPDATED"
  | "SUBSCRIPTION_CANCELED"
  | "CHARGE_CREATED"
  | "CHARGE_UPDATED"
  | "CHARGE_PAID"
  | "CHARGE_OVERDUE"
  | "CHARGE_CANCELED"
  | "PAYMENT_CONFIRMED"
  | "PAYMENT_REFUNDED"
  | "UNKNOWN";

export interface BillingGatewayRuntimeConfig {
  provider: BillingGatewayProviderName;
  environment: BillingGatewayEnvironmentName;
  automaticBillingEnabled: boolean;
  pixEnabled: boolean;
  boletoEnabled: boolean;
  cardEnabled: boolean;
  apiKeyConfigured: boolean;
  webhookSecretConfigured: boolean;
}

export interface CreateGatewayCustomerInput {
  administratorId: string;
  name: string;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  metadata?: Record<string, unknown>;
}

export interface GatewayCustomerResult {
  provider: BillingGatewayProviderName;
  externalCustomerId: string;
  raw?: unknown;
}

export interface CreateGatewaySubscriptionInput {
  subscriptionId: string;
  externalCustomerId: string;
  description: string;
  amountCents: number;
  currency: string;
  billingInterval: "MONTHLY" | "ANNUAL" | "CUSTOM";
  nextBillingAt?: Date | null;
  metadata?: Record<string, unknown>;
}

export interface GatewaySubscriptionResult {
  provider: BillingGatewayProviderName;
  externalSubscriptionId: string;
  raw?: unknown;
}

export interface CreateGatewayChargeInput {
  chargeId: string;
  externalCustomerId: string;
  externalSubscriptionId?: string | null;
  description: string;
  amountCents: number;
  currency: string;
  dueAt: Date;
  allowedMethods: BillingPaymentMethodName[];
  metadata?: Record<string, unknown>;
}

export interface GatewayChargeResult {
  provider: BillingGatewayProviderName;
  externalChargeId: string;
  checkoutUrl?: string | null;
  pixCopyPaste?: string | null;
  boletoUrl?: string | null;
  raw?: unknown;
}

export interface GatewayActionResult {
  success: boolean;
  provider: BillingGatewayProviderName;
  externalId?: string | null;
  raw?: unknown;
}

export interface ParseWebhookInput {
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
}

export interface NormalizedWebhookEvent {
  provider: BillingGatewayProviderName;
  externalEventId: string;
  type: NormalizedWebhookEventType;
  occurredAt: Date;
  externalCustomerId?: string | null;
  externalSubscriptionId?: string | null;
  externalChargeId?: string | null;
  externalPaymentId?: string | null;
  amountCents?: number | null;
  raw: unknown;
}

export interface GatewayConnectionResult {
  connected: boolean;
  provider: BillingGatewayProviderName;
  environment: BillingGatewayEnvironmentName;
  message: string;
}
