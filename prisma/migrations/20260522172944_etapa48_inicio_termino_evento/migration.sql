-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "eventEndAt" TIMESTAMP(3),
ADD COLUMN     "eventStartAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Announcement_eventStartAt_idx" ON "Announcement"("eventStartAt");

-- CreateIndex
CREATE INDEX "Announcement_eventEndAt_idx" ON "Announcement"("eventEndAt");
