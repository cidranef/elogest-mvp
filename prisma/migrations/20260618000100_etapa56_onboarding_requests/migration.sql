-- ELOGEST — ETAPA 56.1
-- Onboarding público: solicitações comerciais antes da criação de administradora.

CREATE TYPE "OnboardingRequestStatus" AS ENUM (
  'PENDING_REVIEW',
  'IN_CONTACT',
  'APPROVED',
  'CONVERTED',
  'REJECTED'
);

CREATE TABLE "onboarding_requests" (
  "id" TEXT NOT NULL,
  "administratorName" TEXT NOT NULL,
  "responsibleName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "city" TEXT,
  "state" TEXT,
  "condominiumEstimate" INTEGER,
  "unitEstimate" INTEGER,
  "message" TEXT,
  "status" "OnboardingRequestStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "interestedPlanId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewedByUserId" TEXT,
  "convertedAt" TIMESTAMP(3),
  "convertedAdminId" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "onboarding_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "onboarding_requests_status_idx" ON "onboarding_requests"("status");
CREATE INDEX "onboarding_requests_email_idx" ON "onboarding_requests"("email");
CREATE INDEX "onboarding_requests_interestedPlanId_idx" ON "onboarding_requests"("interestedPlanId");
CREATE INDEX "onboarding_requests_reviewedByUserId_idx" ON "onboarding_requests"("reviewedByUserId");
CREATE INDEX "onboarding_requests_convertedAdminId_idx" ON "onboarding_requests"("convertedAdminId");
CREATE INDEX "onboarding_requests_createdAt_idx" ON "onboarding_requests"("createdAt");

ALTER TABLE "onboarding_requests"
  ADD CONSTRAINT "onboarding_requests_interestedPlanId_fkey"
  FOREIGN KEY ("interestedPlanId") REFERENCES "Plan"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "onboarding_requests"
  ADD CONSTRAINT "onboarding_requests_reviewedByUserId_fkey"
  FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "onboarding_requests"
  ADD CONSTRAINT "onboarding_requests_convertedAdminId_fkey"
  FOREIGN KEY ("convertedAdminId") REFERENCES "Administrator"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
