-- Per-workspace wallet balance, immutable transaction ledger, and subscription renewal state.
CREATE TYPE "TenantSubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE');
CREATE TYPE "WalletTransactionType" AS ENUM ('TOP_UP', 'SUBSCRIPTION_CHARGE', 'REFUND', 'ADJUSTMENT');
CREATE TYPE "WalletTopUpStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

ALTER TABLE "Tenant"
  ADD COLUMN "subscriptionStatus" "TenantSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "subscriptionStartedAt" TIMESTAMP(3),
  ADD COLUMN "subscriptionPeriodStartAt" TIMESTAMP(3),
  ADD COLUMN "subscriptionPeriodEndAt" TIMESTAMP(3),
  ADD COLUMN "subscriptionNextBillingAt" TIMESTAMP(3);

-- Existing paid workspaces receive a transition month. New paid subscriptions are charged immediately.
UPDATE "Tenant"
SET "subscriptionNextBillingAt" = NOW() + INTERVAL '1 month'
FROM "Subscription"
WHERE "Tenant"."subscriptionId" = "Subscription"."id"
  AND "Subscription"."monthlyPriceCents" > 0;

CREATE INDEX "Tenant_subscriptionNextBillingAt_idx" ON "Tenant"("subscriptionNextBillingAt");
CREATE INDEX "Tenant_subscriptionStatus_idx" ON "Tenant"("subscriptionStatus");

CREATE TABLE "Wallet" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "balanceCents" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Wallet_tenantId_key" ON "Wallet"("tenantId");
CREATE INDEX "Wallet_currency_idx" ON "Wallet"("currency");

CREATE TABLE "WalletTransaction" (
  "id" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "subscriptionId" TEXT,
  "type" "WalletTransactionType" NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "balanceAfterCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "reference" TEXT,
  "billingPeriodStart" TIMESTAMP(3),
  "billingPeriodEnd" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WalletTransaction_reference_key" ON "WalletTransaction"("reference");
CREATE INDEX "WalletTransaction_walletId_createdAt_idx" ON "WalletTransaction"("walletId", "createdAt");
CREATE INDEX "WalletTransaction_tenantId_createdAt_idx" ON "WalletTransaction"("tenantId", "createdAt");
CREATE INDEX "WalletTransaction_tenantId_type_createdAt_idx" ON "WalletTransaction"("tenantId", "type", "createdAt");
CREATE INDEX "WalletTransaction_subscriptionId_billingPeriodStart_idx" ON "WalletTransaction"("subscriptionId", "billingPeriodStart");

CREATE TABLE "WalletTopUp" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "paymentMethod" TEXT NOT NULL DEFAULT 'bank_transfer',
  "paymentReference" TEXT,
  "note" TEXT,
  "reference" TEXT NOT NULL,
  "status" "WalletTopUpStatus" NOT NULL DEFAULT 'PENDING',
  "walletTransactionId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "approvedByUserId" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WalletTopUp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WalletTopUp_reference_key" ON "WalletTopUp"("reference");
CREATE UNIQUE INDEX "WalletTopUp_walletTransactionId_key" ON "WalletTopUp"("walletTransactionId");
CREATE INDEX "WalletTopUp_tenantId_createdAt_idx" ON "WalletTopUp"("tenantId", "createdAt");
CREATE INDEX "WalletTopUp_status_createdAt_idx" ON "WalletTopUp"("status", "createdAt");

ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WalletTopUp" ADD CONSTRAINT "WalletTopUp_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WalletTopUp" ADD CONSTRAINT "WalletTopUp_walletTransactionId_fkey" FOREIGN KEY ("walletTransactionId") REFERENCES "WalletTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
