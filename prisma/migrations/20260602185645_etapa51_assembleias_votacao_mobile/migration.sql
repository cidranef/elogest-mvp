-- CreateEnum
CREATE TYPE "AssemblyType" AS ENUM ('ORDINARY', 'EXTRAORDINARY', 'SPECIAL', 'OTHER');

-- CreateEnum
CREATE TYPE "AssemblyStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED', 'RESULTS_PUBLISHED', 'CANCELED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AssemblyAgendaItemType" AS ENUM ('INFORMATIVE', 'APPROVE_REJECT_ABSTAIN', 'YES_NO_ABSTAIN', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE');

-- CreateEnum
CREATE TYPE "AssemblyAgendaItemStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'RESULT_VALIDATED', 'CANCELED');

-- CreateEnum
CREATE TYPE "AssemblyResultStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'NO_QUORUM', 'INFORMATIONAL', 'MANUAL_REVIEW', 'CANCELED');

-- CreateEnum
CREATE TYPE "AssemblyQuorumRuleType" AS ENUM ('SIMPLE_MAJORITY', 'MINIMUM_PARTICIPATION', 'MINIMUM_APPROVAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AssemblyEligibilityStatus" AS ENUM ('ELIGIBLE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "AssemblyRepresentationStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AssemblyVoteOrigin" AS ENUM ('DIRECT_UNIT_LINK', 'PROXY_REPRESENTATION', 'AUTHORIZED_LINK', 'ADMINISTRATIVE_IMPORT');

-- CreateEnum
CREATE TYPE "AssemblyAttachmentScope" AS ENUM ('CONVOCATION', 'AGENDA_ITEM', 'RESULT', 'OTHER');

-- CreateEnum
CREATE TYPE "AssemblyLogAction" AS ENUM ('CREATED', 'UPDATED', 'SCHEDULED', 'OPENED', 'CLOSED', 'CANCELED', 'ARCHIVED', 'RESULTS_PUBLISHED', 'AGENDA_ITEM_ADDED', 'AGENDA_ITEM_UPDATED', 'AGENDA_ITEM_REMOVED', 'ATTACHMENT_ADDED', 'ATTACHMENT_REMOVED', 'ELIGIBILITY_SNAPSHOT_CREATED', 'ELIGIBLE_UNIT_ADDED', 'ELIGIBLE_UNIT_UPDATED', 'ELIGIBLE_UNIT_BLOCKED', 'REPRESENTATION_ADDED', 'REPRESENTATION_UPDATED', 'REPRESENTATION_REVOKED', 'VOTE_REGISTERED', 'VOTE_UPDATED', 'REMINDER_SENT');

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "assemblyId" TEXT;

-- CreateTable
CREATE TABLE "Assembly" (
    "id" TEXT NOT NULL,
    "administratorId" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "meetingRoomId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "AssemblyType" NOT NULL DEFAULT 'ORDINARY',
    "status" "AssemblyStatus" NOT NULL DEFAULT 'DRAFT',
    "mode" "MeetingMode" NOT NULL DEFAULT 'HYBRID',
    "scheduledStartAt" TIMESTAMP(3),
    "scheduledEndAt" TIMESTAMP(3),
    "votingStartsAt" TIMESTAMP(3),
    "votingEndsAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "resultsPublishedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "location" TEXT,
    "externalMeetingUrl" TEXT,
    "accessInstructions" TEXT,
    "convocationText" TEXT,
    "internalNotes" TEXT,
    "allowVoteChange" BOOLEAN NOT NULL DEFAULT false,
    "eligibilitySnapshotAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "resultsPublishedByUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assembly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssemblyAgendaItem" (
    "id" TEXT NOT NULL,
    "assemblyId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "AssemblyAgendaItemType" NOT NULL DEFAULT 'APPROVE_REJECT_ABSTAIN',
    "status" "AssemblyAgendaItemStatus" NOT NULL DEFAULT 'DRAFT',
    "quorumRuleType" "AssemblyQuorumRuleType" NOT NULL DEFAULT 'SIMPLE_MAJORITY',
    "minimumParticipationPct" DECIMAL(7,4),
    "minimumApprovalPct" DECIMAL(7,4),
    "customRuleDescription" TEXT,
    "votingStartsAt" TIMESTAMP(3),
    "votingEndsAt" TIMESTAMP(3),
    "resultStatus" "AssemblyResultStatus" NOT NULL DEFAULT 'PENDING',
    "resultSummary" TEXT,
    "resultValidatedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssemblyAgendaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssemblyAgendaOption" (
    "id" TEXT NOT NULL,
    "agendaItemId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isAbstention" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssemblyAgendaOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssemblyEligibleUnit" (
    "id" TEXT NOT NULL,
    "assemblyId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "snapshotBlock" TEXT,
    "snapshotUnitNumber" TEXT NOT NULL,
    "status" "AssemblyEligibilityStatus" NOT NULL DEFAULT 'ELIGIBLE',
    "blockedReason" TEXT,
    "votingWeight" DECIMAL(12,6) NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssemblyEligibleUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssemblyRepresentation" (
    "id" TEXT NOT NULL,
    "assemblyId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "grantorUserId" TEXT,
    "representativeUserId" TEXT NOT NULL,
    "representativeAccessId" TEXT,
    "status" "AssemblyRepresentationStatus" NOT NULL DEFAULT 'ACTIVE',
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "documentUrl" TEXT,
    "documentName" TEXT,
    "documentMimeType" TEXT,
    "documentSizeBytes" INTEGER,
    "notes" TEXT,
    "metadata" JSONB,
    "createdByUserId" TEXT NOT NULL,
    "revokedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssemblyRepresentation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssemblyVote" (
    "id" TEXT NOT NULL,
    "assemblyId" TEXT NOT NULL,
    "agendaItemId" TEXT NOT NULL,
    "eligibleUnitId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "voterUserId" TEXT NOT NULL,
    "voterAccessId" TEXT,
    "unitPersonLinkId" TEXT,
    "representationId" TEXT,
    "origin" "AssemblyVoteOrigin" NOT NULL DEFAULT 'DIRECT_UNIT_LINK',
    "version" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "AssemblyVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssemblyVoteOption" (
    "id" TEXT NOT NULL,
    "voteId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssemblyVoteOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssemblyVoteRevision" (
    "id" TEXT NOT NULL,
    "voteId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changedByUserId" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssemblyVoteRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssemblyAttachment" (
    "id" TEXT NOT NULL,
    "assemblyId" TEXT NOT NULL,
    "agendaItemId" TEXT,
    "uploadedByUserId" TEXT NOT NULL,
    "scope" "AssemblyAttachmentScope" NOT NULL DEFAULT 'CONVOCATION',
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssemblyAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssemblyLog" (
    "id" TEXT NOT NULL,
    "assemblyId" TEXT NOT NULL,
    "userId" TEXT,
    "action" "AssemblyLogAction" NOT NULL,
    "message" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssemblyLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Assembly_administratorId_idx" ON "Assembly"("administratorId");

-- CreateIndex
CREATE INDEX "Assembly_condominiumId_idx" ON "Assembly"("condominiumId");

-- CreateIndex
CREATE INDEX "Assembly_meetingRoomId_idx" ON "Assembly"("meetingRoomId");

-- CreateIndex
CREATE INDEX "Assembly_createdByUserId_idx" ON "Assembly"("createdByUserId");

-- CreateIndex
CREATE INDEX "Assembly_resultsPublishedByUserId_idx" ON "Assembly"("resultsPublishedByUserId");

-- CreateIndex
CREATE INDEX "Assembly_type_idx" ON "Assembly"("type");

-- CreateIndex
CREATE INDEX "Assembly_status_idx" ON "Assembly"("status");

-- CreateIndex
CREATE INDEX "Assembly_mode_idx" ON "Assembly"("mode");

-- CreateIndex
CREATE INDEX "Assembly_scheduledStartAt_idx" ON "Assembly"("scheduledStartAt");

-- CreateIndex
CREATE INDEX "Assembly_votingStartsAt_idx" ON "Assembly"("votingStartsAt");

-- CreateIndex
CREATE INDEX "Assembly_votingEndsAt_idx" ON "Assembly"("votingEndsAt");

-- CreateIndex
CREATE INDEX "Assembly_administratorId_condominiumId_idx" ON "Assembly"("administratorId", "condominiumId");

-- CreateIndex
CREATE INDEX "Assembly_administratorId_status_idx" ON "Assembly"("administratorId", "status");

-- CreateIndex
CREATE INDEX "Assembly_condominiumId_status_idx" ON "Assembly"("condominiumId", "status");

-- CreateIndex
CREATE INDEX "AssemblyAgendaItem_assemblyId_idx" ON "AssemblyAgendaItem"("assemblyId");

-- CreateIndex
CREATE INDEX "AssemblyAgendaItem_order_idx" ON "AssemblyAgendaItem"("order");

-- CreateIndex
CREATE INDEX "AssemblyAgendaItem_type_idx" ON "AssemblyAgendaItem"("type");

-- CreateIndex
CREATE INDEX "AssemblyAgendaItem_status_idx" ON "AssemblyAgendaItem"("status");

-- CreateIndex
CREATE INDEX "AssemblyAgendaItem_resultStatus_idx" ON "AssemblyAgendaItem"("resultStatus");

-- CreateIndex
CREATE INDEX "AssemblyAgendaItem_votingStartsAt_idx" ON "AssemblyAgendaItem"("votingStartsAt");

-- CreateIndex
CREATE INDEX "AssemblyAgendaItem_votingEndsAt_idx" ON "AssemblyAgendaItem"("votingEndsAt");

-- CreateIndex
CREATE INDEX "AssemblyAgendaItem_assemblyId_order_idx" ON "AssemblyAgendaItem"("assemblyId", "order");

-- CreateIndex
CREATE INDEX "AssemblyAgendaOption_agendaItemId_idx" ON "AssemblyAgendaOption"("agendaItemId");

-- CreateIndex
CREATE INDEX "AssemblyAgendaOption_order_idx" ON "AssemblyAgendaOption"("order");

-- CreateIndex
CREATE INDEX "AssemblyAgendaOption_isAbstention_idx" ON "AssemblyAgendaOption"("isAbstention");

-- CreateIndex
CREATE INDEX "AssemblyAgendaOption_agendaItemId_order_idx" ON "AssemblyAgendaOption"("agendaItemId", "order");

-- CreateIndex
CREATE INDEX "AssemblyEligibleUnit_assemblyId_idx" ON "AssemblyEligibleUnit"("assemblyId");

-- CreateIndex
CREATE INDEX "AssemblyEligibleUnit_unitId_idx" ON "AssemblyEligibleUnit"("unitId");

-- CreateIndex
CREATE INDEX "AssemblyEligibleUnit_status_idx" ON "AssemblyEligibleUnit"("status");

-- CreateIndex
CREATE INDEX "AssemblyEligibleUnit_assemblyId_status_idx" ON "AssemblyEligibleUnit"("assemblyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AssemblyEligibleUnit_assemblyId_unitId_key" ON "AssemblyEligibleUnit"("assemblyId", "unitId");

-- CreateIndex
CREATE INDEX "AssemblyRepresentation_assemblyId_idx" ON "AssemblyRepresentation"("assemblyId");

-- CreateIndex
CREATE INDEX "AssemblyRepresentation_unitId_idx" ON "AssemblyRepresentation"("unitId");

-- CreateIndex
CREATE INDEX "AssemblyRepresentation_grantorUserId_idx" ON "AssemblyRepresentation"("grantorUserId");

-- CreateIndex
CREATE INDEX "AssemblyRepresentation_representativeUserId_idx" ON "AssemblyRepresentation"("representativeUserId");

-- CreateIndex
CREATE INDEX "AssemblyRepresentation_representativeAccessId_idx" ON "AssemblyRepresentation"("representativeAccessId");

-- CreateIndex
CREATE INDEX "AssemblyRepresentation_status_idx" ON "AssemblyRepresentation"("status");

-- CreateIndex
CREATE INDEX "AssemblyRepresentation_validFrom_idx" ON "AssemblyRepresentation"("validFrom");

-- CreateIndex
CREATE INDEX "AssemblyRepresentation_validUntil_idx" ON "AssemblyRepresentation"("validUntil");

-- CreateIndex
CREATE INDEX "AssemblyRepresentation_createdByUserId_idx" ON "AssemblyRepresentation"("createdByUserId");

-- CreateIndex
CREATE INDEX "AssemblyRepresentation_revokedByUserId_idx" ON "AssemblyRepresentation"("revokedByUserId");

-- CreateIndex
CREATE INDEX "AssemblyRepresentation_assemblyId_unitId_idx" ON "AssemblyRepresentation"("assemblyId", "unitId");

-- CreateIndex
CREATE INDEX "AssemblyRepresentation_assemblyId_representativeUserId_idx" ON "AssemblyRepresentation"("assemblyId", "representativeUserId");

-- CreateIndex
CREATE INDEX "AssemblyVote_assemblyId_idx" ON "AssemblyVote"("assemblyId");

-- CreateIndex
CREATE INDEX "AssemblyVote_agendaItemId_idx" ON "AssemblyVote"("agendaItemId");

-- CreateIndex
CREATE INDEX "AssemblyVote_eligibleUnitId_idx" ON "AssemblyVote"("eligibleUnitId");

-- CreateIndex
CREATE INDEX "AssemblyVote_unitId_idx" ON "AssemblyVote"("unitId");

-- CreateIndex
CREATE INDEX "AssemblyVote_voterUserId_idx" ON "AssemblyVote"("voterUserId");

-- CreateIndex
CREATE INDEX "AssemblyVote_voterAccessId_idx" ON "AssemblyVote"("voterAccessId");

-- CreateIndex
CREATE INDEX "AssemblyVote_unitPersonLinkId_idx" ON "AssemblyVote"("unitPersonLinkId");

-- CreateIndex
CREATE INDEX "AssemblyVote_representationId_idx" ON "AssemblyVote"("representationId");

-- CreateIndex
CREATE INDEX "AssemblyVote_origin_idx" ON "AssemblyVote"("origin");

-- CreateIndex
CREATE INDEX "AssemblyVote_submittedAt_idx" ON "AssemblyVote"("submittedAt");

-- CreateIndex
CREATE INDEX "AssemblyVote_assemblyId_unitId_idx" ON "AssemblyVote"("assemblyId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "AssemblyVote_agendaItemId_eligibleUnitId_key" ON "AssemblyVote"("agendaItemId", "eligibleUnitId");

-- CreateIndex
CREATE INDEX "AssemblyVoteOption_voteId_idx" ON "AssemblyVoteOption"("voteId");

-- CreateIndex
CREATE INDEX "AssemblyVoteOption_optionId_idx" ON "AssemblyVoteOption"("optionId");

-- CreateIndex
CREATE UNIQUE INDEX "AssemblyVoteOption_voteId_optionId_key" ON "AssemblyVoteOption"("voteId", "optionId");

-- CreateIndex
CREATE INDEX "AssemblyVoteRevision_voteId_idx" ON "AssemblyVoteRevision"("voteId");

-- CreateIndex
CREATE INDEX "AssemblyVoteRevision_changedByUserId_idx" ON "AssemblyVoteRevision"("changedByUserId");

-- CreateIndex
CREATE INDEX "AssemblyVoteRevision_createdAt_idx" ON "AssemblyVoteRevision"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssemblyVoteRevision_voteId_version_key" ON "AssemblyVoteRevision"("voteId", "version");

-- CreateIndex
CREATE INDEX "AssemblyAttachment_assemblyId_idx" ON "AssemblyAttachment"("assemblyId");

-- CreateIndex
CREATE INDEX "AssemblyAttachment_agendaItemId_idx" ON "AssemblyAttachment"("agendaItemId");

-- CreateIndex
CREATE INDEX "AssemblyAttachment_uploadedByUserId_idx" ON "AssemblyAttachment"("uploadedByUserId");

-- CreateIndex
CREATE INDEX "AssemblyAttachment_scope_idx" ON "AssemblyAttachment"("scope");

-- CreateIndex
CREATE INDEX "AssemblyAttachment_createdAt_idx" ON "AssemblyAttachment"("createdAt");

-- CreateIndex
CREATE INDEX "AssemblyLog_assemblyId_idx" ON "AssemblyLog"("assemblyId");

-- CreateIndex
CREATE INDEX "AssemblyLog_userId_idx" ON "AssemblyLog"("userId");

-- CreateIndex
CREATE INDEX "AssemblyLog_action_idx" ON "AssemblyLog"("action");

-- CreateIndex
CREATE INDEX "AssemblyLog_createdAt_idx" ON "AssemblyLog"("createdAt");

-- CreateIndex
CREATE INDEX "AssemblyLog_assemblyId_createdAt_idx" ON "AssemblyLog"("assemblyId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_assemblyId_idx" ON "Notification"("assemblyId");

-- AddForeignKey
ALTER TABLE "Assembly" ADD CONSTRAINT "Assembly_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "Administrator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assembly" ADD CONSTRAINT "Assembly_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assembly" ADD CONSTRAINT "Assembly_meetingRoomId_fkey" FOREIGN KEY ("meetingRoomId") REFERENCES "MeetingRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assembly" ADD CONSTRAINT "Assembly_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assembly" ADD CONSTRAINT "Assembly_resultsPublishedByUserId_fkey" FOREIGN KEY ("resultsPublishedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyAgendaItem" ADD CONSTRAINT "AssemblyAgendaItem_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyAgendaOption" ADD CONSTRAINT "AssemblyAgendaOption_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "AssemblyAgendaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyEligibleUnit" ADD CONSTRAINT "AssemblyEligibleUnit_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyEligibleUnit" ADD CONSTRAINT "AssemblyEligibleUnit_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyRepresentation" ADD CONSTRAINT "AssemblyRepresentation_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyRepresentation" ADD CONSTRAINT "AssemblyRepresentation_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyRepresentation" ADD CONSTRAINT "AssemblyRepresentation_grantorUserId_fkey" FOREIGN KEY ("grantorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyRepresentation" ADD CONSTRAINT "AssemblyRepresentation_representativeUserId_fkey" FOREIGN KEY ("representativeUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyRepresentation" ADD CONSTRAINT "AssemblyRepresentation_representativeAccessId_fkey" FOREIGN KEY ("representativeAccessId") REFERENCES "UserAccess"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyRepresentation" ADD CONSTRAINT "AssemblyRepresentation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyRepresentation" ADD CONSTRAINT "AssemblyRepresentation_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyVote" ADD CONSTRAINT "AssemblyVote_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyVote" ADD CONSTRAINT "AssemblyVote_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "AssemblyAgendaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyVote" ADD CONSTRAINT "AssemblyVote_eligibleUnitId_fkey" FOREIGN KEY ("eligibleUnitId") REFERENCES "AssemblyEligibleUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyVote" ADD CONSTRAINT "AssemblyVote_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyVote" ADD CONSTRAINT "AssemblyVote_voterUserId_fkey" FOREIGN KEY ("voterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyVote" ADD CONSTRAINT "AssemblyVote_voterAccessId_fkey" FOREIGN KEY ("voterAccessId") REFERENCES "UserAccess"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyVote" ADD CONSTRAINT "AssemblyVote_unitPersonLinkId_fkey" FOREIGN KEY ("unitPersonLinkId") REFERENCES "UnitPersonLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyVote" ADD CONSTRAINT "AssemblyVote_representationId_fkey" FOREIGN KEY ("representationId") REFERENCES "AssemblyRepresentation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyVoteOption" ADD CONSTRAINT "AssemblyVoteOption_voteId_fkey" FOREIGN KEY ("voteId") REFERENCES "AssemblyVote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyVoteOption" ADD CONSTRAINT "AssemblyVoteOption_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "AssemblyAgendaOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyVoteRevision" ADD CONSTRAINT "AssemblyVoteRevision_voteId_fkey" FOREIGN KEY ("voteId") REFERENCES "AssemblyVote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyVoteRevision" ADD CONSTRAINT "AssemblyVoteRevision_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyAttachment" ADD CONSTRAINT "AssemblyAttachment_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyAttachment" ADD CONSTRAINT "AssemblyAttachment_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "AssemblyAgendaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyAttachment" ADD CONSTRAINT "AssemblyAttachment_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyLog" ADD CONSTRAINT "AssemblyLog_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyLog" ADD CONSTRAINT "AssemblyLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly"("id") ON DELETE SET NULL ON UPDATE CASCADE;
