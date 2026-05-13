-- CreateEnum
CREATE TYPE "TicketScope" AS ENUM ('UNIT', 'CONDOMINIUM');

-- DropForeignKey
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_unitId_fkey";

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "scope" "TicketScope" NOT NULL DEFAULT 'UNIT',
ALTER COLUMN "unitId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Ticket_condominiumId_idx" ON "Ticket"("condominiumId");

-- CreateIndex
CREATE INDEX "Ticket_unitId_idx" ON "Ticket"("unitId");

-- CreateIndex
CREATE INDEX "Ticket_residentId_idx" ON "Ticket"("residentId");

-- CreateIndex
CREATE INDEX "Ticket_scope_idx" ON "Ticket"("scope");

-- CreateIndex
CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
