ALTER TABLE "AffiliateConversionEvent"
ADD COLUMN "affiliateRefId" TEXT,
ADD COLUMN "affiliateRefSource" TEXT,
ADD COLUMN "partnerStackCustomerKey" TEXT,
ADD COLUMN "impactRefClickId" TEXT;

UPDATE "AffiliateConversionEvent"
SET
  "partnerStackCustomerKey" = COALESCE(
    CASE
      WHEN "rawPayload"->>'event' ILIKE 'customer.%' THEN "rawPayload"#>>'{data,key}'
      ELSE "rawPayload"#>>'{data,customer,key}'
    END,
    "rawPayload"#>>'{data,customer,key}',
    "rawPayload"#>>'{data,key}'
  )
WHERE "rawPayload" ? 'event'
  AND "rawPayload" ? 'data'
  AND (
    "rawPayload"->>'event' ILIKE 'customer.%'
    OR "rawPayload"->>'event' ILIKE 'transaction.%'
    OR "rawPayload"->>'event' ILIKE 'reward.%'
  );

UPDATE "AffiliateConversionEvent"
SET "impactRefClickId" = COALESCE(
  "rawPayload"->>'RefClickId',
  "rawPayload"->>'refClickId',
  "rawPayload"->>'ref_click_id',
  "rawPayload"->>'refclickid'
)
WHERE COALESCE(
  "rawPayload"->>'RefClickId',
  "rawPayload"->>'refClickId',
  "rawPayload"->>'ref_click_id',
  "rawPayload"->>'refclickid'
) IS NOT NULL;

UPDATE "AffiliateConversionEvent"
SET
  "affiliateRefSource" = CASE
    WHEN "partnerStackCustomerKey" IS NOT NULL AND "partnerStackCustomerKey" <> '' THEN 'partnerstack_customer_key'
    WHEN "impactRefClickId" IS NOT NULL AND "impactRefClickId" <> '' THEN 'impact_ref_click_id'
    ELSE "affiliateRefSource"
  END,
  "affiliateRefId" = COALESCE(NULLIF("partnerStackCustomerKey", ''), NULLIF("impactRefClickId", ''), "affiliateRefId");

CREATE INDEX "AffConv_tenant_ref_src_ref_id_created_idx" ON "AffiliateConversionEvent"("tenantId", "affiliateRefSource", "affiliateRefId", "createdAt");
CREATE INDEX "AffConv_tenant_ps_customer_created_idx" ON "AffiliateConversionEvent"("tenantId", "partnerStackCustomerKey", "createdAt");
CREATE INDEX "AffConv_tenant_impact_ref_created_idx" ON "AffiliateConversionEvent"("tenantId", "impactRefClickId", "createdAt");
CREATE INDEX "AffConv_affiliateRefId_idx" ON "AffiliateConversionEvent"("affiliateRefId");
