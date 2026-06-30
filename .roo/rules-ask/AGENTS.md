# Project Documentation Rules (Non-Obvious Only)

- Prefer code/schema over README/context docs: some docs still show old `/r/:slug`, Campaign-to-Brand, single-dataset, and old CapiEvent unique-key shapes.
- “Tenant” and “workspace” mean the same one-user-owned boundary; there is no team membership model.
- “Brand / Offer” is not `AffiliatePlatform`; affiliate URL lives on Brand, while Platform supplies tracking param key, webhook token, and supported-network preset.
- Public click URLs use `tenantKey` (`Tenant.id` or `Tenant.publicKey`) plus tracking-link `slug`; click webhook URL is per tracking link and still requires workspace token.
- CAPI setup docs must mention Campaign dataset selection; TrackingLink has no direct dataset selection.
- Event mapping docs need the current caveat: supported platform resolver ignores stored custom rules except Impact Amount/Payout heuristic.
- User-facing copy is mixed Vietnamese/English; preserve Vietnamese success/error/status messages unless intentionally changing UX.