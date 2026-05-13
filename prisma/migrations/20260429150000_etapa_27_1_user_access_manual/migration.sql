-- CreateEnum
CREATE TYPE "AccessRole" AS ENUM ('SUPER_ADMIN', 'ADMINISTRADORA', 'SINDICO', 'MORADOR', 'PROPRIETARIO', 'CONSELHEIRO');

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "accessId" TEXT;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "createdByAccessId" TEXT;

-- AlterTable
ALTER TABLE "TicketLog" ADD COLUMN     "accessId" TEXT,
ADD COLUMN     "actorLabel" TEXT,
ADD COLUMN     "actorRole" TEXT;

-- CreateTable
CREATE TABLE "UserAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "administratorId" TEXT,
    "condominiumId" TEXT,
    "unitId" TEXT,
    "residentId" TEXT,
    "role" "AccessRole" NOT NULL,
    "label" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserAccess_userId_idx" ON "UserAccess"("userId");

-- CreateIndex
CREATE INDEX "UserAccess_administratorId_idx" ON "UserAccess"("administratorId");

-- CreateIndex
CREATE INDEX "UserAccess_condominiumId_idx" ON "UserAccess"("condominiumId");

-- CreateIndex
CREATE INDEX "UserAccess_unitId_idx" ON "UserAccess"("unitId");

-- CreateIndex
CREATE INDEX "UserAccess_residentId_idx" ON "UserAccess"("residentId");

-- CreateIndex
CREATE INDEX "UserAccess_role_idx" ON "UserAccess"("role");

-- CreateIndex
CREATE INDEX "UserAccess_isActive_idx" ON "UserAccess"("isActive");

-- CreateIndex
CREATE INDEX "UserAccess_isDefault_idx" ON "UserAccess"("isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "UserAccess_userId_role_administratorId_condominiumId_unitId_key" ON "UserAccess"("userId", "role", "administratorId", "condominiumId", "unitId", "residentId");

-- CreateIndex
CREATE INDEX "Notification_accessId_idx" ON "Notification"("accessId");

-- CreateIndex
CREATE INDEX "Ticket_createdByAccessId_idx" ON "Ticket"("createdByAccessId");

-- CreateIndex
CREATE INDEX "TicketLog_accessId_idx" ON "TicketLog"("accessId");

-- AddForeignKey
ALTER TABLE "UserAccess" ADD CONSTRAINT "UserAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAccess" ADD CONSTRAINT "UserAccess_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "Administrator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAccess" ADD CONSTRAINT "UserAccess_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAccess" ADD CONSTRAINT "UserAccess_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAccess" ADD CONSTRAINT "UserAccess_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_createdByAccessId_fkey" FOREIGN KEY ("createdByAccessId") REFERENCES "UserAccess"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketLog" ADD CONSTRAINT "TicketLog_accessId_fkey" FOREIGN KEY ("accessId") REFERENCES "UserAccess"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_accessId_fkey" FOREIGN KEY ("accessId") REFERENCES "UserAccess"("id") ON DELETE SET NULL ON UPDATE CASCADE;
