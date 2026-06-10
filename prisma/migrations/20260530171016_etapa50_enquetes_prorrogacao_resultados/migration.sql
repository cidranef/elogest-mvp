-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PollLogAction" ADD VALUE 'EXTENDED';
ALTER TYPE "PollLogAction" ADD VALUE 'RESULTS_PUBLISHED';

-- AlterTable
ALTER TABLE "Poll" ADD COLUMN     "resultsPublishedAt" TIMESTAMP(3),
ADD COLUMN     "resultsPublishedByUserId" TEXT;

-- CreateIndex
CREATE INDEX "Poll_resultsPublishedAt_idx" ON "Poll"("resultsPublishedAt");

-- CreateIndex
CREATE INDEX "Poll_resultsPublishedByUserId_idx" ON "Poll"("resultsPublishedByUserId");

-- AddForeignKey
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_resultsPublishedByUserId_fkey" FOREIGN KEY ("resultsPublishedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
