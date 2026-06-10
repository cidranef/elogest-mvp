-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "eventDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Announcement_eventDate_idx" ON "Announcement"("eventDate");
