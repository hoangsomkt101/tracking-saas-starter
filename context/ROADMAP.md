# Product Roadmap

## Current scope assumptions

- Current workspace model is **one tenant/workspace per Clerk user**.
- Tenant is the main data boundary. Team members / multi-user workspace are not implemented yet.
- Phase 1-2 are now more than a thin MVP: CRUD, ingestion, event exploration, attribution resolver, analytics breakdown, CAPI delivery, quota checks, and advanced event mapping are present.

## Phase 1 — Completed / Tracking Foundation

Core tracking foundation is implemented.

### Capability matrix

| Area | Current capability | Completion | Notes / limits |
| --- | --- | --- | --- |
| Auth & tenant scoping | Clerk auth, API bearer verification, automatic User/Tenant upsert, one workspace per user | Done | No team/membership model yet. |
| Tenant security | API queries scoped by `tenant.ownerUserId`; public webhooks require tenant/platform tokens | Done | Public webhook token guard was hardened to reject missing token instead of matching null/undefined tokens. |
| Campaigns | Create/list/detail/edit/delete, optional dataset assignment | Done | Campaign delete cascades related entities through schema relations. |
| Brands / Offers | Create/list/detail/edit/delete, validate affiliate URL, link campaign + affiliate platform | Done | Offer history is mutable; no historical snapshot on conversions yet. |
| Affiliate Platforms | Create/list/detail/edit/delete, slug, tracking param key, GET/POST webhook method, token reveal/rotate, default event, event mapping | Done | Mapping is stored as JSON in platform config. |
| Datasets | Meta/TikTok dataset CRUD, pixel ID, access token masking in API serialization, active flag | Done | No token vault/KMS yet; app-level masking only. |
| Prelanders | CRUD, theme `clean/dark/warm`, CTA text, body, delay, active flag | Done | Simple template renderer; no drag/drop builder or custom domain/SEO yet. |
| Tracking Links | CRUD, tenant-unique slug, brand/campaign linkage, optional prelander, active flag | Done | One tracking param appended to affiliate URL based on affiliate platform config. |
| Redirect tracking | Public `/r/:tenantId/:slug`, click UUID generation, IP/UA/referrer/cookies/click IDs capture, CAPI queue enqueue | Done | Redirect service stays lightweight; no bot filtering/fraud scoring yet. |
| CAPI pipeline | Redis/BullMQ queue, worker, dry-run by default, Meta/TikTok payload build, delivery status and attempts | Done | Event payload is basic; no advanced Meta/TikTok value/content/user-data mapping yet. |
| Rate limiting / hardening | Fastify rate limits on API/redirect/public webhooks, Helmet, CORS allow-list | Done | No per-tenant adaptive throttling yet. |
| Quota foundation | Click/CAPI/EAPI monthly quota checks against billing plan | Done | User-side billing usage page belongs Phase 3. |

### Phase 1 remaining enhancements

These are not blockers for MVP but are good hardening items:

- [ ] Bot/fraud filtering for redirect traffic.
- [ ] More complete cookie/user-data collection for CAPI quality.
- [ ] Secret vault/KMS or encrypted columns for ad platform access tokens.
- [ ] Custom domain support for redirect/prelander URLs.
- [ ] Audit log for create/update/delete actions.

## Phase 2 — MVP Done / Attribution & Analytics

Core ingestion, event matching, attribution resolver, filtered event exploration, and MVP analytics reporting are implemented. Further work should focus on immutable historical data, scale, exports, and deeper reporting.

### Capability matrix

