# Project Coding Rules (Non-Obvious Only)

- Treat `packages/shared/src/index.ts` as canonical for queue name, Redis connection, supported affiliate platform aliases, event mapping helpers, FBC, URL, and HTML escaping utilities.
- API routes live in one large `apps/api/src/server.ts`; new protected routes should use `requireAuthenticated` plus `assertTenantAccess` and the existing serializers.
- Use the local `createActivityLog` helpers for logs; they raw-insert enum JSON and convert BigInt/Date safely.
- Public webhook routes must require token via `getWebhookToken`/`requireWebhookToken`; missing tokens must fail, not match null database values.
- `requireUser` has side effects: Clerk User/Tenant upsert, default BillingPlan assignment, and core MenuFeature grants.
- Add new menu features in API `getDefaultMenuFeatures`, web `navGroups`/`pageMeta`, and `DashboardRoutes`/`FeatureGate`; `api-keys` is frontend-core without a DB seed.
- Web mutations should use `runEntityAction(ctx, ..., successMessage)` to keep status and refetch behavior consistent.
- Supported platform `eventMapping` rules are currently ignored at resolution time except Impact Amount/Payout heuristic; change server resolver before promising custom mapping.
- Dataset token update forms intentionally keep the current token on blank `accessToken` via `optionalString`; do not send an empty string expecting to clear it.
- Preserve existing TS style when editing: strict types, single quotes, no semicolons, and no formatter/linter safety net.