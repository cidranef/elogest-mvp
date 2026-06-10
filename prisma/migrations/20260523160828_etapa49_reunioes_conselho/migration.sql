-- CreateEnum
CREATE TYPE "MeetingRoomType" AS ENUM ('COUNCIL', 'ASSEMBLY', 'INTERNAL', 'EXTRAORDINARY', 'OTHER');

-- CreateEnum
CREATE TYPE "MeetingMode" AS ENUM ('PRESENTIAL', 'ONLINE', 'HYBRID');

-- CreateEnum
CREATE TYPE "MeetingRoomStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED', 'CANCELED');

-- CreateEnum
CREATE TYPE "MeetingProvider" AS ENUM ('INTERNAL_PENDING', 'GOOGLE_MEET', 'ZOOM', 'TEAMS', 'JITSI', 'DAILY', 'WHEREBY', 'OTHER');

-- CreateEnum
CREATE TYPE "MeetingRoomParticipantStatus" AS ENUM ('INVITED', 'CONFIRMED', 'DECLINED', 'PRESENT', 'ABSENT', 'EXCUSED');

-- CreateEnum
CREATE TYPE "MeetingRoomLogAction" AS ENUM ('CREATED', 'UPDATED', 'SCHEDULED', 'OPENED', 'CLOSED', 'CANCELED', 'PARTICIPANT_INVITED', 'PARTICIPANT_CONFIRMED', 'PARTICIPANT_DECLINED', 'PARTICIPANT_MARKED_PRESENT', 'PARTICIPANT_MARKED_ABSENT', 'PROVIDER_UPDATED');

-- CreateEnum
CREATE TYPE "CouncilMeetingStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CouncilParticipantStatus" AS ENUM ('INVITED', 'CONFIRMED', 'DECLINED', 'PRESENT', 'ABSENT', 'EXCUSED');

-- CreateEnum
CREATE TYPE "CouncilAgendaItemStatus" AS ENUM ('OPEN', 'DISCUSSED', 'APPROVED', 'REJECTED', 'POSTPONED', 'CANCELED');

-- CreateEnum
CREATE TYPE "CouncilMeetingLogAction" AS ENUM ('CREATED', 'UPDATED', 'SCHEDULED', 'STARTED', 'COMPLETED', 'CANCELED', 'ARCHIVED', 'PARTICIPANT_ADDED', 'PARTICIPANT_UPDATED', 'PARTICIPANT_REMOVED', 'AGENDA_ITEM_ADDED', 'AGENDA_ITEM_UPDATED', 'AGENDA_ITEM_REMOVED', 'ATTACHMENT_ADDED', 'ATTACHMENT_REMOVED', 'ATTENDANCE_CONFIRMED', 'PRESENCE_REGISTERED', 'DECISION_REGISTERED');

