-- Add real prelander templates and connect tracking links to a selected prelander.
CREATE TABLE "Prelander" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "ctaText" TEXT NOT NULL DEFAULT 'Continue',
    "ctaDelaySeconds" INTEGER NOT NULL DEFAULT 2,
    "theme" TEXT NOT NULL DEFAULT 'clean',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prelander_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TrackingLink" ADD COLUMN "prelanderId" TEXT;

CREATE INDEX "Prelander_tenantId_idx" ON "Prelander"("tenantId");
CREATE INDEX "Prelander_isActive_idx" ON "Prelander"("isActive");
CREATE UNIQUE INDEX "Prelander_tenantId_name_key" ON "Prelander"("tenantId", "name");
CREATE INDEX "TrackingLink_prelanderId_idx" ON "TrackingLink"("prelanderId");

INSERT INTO "MenuFeature" ("id", "key", "path", "label", "group", "icon", "sortOrder", "isCore", "isActive", "createdAt", "updatedAt")
VALUES ('menu-prelanders', 'prelanders', '/prelanders', 'Prelanders', 'Tracking', 'Layers3', 55, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET
    "path" = EXCLUDED."path",
    "label" = EXCLUDED."label",
    "group" = EXCLUDED."group",
    "icon" = EXCLUDED."icon",
    "sortOrder" = EXCLUDED."sortOrder",
    "isCore" = EXCLUDED."isCore",
    "isActive" = EXCLUDED."isActive",
    "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "TenantMenuGrant" ("id", "tenantId", "menuFeatureId", "isEnabled", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'menu-prelanders', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant" t
ON CONFLICT ("tenantId", "menuFeatureId") DO NOTHING;

ALTER TABLE "Prelander" ADD CONSTRAINT "Prelander_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrackingLink" ADD CONSTRAINT "TrackingLink_prelanderId_fkey" FOREIGN KEY ("prelanderId") REFERENCES "Prelander"("id") ON DELETE SET NULL ON UPDATE CASCADE;
