-- ETAPA 53.10 — Pagamento Informado Pelo Portal

CREATE TYPE "FinancialPaymentSubmissionStatus" AS ENUM (
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'CANCELED'
);

CREATE TABLE "FinancialPaymentSubmission" (
  "id" TEXT NOT NULL,
  "administratorId" TEXT NOT NULL,
  "condominiumId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "financialEntryId" TEXT NOT NULL,
  "submittedByUserId" TEXT NOT NULL,
  "submittedByAccessId" TEXT,
  "financialAttachmentId" TEXT,
  "approvedFinancialSettlementId" TEXT,
  "status" "FinancialPaymentSubmissionStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "paidAt" TIMESTAMP(3) NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "paymentMethod" "FinancialPaymentMethod",
  "notes" TEXT,
  "metadata" JSONB,
  "reviewedAt" TIMESTAMP(3),
  "reviewedByUserId" TEXT,
  "reviewNotes" TEXT,
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FinancialPaymentSubmission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FinancialPaymentSubmission_administratorId_idx" ON "FinancialPaymentSubmission"("administratorId");
CREATE INDEX "FinancialPaymentSubmission_condominiumId_idx" ON "FinancialPaymentSubmission"("condominiumId");
CREATE INDEX "FinancialPaymentSubmission_unitId_idx" ON "FinancialPaymentSubmission"("unitId");
CREATE INDEX "FinancialPaymentSubmission_financialEntryId_idx" ON "FinancialPaymentSubmission"("financialEntryId");
CREATE INDEX "FinancialPaymentSubmission_submittedByUserId_idx" ON "FinancialPaymentSubmission"("submittedByUserId");
CREATE INDEX "FinancialPaymentSubmission_submittedByAccessId_idx" ON "FinancialPaymentSubmission"("submittedByAccessId");
CREATE INDEX "FinancialPaymentSubmission_financialAttachmentId_idx" ON "FinancialPaymentSubmission"("financialAttachmentId");
CREATE INDEX "FinancialPaymentSubmission_approvedFinancialSettlementId_idx" ON "FinancialPaymentSubmission"("approvedFinancialSettlementId");
CREATE INDEX "FinancialPaymentSubmission_status_idx" ON "FinancialPaymentSubmission"("status");
CREATE INDEX "FinancialPaymentSubmission_paidAt_idx" ON "FinancialPaymentSubmission"("paidAt");
CREATE INDEX "FinancialPaymentSubmission_createdAt_idx" ON "FinancialPaymentSubmission"("createdAt");
CREATE INDEX "FinancialPaymentSubmission_administratorId_status_idx" ON "FinancialPaymentSubmission"("administratorId", "status");
CREATE INDEX "FinancialPaymentSubmission_unitId_status_idx" ON "FinancialPaymentSubmission"("unitId", "status");
CREATE INDEX "FinancialPaymentSubmission_financialEntryId_status_idx" ON "FinancialPaymentSubmission"("financialEntryId", "status");
