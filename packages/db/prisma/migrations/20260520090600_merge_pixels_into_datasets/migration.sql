-- Merge MetaPixel/TiktokPixel into one tenant-scoped Dataset table.

CREATE TABLE "Dataset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pixelId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dataset_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Campaign" ADD COLUMN "datasetId" TEXT;

INSERT INTO "Dataset" ("id", "tenantId", "platform", "name", "pixelId", "accessToken", "isActive", "createdAt", "updatedAt")
SELECT "id", "tenantId", 'meta', "name", "pixelId", "accessToken", "isActive", "createdAt", "updatedAt"
FROM "MetaPixel";

INSERT INTO "Dataset" ("id", "tenantId", "platform", "name", "pixelId", "accessToken", "isActive", "createdAt", "updatedAt")
SELECT "id", "tenantId", 'tiktok', "name", "pixelId", "accessToken", "isActive", "createdAt", "updatedAt"
FROM "TiktokPixel";

UPDATE "Campaign"
SET "datasetId" = "metaPixelId"
WHERE "metaPixelId" IS NOT NULL;

UPDATE "Campaign"
SET "datasetId" = "tiktokPixelId"
WHERE "datasetId" IS NULL AND "tiktokPixelId" IS NOT NULL;

CREATE INDEX "Dataset_tenantId_idx" ON "Dataset"("tenantId");
CREATE INDEX "Dataset_platform_idx" ON "Dataset"("platform");
CREATE INDEX "Dataset_isActive_idx" ON "Dataset"("isActive");
CREATE UNIQUE INDEX "Dataset_tenantId_name_key" ON "Dataset"("tenantId", "name");
CREATE UNIQUE INDEX "Dataset_tenantId_platform_pixelId_key" ON "Dataset"("tenantId", "platform", "pixelId");
CREATE INDEX "Campaign_datasetId_idx" ON "Campaign"("datasetId");

ALTER TABLE "Dataset" ADD CONSTRAINT "Dataset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Campaign" DROP CONSTRAINT IF EXISTS "Campaign_metaPixelId_fkey";
ALTER TABLE "Campaign" DROP CONSTRAINT IF EXISTS "Campaign_tiktokPixelId_fkey";
DROP INDEX IF EXISTS "Campaign_metaPixelId_idx";
DROP INDEX IF EXISTS "Campaign_tiktokPixelId_idx";
ALTER TABLE "Campaign" DROP COLUMN "metaPixelId";
ALTER TABLE "Campaign" DROP COLUMN "tiktokPixelId";

DROP TABLE "MetaPixel";
DROP TABLE "TiktokPixel";
