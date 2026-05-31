-- Keep at most 100 activity logs per tenant. Older logs are pruned automatically after inserts.
CREATE OR REPLACE FUNCTION prune_activity_logs_per_tenant()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext(NEW."tenantId")::bigint);

    DELETE FROM "ActivityLog"
    WHERE "id" IN (
        SELECT "id"
        FROM "ActivityLog"
        WHERE "tenantId" = NEW."tenantId"
        ORDER BY "createdAt" DESC, "id" DESC
        OFFSET 100
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "ActivityLog_retention_trigger" ON "ActivityLog";

CREATE TRIGGER "ActivityLog_retention_trigger"
AFTER INSERT ON "ActivityLog"
FOR EACH ROW
EXECUTE FUNCTION prune_activity_logs_per_tenant();

DELETE FROM "ActivityLog"
WHERE "id" IN (
    SELECT "id"
    FROM (
        SELECT
            "id",
            row_number() OVER (PARTITION BY "tenantId" ORDER BY "createdAt" DESC, "id" DESC) AS row_number
        FROM "ActivityLog"
    ) ranked_logs
    WHERE ranked_logs.row_number > 100
);
