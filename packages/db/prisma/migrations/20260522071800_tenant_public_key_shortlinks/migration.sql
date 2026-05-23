-- Add a short public tenant key for compact redirect URLs.
-- Existing long URLs /r/:tenantId/:slug continue to work; new UI uses /r/:publicKey/:slug.

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "publicKey" TEXT;

UPDATE "Tenant"
SET "publicKey" = substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)
WHERE "publicKey" IS NULL;

ALTER TABLE "Tenant" ALTER COLUMN "publicKey" SET NOT NULL;
ALTER TABLE "Tenant" ALTER COLUMN "publicKey" SET DEFAULT substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_publicKey_key" ON "Tenant"("publicKey");
CREATE INDEX IF NOT EXISTS "Tenant_publicKey_idx" ON "Tenant"("publicKey");
