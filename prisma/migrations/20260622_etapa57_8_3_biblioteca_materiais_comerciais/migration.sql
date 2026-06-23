CREATE TYPE "CommercialMaterialCategory" AS ENUM ('INSTITUTIONAL','PRESENTATION','SCRIPT','PLAN_COMPARISON','QUALIFICATION','PILOT','PROPOSAL','FOLLOW_UP','FAQ','OTHER');
CREATE TYPE "CommercialMaterialStatus" AS ENUM ('DRAFT','APPROVED','ARCHIVED');
CREATE TYPE "CommercialMaterialFileType" AS ENUM ('PDF','DOCX','PPTX','XLSX','OTHER');

CREATE TABLE "commercial_materials" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "category" "CommercialMaterialCategory" NOT NULL,
  "status" "CommercialMaterialStatus" NOT NULL DEFAULT 'DRAFT',
  "currentVersionNumber" INTEGER NOT NULL DEFAULT 0,
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "approvedByUserId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "commercial_materials_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "commercial_materials_slug_key" ON "commercial_materials"("slug");
CREATE INDEX "commercial_materials_category_idx" ON "commercial_materials"("category");
CREATE INDEX "commercial_materials_status_idx" ON "commercial_materials"("status");
CREATE INDEX "commercial_materials_updatedAt_idx" ON "commercial_materials"("updatedAt");

CREATE TABLE "commercial_material_versions" (
  "id" TEXT NOT NULL,
  "commercialMaterialId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "versionLabel" TEXT NOT NULL,
  "content" TEXT,
  "fileType" "CommercialMaterialFileType",
  "fileKey" TEXT,
  "fileName" TEXT,
  "mimeType" TEXT,
  "fileSizeBytes" INTEGER,
  "checksumSha256" TEXT,
  "changeNotes" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commercial_material_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "commercial_material_versions_commercialMaterialId_versionNumber_key" ON "commercial_material_versions"("commercialMaterialId","versionNumber");
CREATE INDEX "commercial_material_versions_commercialMaterialId_createdAt_idx" ON "commercial_material_versions"("commercialMaterialId","createdAt");

CREATE TABLE "commercial_material_download_logs" (
  "id" TEXT NOT NULL,
  "commercialMaterialId" TEXT NOT NULL,
  "commercialMaterialVersionId" TEXT NOT NULL,
  "downloadedByUserId" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commercial_material_download_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "commercial_material_download_logs_commercialMaterialId_createdAt_idx" ON "commercial_material_download_logs"("commercialMaterialId","createdAt");
CREATE INDEX "commercial_material_download_logs_commercialMaterialVersionId_idx" ON "commercial_material_download_logs"("commercialMaterialVersionId");
CREATE INDEX "commercial_material_download_logs_downloadedByUserId_idx" ON "commercial_material_download_logs"("downloadedByUserId");

ALTER TABLE "commercial_materials" ADD CONSTRAINT "commercial_materials_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commercial_materials" ADD CONSTRAINT "commercial_materials_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commercial_materials" ADD CONSTRAINT "commercial_materials_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commercial_material_versions" ADD CONSTRAINT "commercial_material_versions_commercialMaterialId_fkey" FOREIGN KEY ("commercialMaterialId") REFERENCES "commercial_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "commercial_material_versions" ADD CONSTRAINT "commercial_material_versions_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commercial_material_download_logs" ADD CONSTRAINT "commercial_material_download_logs_commercialMaterialId_fkey" FOREIGN KEY ("commercialMaterialId") REFERENCES "commercial_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "commercial_material_download_logs" ADD CONSTRAINT "commercial_material_download_logs_commercialMaterialVersionId_fkey" FOREIGN KEY ("commercialMaterialVersionId") REFERENCES "commercial_material_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "commercial_material_download_logs" ADD CONSTRAINT "commercial_material_download_logs_downloadedByUserId_fkey" FOREIGN KEY ("downloadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
