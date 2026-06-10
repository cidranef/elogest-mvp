-- DropForeignKey
ALTER TABLE "AssemblyRepresentation" DROP CONSTRAINT "AssemblyRepresentation_representativeUserId_fkey";

-- AlterTable
ALTER TABLE "AssemblyRepresentation" ADD COLUMN     "externalRepresentativeDocument" TEXT,
ADD COLUMN     "externalRepresentativeEmail" TEXT,
ADD COLUMN     "externalRepresentativeName" TEXT,
ADD COLUMN     "externalRepresentativePhone" TEXT,
ALTER COLUMN "representativeUserId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "AssemblyRepresentation" ADD CONSTRAINT "AssemblyRepresentation_representativeUserId_fkey" FOREIGN KEY ("representativeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
