-- DropForeignKey
ALTER TABLE "sites" DROP CONSTRAINT "sites_customerId_fkey";

-- AlterTable
ALTER TABLE "sites" ALTER COLUMN "customerId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
