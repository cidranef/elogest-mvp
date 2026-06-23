CREATE TABLE "DemoResetLog" (
    "id" TEXT NOT NULL,
    "demoCnpj" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "requestedByName" TEXT,
    "requestedByEmail" TEXT,
    "status" TEXT NOT NULL,
    "strategy" TEXT NOT NULL DEFAULT 'SAFE_ROTATION',
    "archivedAdministratorId" TEXT,
    "createdAdministratorId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoResetLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DemoResetLog_demoCnpj_idx" ON "DemoResetLog"("demoCnpj");
CREATE INDEX "DemoResetLog_status_idx" ON "DemoResetLog"("status");
CREATE INDEX "DemoResetLog_startedAt_idx" ON "DemoResetLog"("startedAt");
