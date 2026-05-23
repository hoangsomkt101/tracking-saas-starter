-- Add public tenant namespace for redirect URLs.
ALTER TABLE "Tenant" ADD COLUMN "slug" TEXT;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) AS rn
  FROM "Tenant"
)
UPDATE "Tenant"
SET "slug" = CONCAT('t', ranked.rn)
FROM ranked
WHERE "Tenant".id = ranked.id;

ALTER TABLE "Tenant" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- Tracking link slugs are now unique inside each tenant namespace, not globally.
DROP INDEX IF EXISTS "TrackingLink_slug_key";
CREATE UNIQUE INDEX "TrackingLink_tenantId_slug_key" ON "TrackingLink"("tenantId", "slug");
