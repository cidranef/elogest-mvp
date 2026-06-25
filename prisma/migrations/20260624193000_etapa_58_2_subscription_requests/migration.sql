-- ETAPA 58.2 — Solicitações comerciais da assinatura

CREATE TYPE "SubscriptionRequestType" AS ENUM (
  'UPGRADE',
  'DOWNGRADE',
  'CANCELLATION',
  'CYCLE_REVIEW'
);

CREATE TYPE "SubscriptionRequestStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN'
);

CREATE TABLE "subscription_requests" (
  "id" TEXT NOT NULL,
  "administratorId" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "targetPlanId" TEXT,
  "type" "SubscriptionRequestType" NOT NULL,
  "status" "SubscriptionRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT NOT NULL,
  "reviewNotes" TEXT,
  "requestedByUserId" TEXT,
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "withdrawnAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "subscription_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "subscription_requests_administratorId_status_createdAt_idx"
  ON "subscription_requests"("administratorId", "status", "createdAt");

CREATE INDEX "subscription_requests_subscriptionId_status_idx"
  ON "subscription_requests"("subscriptionId", "status");

CREATE INDEX "subscription_requests_targetPlanId_idx"
  ON "subscription_requests"("targetPlanId");

CREATE INDEX "subscription_requests_type_status_idx"
  ON "subscription_requests"("type", "status");

ALTER TABLE "subscription_requests"
  ADD CONSTRAINT "subscription_requests_administratorId_fkey"
  FOREIGN KEY ("administratorId")
  REFERENCES "Administrator"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "subscription_requests"
  ADD CONSTRAINT "subscription_requests_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId")
  REFERENCES "administrator_subscriptions"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "subscription_requests"
  ADD CONSTRAINT "subscription_requests_targetPlanId_fkey"
  FOREIGN KEY ("targetPlanId")
  REFERENCES "Plan"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
