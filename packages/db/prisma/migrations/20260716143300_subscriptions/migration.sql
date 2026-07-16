-- Rename the plan catalog and tenant reference without changing assigned subscriptions.
ALTER TABLE "Tenant" DROP CONSTRAINT "Tenant_billingPlanId_fkey";
ALTER TABLE "Tenant" RENAME COLUMN "billingPlanId" TO "subscriptionId";
ALTER INDEX "Tenant_billingPlanId_idx" RENAME TO "Tenant_subscriptionId_idx";

ALTER TABLE "BillingPlan" RENAME TO "Subscription";
ALTER TABLE "Subscription" RENAME CONSTRAINT "BillingPlan_pkey" TO "Subscription_pkey";
ALTER INDEX "BillingPlan_slug_key" RENAME TO "Subscription_slug_key";
ALTER INDEX "BillingPlan_isDefault_idx" RENAME TO "Subscription_isDefault_idx";
ALTER INDEX "BillingPlan_isActive_idx" RENAME TO "Subscription_isActive_idx";

ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
