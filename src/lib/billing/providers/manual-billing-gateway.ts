import {
  BillingGatewayNotSupportedError,
  type BillingGateway,
} from "../gateway";
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
} from "../types";

export class ManualBillingGateway implements BillingGateway {
  readonly provider = "MANUAL";

  async createCustomer(
    input: CreateGatewayCustomerInput,
  ): Promise<GatewayCustomerResult> {
    return {
      provider: "MANUAL",
      externalCustomerId: `manual_customer_${input.administratorId}`,
    };
  }

  async createSubscription(
    input: CreateGatewaySubscriptionInput,
  ): Promise<GatewaySubscriptionResult> {
    return {
      provider: "MANUAL",
      externalSubscriptionId: `manual_subscription_${input.subscriptionId}`,
    };
  }

  async createCharge(input: CreateGatewayChargeInput): Promise<GatewayChargeResult> {
    return {
      provider: "MANUAL",
      externalChargeId: `manual_charge_${input.chargeId}`,
      checkoutUrl: null,
      pixCopyPaste: null,
      boletoUrl: null,
    };
  }

  async cancelSubscription(
    externalSubscriptionId: string,
  ): Promise<GatewayActionResult> {
    return {
      success: true,
      provider: "MANUAL",
      externalId: externalSubscriptionId,
    };
  }

  async refundPayment(
    externalPaymentId: string,
    _amountCents?: number,
  ): Promise<GatewayActionResult> {
    return {
      success: true,
      provider: "MANUAL",
      externalId: externalPaymentId,
    };
  }

  async parseWebhook(
    _input: ParseWebhookInput,
  ): Promise<NormalizedWebhookEvent> {
    throw new BillingGatewayNotSupportedError("parseWebhook", this.provider);
  }

  async testConnection(): Promise<GatewayConnectionResult> {
    return {
      connected: true,
      provider: "MANUAL",
      environment: "DISABLED",
      message: "Cobrança manual disponível. Nenhuma conexão externa é necessária.",
    };
  }
}
