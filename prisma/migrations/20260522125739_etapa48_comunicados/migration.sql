-- CreateEnum
CREATE TYPE "AnnouncementType" AS ENUM ('GENERAL', 'MAINTENANCE', 'ASSEMBLY', 'FINANCIAL', 'SECURITY', 'EMERGENCY', 'GOVERNANCE');

-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AnnouncementPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "AnnouncementTargetScope" AS ENUM ('ALL_ADMINISTRATOR', 'CONDOMINIUM', 'UNIT', 'ROLE', 'LINK_TYPE', 'CUSTOM');

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "administratorId" TEXT NOT NULL,
    "condominiumId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" "AnnouncementType" NOT NULL DEFAULT 'GENERAL',
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" "AnnouncementPriority" NOT NULL DEFAULT 'NORMAL',
    "targetScope" "AnnouncementTargetScope" NOT NULL DEFAULT 'CONDOMINIUM',
    "publishAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "requireReadingConfirmation" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementTarget" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "condominiumId" TEXT,
    "unitId" TEXT,
    "role" "AccessRole",
    "linkType" "UnitPersonLinkType",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementReading" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementReading_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Announcement_administratorId_idx" ON "Announcement"("administratorId");

-- CreateIndex
CREATE INDEX "Announcement_condominiumId_idx" ON "Announcement"("condominiumId");

-- CreateIndex
CREATE INDEX "Announcement_createdByUserId_idx" ON "Announcement"("createdByUserId");

-- CreateIndex
CREATE INDEX "Announcement_status_idx" ON "Announcement"("status");

-- CreateIndex
CREATE INDEX "Announcement_priority_idx" ON "Announcement"("priority");

-- CreateIndex
CREATE INDEX "Announcement_targetScope_idx" ON "Announcement"("targetScope");

-- CreateIndex
CREATE INDEX "Announcement_publishAt_idx" ON "Announcement"("publishAt");

-- CreateIndex
CREATE INDEX "Announcement_publishedAt_idx" ON "Announcement"("publishedAt");

-- CreateIndex
CREATE INDEX "Announcement_expiresAt_idx" ON "Announcement"("expiresAt");

-- CreateIndex
CREATE INDEX "Announcement_administratorId_status_idx" ON "Announcement"("administratorId", "status");

-- CreateIndex
CREATE INDEX "Announcement_administratorId_condominiumId_idx" ON "Announcement"("administratorId", "condominiumId");

-- CreateIndex
CREATE INDEX "AnnouncementTarget_announcementId_idx" ON "AnnouncementTarget"("announcementId");

-- CreateIndex
CREATE INDEX "AnnouncementTarget_condominiumId_idx" ON "AnnouncementTarget"("condominiumId");

-- CreateIndex
CREATE INDEX "AnnouncementTarget_unitId_idx" ON "AnnouncementTarget"("unitId");

-- CreateIndex
CREATE INDEX "AnnouncementTarget_role_idx" ON "AnnouncementTarget"("role");

-- CreateIndex
CREATE INDEX "AnnouncementTarget_linkType_idx" ON "AnnouncementTarget"("linkType");

-- CreateIndex
CREATE INDEX "AnnouncementTarget_announcementId_condominiumId_idx" ON "AnnouncementTarget"("announcementId", "condominiumId");

-- CreateIndex
CREATE INDEX "AnnouncementTarget_announcementId_unitId_idx" ON "AnnouncementTarget"("announcementId", "unitId");

-- CreateIndex
CREATE INDEX "AnnouncementTarget_announcementId_role_idx" ON "AnnouncementTarget"("announcementId", "role");

-- CreateIndex
CREATE INDEX "AnnouncementTarget_announcementId_linkType_idx" ON "AnnouncementTarget"("announcementId", "linkType");

-- CreateIndex
CREATE INDEX "AnnouncementReading_announcementId_idx" ON "AnnouncementReading"("announcementId");

-- CreateIndex
CREATE INDEX "AnnouncementReading_userId_idx" ON "AnnouncementReading"("userId");

-- CreateIndex
CREATE INDEX "AnnouncementReading_accessId_idx" ON "AnnouncementReading"("accessId");

-- CreateIndex
CREATE INDEX "AnnouncementReading_readAt_idx" ON "AnnouncementReading"("readAt");

-- CreateIndex
CREATE INDEX "AnnouncementReading_announcementId_readAt_idx" ON "AnnouncementReading"("announcementId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementReading_announcementId_userId_accessId_key" ON "AnnouncementReading"("announcementId", "userId", "accessId");

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "Administrator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementTarget" ADD CONSTRAINT "AnnouncementTarget_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementTarget" ADD CONSTRAINT "AnnouncementTarget_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementTarget" ADD CONSTRAINT "AnnouncementTarget_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementReading" ADD CONSTRAINT "AnnouncementReading_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementReading" ADD CONSTRAINT "AnnouncementReading_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementReading" ADD CONSTRAINT "AnnouncementReading_accessId_fkey" FOREIGN KEY ("accessId") REFERENCES "UserAccess"("id") ON DELETE CASCADE ON UPDATE CASCADE;
