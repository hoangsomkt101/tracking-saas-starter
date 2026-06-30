# Project Debug Rules (Non-Obvious Only)

- `pnpm lint` fails because Turbo has no package `lint` tasks; current verification is `pnpm build` or filtered package builds.
- No tests or test runner exist, so there is no valid single-test command until a runner is added.
- API/redirect `/health/ready` checks both PostgreSQL and Redis; Dokploy healthchecks use Node `fetch` against these endpoints.
- Worker dry-runs CAPI unless `CAPI_DRY_RUN=false`; inspect `CapiEvent.payload.dryRun` before assuming Meta/TikTok was called.
- Queue metrics are available at API/redirect `/metrics` and worker logs every `WORKER_METRICS_INTERVAL_MS`.
- Redirect `createActivityLog` currently returns unless eventType is `capi.delivered`/`capi.failed`; `prelander.viewed` and `redirect.direct` calls will not appear in ActivityLog.
- Normal list responses mask `clickWebhookToken`, `webhookToken`, and dataset `accessToken`; platform/tenant reveal endpoints exist, dataset reveal does not.
- Vite reads env from repo root via `envDir: '../..'`; web dev proxies `/api` to `VITE_API_URL`.