| Area | Current capability | Completion | Notes / limits |
| --- | --- | --- | --- |
| Affiliate conversion ingestion | Public `GET/POST /affiliate-webhooks/:tenantId/:platformSlug`, token auth, platform method enforcement | Done | No idempotency key/deduplication for repeated network postbacks yet. |
| Click UUID extraction | Reads `clickUuid`, `subid1`, `sid1`, `fp_sid`, and the platform's configured `trackingParamKey` | Done | Does not yet support arbitrary alias list per platform. |
| Conversion storage | Stores event name, matched rule metadata, customer id/email, spend/payout/commission/currency, raw payload, method | Done | No attribution snapshot columns yet. |
| Advanced event mapping | Rule builder UI + JSON compatibility; nested paths, array index paths, `all/any`, priority, case sensitivity | Done | Stored as JSON; no test-run/simulation endpoint yet. |
| Mapping operators | `equals`, `not_equals`, `contains`, `not_contains`, `starts_with`, `ends_with`, `exists`, `not_exists`, `in`, `not_in`, `regex`, `gt`, `gte`, `lt`, `lte` | Done | Regex is evaluated server-side; invalid regex safely fails. |
| Default event fallback | Uses platform `defaultEventName` when no rule matches | Done | Default is `CompleteRegistration`. |
| Conversion-triggered CAPI | If postback has matching click UUID, enqueue CAPI event with resolved affiliate event name | Done | CAPI payload for purchase value/currency is not yet enriched. |
| Attribution resolver | Runtime resolver maps `AffiliateConversionEvent.clickUuid -> ClickEvent -> TrackingLink -> Brand -> Campaign -> AffiliatePlatform` | Done | Runtime join means historical names can change if entities are edited. |
| Event lists | Click, CAPI, Conversion lists with pagination and manual refresh | Done | Non-paginated fallback still caps to latest 100. |
| Filters | Search, date range, campaign, brand, tracking link, affiliate platform, CAPI status | Done | Conversion campaign/brand/link filter resolves via matching click UUIDs; can be heavy at scale. |
| Analytics summary | Clicks, conversions, attributed/unattributed conversions, CAPI totals/delivered/failed, conversion rates, revenue/payout/commission/spend | Done | Query-time aggregation only. |
| Analytics breakdown | By campaign, brand/offer, affiliate platform, day | Done | Top rows capped in code; no custom grouping UI yet. |
| Money handling | Decimal storage for spend/payout/commission; UI formats currency | Done | Revenue currently uses payout or commission fallback; no configurable revenue model yet. |
| Reporting UX | Dashboard cards, tables, filters, pagination, detail pages | Done | No CSV export/scheduled reports yet. |

### Phase 2 known gaps / higher-level next work

- [ ] **Idempotency / dedupe for affiliate postbacks**: avoid duplicate conversions when networks retry callbacks.
- [ ] **Persist attribution snapshot** on conversion ingestion if campaign/offer/platform names must remain historically immutable.
- [ ] **Value-aware CAPI enrichment**: pass payout/revenue/currency/content metadata into Meta/TikTok events for purchase/lead optimization.
- [ ] **Materialized aggregate tables or reporting indexes** for high-volume analytics.
- [ ] **Event mapping test tool**: paste sample webhook payload and show matched event/rule before saving.
- [ ] **Custom click/conversion field mapping** per platform beyond built-in aliases.
- [ ] **Export/report scheduling** for filtered event and analytics views.
- [ ] **Compare periods and advanced funnel charts**.
- [ ] **Bot/fraud/anomaly reporting** for click/conversion quality.

### Recommended next order

1. Add affiliate conversion idempotency/dedupe key support.
2. Add attribution snapshot fields on `AffiliateConversionEvent` and populate during ingestion.
3. Enrich conversion-triggered CAPI payload with value/currency/event metadata.
4. Add event mapping test endpoint/UI for safer platform setup.
5. Add reporting indexes/materialized aggregates once event volume grows.
6. Add CSV export/report scheduler.
7. Add period comparison and richer funnel charts.

## Phase 3 — Partially Done / Billing & Workspace Management

### Done

- [x] Billing plan model.
- [x] Superadmin billing plan management.
- [x] Assign billing plan to tenant.
- [x] Monthly quota checks for clicks, CAPI events, and EAPI/conversion events.
- [x] Superadmin menu/function grants per tenant.

### Not done yet

- [ ] User-side billing page with current plan and usage.
- [ ] Payment provider integration such as Stripe/Paddle.
- [ ] Subscription lifecycle.
- [ ] Invoice/payment history.
- [ ] Custom domains.
- [ ] Team members / multi-user workspace.

## Phase 4 — Later / Scale & Optimization

These should come after attribution and reporting are stable.

- [ ] ClickHouse or event warehouse for high-volume analytics.
- [ ] Near-realtime analytics for lightweight counters only.
- [ ] Cache layer for dashboard summary and heavy aggregate queries.
- [ ] Smart routing.
- [ ] AI optimization.
- [ ] Advanced prelander builder and custom domain/SEO controls.
- [ ] Audit log for create/update/delete actions.
