-- AlterEnum
ALTER TYPE "AnnouncementTargetScope" ADD VALUE 'BLOCK';

-- AlterTable
ALTER TABLE "AnnouncementTarget" ADD COLUMN     "block" TEXT;

-- CreateIndex
CREATE INDEX "AnnouncementTarget_block_idx" ON "AnnouncementTarget"("block");

-- CreateIndex
CREATE INDEX "AnnouncementTarget_announcementId_block_idx" ON "AnnouncementTarget"("announcementId", "block");
