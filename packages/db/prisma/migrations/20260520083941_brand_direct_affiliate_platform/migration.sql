/*
  Warnings:

  - You are about to drop the column `brandPlatformId` on the `TrackingLink` table. All the data in the column will be lost.
  - You are about to drop the `BrandPlatform` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `affiliatePlatformId` to the `Brand` table without a default value. This is not possible if the table is not empty.
  - Added the required column `affiliateUrl` to the `Brand` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "BrandPlatform" DROP CONSTRAINT "BrandPlatform_affiliatePlatformId_fkey";

-- DropForeignKey
ALTER TABLE "BrandPlatform" DROP CONSTRAINT "BrandPlatform_brandId_fkey";

-- DropForeignKey
ALTER TABLE "BrandPlatform" DROP CONSTRAINT "BrandPlatform_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "TrackingLink" DROP CONSTRAINT "TrackingLink_brandPlatformId_fkey";

-- DropIndex
DROP INDEX "TrackingLink_brandPlatformId_idx";

-- AlterTable
ALTER TABLE "AffiliatePlatform" ALTER COLUMN "webhookToken" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "affiliatePlatformId" TEXT NOT NULL,
ADD COLUMN     "affiliateUrl" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "TrackingLink" DROP COLUMN "brandPlatformId";

-- DropTable
DROP TABLE "BrandPlatform";

-- CreateIndex
CREATE INDEX "Brand_affiliatePlatformId_idx" ON "Brand"("affiliatePlatformId");

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_affiliatePlatformId_fkey" FOREIGN KEY ("affiliatePlatformId") REFERENCES "AffiliatePlatform"("id") ON DELETE CASCADE ON UPDATE CASCADE;
