ALTER TABLE "AffiliatePlatform"
ALTER COLUMN "trackingParamKey" SET DEFAULT 'subId1';

UPDATE "AffiliatePlatform"
SET "trackingParamKey" = 'subId1'
WHERE LOWER("trackingParamKey") = 'subid1';
