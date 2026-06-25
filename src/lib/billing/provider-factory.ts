import type { BillingGateway } from "./gateway";
import { getBillingGatewayRuntimeConfig } from "./config";
import { ManualBillingGateway } from "./providers/manual-billing-gateway";
import { MockBillingGateway } from "./providers/mock-billing-gateway";

export function createBillingGateway(): BillingGateway {
  const config = getBillingGatewayRuntimeConfig();

  switch (config.provider) {
    case "MANUAL":
      return new ManualBillingGateway();
    case "MOCK":
      return new MockBillingGateway();
    case "ASAAS":
    case "MERCADO_PAGO":
    case "PAGARME":
    case "STRIPE":
    case "OTHER":
      throw new Error(
        `O gateway ${config.provider} ainda não possui adaptador implementado.`,
      );
    default: {
      const exhaustiveCheck: never = config.provider;
      throw new Error(`Gateway inválido: ${exhaustiveCheck}`);
    }
  }
}
