# Project Architecture Rules (Non-Obvious Only)

- Authenticated API requests call `requireUser`, which upserts Clerk User/Tenant, attaches default BillingPlan, and seeds core menu grants as request side effects.
- Public ingest is split: redirect handles `/r/:tenantKey/:slug`, API handles click/affiliate webhooks; both create events and enqueue BullMQ jobs.
- CAPI event identity is `[clickEventId,datasetId,eventName,source,sourceId]`; browser pixel/server CAPI dedupe uses event/job ids `${eventName}_${clickUuid}`.
- Affiliate conversions store attribution snapshots and CAPI enrichment at ingestion; analytics still falls back to clickUuid joins when snapshots are missing.
- Billing quotas count month-to-date UTC rows; click quota is checked in redirect and click webhook, EAPI only for new conversions, CAPI inside worker per dataset event.
- Menu grants are DB-backed, but frontend also hardcodes core feature fallback and superadmin sees all `navGroups`; keep DB seed and frontend nav synchronized.
- External API calls belong in worker/queue flow; redirect path should stay click-write, queue, and fast HTML/302 only.
- `@repo/db` and `@repo/shared` export TypeScript source directly, so runtime uses `tsx` and builds are typechecks/noEmit rather than package compilation.