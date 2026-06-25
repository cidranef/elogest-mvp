import {
  BillingGatewayConnectionStatus,
  BillingGatewayEnvironment,
  BillingGatewayProvider,
} from "@prisma/client";

import { db } from "@/lib/db";
import type { BillingGateway } from "@/lib/billing/gateway";
import { ManualBillingGateway } from "@/lib/billing/providers/manual-billing-gateway";
import { MockBillingGateway } from "@/lib/billing/providers/mock-billing-gateway";
import {
  getOrCreateBillingGatewayConfiguration,
  isBillingProviderImplemented,
} from "./configuration-service";

export function createBillingGatewayByProvider(
  provider: BillingGatewayProvider,
): BillingGateway {
  switch (provider) {
    case BillingGatewayProvider.MANUAL:
      return new ManualBillingGateway();
    case BillingGatewayProvider.MOCK:
      return new MockBillingGateway();
    default:
      throw new Error(
        `O gateway ${provider} ainda não possui adaptador implementado.`,
      );
  }
}

export async function testConfiguredBillingGateway(userId: string) {
  const configuration = await getOrCreateBillingGatewayConfiguration(userId);

  if (!isBillingProviderImplemented(configuration.provider)) {
    const message = `O gateway ${configuration.provider} ainda não possui adaptador implementado.`;

    await db.billingGatewayConfiguration.update({
      where: { id: configuration.id },
      data: {
        status: BillingGatewayConnectionStatus.NOT_CONFIGURED,
        lastConnectionTestAt: new Date(),
        lastErrorAt: new Date(),
        lastErrorMessage: message,
        updatedByUserId: userId,
      },
    });

    throw new Error(message);
  }

  if (
    configuration.provider === BillingGatewayProvider.MOCK &&
    configuration.environment === BillingGatewayEnvironment.PRODUCTION
  ) {
    throw new Error("O provider MOCK não pode ser testado em produção.");
  }

  try {
    const gateway = createBillingGatewayByProvider(configuration.provider);
    const result = await gateway.testConnection();

    await db.billingGatewayConfiguration.update({
      where: { id: configuration.id },
      data: {
        status: result.connected
          ? BillingGatewayConnectionStatus.CONNECTED
          : BillingGatewayConnectionStatus.ERROR,
        lastConnectionTestAt: new Date(),
        lastErrorAt: result.connected ? null : new Date(),
        lastErrorMessage: result.connected ? null : result.message,
        updatedByUserId: userId,
      },
    });

    return result;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao testar o gateway.";

    await db.billingGatewayConfiguration.update({
      where: { id: configuration.id },
      data: {
        status: BillingGatewayConnectionStatus.ERROR,
        lastConnectionTestAt: new Date(),
        lastErrorAt: new Date(),
        lastErrorMessage: message,
        updatedByUserId: userId,
      },
    });

    throw error;
  }
}
