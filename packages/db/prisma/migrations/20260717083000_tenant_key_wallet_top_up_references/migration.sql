-- A wallet top-up reference is now the stable public tenant key prefixed with ATP.
-- Historical requests retain their original references, so the column can no longer be unique.
DROP INDEX IF EXISTS "WalletTopUp_reference_key";

CREATE INDEX IF NOT EXISTS "WalletTopUp_reference_status_idx" ON "WalletTopUp"("reference", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "WalletTopUp_pending_tenant_key" ON "WalletTopUp"("tenantId") WHERE "status" = 'PENDING';
