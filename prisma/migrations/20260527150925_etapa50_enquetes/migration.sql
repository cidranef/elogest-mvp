-- CreateEnum
CREATE TYPE "PollType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'YES_NO', 'TEXT');

-- CreateEnum
CREATE TYPE "PollStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED', 'CANCELED');

-- CreateEnum
CREATE TYPE "PollTargetScope" AS ENUM ('CONDOMINIUM', 'BLOCK', 'UNIT', 'ROLE', 'LINK_TYPE', 'GOVERNANCE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PollResultVisibility" AS ENUM ('ADMIN_ONLY', 'PARTICIPANTS_AFTER_RESPONSE', 'PARTICIPANTS_AFTER_CLOSED', 'PUBLIC_TO_TARGET');

-- CreateEnum
CREATE TYPE "PollLogAction" AS ENUM ('CREATED', 'UPDATED', 'PUBLISHED', 'CLOSED', 'ARCHIVED', 'CANCELED', 'TARGET_ADDED', 'TARGET_REMOVED', 'RESPONSE_REGISTERED', 'RESPONSE_UPDATED', 'REMINDER_SENT', 'RESULTS_VIEWED');

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "pollId" TEXT;

-- CreateTable
CREATE TABLE "Poll" (
    "id" TEXT NOT NULL,
    "administratorId" TEXT NOT NULL,
    "condominiumId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "PollType" NOT NULL DEFAULT 'SINGLE_CHOICE',
    "status" "PollStatus" NOT NULL DEFAULT 'DRAFT',
    "targetScope" "PollTargetScope" NOT NULL DEFAULT 'CONDOMINIUM',
    "resultVisibility" "PollResultVisibility" NOT NULL DEFAULT 'ADMIN_ONLY',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "allowResponseUpdate" BOOLEAN NOT NULL DEFAULT false,
    "anonymousResults" BOOLEAN NOT NULL DEFAULT true,
    "requireEligibleVoter" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Poll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollTarget" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "condominiumId" TEXT,
    "unitId" TEXT,
    "block" TEXT,
    "role" "AccessRole",
    "linkType" "UnitPersonLinkType",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollOption" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PollOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollResponse" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessId" TEXT NOT NULL,
    "condominiumId" TEXT,
    "unitId" TEXT,
    "residentId" TEXT,
    "selectedOptionId" TEXT,
    "textAnswer" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "PollResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollResponseOption" (
    "id" TEXT NOT NULL,
    "pollResponseId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollResponseOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollLog" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "userId" TEXT,
    "action" "PollLogAction" NOT NULL,
    "message" TEXT,
    "fromValue" TEXT,
    "toValue" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Poll_administratorId_idx" ON "Poll"("administratorId");

-- CreateIndex
CREATE INDEX "Poll_condominiumId_idx" ON "Poll"("condominiumId");

-- CreateIndex
CREATE INDEX "Poll_createdByUserId_idx" ON "Poll"("createdByUserId");

-- CreateIndex
CREATE INDEX "Poll_type_idx" ON "Poll"("type");

-- CreateIndex
CREATE INDEX "Poll_status_idx" ON "Poll"("status");

-- CreateIndex
CREATE INDEX "Poll_targetScope_idx" ON "Poll"("targetScope");

-- CreateIndex
CREATE INDEX "Poll_resultVisibility_idx" ON "Poll"("resultVisibility");

-- CreateIndex
CREATE INDEX "Poll_startsAt_idx" ON "Poll"("startsAt");

-- CreateIndex
CREATE INDEX "Poll_endsAt_idx" ON "Poll"("endsAt");

-- CreateIndex
CREATE INDEX "Poll_publishedAt_idx" ON "Poll"("publishedAt");

-- CreateIndex
CREATE INDEX "Poll_closedAt_idx" ON "Poll"("closedAt");

-- CreateIndex
CREATE INDEX "Poll_administratorId_condominiumId_idx" ON "Poll"("administratorId", "condominiumId");

-- CreateIndex
CREATE INDEX "Poll_administratorId_status_idx" ON "Poll"("administratorId", "status");

-- CreateIndex
CREATE INDEX "Poll_condominiumId_status_idx" ON "Poll"("condominiumId", "status");

-- CreateIndex
CREATE INDEX "PollTarget_pollId_idx" ON "PollTarget"("pollId");

-- CreateIndex
CREATE INDEX "PollTarget_condominiumId_idx" ON "PollTarget"("condominiumId");

-- CreateIndex
CREATE INDEX "PollTarget_unitId_idx" ON "PollTarget"("unitId");

-- CreateIndex
CREATE INDEX "PollTarget_block_idx" ON "PollTarget"("block");

-- CreateIndex
CREATE INDEX "PollTarget_role_idx" ON "PollTarget"("role");

-- CreateIndex
CREATE INDEX "PollTarget_linkType_idx" ON "PollTarget"("linkType");

-- CreateIndex
CREATE INDEX "PollTarget_pollId_condominiumId_idx" ON "PollTarget"("pollId", "condominiumId");

-- CreateIndex
CREATE INDEX "PollTarget_pollId_unitId_idx" ON "PollTarget"("pollId", "unitId");

-- CreateIndex
CREATE INDEX "PollTarget_pollId_block_idx" ON "PollTarget"("pollId", "block");

-- CreateIndex
CREATE INDEX "PollTarget_pollId_role_idx" ON "PollTarget"("pollId", "role");

-- CreateIndex
CREATE INDEX "PollTarget_pollId_linkType_idx" ON "PollTarget"("pollId", "linkType");

-- CreateIndex
CREATE INDEX "PollOption_pollId_idx" ON "PollOption"("pollId");

-- CreateIndex
CREATE INDEX "PollOption_order_idx" ON "PollOption"("order");

-- CreateIndex
CREATE INDEX "PollOption_isActive_idx" ON "PollOption"("isActive");

-- CreateIndex
CREATE INDEX "PollOption_pollId_order_idx" ON "PollOption"("pollId", "order");

-- CreateIndex
CREATE INDEX "PollResponse_pollId_idx" ON "PollResponse"("pollId");

-- CreateIndex
CREATE INDEX "PollResponse_userId_idx" ON "PollResponse"("userId");

-- CreateIndex
CREATE INDEX "PollResponse_accessId_idx" ON "PollResponse"("accessId");

-- CreateIndex
CREATE INDEX "PollResponse_condominiumId_idx" ON "PollResponse"("condominiumId");

-- CreateIndex
CREATE INDEX "PollResponse_unitId_idx" ON "PollResponse"("unitId");

-- CreateIndex
CREATE INDEX "PollResponse_residentId_idx" ON "PollResponse"("residentId");

-- CreateIndex
CREATE INDEX "PollResponse_selectedOptionId_idx" ON "PollResponse"("selectedOptionId");

-- CreateIndex
CREATE INDEX "PollResponse_submittedAt_idx" ON "PollResponse"("submittedAt");

-- CreateIndex
CREATE INDEX "PollResponse_pollId_submittedAt_idx" ON "PollResponse"("pollId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PollResponse_pollId_userId_accessId_key" ON "PollResponse"("pollId", "userId", "accessId");

-- CreateIndex
CREATE INDEX "PollResponseOption_pollResponseId_idx" ON "PollResponseOption"("pollResponseId");

-- CreateIndex
CREATE INDEX "PollResponseOption_optionId_idx" ON "PollResponseOption"("optionId");

-- CreateIndex
CREATE UNIQUE INDEX "PollResponseOption_pollResponseId_optionId_key" ON "PollResponseOption"("pollResponseId", "optionId");

-- CreateIndex
CREATE INDEX "PollLog_pollId_idx" ON "PollLog"("pollId");

-- CreateIndex
CREATE INDEX "PollLog_userId_idx" ON "PollLog"("userId");

-- CreateIndex
CREATE INDEX "PollLog_action_idx" ON "PollLog"("action");

-- CreateIndex
CREATE INDEX "PollLog_createdAt_idx" ON "PollLog"("createdAt");

-- CreateIndex
CREATE INDEX "PollLog_pollId_createdAt_idx" ON "PollLog"("pollId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_pollId_idx" ON "Notification"("pollId");

-- AddForeignKey
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "Administrator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollTarget" ADD CONSTRAINT "PollTarget_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollTarget" ADD CONSTRAINT "PollTarget_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollTarget" ADD CONSTRAINT "PollTarget_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollOption" ADD CONSTRAINT "PollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollResponse" ADD CONSTRAINT "PollResponse_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollResponse" ADD CONSTRAINT "PollResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollResponse" ADD CONSTRAINT "PollResponse_accessId_fkey" FOREIGN KEY ("accessId") REFERENCES "UserAccess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollResponse" ADD CONSTRAINT "PollResponse_selectedOptionId_fkey" FOREIGN KEY ("selectedOptionId") REFERENCES "PollOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollResponseOption" ADD CONSTRAINT "PollResponseOption_pollResponseId_fkey" FOREIGN KEY ("pollResponseId") REFERENCES "PollResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollResponseOption" ADD CONSTRAINT "PollResponseOption_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "PollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollLog" ADD CONSTRAINT "PollLog_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollLog" ADD CONSTRAINT "PollLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE SET NULL ON UPDATE CASCADE;
