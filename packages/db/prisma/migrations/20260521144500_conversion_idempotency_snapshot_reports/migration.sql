-- Advanced conversion attribution and reporting hardening
ALTER TABLE "AffiliateConversionEvent"
  ADD COLUMN "clickEventId" BIGINT,
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "requestCount" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "lastReceivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "attributionSnapshot" JSONB,
  ADD COLUMN "capiEnrichment" JSONB;

UPDATE "AffiliateConversionEvent" AS conversion
SET
  "clickEventId" = click_event."id",
  "attributionSnapshot" = jsonb_build_object(
    'matched', true,
    'clickUuid', click_event."clickUuid",
    'clickEvent', jsonb_build_object(
      'id', click_event."id"::text,
      'tenantId', click_event."tenantId",
      'campaignId', click_event."campaignId",
      'trackingLinkId', click_event."trackingLinkId",
      'clickUuid', click_event."clickUuid",
      'ip', click_event."ip",
      'userAgent', click_event."userAgent",
      'referrer', click_event."referrer",
      'fbclid', click_event."fbclid",
      'ttclid', click_event."ttclid",
      'fbp', click_event."fbp",
      'fbc', click_event."fbc",
      'ttp', click_event."ttp",
      'createdAt', click_event."createdAt"
    ),
    'campaign', jsonb_build_object(
      'id', campaign."id",
      'tenantId', campaign."tenantId",
      'name', campaign."name",
      'datasetId', campaign."datasetId"
    ),
    'trackingLink', jsonb_build_object(
      'id', tracking_link."id",
      'tenantId', tracking_link."tenantId",
      'campaignId', tracking_link."campaignId",
      'brandId', tracking_link."brandId",
      'prelanderId', tracking_link."prelanderId",
      'slug', tracking_link."slug",
      'prelanderEnabled', tracking_link."prelanderEnabled",
      'isActive', tracking_link."isActive"
    ),
    'brand', jsonb_build_object(
      'id', brand."id",
      'tenantId', brand."tenantId",
      'campaignId', brand."campaignId",
      'affiliatePlatformId', brand."affiliatePlatformId",
      'name', brand."name"
    ),
    'affiliatePlatform', jsonb_build_object(
      'id', affiliate_platform."id",
      'tenantId', affiliate_platform."tenantId",
      'name', affiliate_platform."name",
      'slug', affiliate_platform."slug",
      'trackingParamKey', affiliate_platform."trackingParamKey"
    )
  )
FROM "ClickEvent" AS click_event
JOIN "Campaign" AS campaign ON campaign."id" = click_event."campaignId"
JOIN "TrackingLink" AS tracking_link ON tracking_link."id" = click_event."trackingLinkId"
JOIN "Brand" AS brand ON brand."id" = tracking_link."brandId"
JOIN "AffiliatePlatform" AS affiliate_platform ON affiliate_platform."id" = brand."affiliatePlatformId"
WHERE conversion."tenantId" = click_event."tenantId"
  AND conversion."clickUuid" = click_event."clickUuid";

ALTER TABLE "CapiEvent"
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'click',
  ADD COLUMN "sourceId" TEXT NOT NULL DEFAULT '';

ALTER TABLE "AffiliateConversionEvent"
  ADD CONSTRAINT "AffiliateConversionEvent_clickEventId_fkey"
  FOREIGN KEY ("clickEventId") REFERENCES "ClickEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "AffiliateConversionEvent_tenantId_affiliatePlatformId_idempot_key"
  ON "AffiliateConversionEvent"("tenantId", "affiliatePlatformId", "idempotencyKey");
CREATE INDEX "AffiliateConversionEvent_tenantId_affiliatePlatformId_createdAt_idx"
  ON "AffiliateConversionEvent"("tenantId", "affiliatePlatformId", "createdAt");
CREATE INDEX "AffiliateConversionEvent_tenantId_clickEventId_createdAt_idx"
  ON "AffiliateConversionEvent"("tenantId", "clickEventId", "createdAt");
CREATE INDEX "AffiliateConversionEvent_tenantId_eventName_createdAt_idx"
  ON "AffiliateConversionEvent"("tenantId", "eventName", "createdAt");
CREATE INDEX "AffiliateConversionEvent_idempotencyKey_idx"
  ON "AffiliateConversionEvent"("idempotencyKey");

DROP INDEX IF EXISTS "CapiEvent_clickEventId_platform_eventName_key";
CREATE INDEX "CapiEvent_tenantId_platform_eventName_createdAt_idx"
  ON "CapiEvent"("tenantId", "platform", "eventName", "createdAt");
CREATE UNIQUE INDEX "CapiEvent_clickEventId_platform_eventName_source_sourceId_key"
  ON "CapiEvent"("clickEventId", "platform", "eventName", "source", "sourceId");

CREATE TABLE "ReportSchedule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "reportType" TEXT NOT NULL DEFAULT 'analytics',
  "frequency" TEXT NOT NULL DEFAULT 'weekly',
  "recipientEmail" TEXT,
  "filters" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastRunAt" TIMESTAMP(3),
  "nextRunAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReportSchedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReportSchedule_tenantId_name_key" ON "ReportSchedule"("tenantId", "name");
CREATE INDEX "ReportSchedule_tenantId_idx" ON "ReportSchedule"("tenantId");
CREATE INDEX "ReportSchedule_isActive_nextRunAt_idx" ON "ReportSchedule"("isActive", "nextRunAt");
ALTER TABLE "ReportSchedule"
  ADD CONSTRAINT "ReportSchedule_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
