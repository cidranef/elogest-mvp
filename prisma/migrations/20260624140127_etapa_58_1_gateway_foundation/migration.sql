-- CreateEnum
CREATE TYPE "SubscriptionBillingInterval" AS ENUM ('MONTHLY', 'ANNUAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SubscriptionOrigin" AS ENUM ('COMMERCIAL_PROPOSAL', 'ONBOARDING', 'TRIAL_CONVERSION', 'MANUAL', 'MIGRATION');

-- CreateEnum
CREATE TYPE "SubscriptionChargeStatus" AS ENUM ('DRAFT', 'PENDING', 'PAID', 'OVERDUE', 'CANCELED', 'WAIVED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "SubscriptionPaymentStatus" AS ENUM ('PENDING_CONFIRMATION', 'CONFIRMED', 'CANCELED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "SubscriptionPaymentMethod" AS ENUM ('PIX', 'BANK_TRANSFER', 'BOLETO', 'CASH', 'OTHER', 'FUTURE_GATEWAY');

-- CreateEnum
CREATE TYPE "SubscriptionEventType" AS ENUM ('CREATED', 'TRIAL_STARTED', 'ACTIVATED', 'PLAN_CHANGED', 'PRICE_CHANGED', 'BILLING_DATE_CHANGED', 'CHARGE_CREATED', 'CHARGE_MARKED_OVERDUE', 'PAYMENT_RECORDED', 'PAYMENT_CONFIRMED', 'PAYMENT_CANCELED', 'PAYMENT_REFUNDED', 'PAST_DUE', 'SUSPENDED', 'REACTIVATED', 'CANCELLATION_SCHEDULED', 'CANCELLATION_REVERSED', 'CANCELED', 'EXPIRED', 'NOTES_UPDATED', 'EXTERNAL_REFERENCE_UPDATED');

-- CreateEnum
CREATE TYPE "BillingGatewayProvider" AS ENUM ('MANUAL', 'MOCK', 'ASAAS', 'MERCADO_PAGO', 'PAGARME', 'STRIPE', 'OTHER');

-- CreateEnum
CREATE TYPE "BillingGatewayEnvironment" AS ENUM ('DISABLED', 'SANDBOX', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "BillingGatewayConnectionStatus" AS ENUM ('NOT_CONFIGURED', 'CONFIGURED', 'CONNECTED', 'ERROR', 'DISABLED');

-- CreateEnum
CREATE TYPE "BillingWebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'IGNORED', 'FAILED');

-- CreateTable
CREATE TABLE "administrator_subscriptions" (
    "id" TEXT NOT NULL,
    "administratorId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "commercialProposalId" TEXT,
    "status" "AdministratorPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "billingInterval" "SubscriptionBillingInterval" NOT NULL DEFAULT 'MONTHLY',
    "origin" "SubscriptionOrigin" NOT NULL DEFAULT 'MANUAL',
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "basePriceCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "finalPriceCents" INTEGER NOT NULL,
    "implementationFeeCents" INTEGER NOT NULL DEFAULT 0,
    "isComplimentary" BOOLEAN NOT NULL DEFAULT false,
    "manualBillingOnly" BOOLEAN NOT NULL DEFAULT true,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "nextBillingAt" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancellationScheduledAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "endedAt" TIMESTAMP(3),
    "externalProvider" TEXT,
    "externalCustomerId" TEXT,
    "externalSubscriptionId" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "administrator_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_charges" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "administratorId" TEXT NOT NULL,
    "status" "SubscriptionChargeStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "amountCents" INTEGER NOT NULL,
    "referenceMonth" INTEGER,
    "referenceYear" INTEGER,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paidAmountCents" INTEGER NOT NULL DEFAULT 0,
    "overdueAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "waivedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "externalProvider" TEXT,
    "externalChargeId" TEXT,
    "externalReference" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_payments" (
    "id" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "administratorId" TEXT NOT NULL,
    "status" "SubscriptionPaymentStatus" NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    "method" "SubscriptionPaymentMethod" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "amountCents" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "referenceCode" TEXT,
    "payerName" TEXT,
    "payerDocument" TEXT,
    "receiptStorageKey" TEXT,
    "receiptFileName" TEXT,
    "receiptMimeType" TEXT,
    "receiptSizeBytes" INTEGER,
    "receiptSha256" TEXT,
    "externalProvider" TEXT,
    "externalPaymentId" TEXT,
    "notes" TEXT,
    "recordedByUserId" TEXT,
    "confirmedByUserId" TEXT,
    "canceledByUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_events" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "type" "SubscriptionEventType" NOT NULL,
    "description" TEXT,
    "createdByUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_gateway_configurations" (
    "id" TEXT NOT NULL,
    "provider" "BillingGatewayProvider" NOT NULL DEFAULT 'MANUAL',
    "environment" "BillingGatewayEnvironment" NOT NULL DEFAULT 'DISABLED',
    "status" "BillingGatewayConnectionStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "automaticBillingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "pixEnabled" BOOLEAN NOT NULL DEFAULT false,
    "boletoEnabled" BOOLEAN NOT NULL DEFAULT false,
    "cardEnabled" BOOLEAN NOT NULL DEFAULT false,
    "gracePeriodDays" INTEGER NOT NULL DEFAULT 5,
    "retryLimit" INTEGER NOT NULL DEFAULT 0,
    "webhookPublicId" TEXT,
    "webhookUrl" TEXT,
    "lastConnectionTestAt" TIMESTAMP(3),
    "lastWebhookAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_gateway_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_webhook_events" (
    "id" TEXT NOT NULL,
    "provider" "BillingGatewayProvider" NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" "BillingWebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "payload" JSONB NOT NULL,
    "normalizedData" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processingAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "administrator_subscriptions_commercialProposalId_key" ON "administrator_subscriptions"("commercialProposalId");

-- CreateIndex
CREATE INDEX "administrator_subscriptions_administratorId_status_idx" ON "administrator_subscriptions"("administratorId", "status");

-- CreateIndex
CREATE INDEX "administrator_subscriptions_planId_idx" ON "administrator_subscriptions"("planId");

-- CreateIndex
CREATE INDEX "administrator_subscriptions_nextBillingAt_idx" ON "administrator_subscriptions"("nextBillingAt");

-- CreateIndex
CREATE INDEX "administrator_subscriptions_trialEndsAt_idx" ON "administrator_subscriptions"("trialEndsAt");

-- CreateIndex
CREATE INDEX "administrator_subscriptions_externalProvider_externalSubscr_idx" ON "administrator_subscriptions"("externalProvider", "externalSubscriptionId");

-- CreateIndex
CREATE INDEX "subscription_charges_administratorId_status_idx" ON "subscription_charges"("administratorId", "status");

-- CreateIndex
CREATE INDEX "subscription_charges_subscriptionId_dueAt_idx" ON "subscription_charges"("subscriptionId", "dueAt");

-- CreateIndex
CREATE INDEX "subscription_charges_dueAt_status_idx" ON "subscription_charges"("dueAt", "status");

-- CreateIndex
CREATE INDEX "subscription_charges_externalProvider_externalChargeId_idx" ON "subscription_charges"("externalProvider", "externalChargeId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_charges_subscriptionId_referenceMonth_referenc_key" ON "subscription_charges"("subscriptionId", "referenceMonth", "referenceYear");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payments_receiptStorageKey_key" ON "subscription_payments"("receiptStorageKey");

-- CreateIndex
CREATE INDEX "subscription_payments_chargeId_status_idx" ON "subscription_payments"("chargeId", "status");

-- CreateIndex
CREATE INDEX "subscription_payments_administratorId_paidAt_idx" ON "subscription_payments"("administratorId", "paidAt");

-- CreateIndex
CREATE INDEX "subscription_payments_externalProvider_externalPaymentId_idx" ON "subscription_payments"("externalProvider", "externalPaymentId");

-- CreateIndex
CREATE INDEX "subscription_events_subscriptionId_createdAt_idx" ON "subscription_events"("subscriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "subscription_events_type_idx" ON "subscription_events"("type");

-- CreateIndex
CREATE UNIQUE INDEX "billing_gateway_configurations_webhookPublicId_key" ON "billing_gateway_configurations"("webhookPublicId");

-- CreateIndex
CREATE INDEX "billing_gateway_configurations_provider_environment_idx" ON "billing_gateway_configurations"("provider", "environment");

-- CreateIndex
CREATE INDEX "billing_gateway_configurations_status_idx" ON "billing_gateway_configurations"("status");

-- CreateIndex
CREATE INDEX "billing_webhook_events_status_receivedAt_idx" ON "billing_webhook_events"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "billing_webhook_events_provider_eventType_idx" ON "billing_webhook_events"("provider", "eventType");

-- CreateIndex
CREATE UNIQUE INDEX "billing_webhook_events_provider_externalEventId_key" ON "billing_webhook_events"("provider", "externalEventId");

-- AddForeignKey
ALTER TABLE "administrator_subscriptions" ADD CONSTRAINT "administrator_subscriptions_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "Administrator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administrator_subscriptions" ADD CONSTRAINT "administrator_subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administrator_subscriptions" ADD CONSTRAINT "administrator_subscriptions_commercialProposalId_fkey" FOREIGN KEY ("commercialProposalId") REFERENCES "commercial_proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_charges" ADD CONSTRAINT "subscription_charges_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "administrator_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_charges" ADD CONSTRAINT "subscription_charges_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "Administrator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "subscription_charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "Administrator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "administrator_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
