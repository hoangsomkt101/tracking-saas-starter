-- Make Campaign optional for Brand / Offer.
-- TrackingLink and ClickEvent keep campaignId as optional snapshots for analytics when a brand has a campaign.

ALTER TABLE "ClickEvent" DROP CONSTRAINT IF EXISTS "ClickEvent_campaignId_fkey";
ALTER TABLE "TrackingLink" DROP CONSTRAINT IF EXISTS "TrackingLink_campaignId_fkey";
ALTER TABLE "Brand" DROP CONSTRAINT IF EXISTS "Brand_campaignId_fkey";

ALTER TABLE "Brand" ALTER COLUMN "campaignId" DROP NOT NULL;
ALTER TABLE "TrackingLink" ALTER COLUMN "campaignId" DROP NOT NULL;
ALTER TABLE "ClickEvent" ALTER COLUMN "campaignId" DROP NOT NULL;

ALTER TABLE "Brand" ADD CONSTRAINT "Brand_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TrackingLink" ADD CONSTRAINT "TrackingLink_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClickEvent" ADD CONSTRAINT "ClickEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
