-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AssemblyLogAction" ADD VALUE 'AGENDA_ITEM_DEFERRED';
ALTER TYPE "AssemblyLogAction" ADD VALUE 'AGENDA_ITEM_IMPORTED';

-- AlterEnum
ALTER TYPE "AssemblyResultStatus" ADD VALUE 'DEFERRED';

-- AlterTable
ALTER TABLE "AssemblyAgendaItem" ADD COLUMN     "deferredAt" TIMESTAMP(3),
ADD COLUMN     "deferredByUserId" TEXT,
ADD COLUMN     "deferredNotes" TEXT,
ADD COLUMN     "deferredReason" TEXT,
ADD COLUMN     "originAgendaItemId" TEXT;

-- CreateIndex
CREATE INDEX "AssemblyAgendaItem_deferredAt_idx" ON "AssemblyAgendaItem"("deferredAt");

-- CreateIndex
CREATE INDEX "AssemblyAgendaItem_deferredByUserId_idx" ON "AssemblyAgendaItem"("deferredByUserId");

-- CreateIndex
CREATE INDEX "AssemblyAgendaItem_originAgendaItemId_idx" ON "AssemblyAgendaItem"("originAgendaItemId");

-- AddForeignKey
ALTER TABLE "AssemblyAgendaItem" ADD CONSTRAINT "AssemblyAgendaItem_deferredByUserId_fkey" FOREIGN KEY ("deferredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyAgendaItem" ADD CONSTRAINT "AssemblyAgendaItem_originAgendaItemId_fkey" FOREIGN KEY ("originAgendaItemId") REFERENCES "AssemblyAgendaItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
