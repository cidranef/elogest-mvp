-- CreateEnum
CREATE TYPE "CondominiumType" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'MIXED', 'HORIZONTAL', 'OTHER');

-- AlterTable
ALTER TABLE "Condominium" ADD COLUMN     "administrativeContactEmail" TEXT,
ADD COLUMN     "administrativeContactName" TEXT,
ADD COLUMN     "administrativeContactPhone" TEXT,
ADD COLUMN     "blocksCount" INTEGER,
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "managementEndDate" TIMESTAMP(3),
ADD COLUMN     "managementStartDate" TIMESTAMP(3),
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "type" "CondominiumType" NOT NULL DEFAULT 'RESIDENTIAL',
ADD COLUMN     "unitsCount" INTEGER;

-- CreateIndex
CREATE INDEX "Condominium_administratorId_idx" ON "Condominium"("administratorId");

-- CreateIndex
CREATE INDEX "Condominium_status_idx" ON "Condominium"("status");

-- CreateIndex
CREATE INDEX "Condominium_type_idx" ON "Condominium"("type");

-- CreateIndex
CREATE INDEX "Condominium_city_idx" ON "Condominium"("city");

-- CreateIndex
CREATE INDEX "Condominium_state_idx" ON "Condominium"("state");

-- CreateIndex
CREATE INDEX "Condominium_administratorId_status_idx" ON "Condominium"("administratorId", "status");

-- CreateIndex
CREATE INDEX "Condominium_administratorId_city_idx" ON "Condominium"("administratorId", "city");
