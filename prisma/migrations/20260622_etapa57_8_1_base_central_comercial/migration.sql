-- ETAPA 57.8.1 - Base da Central Comercial EloGest

CREATE TYPE "CommercialLeadStage" AS ENUM (
  'NEW',
  'CONTACT_PENDING',
  'CONTACTED',
  'DIAGNOSIS_SENT',
  'DIAGNOSIS_RECEIVED',
  'QUALIFIED',
  'DEMO_SCHEDULED',
  'DEMO_COMPLETED',
  'PILOT_PROPOSED',
  'PILOT_ACTIVE',
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'CONVERTED',
  'LOST',
  'FOLLOW_UP'
);

CREATE TYPE "CommercialLeadPriority" AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH',
  'STRATEGIC'
);

CREATE TYPE "CommercialLeadLogAction" AS ENUM (
  'PROFILE_CREATED',
  'PROFILE_UPDATED',
  'STAGE_CHANGED',
  'SCORE_RECALCULATED',
  'OWNER_ASSIGNED',
  'FOLLOW_UP_SCHEDULED',
  'NOTE_ADDED',
  'LOST_MARKED',
  'REOPENED'
);

CREATE TABLE "commercial_lead_profiles" (
  "id" TEXT NOT NULL,
  "onboardingRequestId" TEXT NOT NULL,
  "stage" "CommercialLeadStage" NOT NULL DEFAULT 'NEW',
  "priority" "CommercialLeadPriority" NOT NULL DEFAULT 'MEDIUM',
  "score" INTEGER NOT NULL DEFAULT 0,
  "ownerUserId" TEXT,
  "nextFollowUpAt" TIMESTAMP(3),
  "lastContactAt" TIMESTAMP(3),
  "qualifiedAt" TIMESTAMP(3),
  "lostAt" TIMESTAMP(3),
  "lostReason" TEXT,
  "strategicPotential" BOOLEAN NOT NULL DEFAULT false,
  "investorInterest" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "commercial_lead_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "commercial_lead_logs" (
  "id" TEXT NOT NULL,
  "commercialLeadProfileId" TEXT NOT NULL,
  "action" "CommercialLeadLogAction" NOT NULL,
  "fromStage" "CommercialLeadStage",
  "toStage" "CommercialLeadStage",
  "score" INTEGER,
  "description" TEXT,
  "metadata" JSONB,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "commercial_lead_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "commercial_lead_profiles_onboardingRequestId_key"
  ON "commercial_lead_profiles"("onboardingRequestId");
CREATE INDEX "commercial_lead_profiles_stage_idx"
  ON "commercial_lead_profiles"("stage");
CREATE INDEX "commercial_lead_profiles_priority_idx"
  ON "commercial_lead_profiles"("priority");
CREATE INDEX "commercial_lead_profiles_score_idx"
  ON "commercial_lead_profiles"("score");
CREATE INDEX "commercial_lead_profiles_ownerUserId_idx"
  ON "commercial_lead_profiles"("ownerUserId");
CREATE INDEX "commercial_lead_profiles_nextFollowUpAt_idx"
  ON "commercial_lead_profiles"("nextFollowUpAt");
CREATE INDEX "commercial_lead_profiles_createdAt_idx"
  ON "commercial_lead_profiles"("createdAt");

CREATE INDEX "commercial_lead_logs_commercialLeadProfileId_idx"
  ON "commercial_lead_logs"("commercialLeadProfileId");
CREATE INDEX "commercial_lead_logs_action_idx"
  ON "commercial_lead_logs"("action");
CREATE INDEX "commercial_lead_logs_createdByUserId_idx"
  ON "commercial_lead_logs"("createdByUserId");
CREATE INDEX "commercial_lead_logs_createdAt_idx"
  ON "commercial_lead_logs"("createdAt");

ALTER TABLE "commercial_lead_profiles"
  ADD CONSTRAINT "commercial_lead_profiles_onboardingRequestId_fkey"
  FOREIGN KEY ("onboardingRequestId") REFERENCES "onboarding_requests"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "commercial_lead_profiles"
  ADD CONSTRAINT "commercial_lead_profiles_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "commercial_lead_logs"
  ADD CONSTRAINT "commercial_lead_logs_commercialLeadProfileId_fkey"
  FOREIGN KEY ("commercialLeadProfileId") REFERENCES "commercial_lead_profiles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "commercial_lead_logs"
  ADD CONSTRAINT "commercial_lead_logs_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
