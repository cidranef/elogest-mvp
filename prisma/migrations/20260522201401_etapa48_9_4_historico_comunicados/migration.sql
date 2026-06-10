-- CreateEnum
CREATE TYPE "AnnouncementLogAction" AS ENUM ('CREATED', 'UPDATED', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED', 'REMINDER_SENT', 'READING_CONFIRMED', 'ATTACHMENT_ADDED', 'ATTACHMENT_REMOVED');

-- CreateTable
CREATE TABLE "AnnouncementLog" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT,
    "action" "AnnouncementLogAction" NOT NULL,
    "message" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnnouncementLog_announcementId_idx" ON "AnnouncementLog"("announcementId");

-- CreateIndex
CREATE INDEX "AnnouncementLog_userId_idx" ON "AnnouncementLog"("userId");

-- CreateIndex
CREATE INDEX "AnnouncementLog_action_idx" ON "AnnouncementLog"("action");

-- CreateIndex
CREATE INDEX "AnnouncementLog_createdAt_idx" ON "AnnouncementLog"("createdAt");

-- CreateIndex
CREATE INDEX "AnnouncementLog_announcementId_createdAt_idx" ON "AnnouncementLog"("announcementId", "createdAt");

-- AddForeignKey
ALTER TABLE "AnnouncementLog" ADD CONSTRAINT "AnnouncementLog_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementLog" ADD CONSTRAINT "AnnouncementLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
