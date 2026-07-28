-- Wallet top-ups and subscription billing share one VND-denominated ledger.
UPDATE "Subscription"
SET "currency" = 'VND'
WHERE UPPER("currency") <> 'VND';

ALTER TABLE "Subscription"
  ALTER COLUMN "currency" SET DEFAULT 'VND';

ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_currency_vnd_check" CHECK ("currency" = 'VND');
