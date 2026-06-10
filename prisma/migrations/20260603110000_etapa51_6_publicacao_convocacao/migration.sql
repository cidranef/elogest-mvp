-- ETAPA 51.6 — Publicação formal da convocação
ALTER TABLE "Assembly"
ADD COLUMN "convocationPublishedAt" TIMESTAMP(3),
ADD COLUMN "convocationPublishedByUserId" TEXT;

CREATE INDEX "Assembly_convocationPublishedByUserId_idx"
ON "Assembly"("convocationPublishedByUserId");

CREATE INDEX "Assembly_convocationPublishedAt_idx"
ON "Assembly"("convocationPublishedAt");

ALTER TABLE "Assembly"
ADD CONSTRAINT "Assembly_convocationPublishedByUserId_fkey"
FOREIGN KEY ("convocationPublishedByUserId")
REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
