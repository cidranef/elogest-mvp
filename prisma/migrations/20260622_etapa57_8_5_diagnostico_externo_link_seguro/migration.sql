CREATE TYPE "CommercialDiagnosisLinkStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'EXPIRED', 'REVOKED');
CREATE TYPE "CommercialDiagnosisEventType" AS ENUM ('LINK_CREATED', 'OPENED', 'STARTED', 'DRAFT_SAVED', 'COMPLETED', 'REVOKED', 'IMPORTED');

CREATE TABLE "commercial_diagnosis_links" (
  "id" TEXT NOT NULL,
  "commercialLeadProfileId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "tokenHint" TEXT NOT NULL,
  "status" "CommercialDiagnosisLinkStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "openedAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "lastSavedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "respondentName" TEXT,
  "respondentEmail" TEXT,
  "respondentPhone" TEXT,
  "consentAcceptedAt" TIMESTAMP(3),
  "privacyAcknowledgedAt" TIMESTAMP(3),
  "responses" JSONB,
  "importedAt" TIMESTAMP(3),
  "importedByUserId" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "commercial_diagnosis_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "commercial_diagnosis_events" (
  "id" TEXT NOT NULL,
  "commercialDiagnosisLinkId" TEXT NOT NULL,
  "type" "CommercialDiagnosisEventType" NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commercial_diagnosis_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cdl_token_hash_key" ON "commercial_diagnosis_links"("tokenHash");
CREATE INDEX "cdl_lead_status_idx" ON "commercial_diagnosis_links"("commercialLeadProfileId", "status");
CREATE INDEX "cdl_expires_at_idx" ON "commercial_diagnosis_links"("expiresAt");
CREATE INDEX "cdl_created_by_idx" ON "commercial_diagnosis_links"("createdByUserId");
CREATE INDEX "cdl_imported_by_idx" ON "commercial_diagnosis_links"("importedByUserId");
CREATE INDEX "cde_link_created_at_idx" ON "commercial_diagnosis_events"("commercialDiagnosisLinkId", "createdAt");
CREATE INDEX "cde_type_idx" ON "commercial_diagnosis_events"("type");

ALTER TABLE "commercial_diagnosis_links" ADD CONSTRAINT "commercial_diagnosis_links_commercialLeadProfileId_fkey" FOREIGN KEY ("commercialLeadProfileId") REFERENCES "commercial_lead_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "commercial_diagnosis_links" ADD CONSTRAINT "commercial_diagnosis_links_importedByUserId_fkey" FOREIGN KEY ("importedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commercial_diagnosis_links" ADD CONSTRAINT "commercial_diagnosis_links_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commercial_diagnosis_events" ADD CONSTRAINT "commercial_diagnosis_events_commercialDiagnosisLinkId_fkey" FOREIGN KEY ("commercialDiagnosisLinkId") REFERENCES "commercial_diagnosis_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;
