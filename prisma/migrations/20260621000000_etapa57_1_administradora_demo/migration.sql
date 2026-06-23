ALTER TABLE "Administrator"
ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "demoProtectionEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Administrator_isDemo_idx"
ON "Administrator"("isDemo");
