-- CreateTable
CREATE TABLE "AiOperationLog" (
    "id" TEXT NOT NULL,
    "administratorId" TEXT NOT NULL,
    "userId" TEXT,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "promptVersion" TEXT,
    "status" TEXT NOT NULL,
    "inputHash" TEXT,
    "outputHash" TEXT,
    "outputPreview" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiOperationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiOperationLog_administratorId_idx" ON "AiOperationLog"("administratorId");

-- CreateIndex
CREATE INDEX "AiOperationLog_userId_idx" ON "AiOperationLog"("userId");

-- CreateIndex
CREATE INDEX "AiOperationLog_module_idx" ON "AiOperationLog"("module");

-- CreateIndex
CREATE INDEX "AiOperationLog_entityType_entityId_idx" ON "AiOperationLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AiOperationLog_createdAt_idx" ON "AiOperationLog"("createdAt");

-- AddForeignKey
ALTER TABLE "AiOperationLog" ADD CONSTRAINT "AiOperationLog_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "Administrator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiOperationLog" ADD CONSTRAINT "AiOperationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
