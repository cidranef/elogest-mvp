-- CreateEnum
CREATE TYPE "FinancialEntryType" AS ENUM ('REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "FinancialEntryOrigin" AS ENUM ('MANUAL', 'UNIT_CHARGE_BATCH', 'UNIT_CHARGE_ADJUSTMENT', 'IMPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "FinancialEntryStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "FinancialSettlementType" AS ENUM ('PAYMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "FinancialPaymentMethod" AS ENUM ('CASH', 'PIX', 'BANK_TRANSFER', 'BOLETO', 'CREDIT_CARD', 'DEBIT_CARD', 'CHECK', 'OTHER');

-- CreateEnum
CREATE TYPE "FinancialAttachmentScope" AS ENUM ('ENTRY', 'SETTLEMENT');

-- CreateEnum
CREATE TYPE "FinancialLogAction" AS ENUM ('CREATED', 'UPDATED', 'CANCELED', 'REACTIVATED', 'SETTLEMENT_ADDED', 'SETTLEMENT_REVERSED', 'ATTACHMENT_ADDED', 'ATTACHMENT_REMOVED', 'BATCH_CREATED', 'BATCH_ENTRY_CREATED');

-- CreateTable
CREATE TABLE "FinancialCategory" (
    "id" TEXT NOT NULL,
    "administratorId" TEXT NOT NULL,
    "type" "FinancialEntryType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialChargeBatch" (
    "id" TEXT NOT NULL,
    "administratorId" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "competence" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "defaultValueCents" INTEGER NOT NULL,
    "notes" TEXT,
    "metadata" JSONB,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialChargeBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialEntry" (
    "id" TEXT NOT NULL,
    "administratorId" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "unitId" TEXT,
    "providerId" TEXT,
    "categoryId" TEXT NOT NULL,
    "chargeBatchId" TEXT,
    "type" "FinancialEntryType" NOT NULL,
    "origin" "FinancialEntryOrigin" NOT NULL DEFAULT 'MANUAL',
    "status" "FinancialEntryStatus" NOT NULL DEFAULT 'OPEN',
    "description" TEXT NOT NULL,
    "competence" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "valueCents" INTEGER NOT NULL,
    "notes" TEXT,
    "metadata" JSONB,
    "createdByUserId" TEXT NOT NULL,
    "canceledAt" TIMESTAMP(3),
    "canceledByUserId" TEXT,
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialSettlement" (
    "id" TEXT NOT NULL,
    "financialEntryId" TEXT NOT NULL,
    "type" "FinancialSettlementType" NOT NULL DEFAULT 'PAYMENT',
    "paidAt" TIMESTAMP(3) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "interestCents" INTEGER NOT NULL DEFAULT 0,
    "fineCents" INTEGER NOT NULL DEFAULT 0,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "paymentMethod" "FinancialPaymentMethod",
    "notes" TEXT,
    "metadata" JSONB,
    "registeredByUserId" TEXT NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "reversedByUserId" TEXT,
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialAttachment" (
    "id" TEXT NOT NULL,
    "administratorId" TEXT NOT NULL,
    "financialEntryId" TEXT,
    "financialSettlementId" TEXT,
    "uploadedByUserId" TEXT NOT NULL,
    "scope" "FinancialAttachmentScope" NOT NULL DEFAULT 'ENTRY',
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialLog" (
    "id" TEXT NOT NULL,
    "financialEntryId" TEXT,
    "financialChargeBatchId" TEXT,
    "financialSettlementId" TEXT,
    "userId" TEXT,
    "action" "FinancialLogAction" NOT NULL,
    "message" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinancialCategory_administratorId_idx" ON "FinancialCategory"("administratorId");

-- CreateIndex
CREATE INDEX "FinancialCategory_type_idx" ON "FinancialCategory"("type");

-- CreateIndex
CREATE INDEX "FinancialCategory_status_idx" ON "FinancialCategory"("status");

-- CreateIndex
CREATE INDEX "FinancialCategory_isDefault_idx" ON "FinancialCategory"("isDefault");

-- CreateIndex
CREATE INDEX "FinancialCategory_administratorId_type_status_idx" ON "FinancialCategory"("administratorId", "type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialCategory_administratorId_type_name_key" ON "FinancialCategory"("administratorId", "type", "name");

-- CreateIndex
CREATE INDEX "FinancialChargeBatch_administratorId_idx" ON "FinancialChargeBatch"("administratorId");

-- CreateIndex
CREATE INDEX "FinancialChargeBatch_condominiumId_idx" ON "FinancialChargeBatch"("condominiumId");

-- CreateIndex
CREATE INDEX "FinancialChargeBatch_categoryId_idx" ON "FinancialChargeBatch"("categoryId");

-- CreateIndex
CREATE INDEX "FinancialChargeBatch_competence_idx" ON "FinancialChargeBatch"("competence");

-- CreateIndex
CREATE INDEX "FinancialChargeBatch_dueDate_idx" ON "FinancialChargeBatch"("dueDate");

-- CreateIndex
CREATE INDEX "FinancialChargeBatch_createdByUserId_idx" ON "FinancialChargeBatch"("createdByUserId");

-- CreateIndex
CREATE INDEX "FinancialChargeBatch_administratorId_condominiumId_idx" ON "FinancialChargeBatch"("administratorId", "condominiumId");

-- CreateIndex
CREATE INDEX "FinancialChargeBatch_condominiumId_competence_idx" ON "FinancialChargeBatch"("condominiumId", "competence");

-- CreateIndex
CREATE INDEX "FinancialEntry_administratorId_idx" ON "FinancialEntry"("administratorId");

-- CreateIndex
CREATE INDEX "FinancialEntry_condominiumId_idx" ON "FinancialEntry"("condominiumId");

-- CreateIndex
CREATE INDEX "FinancialEntry_unitId_idx" ON "FinancialEntry"("unitId");

-- CreateIndex
CREATE INDEX "FinancialEntry_providerId_idx" ON "FinancialEntry"("providerId");

-- CreateIndex
CREATE INDEX "FinancialEntry_categoryId_idx" ON "FinancialEntry"("categoryId");

-- CreateIndex
CREATE INDEX "FinancialEntry_chargeBatchId_idx" ON "FinancialEntry"("chargeBatchId");

-- CreateIndex
CREATE INDEX "FinancialEntry_type_idx" ON "FinancialEntry"("type");

-- CreateIndex
CREATE INDEX "FinancialEntry_origin_idx" ON "FinancialEntry"("origin");

-- CreateIndex
CREATE INDEX "FinancialEntry_status_idx" ON "FinancialEntry"("status");

-- CreateIndex
CREATE INDEX "FinancialEntry_competence_idx" ON "FinancialEntry"("competence");

-- CreateIndex
CREATE INDEX "FinancialEntry_dueDate_idx" ON "FinancialEntry"("dueDate");

-- CreateIndex
CREATE INDEX "FinancialEntry_createdByUserId_idx" ON "FinancialEntry"("createdByUserId");

-- CreateIndex
CREATE INDEX "FinancialEntry_canceledByUserId_idx" ON "FinancialEntry"("canceledByUserId");

-- CreateIndex
CREATE INDEX "FinancialEntry_administratorId_condominiumId_idx" ON "FinancialEntry"("administratorId", "condominiumId");

-- CreateIndex
CREATE INDEX "FinancialEntry_condominiumId_competence_idx" ON "FinancialEntry"("condominiumId", "competence");

-- CreateIndex
CREATE INDEX "FinancialEntry_condominiumId_status_idx" ON "FinancialEntry"("condominiumId", "status");

-- CreateIndex
CREATE INDEX "FinancialEntry_condominiumId_dueDate_idx" ON "FinancialEntry"("condominiumId", "dueDate");

-- CreateIndex
CREATE INDEX "FinancialEntry_unitId_competence_idx" ON "FinancialEntry"("unitId", "competence");

-- CreateIndex
CREATE INDEX "FinancialSettlement_financialEntryId_idx" ON "FinancialSettlement"("financialEntryId");

-- CreateIndex
CREATE INDEX "FinancialSettlement_type_idx" ON "FinancialSettlement"("type");

-- CreateIndex
CREATE INDEX "FinancialSettlement_paidAt_idx" ON "FinancialSettlement"("paidAt");

-- CreateIndex
CREATE INDEX "FinancialSettlement_paymentMethod_idx" ON "FinancialSettlement"("paymentMethod");

-- CreateIndex
CREATE INDEX "FinancialSettlement_registeredByUserId_idx" ON "FinancialSettlement"("registeredByUserId");

-- CreateIndex
CREATE INDEX "FinancialSettlement_reversedByUserId_idx" ON "FinancialSettlement"("reversedByUserId");

-- CreateIndex
CREATE INDEX "FinancialSettlement_financialEntryId_type_idx" ON "FinancialSettlement"("financialEntryId", "type");

-- CreateIndex
CREATE INDEX "FinancialAttachment_administratorId_idx" ON "FinancialAttachment"("administratorId");

-- CreateIndex
CREATE INDEX "FinancialAttachment_financialEntryId_idx" ON "FinancialAttachment"("financialEntryId");

-- CreateIndex
CREATE INDEX "FinancialAttachment_financialSettlementId_idx" ON "FinancialAttachment"("financialSettlementId");

-- CreateIndex
CREATE INDEX "FinancialAttachment_uploadedByUserId_idx" ON "FinancialAttachment"("uploadedByUserId");

-- CreateIndex
CREATE INDEX "FinancialAttachment_scope_idx" ON "FinancialAttachment"("scope");

-- CreateIndex
CREATE INDEX "FinancialAttachment_createdAt_idx" ON "FinancialAttachment"("createdAt");

-- CreateIndex
CREATE INDEX "FinancialLog_financialEntryId_idx" ON "FinancialLog"("financialEntryId");

-- CreateIndex
CREATE INDEX "FinancialLog_financialChargeBatchId_idx" ON "FinancialLog"("financialChargeBatchId");

-- CreateIndex
CREATE INDEX "FinancialLog_financialSettlementId_idx" ON "FinancialLog"("financialSettlementId");

-- CreateIndex
CREATE INDEX "FinancialLog_userId_idx" ON "FinancialLog"("userId");

-- CreateIndex
CREATE INDEX "FinancialLog_action_idx" ON "FinancialLog"("action");

-- CreateIndex
CREATE INDEX "FinancialLog_createdAt_idx" ON "FinancialLog"("createdAt");

-- CreateIndex
CREATE INDEX "FinancialLog_financialEntryId_createdAt_idx" ON "FinancialLog"("financialEntryId", "createdAt");

-- CreateIndex
CREATE INDEX "FinancialLog_financialChargeBatchId_createdAt_idx" ON "FinancialLog"("financialChargeBatchId", "createdAt");

-- AddForeignKey
ALTER TABLE "FinancialCategory" ADD CONSTRAINT "FinancialCategory_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "Administrator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialChargeBatch" ADD CONSTRAINT "FinancialChargeBatch_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "Administrator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialChargeBatch" ADD CONSTRAINT "FinancialChargeBatch_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialChargeBatch" ADD CONSTRAINT "FinancialChargeBatch_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinancialCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialChargeBatch" ADD CONSTRAINT "FinancialChargeBatch_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "Administrator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FinancialCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_chargeBatchId_fkey" FOREIGN KEY ("chargeBatchId") REFERENCES "FinancialChargeBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialEntry" ADD CONSTRAINT "FinancialEntry_canceledByUserId_fkey" FOREIGN KEY ("canceledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialSettlement" ADD CONSTRAINT "FinancialSettlement_financialEntryId_fkey" FOREIGN KEY ("financialEntryId") REFERENCES "FinancialEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialSettlement" ADD CONSTRAINT "FinancialSettlement_registeredByUserId_fkey" FOREIGN KEY ("registeredByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialSettlement" ADD CONSTRAINT "FinancialSettlement_reversedByUserId_fkey" FOREIGN KEY ("reversedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAttachment" ADD CONSTRAINT "FinancialAttachment_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "Administrator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAttachment" ADD CONSTRAINT "FinancialAttachment_financialEntryId_fkey" FOREIGN KEY ("financialEntryId") REFERENCES "FinancialEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAttachment" ADD CONSTRAINT "FinancialAttachment_financialSettlementId_fkey" FOREIGN KEY ("financialSettlementId") REFERENCES "FinancialSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAttachment" ADD CONSTRAINT "FinancialAttachment_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialLog" ADD CONSTRAINT "FinancialLog_financialEntryId_fkey" FOREIGN KEY ("financialEntryId") REFERENCES "FinancialEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialLog" ADD CONSTRAINT "FinancialLog_financialChargeBatchId_fkey" FOREIGN KEY ("financialChargeBatchId") REFERENCES "FinancialChargeBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialLog" ADD CONSTRAINT "FinancialLog_financialSettlementId_fkey" FOREIGN KEY ("financialSettlementId") REFERENCES "FinancialSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialLog" ADD CONSTRAINT "FinancialLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
