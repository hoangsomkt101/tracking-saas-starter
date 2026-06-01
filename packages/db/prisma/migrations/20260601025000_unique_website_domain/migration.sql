WITH ranked_domains AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (PARTITION BY "domain" ORDER BY "createdAt" ASC, "id" ASC) AS row_number
    FROM "WebsiteDomain"
)
DELETE FROM "WebsiteDomain" AS website_domain
USING ranked_domains
WHERE website_domain."id" = ranked_domains."id"
  AND ranked_domains.row_number > 1;

CREATE UNIQUE INDEX "WebsiteDomain_domain_key" ON "WebsiteDomain"("domain");
