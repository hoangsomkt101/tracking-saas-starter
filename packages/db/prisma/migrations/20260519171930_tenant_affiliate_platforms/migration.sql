-- Tenant-scoped affiliate platform/network catalog with tracking param rules and inbound webhooks.

CREATE TABLE "AffiliatePlatform" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "trackingParamKey" TEXT NOT NULL DEFAULT 'subid1',
  "webhookMethod" TEXT NOT NULL DEFAULT 'POST',
  "webhookToken" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AffiliatePlatform_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffiliateConversionEvent" (
  "id" BIGSERIAL NOT NULL,
  "tenantId" TEXT NOT NULL,
  "affiliatePlatformId" TEXT NOT NULL,
  "clickUuid" TEXT,
  "customerId" TEXT,
  "customerEmail" TEXT,
  "spendAmount" DECIMAL(18,6),
  "payoutAmount" DECIMAL(18,6),
  "commissionAmount" DECIMAL(18,6),
  "currency" TEXT,
  "rawPayload" JSONB NOT NULL,
  "receivedMethod" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AffiliateConversionEvent_pkey" PRIMARY KEY ("id")
);

INSERT INTO "AffiliatePlatform" (
  "id",
  "tenantId",
  "name",
  "slug",
  "trackingParamKey",
  "webhookMethod",
  "webhookToken",
  "createdAt",
  "updatedAt"
)
SELECT DISTINCT ON ("tenantId", "affiliateNetwork")
  gen_random_uuid()::TEXT,
  "tenantId",
  "affiliateNetwork",
  LOWER(TRIM(BOTH '-' FROM REGEXP_REPLACE("affiliateNetwork", '[^a-zA-Z0-9]+', '-', 'g'))),
  "trackingParamKey",
  'POST',
  gen_random_uuid()::TEXT,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "BrandPlatform"
ORDER BY "tenantId", "affiliateNetwork", "createdAt" ASC;

ALTER TABLE "BrandPlatform" ADD COLUMN "affiliatePlatformId" TEXT;

UPDATE "BrandPlatform"
SET "affiliatePlatformId" = "AffiliatePlatform"."id"
FROM "AffiliatePlatform"
WHERE "BrandPlatform"."tenantId" = "AffiliatePlatform"."tenantId"
  AND "BrandPlatform"."affiliateNetwork" = "AffiliatePlatform"."name";

ALTER TABLE "BrandPlatform" ALTER COLUMN "affiliatePlatformId" SET NOT NULL;
ALTER TABLE "BrandPlatform" DROP COLUMN "affiliateNetwork";
ALTER TABLE "BrandPlatform" DROP COLUMN "trackingParamKey";

DROP INDEX IF EXISTS "BrandPlatform_brandId_affiliateNetwork_key";
CREATE UNIQUE INDEX "AffiliatePlatform_tenantId_slug_key" ON "AffiliatePlatform"("tenantId", "slug");
CREATE UNIQUE INDEX "AffiliatePlatform_tenantId_name_key" ON "AffiliatePlatform"("tenantId", "name");
CREATE INDEX "AffiliatePlatform_tenantId_idx" ON "AffiliatePlatform"("tenantId");
CREATE INDEX "BrandPlatform_affiliatePlatformId_idx" ON "BrandPlatform"("affiliatePlatformId");
CREATE UNIQUE INDEX "BrandPlatform_brandId_affiliatePlatformId_key" ON "BrandPlatform"("brandId", "affiliatePlatformId");
CREATE INDEX "AffiliateConversionEvent_tenantId_createdAt_idx" ON "AffiliateConversionEvent"("tenantId", "createdAt");
CREATE INDEX "AffiliateConversionEvent_affiliatePlatformId_createdAt_idx" ON "AffiliateConversionEvent"("affiliatePlatformId", "createdAt");
CREATE INDEX "AffiliateConversionEvent_clickUuid_idx" ON "AffiliateConversionEvent"("clickUuid");

ALTER TABLE "AffiliatePlatform" ADD CONSTRAINT "AffiliatePlatform_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BrandPlatform" ADD CONSTRAINT "BrandPlatform_affiliatePlatformId_fkey" FOREIGN KEY ("affiliatePlatformId") REFERENCES "AffiliatePlatform"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AffiliateConversionEvent" ADD CONSTRAINT "AffiliateConversionEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AffiliateConversionEvent" ADD CONSTRAINT "AffiliateConversionEvent_affiliatePlatformId_fkey" FOREIGN KEY ("affiliatePlatformId") REFERENCES "AffiliatePlatform"("id") ON DELETE CASCADE ON UPDATE CASCADE;
