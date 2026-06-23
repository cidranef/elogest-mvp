-- RenameIndex
ALTER INDEX "cdl_token_hash_key" RENAME TO "commercial_diagnosis_links_tokenHash_key";

-- RenameIndex
ALTER INDEX "commercial_lead_qualification_revisions_commercialLeadQuali_idx" RENAME TO "clqr_qualification_created_at_idx";

-- RenameIndex
ALTER INDEX "commercial_lead_qualification_revisions_commercialLeadQuali_key" RENAME TO "clqr_qualification_revision_key";
