-- AlterTable
ALTER TABLE "commercial_lead_qualifications" ALTER COLUMN "currentSystems" DROP DEFAULT,
ALTER COLUMN "painPoints" DROP DEFAULT,
ALTER COLUMN "desiredModules" DROP DEFAULT,
ALTER COLUMN "objections" DROP DEFAULT;

-- RenameForeignKey
ALTER TABLE "commercial_lead_qualification_revisions" RENAME CONSTRAINT "commercial_lead_qualification_revisions_commercialLeadQualifica" TO "commercial_lead_qualification_revisions_commercialLeadQual_fkey";

-- RenameIndex
ALTER INDEX "clqr_qualification_created_at_idx" RENAME TO "commercial_lead_qualification_revisions_commercialLeadQuali_idx";

-- RenameIndex
ALTER INDEX "clqr_qualification_revision_key" RENAME TO "commercial_lead_qualification_revisions_commercialLeadQuali_key";
