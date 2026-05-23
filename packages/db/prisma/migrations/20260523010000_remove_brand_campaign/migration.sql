-- Remove direct Campaign relation from Brand / Offer.
-- Campaign grouping now happens only through TrackingLink.campaignId.

ALTER TABLE "Brand" DROP CONSTRAINT IF EXISTS "Brand_campaignId_fkey";
DROP INDEX IF EXISTS "Brand_campaignId_idx";
DROP INDEX IF EXISTS "Brand_campaignId_name_key";
ALTER TABLE "Brand" DROP COLUMN IF EXISTS "campaignId";
