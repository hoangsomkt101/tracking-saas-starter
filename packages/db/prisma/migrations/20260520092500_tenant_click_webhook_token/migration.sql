ALTER TABLE "Tenant" ADD COLUMN "clickWebhookToken" TEXT NOT NULL DEFAULT gen_random_uuid()::text;
