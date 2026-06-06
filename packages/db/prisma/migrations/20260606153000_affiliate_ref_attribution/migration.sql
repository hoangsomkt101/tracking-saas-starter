CREATE TABLE "AffiliateRefAttribution" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "tenantId" TEXT NOT NULL,
    "affiliatePlatformId" TEXT NOT NULL,
    "affiliateRefSource" TEXT NOT NULL,
    "affiliateRefId" TEXT NOT NULL,
    "clickEventId" BIGINT NOT NULL,
    "clickUuid" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "learnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMatchedAt" TIMESTAMP(3),
    "learnedFromConversionEventId" BIGINT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AffiliateRefAttribution_pkey" PRIMARY KEY ("id")
);

WITH candidates AS (
    SELECT
        c.*,
        MIN(c."createdAt") OVER (PARTITION BY c."tenantId", c."affiliatePlatformId", c."affiliateRefSource", c."affiliateRefId") AS "firstSeenAtValue",
        MAX(c."createdAt") OVER (PARTITION BY c."tenantId", c."affiliatePlatformId", c."affiliateRefSource", c."affiliateRefId") AS "lastSeenAtValue",
        ROW_NUMBER() OVER (PARTITION BY c."tenantId", c."affiliatePlatformId", c."affiliateRefSource", c."affiliateRefId" ORDER BY c."createdAt" DESC, c."id" DESC) AS rn
    FROM "AffiliateConversionEvent" c
    WHERE c."clickEventId" IS NOT NULL
      AND c."clickUuid" IS NOT NULL
      AND c."affiliateRefSource" IS NOT NULL
      AND c."affiliateRefId" IS NOT NULL
      AND c."affiliateRefId" <> ''
)
INSERT INTO "AffiliateRefAttribution" (
    "id",
    "tenantId",
    "affiliatePlatformId",
    "affiliateRefSource",
    "affiliateRefId",
    "clickEventId",
    "clickUuid",
    "firstSeenAt",
    "lastSeenAt",
    "learnedAt",
    "lastMatchedAt",
    "learnedFromConversionEventId",
    "metadata",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid()::TEXT,
    "tenantId",
    "affiliatePlatformId",
    "affiliateRefSource",
    "affiliateRefId",
    "clickEventId",
    "clickUuid",
    "firstSeenAtValue",
    "lastSeenAtValue",
    CURRENT_TIMESTAMP,
    "lastSeenAtValue",
    "id",
    jsonb_build_object('source', 'migration_backfill', 'conversionEventId', "id"::TEXT, 'clickUuid', "clickUuid"),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM candidates
WHERE rn = 1;

UPDATE "AffiliateConversionEvent" c
SET
    "clickEventId" = a."clickEventId",
    "clickUuid" = COALESCE(c."clickUuid", a."clickUuid"),
    "attributionSnapshot" = NULL
FROM "AffiliateRefAttribution" a
WHERE c."tenantId" = a."tenantId"
  AND c."affiliatePlatformId" = a."affiliatePlatformId"
  AND c."affiliateRefSource" = a."affiliateRefSource"
  AND c."affiliateRefId" = a."affiliateRefId"
  AND c."clickEventId" IS NULL;

CREATE UNIQUE INDEX "AffRefAttr_unique_ref" ON "AffiliateRefAttribution"("tenantId", "affiliatePlatformId", "affiliateRefSource", "affiliateRefId");
CREATE INDEX "AffRefAttr_tenant_platform_seen_idx" ON "AffiliateRefAttribution"("tenantId", "affiliatePlatformId", "lastSeenAt");
CREATE INDEX "AffRefAttr_tenant_click_seen_idx" ON "AffiliateRefAttribution"("tenantId", "clickEventId", "lastSeenAt");
CREATE INDEX "AffRefAttr_clickUuid_idx" ON "AffiliateRefAttribution"("clickUuid");
CREATE INDEX "AffRefAttr_refId_idx" ON "AffiliateRefAttribution"("affiliateRefId");

ALTER TABLE "AffiliateRefAttribution" ADD CONSTRAINT "AffiliateRefAttribution_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AffiliateRefAttribution" ADD CONSTRAINT "AffiliateRefAttribution_platformId_fkey" FOREIGN KEY ("affiliatePlatformId") REFERENCES "AffiliatePlatform"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AffiliateRefAttribution" ADD CONSTRAINT "AffiliateRefAttribution_clickEventId_fkey" FOREIGN KEY ("clickEventId") REFERENCES "ClickEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
