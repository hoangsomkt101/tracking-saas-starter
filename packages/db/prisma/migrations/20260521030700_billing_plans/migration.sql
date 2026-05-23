-- CreateTable
CREATE TABLE "BillingPlan" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "monthlyPriceCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "clickLimit" INTEGER NOT NULL DEFAULT 1000,
    "capiEventLimit" INTEGER NOT NULL DEFAULT 1000,
    "eapiEventLimit" INTEGER NOT NULL DEFAULT 1000,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingPlan_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "billingPlanId" TEXT;

-- Seed default Free plan. Limits are monthly counters.
INSERT INTO "BillingPlan" (
    "id",
    "slug",
    "name",
    "description",
    "monthlyPriceCents",
    "currency",
    "clickLimit",
    "capiEventLimit",
    "eapiEventLimit",
    "isDefault",
    "isActive",
    "createdAt",
    "updatedAt"
) VALUES (
    'free-plan',
    'free',
    'Free',
    'Default free plan for newly registered accounts',
    0,
    'USD',
    1000,
    1000,
    1000,
    true,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
) ON CONFLICT DO NOTHING;

-- Assign all existing tenants to Free plan.
UPDATE "Tenant"
SET "billingPlanId" = 'free-plan'
WHERE "billingPlanId" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "BillingPlan_slug_key" ON "BillingPlan"("slug");

-- CreateIndex
CREATE INDEX "BillingPlan_isDefault_idx" ON "BillingPlan"("isDefault");

-- CreateIndex
CREATE INDEX "BillingPlan_isActive_idx" ON "BillingPlan"("isActive");

-- CreateIndex
CREATE INDEX "Tenant_billingPlanId_idx" ON "Tenant"("billingPlanId");

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_billingPlanId_fkey" FOREIGN KEY ("billingPlanId") REFERENCES "BillingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
