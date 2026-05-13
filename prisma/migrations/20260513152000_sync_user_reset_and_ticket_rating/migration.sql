/* =========================================================
   SYNC - RECUPERAÇÃO DE SENHA + AVALIAÇÃO DO ATENDIMENTO

   Objetivo:
   - Sincronizar o banco com o schema.prisma atual.
   - Adicionar campos de recuperação de senha em User.
   - Adicionar enum e campos de alvo da avaliação em TicketRating.

   Observação:
   - Migration criada manualmente para evitar uso de migrate dev
     apontando para banco Railway.
   ========================================================= */


-- =========================================================
-- ENUM: TicketRatingTargetType
-- =========================================================

DO $$
BEGIN
  CREATE TYPE "TicketRatingTargetType" AS ENUM (
    'ADMINISTRADORA',
    'SINDICO',
    'ELOGEST',
    'FORNECEDOR'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


-- =========================================================
-- USER: CAMPOS DE RECUPERAÇÃO DE SENHA
-- =========================================================

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "passwordResetToken" TEXT;

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "passwordResetTokenExpires" TIMESTAMP(3);

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "passwordResetRequestedAt" TIMESTAMP(3);


CREATE UNIQUE INDEX IF NOT EXISTS "User_passwordResetToken_key"
ON "User"("passwordResetToken");


-- =========================================================
-- TICKET RATING: ALVO DA AVALIAÇÃO
-- =========================================================

ALTER TABLE "TicketRating"
ADD COLUMN IF NOT EXISTS "ratedTargetType" "TicketRatingTargetType" NOT NULL DEFAULT 'ADMINISTRADORA';

ALTER TABLE "TicketRating"
ADD COLUMN IF NOT EXISTS "ratedUserId" TEXT;

ALTER TABLE "TicketRating"
ADD COLUMN IF NOT EXISTS "ratedAdministratorId" TEXT;

ALTER TABLE "TicketRating"
ADD COLUMN IF NOT EXISTS "ratedCondominiumId" TEXT;

ALTER TABLE "TicketRating"
ADD COLUMN IF NOT EXISTS "ratedProviderId" TEXT;

ALTER TABLE "TicketRating"
ADD COLUMN IF NOT EXISTS "ratedLabel" TEXT;

ALTER TABLE "TicketRating"
ADD COLUMN IF NOT EXISTS "ratedMetadata" JSONB;


CREATE INDEX IF NOT EXISTS "TicketRating_ratedTargetType_idx"
ON "TicketRating"("ratedTargetType");

CREATE INDEX IF NOT EXISTS "TicketRating_ratedUserId_idx"
ON "TicketRating"("ratedUserId");

CREATE INDEX IF NOT EXISTS "TicketRating_ratedAdministratorId_idx"
ON "TicketRating"("ratedAdministratorId");

CREATE INDEX IF NOT EXISTS "TicketRating_ratedCondominiumId_idx"
ON "TicketRating"("ratedCondominiumId");


-- =========================================================
-- FOREIGN KEYS
-- =========================================================

DO $$
BEGIN
  ALTER TABLE "TicketRating"
  ADD CONSTRAINT "TicketRating_ratedUserId_fkey"
  FOREIGN KEY ("ratedUserId")
  REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


DO $$
BEGIN
  ALTER TABLE "TicketRating"
  ADD CONSTRAINT "TicketRating_ratedAdministratorId_fkey"
  FOREIGN KEY ("ratedAdministratorId")
  REFERENCES "Administrator"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


DO $$
BEGIN
  ALTER TABLE "TicketRating"
  ADD CONSTRAINT "TicketRating_ratedCondominiumId_fkey"
  FOREIGN KEY ("ratedCondominiumId")
  REFERENCES "Condominium"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;