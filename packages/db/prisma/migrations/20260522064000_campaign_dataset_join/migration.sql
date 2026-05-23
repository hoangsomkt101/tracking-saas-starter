-- Move Campaign -> Dataset from one optional dataset to many datasets.
-- Existing campaign.datasetId assignments are preserved in CampaignDataset.
-- CAPI events now identify the concrete dataset used, so one click can fan out to multiple datasets.

ALTER TABLE "BillingPlan" ADD COLUMN IF NOT EXISTS "campaignDatasetLimit" INTEGER NOT NULL DEFAULT 2;

ALTER TABLE "CapiEvent" ADD COLUMN IF NOT EXISTS "datasetId" TEXT;

CREATE TABLE "CampaignDataset" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "datasetId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CampaignDataset_pkey" PRIMARY KEY ("id")
);

INSERT INTO "CampaignDataset" ("id", "tenantId", "campaignId", "datasetId", "createdAt")
SELECT gen_random_uuid()::TEXT, "tenantId", "id", "datasetId", CURRENT_TIMESTAMP
FROM "Campaign"
WHERE "datasetId" IS NOT NULL;

ALTER TABLE "Campaign" DROP CONSTRAINT IF EXISTS "Campaign_datasetId_fkey";
DROP INDEX IF EXISTS "Campaign_datasetId_idx";
ALTER TABLE "Campaign" DROP COLUMN IF EXISTS "datasetId";

CREATE INDEX "CapiEvent_datasetId_idx" ON "CapiEvent"("datasetId");

DROP INDEX IF EXISTS "CapiEvent_clickEventId_platform_eventName_source_sourceId_key";
CREATE UNIQUE INDEX "CapiEvent_clickEventId_datasetId_eventName_source_sourceId_key" ON "CapiEvent"("clickEventId", "datasetId", "eventName", "source", "sourceId");

CREATE INDEX "CampaignDataset_tenantId_idx" ON "CampaignDataset"("tenantId");
CREATE INDEX "CampaignDataset_campaignId_idx" ON "CampaignDataset"("campaignId");
CREATE INDEX "CampaignDataset_datasetId_idx" ON "CampaignDataset"("datasetId");
CREATE UNIQUE INDEX "CampaignDataset_campaignId_datasetId_key" ON "CampaignDataset"("campaignId", "datasetId");

ALTER TABLE "CapiEvent" ADD CONSTRAINT "CapiEvent_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CampaignDataset" ADD CONSTRAINT "CampaignDataset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignDataset" ADD CONSTRAINT "CampaignDataset_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignDataset" ADD CONSTRAINT "CampaignDataset_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