-- CreateTable
CREATE TABLE "MeetingRoom" (
    "id" TEXT NOT NULL,
    "administratorId" TEXT NOT NULL,
    "condominiumId" TEXT,
    "type" "MeetingRoomType" NOT NULL DEFAULT 'COUNCIL',
    "mode" "MeetingMode" NOT NULL DEFAULT 'ONLINE',
    "status" "MeetingRoomStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scheduledStartAt" TIMESTAMP(3),
    "scheduledEndAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "location" TEXT,
    "provider" "MeetingProvider" NOT NULL DEFAULT 'INTERNAL_PENDING',
    "providerMeetingId" TEXT,
    "providerJoinUrl" TEXT,
    "providerMetadata" JSONB,
    "internalAccessCode" TEXT,
    "accessInstructions" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingRoomParticipant" (
    "id" TEXT NOT NULL,
    "meetingRoomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userAccessId" TEXT,
    "role" "AccessRole" NOT NULL,
    "status" "MeetingRoomParticipantStatus" NOT NULL DEFAULT 'INVITED',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "attendanceNote" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingRoomParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingRoomLog" (
    "id" TEXT NOT NULL,
    "meetingRoomId" TEXT NOT NULL,
    "userId" TEXT,
    "action" "MeetingRoomLogAction" NOT NULL,
    "message" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingRoomLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouncilMeeting" (
    "id" TEXT NOT NULL,
    "administratorId" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "meetingRoomId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "CouncilMeetingStatus" NOT NULL DEFAULT 'DRAFT',
    "mode" "MeetingMode" NOT NULL DEFAULT 'ONLINE',
    "scheduledStartAt" TIMESTAMP(3),
    "scheduledEndAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "location" TEXT,
    "summary" TEXT,
    "decisions" TEXT,
    "nextSteps" TEXT,
    "internalNotes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CouncilMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouncilMeetingParticipant" (
    "id" TEXT NOT NULL,
    "councilMeetingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userAccessId" TEXT,
    "role" "AccessRole" NOT NULL,
    "status" "CouncilParticipantStatus" NOT NULL DEFAULT 'INVITED',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "canViewPrivateNotes" BOOLEAN NOT NULL DEFAULT false,
    "attendanceNote" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CouncilMeetingParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouncilMeetingAgendaItem" (
    "id" TEXT NOT NULL,
    "councilMeetingId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "CouncilAgendaItemStatus" NOT NULL DEFAULT 'OPEN',
    "discussionNotes" TEXT,
    "decision" TEXT,
    "responsibleName" TEXT,
    "dueDate" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CouncilMeetingAgendaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouncilMeetingAttachment" (
    "id" TEXT NOT NULL,
    "councilMeetingId" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouncilMeetingAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouncilMeetingLog" (
    "id" TEXT NOT NULL,
    "councilMeetingId" TEXT NOT NULL,
    "userId" TEXT,
    "action" "CouncilMeetingLogAction" NOT NULL,
    "message" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouncilMeetingLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MeetingRoom_internalAccessCode_key" ON "MeetingRoom"("internalAccessCode");

-- CreateIndex
CREATE INDEX "MeetingRoom_administratorId_idx" ON "MeetingRoom"("administratorId");

-- CreateIndex
CREATE INDEX "MeetingRoom_condominiumId_idx" ON "MeetingRoom"("condominiumId");

-- CreateIndex
CREATE INDEX "MeetingRoom_createdByUserId_idx" ON "MeetingRoom"("createdByUserId");

-- CreateIndex
CREATE INDEX "MeetingRoom_type_idx" ON "MeetingRoom"("type");

-- CreateIndex
CREATE INDEX "MeetingRoom_mode_idx" ON "MeetingRoom"("mode");

-- CreateIndex
CREATE INDEX "MeetingRoom_status_idx" ON "MeetingRoom"("status");

-- CreateIndex
CREATE INDEX "MeetingRoom_provider_idx" ON "MeetingRoom"("provider");

-- CreateIndex
CREATE INDEX "MeetingRoom_scheduledStartAt_idx" ON "MeetingRoom"("scheduledStartAt");

-- CreateIndex
CREATE INDEX "MeetingRoom_scheduledEndAt_idx" ON "MeetingRoom"("scheduledEndAt");

-- CreateIndex
CREATE INDEX "MeetingRoom_openedAt_idx" ON "MeetingRoom"("openedAt");

-- CreateIndex
CREATE INDEX "MeetingRoom_closedAt_idx" ON "MeetingRoom"("closedAt");

-- CreateIndex
CREATE INDEX "MeetingRoom_administratorId_condominiumId_idx" ON "MeetingRoom"("administratorId", "condominiumId");

-- CreateIndex
CREATE INDEX "MeetingRoom_administratorId_status_idx" ON "MeetingRoom"("administratorId", "status");

-- CreateIndex
CREATE INDEX "MeetingRoom_type_status_idx" ON "MeetingRoom"("type", "status");

-- CreateIndex
CREATE INDEX "MeetingRoomParticipant_meetingRoomId_idx" ON "MeetingRoomParticipant"("meetingRoomId");

-- CreateIndex
CREATE INDEX "MeetingRoomParticipant_userId_idx" ON "MeetingRoomParticipant"("userId");

-- CreateIndex
CREATE INDEX "MeetingRoomParticipant_userAccessId_idx" ON "MeetingRoomParticipant"("userAccessId");

-- CreateIndex
CREATE INDEX "MeetingRoomParticipant_role_idx" ON "MeetingRoomParticipant"("role");

-- CreateIndex
CREATE INDEX "MeetingRoomParticipant_status_idx" ON "MeetingRoomParticipant"("status");

-- CreateIndex
CREATE INDEX "MeetingRoomParticipant_invitedAt_idx" ON "MeetingRoomParticipant"("invitedAt");

-- CreateIndex
CREATE INDEX "MeetingRoomParticipant_respondedAt_idx" ON "MeetingRoomParticipant"("respondedAt");

-- CreateIndex
CREATE INDEX "MeetingRoomParticipant_joinedAt_idx" ON "MeetingRoomParticipant"("joinedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingRoomParticipant_meetingRoomId_userId_role_key" ON "MeetingRoomParticipant"("meetingRoomId", "userId", "role");

-- CreateIndex
CREATE INDEX "MeetingRoomLog_meetingRoomId_idx" ON "MeetingRoomLog"("meetingRoomId");

-- CreateIndex
CREATE INDEX "MeetingRoomLog_userId_idx" ON "MeetingRoomLog"("userId");

-- CreateIndex
CREATE INDEX "MeetingRoomLog_action_idx" ON "MeetingRoomLog"("action");

-- CreateIndex
CREATE INDEX "MeetingRoomLog_createdAt_idx" ON "MeetingRoomLog"("createdAt");

-- CreateIndex
CREATE INDEX "MeetingRoomLog_meetingRoomId_createdAt_idx" ON "MeetingRoomLog"("meetingRoomId", "createdAt");

-- CreateIndex
CREATE INDEX "CouncilMeeting_administratorId_idx" ON "CouncilMeeting"("administratorId");

-- CreateIndex
CREATE INDEX "CouncilMeeting_condominiumId_idx" ON "CouncilMeeting"("condominiumId");

-- CreateIndex
CREATE INDEX "CouncilMeeting_meetingRoomId_idx" ON "CouncilMeeting"("meetingRoomId");

-- CreateIndex
CREATE INDEX "CouncilMeeting_createdByUserId_idx" ON "CouncilMeeting"("createdByUserId");

-- CreateIndex
CREATE INDEX "CouncilMeeting_status_idx" ON "CouncilMeeting"("status");

-- CreateIndex
CREATE INDEX "CouncilMeeting_mode_idx" ON "CouncilMeeting"("mode");

-- CreateIndex
CREATE INDEX "CouncilMeeting_scheduledStartAt_idx" ON "CouncilMeeting"("scheduledStartAt");

-- CreateIndex
CREATE INDEX "CouncilMeeting_scheduledEndAt_idx" ON "CouncilMeeting"("scheduledEndAt");

-- CreateIndex
CREATE INDEX "CouncilMeeting_completedAt_idx" ON "CouncilMeeting"("completedAt");

-- CreateIndex
CREATE INDEX "CouncilMeeting_administratorId_condominiumId_idx" ON "CouncilMeeting"("administratorId", "condominiumId");

-- CreateIndex
CREATE INDEX "CouncilMeeting_administratorId_status_idx" ON "CouncilMeeting"("administratorId", "status");

-- CreateIndex
CREATE INDEX "CouncilMeeting_condominiumId_status_idx" ON "CouncilMeeting"("condominiumId", "status");

-- CreateIndex
CREATE INDEX "CouncilMeetingParticipant_councilMeetingId_idx" ON "CouncilMeetingParticipant"("councilMeetingId");

-- CreateIndex
CREATE INDEX "CouncilMeetingParticipant_userId_idx" ON "CouncilMeetingParticipant"("userId");

-- CreateIndex
CREATE INDEX "CouncilMeetingParticipant_userAccessId_idx" ON "CouncilMeetingParticipant"("userAccessId");

-- CreateIndex
CREATE INDEX "CouncilMeetingParticipant_role_idx" ON "CouncilMeetingParticipant"("role");

-- CreateIndex
CREATE INDEX "CouncilMeetingParticipant_status_idx" ON "CouncilMeetingParticipant"("status");

-- CreateIndex
CREATE INDEX "CouncilMeetingParticipant_invitedAt_idx" ON "CouncilMeetingParticipant"("invitedAt");

-- CreateIndex
CREATE INDEX "CouncilMeetingParticipant_respondedAt_idx" ON "CouncilMeetingParticipant"("respondedAt");

-- CreateIndex
CREATE INDEX "CouncilMeetingParticipant_confirmedAt_idx" ON "CouncilMeetingParticipant"("confirmedAt");

-- CreateIndex
CREATE INDEX "CouncilMeetingParticipant_joinedAt_idx" ON "CouncilMeetingParticipant"("joinedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CouncilMeetingParticipant_councilMeetingId_userId_role_key" ON "CouncilMeetingParticipant"("councilMeetingId", "userId", "role");

-- CreateIndex
CREATE INDEX "CouncilMeetingAgendaItem_councilMeetingId_idx" ON "CouncilMeetingAgendaItem"("councilMeetingId");

-- CreateIndex
CREATE INDEX "CouncilMeetingAgendaItem_order_idx" ON "CouncilMeetingAgendaItem"("order");

-- CreateIndex
CREATE INDEX "CouncilMeetingAgendaItem_status_idx" ON "CouncilMeetingAgendaItem"("status");

-- CreateIndex
CREATE INDEX "CouncilMeetingAgendaItem_dueDate_idx" ON "CouncilMeetingAgendaItem"("dueDate");

-- CreateIndex
CREATE INDEX "CouncilMeetingAgendaItem_councilMeetingId_order_idx" ON "CouncilMeetingAgendaItem"("councilMeetingId", "order");

-- CreateIndex
CREATE INDEX "CouncilMeetingAttachment_councilMeetingId_idx" ON "CouncilMeetingAttachment"("councilMeetingId");

-- CreateIndex
CREATE INDEX "CouncilMeetingAttachment_uploadedByUserId_idx" ON "CouncilMeetingAttachment"("uploadedByUserId");

-- CreateIndex
CREATE INDEX "CouncilMeetingAttachment_createdAt_idx" ON "CouncilMeetingAttachment"("createdAt");

-- CreateIndex
CREATE INDEX "CouncilMeetingLog_councilMeetingId_idx" ON "CouncilMeetingLog"("councilMeetingId");

-- CreateIndex
CREATE INDEX "CouncilMeetingLog_userId_idx" ON "CouncilMeetingLog"("userId");

-- CreateIndex
CREATE INDEX "CouncilMeetingLog_action_idx" ON "CouncilMeetingLog"("action");

-- CreateIndex
CREATE INDEX "CouncilMeetingLog_createdAt_idx" ON "CouncilMeetingLog"("createdAt");

-- CreateIndex
CREATE INDEX "CouncilMeetingLog_councilMeetingId_createdAt_idx" ON "CouncilMeetingLog"("councilMeetingId", "createdAt");

-- AddForeignKey
ALTER TABLE "MeetingRoom" ADD CONSTRAINT "MeetingRoom_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "Administrator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingRoom" ADD CONSTRAINT "MeetingRoom_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingRoom" ADD CONSTRAINT "MeetingRoom_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingRoomParticipant" ADD CONSTRAINT "MeetingRoomParticipant_meetingRoomId_fkey" FOREIGN KEY ("meetingRoomId") REFERENCES "MeetingRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingRoomParticipant" ADD CONSTRAINT "MeetingRoomParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingRoomParticipant" ADD CONSTRAINT "MeetingRoomParticipant_userAccessId_fkey" FOREIGN KEY ("userAccessId") REFERENCES "UserAccess"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingRoomLog" ADD CONSTRAINT "MeetingRoomLog_meetingRoomId_fkey" FOREIGN KEY ("meetingRoomId") REFERENCES "MeetingRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingRoomLog" ADD CONSTRAINT "MeetingRoomLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouncilMeeting" ADD CONSTRAINT "CouncilMeeting_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "Administrator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouncilMeeting" ADD CONSTRAINT "CouncilMeeting_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouncilMeeting" ADD CONSTRAINT "CouncilMeeting_meetingRoomId_fkey" FOREIGN KEY ("meetingRoomId") REFERENCES "MeetingRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouncilMeeting" ADD CONSTRAINT "CouncilMeeting_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouncilMeetingParticipant" ADD CONSTRAINT "CouncilMeetingParticipant_councilMeetingId_fkey" FOREIGN KEY ("councilMeetingId") REFERENCES "CouncilMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouncilMeetingParticipant" ADD CONSTRAINT "CouncilMeetingParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouncilMeetingParticipant" ADD CONSTRAINT "CouncilMeetingParticipant_userAccessId_fkey" FOREIGN KEY ("userAccessId") REFERENCES "UserAccess"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouncilMeetingAgendaItem" ADD CONSTRAINT "CouncilMeetingAgendaItem_councilMeetingId_fkey" FOREIGN KEY ("councilMeetingId") REFERENCES "CouncilMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouncilMeetingAttachment" ADD CONSTRAINT "CouncilMeetingAttachment_councilMeetingId_fkey" FOREIGN KEY ("councilMeetingId") REFERENCES "CouncilMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouncilMeetingAttachment" ADD CONSTRAINT "CouncilMeetingAttachment_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouncilMeetingLog" ADD CONSTRAINT "CouncilMeetingLog_councilMeetingId_fkey" FOREIGN KEY ("councilMeetingId") REFERENCES "CouncilMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouncilMeetingLog" ADD CONSTRAINT "CouncilMeetingLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
