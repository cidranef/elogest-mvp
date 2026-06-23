-- AlterTable
ALTER TABLE "commercial_proposals" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- RenameForeignKey
ALTER TABLE "commercial_proposal_events" RENAME CONSTRAINT "commercial_proposal_events_proposal_fkey" TO "commercial_proposal_events_commercialProposalId_fkey";

-- RenameForeignKey
ALTER TABLE "commercial_proposal_versions" RENAME CONSTRAINT "commercial_proposal_versions_proposal_fkey" TO "commercial_proposal_versions_commercialProposalId_fkey";

-- RenameForeignKey
ALTER TABLE "commercial_proposals" RENAME CONSTRAINT "commercial_proposals_admin_fkey" TO "commercial_proposals_convertedAdministratorId_fkey";

-- RenameForeignKey
ALTER TABLE "commercial_proposals" RENAME CONSTRAINT "commercial_proposals_lead_fkey" TO "commercial_proposals_commercialLeadProfileId_fkey";

-- RenameForeignKey
ALTER TABLE "commercial_proposals" RENAME CONSTRAINT "commercial_proposals_plan_fkey" TO "commercial_proposals_planId_fkey";

-- RenameIndex
ALTER INDEX "cpe_proposal_created_idx" RENAME TO "commercial_proposal_events_commercialProposalId_createdAt_idx";

-- RenameIndex
ALTER INDEX "cpe_type_idx" RENAME TO "commercial_proposal_events_type_idx";

-- RenameIndex
ALTER INDEX "cpv_proposal_created_idx" RENAME TO "commercial_proposal_versions_commercialProposalId_createdAt_idx";

-- RenameIndex
ALTER INDEX "cpv_proposal_version_key" RENAME TO "commercial_proposal_versions_commercialProposalId_version_key";

-- RenameIndex
ALTER INDEX "commercial_proposals_lead_key" RENAME TO "commercial_proposals_commercialLeadProfileId_key";

-- RenameIndex
ALTER INDEX "commercial_proposals_plan_idx" RENAME TO "commercial_proposals_planId_idx";

-- RenameIndex
ALTER INDEX "commercial_proposals_token_key" RENAME TO "commercial_proposals_publicTokenHash_key";

-- RenameIndex
ALTER INDEX "commercial_proposals_valid_idx" RENAME TO "commercial_proposals_validUntil_idx";
