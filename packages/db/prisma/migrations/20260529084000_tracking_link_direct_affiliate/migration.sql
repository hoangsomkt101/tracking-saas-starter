-- Move offer URL and affiliate platform selection directly onto TrackingLink.
-- Keep legacy Brand rows only for historical compatibility; new links no longer require Brands / Offers.

ALTER TABLE "TrackingLink" ADD COLUMN IF NOT EXISTS "affiliatePlatformId" TEXT;
ALTER TABLE "TrackingLink" ADD COLUMN IF NOT EXISTS "affiliateUrl" TEXT;

UPDATE "TrackingLink" AS tracking_link
SET
  "affiliatePlatformId" = brand."affiliatePlatformId",
  "affiliateUrl" = brand."affiliateUrl"
FROM "Brand" AS brand
WHERE tracking_link."brandId" = brand."id"
  AND tracking_link."affiliatePlatformId" IS NULL;

UPDATE "TrackingLink" AS tracking_link
SET "affiliatePlatformId" = platform."id"
FROM "AffiliatePlatform" AS platform
WHERE tracking_link."tenantId" = platform."tenantId"
  AND tracking_link."affiliatePlatformId" IS NULL;

UPDATE "TrackingLink"
SET "affiliateUrl" = 'https://example.com'
WHERE "affiliateUrl" IS NULL;

ALTER TABLE "TrackingLink" DROP CONSTRAINT IF EXISTS "TrackingLink_brandId_fkey";
ALTER TABLE "TrackingLink" DROP CONSTRAINT IF EXISTS "TrackingLink_affiliatePlatformId_fkey";

ALTER TABLE "TrackingLink" ALTER COLUMN "affiliatePlatformId" SET NOT NULL;
ALTER TABLE "TrackingLink" ALTER COLUMN "affiliateUrl" SET NOT NULL;
ALTER TABLE "TrackingLink" ALTER COLUMN "brandId" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "TrackingLink_affiliatePlatformId_idx" ON "TrackingLink"("affiliatePlatformId");

ALTER TABLE "TrackingLink" ADD CONSTRAINT "TrackingLink_affiliatePlatformId_fkey" FOREIGN KEY ("affiliatePlatformId") REFERENCES "AffiliatePlatform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TrackingLink" ADD CONSTRAINT "TrackingLink_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "MenuFeature"
SET "isActive" = false,
    "isCore" = false,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'brands';
