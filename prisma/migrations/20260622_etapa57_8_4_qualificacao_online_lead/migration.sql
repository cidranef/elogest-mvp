CREATE TYPE "CommercialQualificationStatus" AS ENUM ('DRAFT', 'COMPLETED');
CREATE TYPE "CommercialQualificationClassification" AS ENUM ('LOW_PRIORITY', 'DEVELOPING', 'QUALIFIED', 'HIGH_PRIORITY', 'STRATEGIC');

CREATE TABLE "commercial_lead_qualifications" (
  "id" TEXT NOT NULL,
  "commercialLeadProfileId" TEXT NOT NULL,
  "status" "CommercialQualificationStatus" NOT NULL DEFAULT 'DRAFT',
  "classification" "CommercialQualificationClassification" NOT NULL DEFAULT 'LOW_PRIORITY',
  "totalScore" INTEGER NOT NULL DEFAULT 0,
  "yearsInMarket" INTEGER,
  "condominiumCount" INTEGER,
  "unitCount" INTEGER,
  "teamSize" INTEGER,
  "currentSystems" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "painPoints" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "primaryPain" TEXT,
  "painFrequency" TEXT,
  "painSeverity" TEXT,
  "desiredModules" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "urgency" TEXT,
  "decisionRole" TEXT,
  "budgetStatus" TEXT,
  "pilotReadiness" TEXT,
  "competitorName" TEXT,
  "objections" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "notes" TEXT,
  "painScore" INTEGER NOT NULL DEFAULT 0,
  "urgencyScore" INTEGER NOT NULL DEFAULT 0,
  "productFitScore" INTEGER NOT NULL DEFAULT 0,
  "authorityScore" INTEGER NOT NULL DEFAULT 0,
  "implementationScore" INTEGER NOT NULL DEFAULT 0,
  "financialScore" INTEGER NOT NULL DEFAULT 0,
  "expansionScore" INTEGER NOT NULL DEFAULT 0,
  "strategicScore" INTEGER NOT NULL DEFAULT 0,
  "pilotScore" INTEGER NOT NULL DEFAULT 0,
  "engagementScore" INTEGER NOT NULL DEFAULT 0,
  "answers" JSONB,
  "completedAt" TIMESTAMP(3),
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "commercial_lead_qualifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "commercial_lead_qualification_revisions" (
  "id" TEXT NOT NULL,
  "commercialLeadQualificationId" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "status" "CommercialQualificationStatus" NOT NULL,
  "classification" "CommercialQualificationClassification" NOT NULL,
  "totalScore" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commercial_lead_qualification_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "commercial_lead_qualifications_commercialLeadProfileId_key" ON "commercial_lead_qualifications"("commercialLeadProfileId");
CREATE INDEX "commercial_lead_qualifications_status_idx" ON "commercial_lead_qualifications"("status");
CREATE INDEX "commercial_lead_qualifications_classification_idx" ON "commercial_lead_qualifications"("classification");
CREATE INDEX "commercial_lead_qualifications_totalScore_idx" ON "commercial_lead_qualifications"("totalScore");
CREATE INDEX "commercial_lead_qualifications_updatedByUserId_idx" ON "commercial_lead_qualifications"("updatedByUserId");
CREATE UNIQUE INDEX "clqr_qualification_revision_key" ON "commercial_lead_qualification_revisions"("commercialLeadQualificationId", "revisionNumber");
CREATE INDEX "clqr_qualification_created_at_idx" ON "commercial_lead_qualification_revisions"("commercialLeadQualificationId", "createdAt");
CREATE INDEX "commercial_lead_qualification_revisions_createdByUserId_idx" ON "commercial_lead_qualification_revisions"("createdByUserId");

ALTER TABLE "commercial_lead_qualifications" ADD CONSTRAINT "commercial_lead_qualifications_commercialLeadProfileId_fkey" FOREIGN KEY ("commercialLeadProfileId") REFERENCES "commercial_lead_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "commercial_lead_qualifications" ADD CONSTRAINT "commercial_lead_qualifications_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commercial_lead_qualification_revisions" ADD CONSTRAINT "commercial_lead_qualification_revisions_commercialLeadQualificationId_fkey" FOREIGN KEY ("commercialLeadQualificationId") REFERENCES "commercial_lead_qualifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "commercial_lead_qualification_revisions" ADD CONSTRAINT "commercial_lead_qualification_revisions_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
