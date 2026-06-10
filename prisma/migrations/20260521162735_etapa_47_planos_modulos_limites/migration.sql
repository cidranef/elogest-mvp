-- CreateEnum
CREATE TYPE "AdministratorPlanStatus" AS ENUM ('ACTIVE', 'TRIALING', 'PAST_DUE', 'SUSPENDED', 'CANCELED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Administrator" ADD COLUMN     "customLimitsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "planExpiresAt" TIMESTAMP(3),
ADD COLUMN     "planId" TEXT,
ADD COLUMN     "planStartedAt" TIMESTAMP(3),
ADD COLUMN     "planStatus" "AdministratorPlanStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "monthlyPriceCents" INTEGER,
    "annualPriceCents" INTEGER,
    "maxCondominiums" INTEGER,
    "maxUnits" INTEGER,
    "maxUsers" INTEGER,
    "maxMonthlyTickets" INTEGER,
    "maxProviders" INTEGER,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformModule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "isCore" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanModule" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdministratorModuleOverride" (
    "id" TEXT NOT NULL,
    "administratorId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "reason" TEXT,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdministratorModuleOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdministratorLimitOverride" (
    "id" TEXT NOT NULL,
    "administratorId" TEXT NOT NULL,
    "maxCondominiums" INTEGER,
    "maxUnits" INTEGER,
    "maxUsers" INTEGER,
    "maxMonthlyTickets" INTEGER,
    "maxProviders" INTEGER,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdministratorLimitOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Plan_slug_key" ON "Plan"("slug");

-- CreateIndex
CREATE INDEX "Plan_status_idx" ON "Plan"("status");

-- CreateIndex
CREATE INDEX "Plan_isPublic_idx" ON "Plan"("isPublic");

-- CreateIndex
CREATE INDEX "Plan_sortOrder_idx" ON "Plan"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformModule_slug_key" ON "PlatformModule"("slug");

-- CreateIndex
CREATE INDEX "PlatformModule_status_idx" ON "PlatformModule"("status");

-- CreateIndex
CREATE INDEX "PlatformModule_isCore_idx" ON "PlatformModule"("isCore");

-- CreateIndex
CREATE INDEX "PlatformModule_sortOrder_idx" ON "PlatformModule"("sortOrder");

-- CreateIndex
CREATE INDEX "PlanModule_planId_idx" ON "PlanModule"("planId");

-- CreateIndex
CREATE INDEX "PlanModule_moduleId_idx" ON "PlanModule"("moduleId");

-- CreateIndex
CREATE INDEX "PlanModule_enabled_idx" ON "PlanModule"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "PlanModule_planId_moduleId_key" ON "PlanModule"("planId", "moduleId");

-- CreateIndex
CREATE INDEX "AdministratorModuleOverride_administratorId_idx" ON "AdministratorModuleOverride"("administratorId");

-- CreateIndex
CREATE INDEX "AdministratorModuleOverride_moduleId_idx" ON "AdministratorModuleOverride"("moduleId");

-- CreateIndex
CREATE INDEX "AdministratorModuleOverride_enabled_idx" ON "AdministratorModuleOverride"("enabled");

-- CreateIndex
CREATE INDEX "AdministratorModuleOverride_expiresAt_idx" ON "AdministratorModuleOverride"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdministratorModuleOverride_administratorId_moduleId_key" ON "AdministratorModuleOverride"("administratorId", "moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "AdministratorLimitOverride_administratorId_key" ON "AdministratorLimitOverride"("administratorId");

-- CreateIndex
CREATE INDEX "AdministratorLimitOverride_administratorId_idx" ON "AdministratorLimitOverride"("administratorId");

-- CreateIndex
CREATE INDEX "Administrator_planId_idx" ON "Administrator"("planId");

-- CreateIndex
CREATE INDEX "Administrator_planStatus_idx" ON "Administrator"("planStatus");

-- AddForeignKey
ALTER TABLE "Administrator" ADD CONSTRAINT "Administrator_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanModule" ADD CONSTRAINT "PlanModule_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanModule" ADD CONSTRAINT "PlanModule_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "PlatformModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdministratorModuleOverride" ADD CONSTRAINT "AdministratorModuleOverride_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "Administrator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdministratorModuleOverride" ADD CONSTRAINT "AdministratorModuleOverride_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "PlatformModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdministratorLimitOverride" ADD CONSTRAINT "AdministratorLimitOverride_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "Administrator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
