-- AlterTable
ALTER TABLE "CouncilMeeting" ADD COLUMN     "recordKeeperAssignedAt" TIMESTAMP(3),
ADD COLUMN     "recordKeeperParticipantId" TEXT,
ADD COLUMN     "recordKeeperUserId" TEXT;

-- CreateIndex
CREATE INDEX "CouncilMeeting_recordKeeperUserId_idx" ON "CouncilMeeting"("recordKeeperUserId");

-- CreateIndex
CREATE INDEX "CouncilMeeting_recordKeeperParticipantId_idx" ON "CouncilMeeting"("recordKeeperParticipantId");

-- CreateIndex
CREATE INDEX "CouncilMeeting_recordKeeperAssignedAt_idx" ON "CouncilMeeting"("recordKeeperAssignedAt");

-- AddForeignKey
ALTER TABLE "CouncilMeeting" ADD CONSTRAINT "CouncilMeeting_recordKeeperUserId_fkey" FOREIGN KEY ("recordKeeperUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouncilMeeting" ADD CONSTRAINT "CouncilMeeting_recordKeeperParticipantId_fkey" FOREIGN KEY ("recordKeeperParticipantId") REFERENCES "CouncilMeetingParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
