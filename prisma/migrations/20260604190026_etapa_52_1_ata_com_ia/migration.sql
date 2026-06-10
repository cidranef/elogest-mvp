-- CreateEnum
CREATE TYPE "AssemblyMinuteStatus" AS ENUM ('DRAFT', 'GENERATED', 'UNDER_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AssemblyMinuteGenerationMode" AS ENUM ('STRUCTURED', 'AI_ASSISTED', 'MANUAL');

-- CreateEnum
CREATE TYPE "AssemblyMinuteVersionSource" AS ENUM ('STRUCTURED_GENERATION', 'AI_ASSISTED_GENERATION', 'MANUAL_REVISION', 'APPROVAL_SNAPSHOT', 'PUBLICATION_SNAPSHOT');

-- CreateEnum
CREATE TYPE "AssemblyMinuteLogAction" AS ENUM ('CREATED', 'STRUCTURED_GENERATED', 'AI_GENERATED', 'AI_FALLBACK_USED', 'REGENERATED', 'UPDATED', 'SUBMITTED_FOR_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED', 'VERSION_CREATED', 'PDF_GENERATED');

-- CreateTable
CREATE TABLE "AssemblyMinute" (
    "id" TEXT NOT NULL,
    "assemblyId" TEXT NOT NULL,
    "administratorId" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "status" "AssemblyMinuteStatus" NOT NULL DEFAULT 'DRAFT',
    "generationMode" "AssemblyMinuteGenerationMode" NOT NULL DEFAULT 'STRUCTURED',
    "title" TEXT NOT NULL,
    "executiveSummary" TEXT,
    "content" TEXT NOT NULL,
    "warnings" JSONB,
    "metadata" JSONB,
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "generatedAt" TIMESTAMP(3),
    "generatedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "publishedByUserId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "archivedByUserId" TEXT,
    "officialPdfUrl" TEXT,
    "officialPdfName" TEXT,
    "officialPdfMimeType" TEXT,
    "officialPdfSizeBytes" INTEGER,
    "officialPdfHash" TEXT,
    "officialPdfGeneratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssemblyMinute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssemblyMinuteVersion" (
    "id" TEXT NOT NULL,
    "minuteId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "source" "AssemblyMinuteVersionSource" NOT NULL,
    "title" TEXT NOT NULL,
    "executiveSummary" TEXT,
    "content" TEXT NOT NULL,
    "sourceSnapshot" JSONB NOT NULL,
    "warnings" JSONB,
    "metadata" JSONB,
    "promptVersion" TEXT,
    "aiProvider" TEXT,
    "aiModel" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssemblyMinuteVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssemblyMinuteLog" (
    "id" TEXT NOT NULL,
    "minuteId" TEXT NOT NULL,
    "userId" TEXT,
    "action" "AssemblyMinuteLogAction" NOT NULL,
    "message" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssemblyMinuteLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssemblyMinute_assemblyId_key" ON "AssemblyMinute"("assemblyId");

-- CreateIndex
CREATE INDEX "AssemblyMinute_administratorId_idx" ON "AssemblyMinute"("administratorId");

-- CreateIndex
CREATE INDEX "AssemblyMinute_condominiumId_idx" ON "AssemblyMinute"("condominiumId");

-- CreateIndex
CREATE INDEX "AssemblyMinute_status_idx" ON "AssemblyMinute"("status");

-- CreateIndex
CREATE INDEX "AssemblyMinute_generationMode_idx" ON "AssemblyMinute"("generationMode");

-- CreateIndex
CREATE INDEX "AssemblyMinute_generatedByUserId_idx" ON "AssemblyMinute"("generatedByUserId");

-- CreateIndex
CREATE INDEX "AssemblyMinute_reviewedByUserId_idx" ON "AssemblyMinute"("reviewedByUserId");

-- CreateIndex
CREATE INDEX "AssemblyMinute_approvedByUserId_idx" ON "AssemblyMinute"("approvedByUserId");

-- CreateIndex
CREATE INDEX "AssemblyMinute_publishedByUserId_idx" ON "AssemblyMinute"("publishedByUserId");

-- CreateIndex
CREATE INDEX "AssemblyMinute_archivedByUserId_idx" ON "AssemblyMinute"("archivedByUserId");

-- CreateIndex
CREATE INDEX "AssemblyMinute_publishedAt_idx" ON "AssemblyMinute"("publishedAt");

-- CreateIndex
CREATE INDEX "AssemblyMinute_administratorId_condominiumId_idx" ON "AssemblyMinute"("administratorId", "condominiumId");

-- CreateIndex
CREATE INDEX "AssemblyMinute_administratorId_status_idx" ON "AssemblyMinute"("administratorId", "status");

-- CreateIndex
CREATE INDEX "AssemblyMinute_condominiumId_status_idx" ON "AssemblyMinute"("condominiumId", "status");

-- CreateIndex
CREATE INDEX "AssemblyMinuteVersion_minuteId_idx" ON "AssemblyMinuteVersion"("minuteId");

-- CreateIndex
CREATE INDEX "AssemblyMinuteVersion_source_idx" ON "AssemblyMinuteVersion"("source");

-- CreateIndex
CREATE INDEX "AssemblyMinuteVersion_createdByUserId_idx" ON "AssemblyMinuteVersion"("createdByUserId");

-- CreateIndex
CREATE INDEX "AssemblyMinuteVersion_createdAt_idx" ON "AssemblyMinuteVersion"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssemblyMinuteVersion_minuteId_version_key" ON "AssemblyMinuteVersion"("minuteId", "version");

-- CreateIndex
CREATE INDEX "AssemblyMinuteLog_minuteId_idx" ON "AssemblyMinuteLog"("minuteId");

-- CreateIndex
CREATE INDEX "AssemblyMinuteLog_userId_idx" ON "AssemblyMinuteLog"("userId");

-- CreateIndex
CREATE INDEX "AssemblyMinuteLog_action_idx" ON "AssemblyMinuteLog"("action");

-- CreateIndex
CREATE INDEX "AssemblyMinuteLog_createdAt_idx" ON "AssemblyMinuteLog"("createdAt");

-- CreateIndex
CREATE INDEX "AssemblyMinuteLog_minuteId_createdAt_idx" ON "AssemblyMinuteLog"("minuteId", "createdAt");

-- AddForeignKey
ALTER TABLE "AssemblyMinute" ADD CONSTRAINT "AssemblyMinute_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyMinute" ADD CONSTRAINT "AssemblyMinute_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "Administrator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyMinute" ADD CONSTRAINT "AssemblyMinute_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyMinute" ADD CONSTRAINT "AssemblyMinute_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyMinute" ADD CONSTRAINT "AssemblyMinute_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyMinute" ADD CONSTRAINT "AssemblyMinute_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyMinute" ADD CONSTRAINT "AssemblyMinute_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyMinute" ADD CONSTRAINT "AssemblyMinute_archivedByUserId_fkey" FOREIGN KEY ("archivedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyMinuteVersion" ADD CONSTRAINT "AssemblyMinuteVersion_minuteId_fkey" FOREIGN KEY ("minuteId") REFERENCES "AssemblyMinute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyMinuteVersion" ADD CONSTRAINT "AssemblyMinuteVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyMinuteLog" ADD CONSTRAINT "AssemblyMinuteLog_minuteId_fkey" FOREIGN KEY ("minuteId") REFERENCES "AssemblyMinute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyMinuteLog" ADD CONSTRAINT "AssemblyMinuteLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
