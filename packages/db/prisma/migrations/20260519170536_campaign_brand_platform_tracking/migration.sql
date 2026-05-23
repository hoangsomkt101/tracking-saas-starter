-- Move network-specific affiliate URL/tracking config out of Brand.
-- A brand belongs to a campaign, while each brand can have many affiliate platforms.

CREATE TABLE "BrandPlatform" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "affiliateNetwork" TEXT NOT NULL,
  "affiliateUrl" TEXT NOT NULL,
  "trackingParamKey" TEXT NOT NULL DEFAULT 'subid1',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BrandPlatform_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignPixel" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "pixelId" TEXT NOT NULL,
  "accessToken" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CampaignPixel_pkey" PRIMARY KEY ("id")
);

INSERT INTO "BrandPlatform" (
  "id",
  "tenantId",
  "brandId",
  "affiliateNetwork",
  "affiliateUrl",
  "trackingParamKey",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::TEXT,
  "tenantId",
  "id",
  "affiliateNetwork",
  "affiliateUrl",
  CASE
    WHEN LOWER("affiliateNetwork") LIKE '%partnerstack%' THEN 'sid1'
    WHEN LOWER("affiliateNetwork") LIKE '%firstpromo%' THEN 'ref_id'
    ELSE 'subid1'
  END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Brand"
WHERE "affiliateNetwork" IS NOT NULL
  AND "affiliateUrl" IS NOT NULL;

ALTER TABLE "TrackingLink" ADD COLUMN "brandPlatformId" TEXT;

UPDATE "TrackingLink"
SET "brandPlatformId" = "BrandPlatform"."id"
FROM "BrandPlatform"
WHERE "TrackingLink"."brandId" = "BrandPlatform"."brandId";

ALTER TABLE "TrackingLink" ALTER COLUMN "brandPlatformId" SET NOT NULL;
ALTER TABLE "TrackingLink" DROP COLUMN "redirectUrl";

ALTER TABLE "Brand" DROP COLUMN "affiliateNetwork";
ALTER TABLE "Brand" DROP COLUMN "affiliateUrl";

CREATE INDEX "BrandPlatform_tenantId_idx" ON "BrandPlatform"("tenantId");
CREATE INDEX "BrandPlatform_brandId_idx" ON "BrandPlatform"("brandId");
CREATE UNIQUE INDEX "BrandPlatform_brandId_affiliateNetwork_key" ON "BrandPlatform"("brandId", "affiliateNetwork");

CREATE INDEX "CampaignPixel_tenantId_idx" ON "CampaignPixel"("tenantId");
CREATE INDEX "CampaignPixel_campaignId_idx" ON "CampaignPixel"("campaignId");
CREATE INDEX "CampaignPixel_platform_idx" ON "CampaignPixel"("platform");
CREATE UNIQUE INDEX "CampaignPixel_campaignId_platform_pixelId_key" ON "CampaignPixel"("campaignId", "platform", "pixelId");

CREATE INDEX "TrackingLink_brandPlatformId_idx" ON "TrackingLink"("brandPlatformId");

ALTER TABLE "BrandPlatform" ADD CONSTRAINT "BrandPlatform_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BrandPlatform" ADD CONSTRAINT "BrandPlatform_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignPixel" ADD CONSTRAINT "CampaignPixel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignPixel" ADD CONSTRAINT "CampaignPixel_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrackingLink" ADD CONSTRAINT "TrackingLink_brandPlatformId_fkey" FOREIGN KEY ("brandPlatformId") REFERENCES "BrandPlatform"("id") ON DELETE CASCADE ON UPDATE CASCADE;
