-- AlterTable
ALTER TABLE "operations" ADD COLUMN     "laborNorm" DECIMAL(10,3),
ADD COLUMN     "unit" TEXT NOT NULL DEFAULT 'компл.';

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "volume" DECIMAL(12,3) NOT NULL DEFAULT 1;
