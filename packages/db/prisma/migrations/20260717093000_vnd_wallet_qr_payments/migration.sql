-- SePay bank-transfer payments and generated VietQR codes use VND.
ALTER TABLE "PaymentSettings" ADD COLUMN IF NOT EXISTS "sepayBankCode" TEXT;

ALTER TABLE "Wallet" ALTER COLUMN "currency" SET DEFAULT 'VND';

-- The generated free plan and empty historical wallets can safely move to VND.
UPDATE "Subscription"
SET "currency" = 'VND'
WHERE "slug" = 'free' AND "monthlyPriceCents" = 0 AND "currency" = 'USD';

UPDATE "Wallet"
SET "currency" = 'VND'
WHERE "balanceCents" = 0 AND "currency" = 'USD';

-- Wallets with a remaining USD balance require a manual balance conversion before VND top-ups.
