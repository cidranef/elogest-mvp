import {
  processSubscriptionDelinquency,
  type DelinquencyProcessingResult,
} from "@/lib/billing/delinquency";
import {
  processRecurringSubscriptionCharges,
  type RecurringBillingProcessingResult,
} from "@/lib/billing/recurring";

export type DailyBillingProcessingResult = {
  startedAt: string;
  finishedAt: string;
  executionOrder: [
    "DELINQUENCY",
    "RECURRING_BILLING",
  ];
  delinquency: DelinquencyProcessingResult;
  recurringBilling: RecurringBillingProcessingResult;
};

/**
 * Executa a rotina diária de cobrança na ordem segura:
 *
 * 1. Processa cobranças vencidas já existentes;
 * 2. Gera novas cobranças recorrentes.
 *
 * Essa ordem evita que uma cobrança criada com vencimento no próprio dia
 * seja marcada como vencida na mesma execução.
 */
export async function processDailyBillingCycle(
  processingDate = new Date(),
): Promise<DailyBillingProcessingResult> {
  const startedAt = new Date().toISOString();

  const delinquency =
    await processSubscriptionDelinquency(
      processingDate,
    );

  const recurringBilling =
    await processRecurringSubscriptionCharges(
      processingDate,
    );

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    executionOrder: [
      "DELINQUENCY",
      "RECURRING_BILLING",
    ],
    delinquency,
    recurringBilling,
  };
}
