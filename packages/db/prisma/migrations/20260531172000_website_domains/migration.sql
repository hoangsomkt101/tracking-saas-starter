CREATE TABLE "WebsiteDomain" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebsiteDomain_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebsiteDomain_tenantId_idx" ON "WebsiteDomain"("tenantId");

CREATE UNIQUE INDEX "WebsiteDomain_tenantId_domain_key" ON "WebsiteDomain"("tenantId", "domain");

ALTER TABLE "WebsiteDomain" ADD CONSTRAINT "WebsiteDomain_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
