-- Inline bridge/prelander content directly on TrackingLink and remove separate Prelander management.
ALTER TABLE "TrackingLink" ALTER COLUMN "prelanderEnabled" SET DEFAULT false;

ALTER TABLE "TrackingLink"
  ADD COLUMN "prelanderTitle" TEXT,
  ADD COLUMN "prelanderHeadline" TEXT,
  ADD COLUMN "prelanderBody" TEXT,
  ADD COLUMN "prelanderCtaText" TEXT NOT NULL DEFAULT 'Continue',
  ADD COLUMN "prelanderCtaDelaySeconds" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "prelanderTheme" TEXT NOT NULL DEFAULT 'clean';

UPDATE "TrackingLink" AS tracking_link
SET
  "prelanderTitle" = prelander."name",
  "prelanderHeadline" = prelander."headline",
  "prelanderBody" = prelander."body",
  "prelanderCtaText" = prelander."ctaText",
  "prelanderCtaDelaySeconds" = prelander."ctaDelaySeconds",
  "prelanderTheme" = prelander."theme",
  "prelanderEnabled" = tracking_link."prelanderEnabled" AND prelander."isActive"
FROM "Prelander" AS prelander
WHERE tracking_link."prelanderId" = prelander."id";

UPDATE "TrackingLink"
SET "prelanderEnabled" = false
WHERE "prelanderId" IS NULL;

ALTER TABLE "TrackingLink" DROP CONSTRAINT IF EXISTS "TrackingLink_prelanderId_fkey";
DROP INDEX IF EXISTS "TrackingLink_prelanderId_idx";
ALTER TABLE "TrackingLink" DROP COLUMN IF EXISTS "prelanderId";

DROP TABLE IF EXISTS "Prelander";

UPDATE "MenuFeature"
SET "isActive" = false,
    "isCore" = false,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'prelanders';
