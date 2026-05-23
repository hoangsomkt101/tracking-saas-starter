-- Add configurable event mapping per affiliate platform.
-- event_mapping is a JSON array of rules, e.g.
-- [{"field":"status","operator":"equals","value":"kaof","eventName":"Purchase"}]
ALTER TABLE "AffiliatePlatform"
ADD COLUMN "eventMapping" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "defaultEventName" TEXT DEFAULT 'CompleteRegistration';

ALTER TABLE "AffiliateConversionEvent"
ADD COLUMN "eventName" TEXT,
ADD COLUMN "eventRule" TEXT,
ADD COLUMN "eventMatchedField" TEXT,
ADD COLUMN "eventMatchedValue" TEXT;

CREATE INDEX "AffiliateConversionEvent_eventName_createdAt_idx"
ON "AffiliateConversionEvent"("eventName", "createdAt");
