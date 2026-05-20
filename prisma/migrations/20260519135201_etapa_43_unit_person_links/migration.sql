-- CreateEnum
CREATE TYPE "UnitPersonLinkType" AS ENUM ('OWNER', 'RESIDENT', 'TENANT', 'DEPENDENT', 'AUTHORIZED');

-- AlterTable
ALTER TABLE "UserAccess" ADD COLUMN     "lastUsedAt" TIMESTAMP(3),
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "permissionsOverride" JSONB,
ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "revokedReason" TEXT,
ADD COLUMN     "unitPersonLinkId" TEXT;

-- CreateTable
CREATE TABLE "UnitPersonLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "residentId" TEXT,
    "condominiumId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "linkType" "UnitPersonLinkType" NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "canVote" BOOLEAN NOT NULL DEFAULT false,
    "canOpenTickets" BOOLEAN NOT NULL DEFAULT true,
    "receivesNotifications" BOOLEAN NOT NULL DEFAULT true,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitPersonLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UnitPersonLink_userId_idx" ON "UnitPersonLink"("userId");

-- CreateIndex
CREATE INDEX "UnitPersonLink_residentId_idx" ON "UnitPersonLink"("residentId");

-- CreateIndex
CREATE INDEX "UnitPersonLink_condominiumId_idx" ON "UnitPersonLink"("condominiumId");

-- CreateIndex
CREATE INDEX "UnitPersonLink_unitId_idx" ON "UnitPersonLink"("unitId");

-- CreateIndex
CREATE INDEX "UnitPersonLink_linkType_idx" ON "UnitPersonLink"("linkType");

-- CreateIndex
CREATE INDEX "UnitPersonLink_status_idx" ON "UnitPersonLink"("status");

-- CreateIndex
CREATE INDEX "UnitPersonLink_canVote_idx" ON "UnitPersonLink"("canVote");

-- CreateIndex
CREATE INDEX "UnitPersonLink_canOpenTickets_idx" ON "UnitPersonLink"("canOpenTickets");

-- CreateIndex
CREATE INDEX "UnitPersonLink_receivesNotifications_idx" ON "UnitPersonLink"("receivesNotifications");

-- CreateIndex
CREATE INDEX "UnitPersonLink_userId_condominiumId_idx" ON "UnitPersonLink"("userId", "condominiumId");

-- CreateIndex
CREATE INDEX "UnitPersonLink_userId_unitId_idx" ON "UnitPersonLink"("userId", "unitId");

-- CreateIndex
CREATE INDEX "UnitPersonLink_condominiumId_unitId_idx" ON "UnitPersonLink"("condominiumId", "unitId");

-- CreateIndex
CREATE INDEX "UserAccess_unitPersonLinkId_idx" ON "UserAccess"("unitPersonLinkId");

-- AddForeignKey
ALTER TABLE "UserAccess" ADD CONSTRAINT "UserAccess_unitPersonLinkId_fkey" FOREIGN KEY ("unitPersonLinkId") REFERENCES "UnitPersonLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitPersonLink" ADD CONSTRAINT "UnitPersonLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitPersonLink" ADD CONSTRAINT "UnitPersonLink_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitPersonLink" ADD CONSTRAINT "UnitPersonLink_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitPersonLink" ADD CONSTRAINT "UnitPersonLink_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
