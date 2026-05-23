-- CreateTable
CREATE TABLE "MenuFeature" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "badge" TEXT,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isCore" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantMenuGrant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "menuFeatureId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantMenuGrant_pkey" PRIMARY KEY ("id")
);

-- Seed available menu features. Core items are granted to every existing tenant by default.
INSERT INTO "MenuFeature" ("id", "key", "path", "label", "group", "icon", "badge", "description", "sortOrder", "isCore", "isActive", "createdAt", "updatedAt") VALUES
('menu-dashboard', 'dashboard', '/dashboard', 'Overview', 'Platform', 'Home', NULL, 'Main dashboard overview', 10, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('menu-campaigns', 'campaigns', '/campaigns', 'Campaigns', 'Platform', 'Megaphone', NULL, 'Campaign management', 20, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('menu-brands', 'brands', '/brands', 'Brands / Offers', 'Platform', 'Building2', NULL, 'Brand and offer management', 30, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('menu-platforms', 'platforms', '/platforms', 'Affiliate Platforms', 'Platform', 'Globe2', NULL, 'Affiliate platform management', 40, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('menu-datasets', 'datasets', '/datasets', 'Datasets', 'Platform', 'ShieldCheck', NULL, 'Ad pixel/dataset management', 50, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('menu-tracking-links', 'tracking-links', '/tracking-links', 'Tracking Links', 'Tracking', 'Link2', NULL, 'Short tracking links', 60, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('menu-click-events', 'click-events', '/click-events', 'Click Events', 'Tracking', 'MousePointerClick', 'Live', 'Recent click events', 70, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('menu-analytics', 'analytics', '/analytics', 'Analytics', 'Tracking', 'BarChart3', NULL, 'Attribution and reporting', 80, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('menu-billing', 'billing', '/billing', 'Billing', 'Account', 'WalletCards', NULL, 'Plan and invoices', 90, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('menu-settings', 'settings', '/settings', 'Settings', 'Account', 'Settings', NULL, 'Workspace settings', 100, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('menu-support', 'support', '/support', 'Support', 'Account', 'HelpCircle', NULL, 'Help and onboarding', 110, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('menu-superadmin', 'superadmin', '/superadmin', 'Super Admin', 'Admin', 'Crown', 'Root', 'Root administrator tools', 1000, false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

-- Grant all core features to existing tenants.
INSERT INTO "TenantMenuGrant" ("id", "tenantId", "menuFeatureId", "isEnabled", "createdAt", "updatedAt")
SELECT CONCAT('grant-', "Tenant"."id", '-', "MenuFeature"."id"), "Tenant"."id", "MenuFeature"."id", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant"
CROSS JOIN "MenuFeature"
WHERE "MenuFeature"."isCore" = true
ON CONFLICT DO NOTHING;

-- CreateIndex
CREATE UNIQUE INDEX "MenuFeature_key_key" ON "MenuFeature"("key");

-- CreateIndex
CREATE UNIQUE INDEX "MenuFeature_path_key" ON "MenuFeature"("path");

-- CreateIndex
CREATE INDEX "MenuFeature_group_idx" ON "MenuFeature"("group");

-- CreateIndex
CREATE INDEX "MenuFeature_isActive_idx" ON "MenuFeature"("isActive");

-- CreateIndex
CREATE INDEX "MenuFeature_sortOrder_idx" ON "MenuFeature"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TenantMenuGrant_tenantId_menuFeatureId_key" ON "TenantMenuGrant"("tenantId", "menuFeatureId");

-- CreateIndex
CREATE INDEX "TenantMenuGrant_tenantId_idx" ON "TenantMenuGrant"("tenantId");

-- CreateIndex
CREATE INDEX "TenantMenuGrant_menuFeatureId_idx" ON "TenantMenuGrant"("menuFeatureId");

-- CreateIndex
CREATE INDEX "TenantMenuGrant_isEnabled_idx" ON "TenantMenuGrant"("isEnabled");

-- AddForeignKey
ALTER TABLE "TenantMenuGrant" ADD CONSTRAINT "TenantMenuGrant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantMenuGrant" ADD CONSTRAINT "TenantMenuGrant_menuFeatureId_fkey" FOREIGN KEY ("menuFeatureId") REFERENCES "MenuFeature"("id") ON DELETE CASCADE ON UPDATE CASCADE;
