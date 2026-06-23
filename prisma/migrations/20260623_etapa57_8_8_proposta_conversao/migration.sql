-- ETAPA 57.8.8 — Proposta Comercial E Conversão
DO $$ BEGIN CREATE TYPE "CommercialProposalStatus" AS ENUM ('DRAFT','SENT','VIEWED','NEGOTIATION','ACCEPTED','REJECTED','EXPIRED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "CommercialProposalEventType" AS ENUM ('CREATED','UPDATED','VERSION_CREATED','SENT','VIEWED','NEGOTIATION_STARTED','ACCEPTED','REJECTED','EXPIRED','CANCELLED','PDF_GENERATED','CONVERTED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "commercial_proposals" (
  "id" TEXT NOT NULL,
  "commercialLeadProfileId" TEXT NOT NULL,
  "planId" TEXT,
  "status" "CommercialProposalStatus" NOT NULL DEFAULT 'DRAFT',
  "title" TEXT NOT NULL,
  "monthlyPriceCents" INTEGER,
  "implementationFeeCents" INTEGER,
  "discountCents" INTEGER NOT NULL DEFAULT 0,
  "discountPercent" DOUBLE PRECISION,
  "validUntil" TIMESTAMP(3),
  "paymentTerms" TEXT,
  "commercialNotes" TEXT,
  "modules" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "limits" JSONB,
  "publicTokenHash" TEXT,
  "publicTokenExpiresAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "firstViewedAt" TIMESTAMP(3),
  "lastViewedAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "acceptedByName" TEXT,
  "acceptedByEmail" TEXT,
  "acceptedIp" TEXT,
  "acceptedUserAgent" TEXT,
  "acceptanceStatement" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "convertedAt" TIMESTAMP(3),
  "convertedAdministratorId" TEXT,
  "currentVersion" INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commercial_proposals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commercial_proposals_lead_fkey" FOREIGN KEY ("commercialLeadProfileId") REFERENCES "commercial_lead_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "commercial_proposals_plan_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "commercial_proposals_admin_fkey" FOREIGN KEY ("convertedAdministratorId") REFERENCES "Administrator"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "commercial_proposals_lead_key" ON "commercial_proposals"("commercialLeadProfileId");
CREATE UNIQUE INDEX IF NOT EXISTS "commercial_proposals_token_key" ON "commercial_proposals"("publicTokenHash");
CREATE INDEX IF NOT EXISTS "commercial_proposals_status_idx" ON "commercial_proposals"("status");
CREATE INDEX IF NOT EXISTS "commercial_proposals_valid_idx" ON "commercial_proposals"("validUntil");
CREATE INDEX IF NOT EXISTS "commercial_proposals_plan_idx" ON "commercial_proposals"("planId");

CREATE TABLE IF NOT EXISTS "commercial_proposal_versions" (
  "id" TEXT NOT NULL,
  "commercialProposalId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commercial_proposal_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commercial_proposal_versions_proposal_fkey" FOREIGN KEY ("commercialProposalId") REFERENCES "commercial_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "cpv_proposal_version_key" ON "commercial_proposal_versions"("commercialProposalId","version");
CREATE INDEX IF NOT EXISTS "cpv_proposal_created_idx" ON "commercial_proposal_versions"("commercialProposalId","createdAt");

CREATE TABLE IF NOT EXISTS "commercial_proposal_events" (
  "id" TEXT NOT NULL,
  "commercialProposalId" TEXT NOT NULL,
  "type" "CommercialProposalEventType" NOT NULL,
  "description" TEXT,
  "metadata" JSONB,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commercial_proposal_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commercial_proposal_events_proposal_fkey" FOREIGN KEY ("commercialProposalId") REFERENCES "commercial_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "cpe_proposal_created_idx" ON "commercial_proposal_events"("commercialProposalId","createdAt");
CREATE INDEX IF NOT EXISTS "cpe_type_idx" ON "commercial_proposal_events"("type");
