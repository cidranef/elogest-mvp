-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "commercialLeadProfileId" TEXT;

-- RenameForeignKey
ALTER TABLE "commercial_material_download_logs" RENAME CONSTRAINT "commercial_material_download_logs_commercialMaterialVersionId_f" TO "commercial_material_download_logs_commercialMaterialVersio_fkey";

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_commercialLeadProfileId_fkey" FOREIGN KEY ("commercialLeadProfileId") REFERENCES "commercial_lead_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "commercial_material_download_logs_commercialMaterialId_createdA" RENAME TO "commercial_material_download_logs_commercialMaterialId_crea_idx";

-- RenameIndex
ALTER INDEX "commercial_material_download_logs_commercialMaterialVersionId_i" RENAME TO "commercial_material_download_logs_commercialMaterialVersion_idx";

-- RenameIndex
ALTER INDEX "commercial_material_versions_commercialMaterialId_versionNumber" RENAME TO "commercial_material_versions_commercialMaterialId_versionNu_key";
