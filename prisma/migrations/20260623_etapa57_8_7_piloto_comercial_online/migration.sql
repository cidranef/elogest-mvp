-- ETAPA 57.8.7 — Piloto Comercial On-line

DO $$ BEGIN
  CREATE TYPE "CommercialPilotStatus" AS ENUM ('DRAFT','PLANNED','ACTIVE','PAUSED','COMPLETED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "CommercialPilotDecision" AS ENUM ('PENDING','APPROVED_FOR_CONTRACT','EXTEND_PILOT','NEEDS_ADJUSTMENTS','NOT_CONVERTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "CommercialPilotItemStatus" AS ENUM ('PENDING','IN_PROGRESS','BLOCKED','COMPLETED','NOT_APPLICABLE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "commercial_pilots" (
  "id" TEXT NOT NULL,
  "commercialLeadProfileId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "condominiumOrOperation" TEXT,
  "objective" TEXT,
  "modules" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "internalResponsible" TEXT,
  "clientResponsible" TEXT,
  "startDate" TIMESTAMP(3),
  "expectedEndDate" TIMESTAMP(3),
  "actualEndDate" TIMESTAMP(3),
  "status" "CommercialPilotStatus" NOT NULL DEFAULT 'DRAFT',
  "decision" "CommercialPilotDecision" NOT NULL DEFAULT 'PENDING',
  "finalEvaluation" TEXT,
  "decisionNotes" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commercial_pilots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commercial_pilots_lead_fkey" FOREIGN KEY ("commercialLeadProfileId") REFERENCES "commercial_lead_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "cp_lead_unique" ON "commercial_pilots"("commercialLeadProfileId");
CREATE INDEX IF NOT EXISTS "cp_status_idx" ON "commercial_pilots"("status");
CREATE INDEX IF NOT EXISTS "cp_decision_idx" ON "commercial_pilots"("decision");
CREATE INDEX IF NOT EXISTS "cp_dates_idx" ON "commercial_pilots"("startDate", "expectedEndDate");

CREATE TABLE IF NOT EXISTS "commercial_pilot_items" (
  "id" TEXT NOT NULL,
  "commercialPilotId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  "status" "CommercialPilotItemStatus" NOT NULL DEFAULT 'PENDING',
  "responsible" TEXT,
  "dueDate" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "blocker" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commercial_pilot_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commercial_pilot_items_pilot_fkey" FOREIGN KEY ("commercialPilotId") REFERENCES "commercial_pilots"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "cpi_pilot_position_idx" ON "commercial_pilot_items"("commercialPilotId", "position");
CREATE INDEX IF NOT EXISTS "cpi_status_idx" ON "commercial_pilot_items"("status");
CREATE INDEX IF NOT EXISTS "cpi_due_idx" ON "commercial_pilot_items"("dueDate");

CREATE TABLE IF NOT EXISTS "commercial_pilot_evidences" (
  "id" TEXT NOT NULL,
  "commercialPilotId" TEXT NOT NULL,
  "commercialPilotItemId" TEXT,
  "title" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "storageKey" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "uploadedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commercial_pilot_evidences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commercial_pilot_evidences_pilot_fkey" FOREIGN KEY ("commercialPilotId") REFERENCES "commercial_pilots"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "commercial_pilot_evidences_item_fkey" FOREIGN KEY ("commercialPilotItemId") REFERENCES "commercial_pilot_items"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "cpe_storage_key_unique" ON "commercial_pilot_evidences"("storageKey");
CREATE INDEX IF NOT EXISTS "cpe_pilot_idx" ON "commercial_pilot_evidences"("commercialPilotId", "createdAt");
CREATE INDEX IF NOT EXISTS "cpe_item_idx" ON "commercial_pilot_evidences"("commercialPilotItemId");
