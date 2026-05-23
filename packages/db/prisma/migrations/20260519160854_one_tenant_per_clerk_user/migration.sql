-- Backfill owners for legacy tenants that do not have an owner yet.
-- If your database already has shared/unowned tenants, assign the oldest tenant to each user before enforcing one tenant per user.
WITH ranked_tenants AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) AS rn
  FROM "Tenant"
  WHERE "ownerUserId" IS NULL
),
ranked_users AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) AS rn
  FROM "User"
  WHERE id NOT IN (
    SELECT "ownerUserId"
    FROM "Tenant"
    WHERE "ownerUserId" IS NOT NULL
  )
)
UPDATE "Tenant"
SET "ownerUserId" = ranked_users.id
FROM ranked_tenants
JOIN ranked_users ON ranked_users.rn = ranked_tenants.rn
WHERE "Tenant".id = ranked_tenants.id;

-- Create a default tenant for any existing Clerk user that still does not have one.
INSERT INTO "Tenant" ("id", "ownerUserId", "name", "createdAt", "updatedAt")
SELECT
  CONCAT(
    SUBSTRING(MD5(CONCAT("User"."id", random()::text, clock_timestamp()::text)) FROM 1 FOR 8), '-',
    SUBSTRING(MD5(CONCAT("User"."id", random()::text, clock_timestamp()::text)) FROM 1 FOR 4), '-',
    SUBSTRING(MD5(CONCAT("User"."id", random()::text, clock_timestamp()::text)) FROM 1 FOR 4), '-',
    SUBSTRING(MD5(CONCAT("User"."id", random()::text, clock_timestamp()::text)) FROM 1 FOR 4), '-',
    SUBSTRING(MD5(CONCAT("User"."id", random()::text, clock_timestamp()::text)) FROM 1 FOR 12)
  ),
  "User"."id",
  COALESCE(NULLIF(TRIM(CONCAT(COALESCE("User"."firstName", ''), ' ', COALESCE("User"."lastName", ''))), ''), "User"."email", CONCAT('User ', "User"."clerkUserId")),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User"
WHERE NOT EXISTS (
  SELECT 1
  FROM "Tenant"
  WHERE "Tenant"."ownerUserId" = "User"."id"
);

-- Remaining unowned tenants cannot belong to a Clerk user under the one-user-one-tenant model.
DELETE FROM "Tenant"
WHERE "ownerUserId" IS NULL;

-- Replace nullable many-tenants relation with required one-to-one relation.
DROP INDEX IF EXISTS "Tenant_ownerUserId_idx";
ALTER TABLE "Tenant" DROP CONSTRAINT IF EXISTS "Tenant_ownerUserId_fkey";
ALTER TABLE "Tenant" ALTER COLUMN "ownerUserId" SET NOT NULL;
CREATE UNIQUE INDEX "Tenant_ownerUserId_key" ON "Tenant"("ownerUserId");
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
