-- DropIndex
DROP INDEX "cpi_due_idx";

-- DropIndex
DROP INDEX "cp_dates_idx";

-- AlterTable
ALTER TABLE "commercial_meetings" ALTER COLUMN "modulesPresented" DROP DEFAULT,
ALTER COLUMN "painsIdentified" DROP DEFAULT,
ALTER COLUMN "objections" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "commercial_pilot_items" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "commercial_pilots" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- RenameForeignKey
ALTER TABLE "commercial_meetings" RENAME CONSTRAINT "commercial_meetings_lead_fkey" TO "commercial_meetings_commercialLeadProfileId_fkey";

-- RenameForeignKey
ALTER TABLE "commercial_pilot_evidences" RENAME CONSTRAINT "commercial_pilot_evidences_item_fkey" TO "commercial_pilot_evidences_commercialPilotItemId_fkey";

-- RenameForeignKey
ALTER TABLE "commercial_pilot_evidences" RENAME CONSTRAINT "commercial_pilot_evidences_pilot_fkey" TO "commercial_pilot_evidences_commercialPilotId_fkey";

-- RenameForeignKey
ALTER TABLE "commercial_pilot_items" RENAME CONSTRAINT "commercial_pilot_items_pilot_fkey" TO "commercial_pilot_items_commercialPilotId_fkey";

-- RenameForeignKey
ALTER TABLE "commercial_pilots" RENAME CONSTRAINT "commercial_pilots_lead_fkey" TO "commercial_pilots_commercialLeadProfileId_fkey";

-- RenameIndex
ALTER INDEX "cm_followup_idx" RENAME TO "commercial_meetings_followUpAt_idx";

-- RenameIndex
ALTER INDEX "cm_lead_created_idx" RENAME TO "commercial_meetings_commercialLeadProfileId_createdAt_idx";

-- RenameIndex
ALTER INDEX "cm_owner_idx" RENAME TO "commercial_meetings_ownerUserId_idx";

-- RenameIndex
ALTER INDEX "cm_status_scheduled_idx" RENAME TO "commercial_meetings_status_scheduledAt_idx";

-- RenameIndex
ALTER INDEX "cpe_item_idx" RENAME TO "commercial_pilot_evidences_commercialPilotItemId_idx";

-- RenameIndex
ALTER INDEX "cpe_pilot_idx" RENAME TO "commercial_pilot_evidences_commercialPilotId_createdAt_idx";

-- RenameIndex
ALTER INDEX "cpe_storage_key_unique" RENAME TO "commercial_pilot_evidences_storageKey_key";

-- RenameIndex
ALTER INDEX "cpi_pilot_position_idx" RENAME TO "commercial_pilot_items_commercialPilotId_position_idx";

-- RenameIndex
ALTER INDEX "cpi_status_idx" RENAME TO "commercial_pilot_items_status_idx";

-- RenameIndex
ALTER INDEX "cp_decision_idx" RENAME TO "commercial_pilots_decision_idx";

-- RenameIndex
ALTER INDEX "cp_lead_unique" RENAME TO "commercial_pilots_commercialLeadProfileId_key";

-- RenameIndex
ALTER INDEX "cp_status_idx" RENAME TO "commercial_pilots_status_idx";
