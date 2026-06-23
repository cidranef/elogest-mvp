-- ETAPA 57.8.6.2 — Reparo idempotente da tabela commercial_meetings
-- Motivo: a migration original consta como aplicada no histórico, mas a tabela física não existe.

DO $$ BEGIN
  CREATE TYPE "CommercialMeetingType" AS ENUM (
    'DISCOVERY',
    'DEMO_10',
    'DEMO_30',
    'DEMO_60',
    'PILOT_ALIGNMENT',
    'PROPOSAL',
    'NEGOTIATION',
    'INVESTMENT',
    'FOLLOW_UP',
    'OTHER'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CommercialMeetingStatus" AS ENUM (
    'SCHEDULED',
    'COMPLETED',
    'CANCELLED',
    'NO_SHOW'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "commercial_meetings" (
  "id" TEXT NOT NULL,
  "commercialLeadProfileId" TEXT NOT NULL,
  "type" "CommercialMeetingType" NOT NULL DEFAULT 'DISCOVERY',
  "status" "CommercialMeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
  "title" TEXT NOT NULL,
  "scheduledAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "durationMinutes" INTEGER,
  "participants" JSONB,
  "scriptUsed" TEXT,
  "modulesPresented" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "painsIdentified" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "objections" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "interestLevel" INTEGER,
  "summary" TEXT,
  "nextStep" TEXT,
  "followUpAt" TIMESTAMP(3),
  "ownerUserId" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commercial_meetings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commercial_meetings_lead_fkey"
    FOREIGN KEY ("commercialLeadProfileId")
    REFERENCES "commercial_lead_profiles"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "commercial_meetings_interest_check"
    CHECK ("interestLevel" IS NULL OR ("interestLevel" >= 0 AND "interestLevel" <= 5))
);

CREATE INDEX IF NOT EXISTS "cm_lead_created_idx"
  ON "commercial_meetings"("commercialLeadProfileId", "createdAt");
CREATE INDEX IF NOT EXISTS "cm_status_scheduled_idx"
  ON "commercial_meetings"("status", "scheduledAt");
CREATE INDEX IF NOT EXISTS "cm_followup_idx"
  ON "commercial_meetings"("followUpAt");
CREATE INDEX IF NOT EXISTS "cm_owner_idx"
  ON "commercial_meetings"("ownerUserId");
