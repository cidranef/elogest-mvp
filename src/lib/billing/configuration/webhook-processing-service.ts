import {
  BillingGatewayProvider,
  BillingWebhookEventStatus,
  Prisma,
} from "@prisma/client";

import { db } from "@/lib/db";

function isJsonRecord(
  value: Prisma.JsonValue | null,
): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const KNOWN_EVENT_TYPES = new Set([
  "CUSTOMER_CREATED",
  "SUBSCRIPTION_CREATED",
  "SUBSCRIPTION_UPDATED",
  "SUBSCRIPTION_CANCELED",
  "CHARGE_CREATED",
  "CHARGE_UPDATED",
  "CHARGE_PAID",
  "CHARGE_OVERDUE",
  "CHARGE_CANCELED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_REFUNDED",
]);

export async function listBillingWebhookEvents(input?: {
  status?: BillingWebhookEventStatus;
  provider?: BillingGatewayProvider;
  take?: number;
}) {
  const take = Math.min(Math.max(input?.take ?? 50, 1), 100);

  return db.billingWebhookEvent.findMany({
    where: {
      status: input?.status,
      provider: input?.provider,
    },
    orderBy: {
      receivedAt: "desc",
    },
    take,
    select: {
      id: true,
      provider: true,
      externalEventId: true,
      eventType: true,
      status: true,
      normalizedData: true,
      receivedAt: true,
      processingAt: true,
      processedAt: true,
      failedAt: true,
      errorMessage: true,
      attemptCount: true,
      updatedAt: true,
    },
  });
}

export async function getBillingWebhookEventById(id: string) {
  return db.billingWebhookEvent.findUnique({
    where: { id },
  });
}

export async function getBillingWebhookSummary() {
  const [total, received, processing, processed, ignored, failed] =
    await Promise.all([
      db.billingWebhookEvent.count(),
      db.billingWebhookEvent.count({
        where: { status: BillingWebhookEventStatus.RECEIVED },
      }),
      db.billingWebhookEvent.count({
        where: { status: BillingWebhookEventStatus.PROCESSING },
      }),
      db.billingWebhookEvent.count({
        where: { status: BillingWebhookEventStatus.PROCESSED },
      }),
      db.billingWebhookEvent.count({
        where: { status: BillingWebhookEventStatus.IGNORED },
      }),
      db.billingWebhookEvent.count({
        where: { status: BillingWebhookEventStatus.FAILED },
      }),
    ]);

  return {
    total,
    received,
    processing,
    processed,
    ignored,
    failed,
  };
}

/**
 * Processamento deliberadamente conservador.
 *
 * Nesta fase, o serviço:
 * - valida se o evento possui dados normalizados;
 * - reconhece o tipo do evento;
 * - registra sucesso, falha ou evento ignorado;
 * - NÃO altera assinatura, cobrança ou pagamento.
 *
 * A vinculação financeira automática será implementada somente quando
 * existir um adaptador real homologado.
 */
export async function processBillingWebhookEvent(id: string) {
  const event = await db.billingWebhookEvent.findUnique({
    where: { id },
  });

  if (!event) {
    throw new Error("Evento de webhook não encontrado.");
  }

  if (event.status === BillingWebhookEventStatus.PROCESSING) {
    throw new Error("O evento já está em processamento.");
  }

  await db.billingWebhookEvent.update({
    where: { id },
    data: {
      status: BillingWebhookEventStatus.PROCESSING,
      processingAt: new Date(),
      processedAt: null,
      failedAt: null,
      errorMessage: null,
      attemptCount: {
        increment: 1,
      },
    },
  });

  try {
    if (!isJsonRecord(event.normalizedData)) {
      const ignored = await db.billingWebhookEvent.update({
        where: { id },
        data: {
          status: BillingWebhookEventStatus.IGNORED,
          processedAt: new Date(),
          processingAt: null,
          errorMessage: "Evento sem dados normalizados.",
        },
      });

      return {
        event: ignored,
        result: "IGNORED" as const,
        message: "Evento ignorado por não possuir dados normalizados.",
      };
    }

    const eventType =
      typeof event.normalizedData.type === "string"
        ? event.normalizedData.type
        : event.eventType;

    if (!KNOWN_EVENT_TYPES.has(eventType)) {
      const ignored = await db.billingWebhookEvent.update({
        where: { id },
        data: {
          status: BillingWebhookEventStatus.IGNORED,
          processedAt: new Date(),
          processingAt: null,
          errorMessage: `Tipo de evento não reconhecido: ${eventType}.`,
        },
      });

      return {
        event: ignored,
        result: "IGNORED" as const,
        message: "Evento armazenado, mas ignorado por não possuir tipo reconhecido.",
      };
    }

    const processed = await db.billingWebhookEvent.update({
      where: { id },
      data: {
        status: BillingWebhookEventStatus.PROCESSED,
        processedAt: new Date(),
        processingAt: null,
        failedAt: null,
        errorMessage: null,
      },
    });

    return {
      event: processed,
      result: "PROCESSED" as const,
      message:
        "Evento validado e processado em modo seguro. Nenhum dado financeiro foi alterado.",
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha desconhecida ao processar o webhook.";

    const failed = await db.billingWebhookEvent.update({
      where: { id },
      data: {
        status: BillingWebhookEventStatus.FAILED,
        processingAt: null,
        failedAt: new Date(),
        errorMessage: message,
      },
    });

    return {
      event: failed,
      result: "FAILED" as const,
      message,
    };
  }
}
