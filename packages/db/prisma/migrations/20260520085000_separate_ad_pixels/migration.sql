-- Separate campaign-scoped pixels into tenant-scoped Meta/TikTok pixel datasets.

CREATE TABLE "MetaPixel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pixelId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaPixel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TiktokPixel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pixelId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TiktokPixel_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Campaign" ADD COLUMN "metaPixelId" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "tiktokPixelId" TEXT;

-- Backfill from the old CampaignPixel table when it exists.
INSERT INTO "MetaPixel" ("id", "tenantId", "name", "pixelId", "accessToken", "isActive", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    cp."tenantId",
    'Meta Pixel ' || cp."pixelId",
    cp."pixelId",
    max(cp."accessToken"),
    bool_or(cp."isActive"),
    min(cp."createdAt"),
    max(cp."updatedAt")
FROM "CampaignPixel" cp
WHERE lower(cp."platform") IN ('meta', 'facebook', 'fb')
GROUP BY cp."tenantId", cp."pixelId"
ON CONFLICT DO NOTHING;

INSERT INTO "TiktokPixel" ("id", "tenantId", "name", "pixelId", "accessToken", "isActive", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    cp."tenantId",
    'TikTok Pixel ' || cp."pixelId",
    cp."pixelId",
    max(cp."accessToken"),
    bool_or(cp."isActive"),
    min(cp."createdAt"),
    max(cp."updatedAt")
FROM "CampaignPixel" cp
WHERE lower(cp."platform") IN ('tiktok', 'tik_tok', 'tt')
GROUP BY cp."tenantId", cp."pixelId"
ON CONFLICT DO NOTHING;

UPDATE "Campaign" c
SET "metaPixelId" = mp."id"
FROM "CampaignPixel" cp
JOIN "MetaPixel" mp
  ON mp."tenantId" = cp."tenantId"
 AND mp."pixelId" = cp."pixelId"
WHERE cp."campaignId" = c."id"
  AND lower(cp."platform") IN ('meta', 'facebook', 'fb')
  AND c."metaPixelId" IS NULL;

UPDATE "Campaign" c
SET "tiktokPixelId" = tp."id"
FROM "CampaignPixel" cp
JOIN "TiktokPixel" tp
  ON tp."tenantId" = cp."tenantId"
 AND tp."pixelId" = cp."pixelId"
WHERE cp."campaignId" = c."id"
  AND lower(cp."platform") IN ('tiktok', 'tik_tok', 'tt')
  AND c."tiktokPixelId" IS NULL;

CREATE INDEX "MetaPixel_tenantId_idx" ON "MetaPixel"("tenantId");
CREATE INDEX "MetaPixel_isActive_idx" ON "MetaPixel"("isActive");
CREATE UNIQUE INDEX "MetaPixel_tenantId_name_key" ON "MetaPixel"("tenantId", "name");
CREATE UNIQUE INDEX "MetaPixel_tenantId_pixelId_key" ON "MetaPixel"("tenantId", "pixelId");

CREATE INDEX "TiktokPixel_tenantId_idx" ON "TiktokPixel"("tenantId");
CREATE INDEX "TiktokPixel_isActive_idx" ON "TiktokPixel"("isActive");
CREATE UNIQUE INDEX "TiktokPixel_tenantId_name_key" ON "TiktokPixel"("tenantId", "name");
CREATE UNIQUE INDEX "TiktokPixel_tenantId_pixelId_key" ON "TiktokPixel"("tenantId", "pixelId");

CREATE INDEX "Campaign_metaPixelId_idx" ON "Campaign"("metaPixelId");
CREATE INDEX "Campaign_tiktokPixelId_idx" ON "Campaign"("tiktokPixelId");

ALTER TABLE "MetaPixel" ADD CONSTRAINT "MetaPixel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TiktokPixel" ADD CONSTRAINT "TiktokPixel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_metaPixelId_fkey" FOREIGN KEY ("metaPixelId") REFERENCES "MetaPixel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_tiktokPixelId_fkey" FOREIGN KEY ("tiktokPixelId") REFERENCES "TiktokPixel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP TABLE "CampaignPixel";
