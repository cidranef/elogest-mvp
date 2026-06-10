-- CreateEnum
CREATE TYPE "ProviderEntityType" AS ENUM ('COMPANY', 'INDIVIDUAL', 'PROFESSIONAL', 'OTHER');

-- CreateEnum
CREATE TYPE "ProviderGlobalStatus" AS ENUM ('DRAFT', 'ACTIVE', 'IN_REVIEW', 'SUSPENDED', 'BLOCKED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ProviderVisibility" AS ENUM ('PRIVATE', 'ELOGEST_NETWORK', 'PUBLIC_FUTURE');

-- CreateEnum
CREATE TYPE "ProviderOrigin" AS ENUM ('ELOGEST', 'ADMINISTRATOR', 'INDICATION', 'IMPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "AdministratorProviderStatus" AS ENUM ('IN_REVIEW', 'HOMOLOGATED', 'ACTIVE', 'SUSPENDED', 'BLOCKED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CondominiumProviderStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ENDED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CondominiumProviderLinkType" AS ENUM ('CONTRACT', 'RECURRING', 'ON_DEMAND', 'INDICATED', 'PREFERRED', 'OTHER');

-- CreateTable
CREATE TABLE "Provider" (
    "id" TEXT NOT NULL,
    "tradeName" TEXT NOT NULL,
    "legalName" TEXT,
    "document" TEXT,
    "documentNormalized" TEXT,
    "entityType" "ProviderEntityType" NOT NULL DEFAULT 'COMPANY',
    "primaryCategory" TEXT,
    "categories" JSONB,
    "description" TEXT,
    "serviceArea" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "website" TEXT,
    "cep" TEXT,
    "address" TEXT,
    "number" TEXT,
    "complement" TEXT,
    "district" TEXT,
    "city" TEXT,
    "state" TEXT,
    "globalStatus" "ProviderGlobalStatus" NOT NULL DEFAULT 'ACTIVE',
    "visibility" "ProviderVisibility" NOT NULL DEFAULT 'PRIVATE',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "origin" "ProviderOrigin" NOT NULL DEFAULT 'ADMINISTRATOR',
    "createdByAdministratorId" TEXT,
    "createdByUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdministratorProvider" (
    "id" TEXT NOT NULL,
    "administratorId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "status" "AdministratorProviderStatus" NOT NULL DEFAULT 'IN_REVIEW',
    "internalName" TEXT,
    "internalCategory" TEXT,
    "notes" TEXT,
    "canBeUsedInTickets" BOOLEAN NOT NULL DEFAULT true,
    "visibleToSyndics" BOOLEAN NOT NULL DEFAULT false,
    "visibleToResidents" BOOLEAN NOT NULL DEFAULT false,
    "homologatedAt" TIMESTAMP(3),
    "homologatedByUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdministratorProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CondominiumProvider" (
    "id" TEXT NOT NULL,
    "administratorId" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "administratorProviderId" TEXT,
    "status" "CondominiumProviderStatus" NOT NULL DEFAULT 'ACTIVE',
    "linkType" "CondominiumProviderLinkType" NOT NULL DEFAULT 'ON_DEMAND',
    "category" TEXT,
    "isPreferred" BOOLEAN NOT NULL DEFAULT false,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdByUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CondominiumProvider_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Provider_documentNormalized_key" ON "Provider"("documentNormalized");

-- CreateIndex
CREATE INDEX "Provider_tradeName_idx" ON "Provider"("tradeName");

-- CreateIndex
CREATE INDEX "Provider_legalName_idx" ON "Provider"("legalName");

-- CreateIndex
CREATE INDEX "Provider_entityType_idx" ON "Provider"("entityType");

-- CreateIndex
CREATE INDEX "Provider_primaryCategory_idx" ON "Provider"("primaryCategory");

-- CreateIndex
CREATE INDEX "Provider_globalStatus_idx" ON "Provider"("globalStatus");

-- CreateIndex
CREATE INDEX "Provider_visibility_idx" ON "Provider"("visibility");

-- CreateIndex
CREATE INDEX "Provider_isVerified_idx" ON "Provider"("isVerified");

-- CreateIndex
CREATE INDEX "Provider_isFeatured_idx" ON "Provider"("isFeatured");

-- CreateIndex
CREATE INDEX "Provider_origin_idx" ON "Provider"("origin");

-- CreateIndex
CREATE INDEX "Provider_createdByAdministratorId_idx" ON "Provider"("createdByAdministratorId");

-- CreateIndex
CREATE INDEX "Provider_createdByUserId_idx" ON "Provider"("createdByUserId");

-- CreateIndex
CREATE INDEX "Provider_city_idx" ON "Provider"("city");

-- CreateIndex
CREATE INDEX "Provider_state_idx" ON "Provider"("state");

-- CreateIndex
CREATE INDEX "Provider_city_state_idx" ON "Provider"("city", "state");

-- CreateIndex
CREATE INDEX "AdministratorProvider_administratorId_idx" ON "AdministratorProvider"("administratorId");

-- CreateIndex
CREATE INDEX "AdministratorProvider_providerId_idx" ON "AdministratorProvider"("providerId");

-- CreateIndex
CREATE INDEX "AdministratorProvider_status_idx" ON "AdministratorProvider"("status");

-- CreateIndex
CREATE INDEX "AdministratorProvider_internalCategory_idx" ON "AdministratorProvider"("internalCategory");

-- CreateIndex
CREATE INDEX "AdministratorProvider_canBeUsedInTickets_idx" ON "AdministratorProvider"("canBeUsedInTickets");

-- CreateIndex
CREATE INDEX "AdministratorProvider_visibleToSyndics_idx" ON "AdministratorProvider"("visibleToSyndics");

-- CreateIndex
CREATE INDEX "AdministratorProvider_visibleToResidents_idx" ON "AdministratorProvider"("visibleToResidents");

-- CreateIndex
CREATE INDEX "AdministratorProvider_homologatedByUserId_idx" ON "AdministratorProvider"("homologatedByUserId");

-- CreateIndex
CREATE INDEX "AdministratorProvider_administratorId_status_idx" ON "AdministratorProvider"("administratorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AdministratorProvider_administratorId_providerId_key" ON "AdministratorProvider"("administratorId", "providerId");

-- CreateIndex
CREATE INDEX "CondominiumProvider_administratorId_idx" ON "CondominiumProvider"("administratorId");

-- CreateIndex
CREATE INDEX "CondominiumProvider_condominiumId_idx" ON "CondominiumProvider"("condominiumId");

-- CreateIndex
CREATE INDEX "CondominiumProvider_providerId_idx" ON "CondominiumProvider"("providerId");

-- CreateIndex
CREATE INDEX "CondominiumProvider_administratorProviderId_idx" ON "CondominiumProvider"("administratorProviderId");

-- CreateIndex
CREATE INDEX "CondominiumProvider_status_idx" ON "CondominiumProvider"("status");

-- CreateIndex
CREATE INDEX "CondominiumProvider_linkType_idx" ON "CondominiumProvider"("linkType");

-- CreateIndex
CREATE INDEX "CondominiumProvider_category_idx" ON "CondominiumProvider"("category");

-- CreateIndex
CREATE INDEX "CondominiumProvider_isPreferred_idx" ON "CondominiumProvider"("isPreferred");

-- CreateIndex
CREATE INDEX "CondominiumProvider_createdByUserId_idx" ON "CondominiumProvider"("createdByUserId");

-- CreateIndex
CREATE INDEX "CondominiumProvider_administratorId_status_idx" ON "CondominiumProvider"("administratorId", "status");

-- CreateIndex
CREATE INDEX "CondominiumProvider_condominiumId_status_idx" ON "CondominiumProvider"("condominiumId", "status");

-- CreateIndex
CREATE INDEX "CondominiumProvider_condominiumId_category_idx" ON "CondominiumProvider"("condominiumId", "category");

-- CreateIndex
CREATE INDEX "CondominiumProvider_providerId_status_idx" ON "CondominiumProvider"("providerId", "status");

-- CreateIndex
CREATE INDEX "TicketRating_ratedProviderId_idx" ON "TicketRating"("ratedProviderId");

-- AddForeignKey
ALTER TABLE "TicketRating" ADD CONSTRAINT "TicketRating_ratedProviderId_fkey" FOREIGN KEY ("ratedProviderId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Provider" ADD CONSTRAINT "Provider_createdByAdministratorId_fkey" FOREIGN KEY ("createdByAdministratorId") REFERENCES "Administrator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Provider" ADD CONSTRAINT "Provider_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdministratorProvider" ADD CONSTRAINT "AdministratorProvider_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "Administrator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdministratorProvider" ADD CONSTRAINT "AdministratorProvider_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdministratorProvider" ADD CONSTRAINT "AdministratorProvider_homologatedByUserId_fkey" FOREIGN KEY ("homologatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CondominiumProvider" ADD CONSTRAINT "CondominiumProvider_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "Administrator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CondominiumProvider" ADD CONSTRAINT "CondominiumProvider_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CondominiumProvider" ADD CONSTRAINT "CondominiumProvider_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CondominiumProvider" ADD CONSTRAINT "CondominiumProvider_administratorProviderId_fkey" FOREIGN KEY ("administratorProviderId") REFERENCES "AdministratorProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CondominiumProvider" ADD CONSTRAINT "CondominiumProvider_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
