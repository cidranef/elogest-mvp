import { createHash } from "node:crypto";
import type { BillingGateway } from "../gateway";
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

function stableId(prefix: string, value: string): string {
  const hash = createHash("sha256").update(value).digest("hex").slice(0, 20);
  return `${prefix}_${hash}`;
}

export class MockBillingGateway implements BillingGateway {
  readonly provider = "MOCK";

  async createCustomer(
    input: CreateGatewayCustomerInput,
  ): Promise<GatewayCustomerResult> {
    return {
      provider: "MOCK",
      externalCustomerId: stableId("mock_customer", input.administratorId),
      raw: { simulated: true },
    };
  }

  async createSubscription(
    input: CreateGatewaySubscriptionInput,
  ): Promise<GatewaySubscriptionResult> {
    return {
      provider: "MOCK",
      externalSubscriptionId: stableId("mock_subscription", input.subscriptionId),
      raw: { simulated: true },
    };
  }

  async createCharge(input: CreateGatewayChargeInput): Promise<GatewayChargeResult> {
    const externalChargeId = stableId("mock_charge", input.chargeId);
    return {
      provider: "MOCK",
      externalChargeId,
      checkoutUrl: `https://mock.elogest.local/checkout/${externalChargeId}`,
      pixCopyPaste: input.allowedMethods.includes("PIX")
        ? `ELOGEST-MOCK-PIX-${externalChargeId}`
        : null,
      boletoUrl: input.allowedMethods.includes("BOLETO")
        ? `https://mock.elogest.local/boleto/${externalChargeId}`
        : null,
      raw: { simulated: true },
    };
  }

  async cancelSubscription(
    externalSubscriptionId: string,
  ): Promise<GatewayActionResult> {
    return {
      success: true,
      provider: "MOCK",
      externalId: externalSubscriptionId,
      raw: { simulated: true },
    };
  }

  async refundPayment(
    externalPaymentId: string,
    amountCents?: number,
  ): Promise<GatewayActionResult> {
    return {
      success: true,
      provider: "MOCK",
      externalId: externalPaymentId,
      raw: { simulated: true, amountCents: amountCents ?? null },
    };
  }

  async parseWebhook(input: ParseWebhookInput): Promise<NormalizedWebhookEvent> {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(input.rawBody) as Record<string, unknown>;
    } catch {
      throw new Error("Payload de webhook MOCK inválido.");
    }

    const externalEventId = String(payload.id ?? "").trim();
    if (!externalEventId) {
      throw new Error("O webhook MOCK exige o campo id.");
    }

    const occurredAtValue = String(payload.occurredAt ?? "");
    const occurredAt = occurredAtValue ? new Date(occurredAtValue) : new Date();
    if (Number.isNaN(occurredAt.getTime())) {
      throw new Error("occurredAt inválido no webhook MOCK.");
    }

    return {
      provider: "MOCK",
      externalEventId,
      type: String(payload.type ?? "UNKNOWN") as NormalizedWebhookEvent["type"],
      occurredAt,
      externalCustomerId: payload.externalCustomerId
        ? String(payload.externalCustomerId)
        : null,
      externalSubscriptionId: payload.externalSubscriptionId
        ? String(payload.externalSubscriptionId)
        : null,
      externalChargeId: payload.externalChargeId
        ? String(payload.externalChargeId)
        : null,
      externalPaymentId: payload.externalPaymentId
        ? String(payload.externalPaymentId)
        : null,
      amountCents:
        typeof payload.amountCents === "number" ? payload.amountCents : null,
      raw: payload,
    };
  }

  async testConnection(): Promise<GatewayConnectionResult> {
    return {
      connected: true,
      provider: "MOCK",
      environment: "SANDBOX",
      message: "Gateway simulado conectado. Nenhuma cobrança real será realizada.",
    };
  }
}
