-- Banks may strip punctuation from transfer descriptions. Convert pending
-- references from ATP<publicKey>-<UUID> to ATP<publicKey><12 hex characters>.
UPDATE "WalletTopUp"
SET "reference" = LEFT("reference", 11) || RIGHT(REPLACE("reference", '-', ''), 12)
WHERE "status" = 'PENDING'
  AND "reference" LIKE 'ATP%-%';
