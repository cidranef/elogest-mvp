-- CreateEnum
CREATE TYPE "AssemblyVoteVisibility" AS ENUM ('CONSOLIDATED', 'NOMINAL_BY_UNIT', 'SECRET');

-- AlterTable
ALTER TABLE "AssemblyAgendaItem" ADD COLUMN     "voteVisibility" "AssemblyVoteVisibility" NOT NULL DEFAULT 'CONSOLIDATED';

-- CreateIndex
CREATE INDEX "AssemblyAgendaItem_voteVisibility_idx" ON "AssemblyAgendaItem"("voteVisibility");
