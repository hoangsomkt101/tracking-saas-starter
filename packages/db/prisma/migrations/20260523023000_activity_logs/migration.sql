-- Tenant-scoped activity logs for click, webhook, CAPI, prelander and resource lifecycle events.
CREATE TYPE "ActivityLogLevel" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR');

CREATE TABLE "ActivityLog" (
    "id" BIGSERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "level" "ActivityLogLevel" NOT NULL DEFAULT 'INFO',
    "source" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ActivityLog_tenantId_createdAt_idx" ON "ActivityLog"("tenantId", "createdAt");
CREATE INDEX "ActivityLog_tenantId_eventType_createdAt_idx" ON "ActivityLog"("tenantId", "eventType", "createdAt");
CREATE INDEX "ActivityLog_tenantId_level_createdAt_idx" ON "ActivityLog"("tenantId", "level", "createdAt");
CREATE INDEX "ActivityLog_tenantId_source_createdAt_idx" ON "ActivityLog"("tenantId", "source", "createdAt");
CREATE INDEX "ActivityLog_tenantId_entityType_entityId_idx" ON "ActivityLog"("tenantId", "entityType", "entityId");

ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "MenuFeature" ("id", "key", "path", "label", "group", "icon", "sortOrder", "isCore", "isActive", "createdAt", "updatedAt")
VALUES ('menu-activity-logs', 'activity-logs', '/logs', 'Activity Logs', 'Tracking', 'ScrollText', 75, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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
SELECT gen_random_uuid()::text, t."id", 'menu-activity-logs', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant" t
ON CONFLICT ("tenantId", "menuFeatureId") DO NOTHING;
