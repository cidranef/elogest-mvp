import type {
  CreateGatewayChargeInput,
  CreateGatewayCustomerInput,
  CreateGatewaySubscriptionInput,
  GatewayActionResult,
  GatewayChargeResult,
  GatewayConnectionResult,
  GatewayCustomerResult,
  GatewaySubscriptionResult,
  NormalizedWebhookEvent,
  ParseWebhookInput,
} from "./types";

export interface BillingGateway {
  readonly provider: string;

  createCustomer(
    input: CreateGatewayCustomerInput,
  ): Promise<GatewayCustomerResult>;

  createSubscription(
    input: CreateGatewaySubscriptionInput,
  ): Promise<GatewaySubscriptionResult>;

  createCharge(
    input: CreateGatewayChargeInput,
  ): Promise<GatewayChargeResult>;

  cancelSubscription(externalSubscriptionId: string): Promise<GatewayActionResult>;

  refundPayment(
    externalPaymentId: string,
    amountCents?: number,
  ): Promise<GatewayActionResult>;

  parseWebhook(input: ParseWebhookInput): Promise<NormalizedWebhookEvent>;

  testConnection(): Promise<GatewayConnectionResult>;
}

export class BillingGatewayNotSupportedError extends Error {
  constructor(operation: string, provider: string) {
    super(`A operação ${operation} não é suportada pelo gateway ${provider}.`);
    this.name = "BillingGatewayNotSupportedError";
  }
}
