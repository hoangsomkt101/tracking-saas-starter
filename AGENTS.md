# AGENTS.md

## Commands
- CI/runtime target Node 22 + pnpm 10.33.4; CI order is `pnpm install --frozen-lockfile` -> `pnpm prisma:generate` -> `pnpm build`.
- Local DB/Redis are only in `docker-compose.yml`; run `docker compose up -d`, copy `.env.example` to `.env`, then `pnpm prisma:migrate` for a usable dev DB.
- `pnpm build` runs Turbo over all workspaces; package builds are `tsc --noEmit` except `@apps/web` also runs `vite build`. Focus with `pnpm --filter @apps/api build`.
- `pnpm test` only runs API helper tests: `apps/api/test/impact.test.ts` then `partnerstack.test.ts`. Single file: `pnpm --filter @apps/api exec tsx test/impact.test.ts`.
- `pnpm lint` is not a valid check yet: root calls `turbo lint`, but no workspace package defines a `lint` task/config.
- Services run TypeScript source directly (`tsx watch` in dev, `node --import tsx` in start scripts); `@repo/db` and `@repo/shared` do not emit compiled packages.

## Package boundaries
- Workspaces are only `apps/*` and `packages/*`: `apps/api` Fastify management/tracking/webhook API, `apps/redirect` public click redirector, `apps/worker` BullMQ CAPI worker, `apps/web` Vite/React dashboard.
- `packages/db` owns Prisma schema/client and loads the repo-root `.env`; root `pnpm prisma:*` scripts are filters to `@repo/db`.
- Treat `packages/shared/src/index.ts` plus `impact.ts`/`partnerstack.ts` as canonical for queue names, Redis connection, supported affiliate platform aliases, event mapping, URL/FBC helpers, and HTML escaping.

## Architecture gotchas
- Tenancy is one `Tenant` per Clerk user (`Tenant.ownerUserId` unique); `requireUser` has side effects: Clerk user/tenant upsert, default subscription assignment, and core menu grants.
- Most API routes live in one large `apps/api/src/server.ts`; new protected routes should rely on the preHandler auth, then call `requireAuthenticated` and `assertTenantAccess`.
- Public shortlinks are `/:slug/:tenantKey` on the redirect service, with `tenantKey` = `Tenant.publicKey` or `Tenant.id`; README/context examples with `/r/:slug` or `/r/:tenantKey/:slug` are stale.
- Redirect uses `TrackingLink.affiliateUrl` and appends `clickUuid` with the linked `AffiliatePlatform.trackingParamKey`; `Brand` is optional metadata, not the redirect URL source.
- CAPI delivery uses active `Dataset`s selected on `TrackingLink -> Campaign` via `CampaignDataset`; links without a campaign or selected datasets make the worker skip.
- Browser pixel/server CAPI dedupe uses event IDs like `${eventName}_${clickUuid}`; stored `CapiEvent` uniqueness is `[clickEventId,datasetId,eventName,source,sourceId]`.
- `CAPI_DRY_RUN` is true unless exactly `false`; local “DELIVERED” CAPI rows may contain only dry-run payloads.
- Affiliate webhook idempotency uses PartnerStack stable keys, explicit/network ids, or a stable payload hash; duplicates increment `requestCount` and normally do not enqueue CAPI again.
- Supported affiliate platform event resolution is special-cased: Impact ignores custom mapping and uses Amount/Payout/ActionTracker helpers; PartnerStack uses custom mapping only when a rule matches, then falls back to built-ins.
- API/redirect `/health/ready` both check PostgreSQL and Redis; `/metrics` exposes click queue counts, and the worker logs queue metrics every `WORKER_METRICS_INTERVAL_MS`.

## Data and UI conventions
- `ClickEvent`, `AffiliateConversionEvent`, `CapiEvent`, and `ActivityLog` ids are Prisma `BigInt`; stringify with existing serializers/`toJsonSafe` before returning JSON or logging metadata.
- Normal list responses mask affiliate platform `webhookToken` and dataset `accessToken`; platform reveal/rotate endpoints exist, dataset reveal does not.
- Dataset update keeps the current token when `accessToken` is blank (`optionalString`); do not send an empty string expecting to clear it.
- API validation status is driven by thrown `Error` text; include `required`, `must`, `not found`, `access denied`, `exceeded`, or `tồn tại` for 400-class errors.
- New menu features must stay in sync across API `getDefaultMenuFeatures`, web `navGroups`/`pageMeta`, and `DashboardRoutes`/`FeatureGate`.
- Web mutations should use `runEntityAction(ctx, ..., successMessage)` where possible, and preserve existing mixed Vietnamese/English user-facing copy unless intentionally changing UX.
- Vite reads env from the repo root (`envDir: '../..'`); web dev proxies `/api` to `VITE_API_URL`, while shortlink display uses `VITE_REDIRECT_URL`.
- Preserve the existing TS style: strict types, single quotes, no semicolons, and no formatter/linter safety net.
