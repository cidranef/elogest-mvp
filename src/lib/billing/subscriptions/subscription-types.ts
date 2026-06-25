import type {
  AdministratorPlanStatus,
  SubscriptionBillingInterval,
  SubscriptionOrigin,
  SubscriptionPaymentMethod,
} from "@prisma/client";

export interface CreateAdministratorSubscriptionInput {
  administratorId: string;
  planId: string;
  commercialProposalId?: string | null;
  status?: AdministratorPlanStatus;
  billingInterval?: SubscriptionBillingInterval;
  origin?: SubscriptionOrigin;
  currency?: string;
  basePriceCents?: number | null;
  discountCents?: number;
  implementationFeeCents?: number;
  isComplimentary?: boolean;
  manualBillingOnly?: boolean;
  startedAt?: Date;
  trialEndsAt?: Date | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  nextBillingAt?: Date | null;
  notes?: string | null;
  createdByUserId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ChangeSubscriptionPlanInput {
  subscriptionId: string;
  newPlanId: string;
  billingInterval?: SubscriptionBillingInterval;
  basePriceCents?: number | null;
  discountCents?: number;
  nextBillingAt?: Date | null;
  reason?: string | null;
  updatedByUserId?: string | null;
}

export interface CreateManualChargeInput {
  subscriptionId: string;
  description: string;
  amountCents?: number | null;
  dueAt: Date;
  referenceMonth?: number | null;
  referenceYear?: number | null;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  notes?: string | null;
  createdByUserId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface RecordManualPaymentInput {
  chargeId: string;
  amountCents: number;
  paidAt: Date;
  method: SubscriptionPaymentMethod;
  referenceCode?: string | null;
  payerName?: string | null;
  payerDocument?: string | null;
  notes?: string | null;
  recordedByUserId?: string | null;
  confirmImmediately?: boolean;
  confirmedByUserId?: string | null;
  metadata?: Record<string, unknown> | null;
}
