-- Central SePay account configuration and idempotent payment reconciliation.
ALTER TABLE "WalletTopUp"
  ADD COLUMN "paymentProvider" TEXT,
  ADD COLUMN "providerTransactionId" TEXT,
  ADD COLUMN "providerReferenceCode" TEXT,
  ADD COLUMN "paymentReceivedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "WalletTopUp_providerTransactionId_key" ON "WalletTopUp"("providerTransactionId");

CREATE TABLE "PaymentSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "sepayAccountNumber" TEXT,
  "sepayAccountName" TEXT,
  "sepayWebhookApiKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PaymentSettings_pkey" PRIMARY KEY ("id")
);
