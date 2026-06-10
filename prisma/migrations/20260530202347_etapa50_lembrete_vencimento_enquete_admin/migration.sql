-- AlterTable
ALTER TABLE "Poll" ADD COLUMN     "adminExpiryReminderSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Poll_adminExpiryReminderSentAt_idx" ON "Poll"("adminExpiryReminderSentAt");
