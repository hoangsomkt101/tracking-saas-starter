# Aff Track Pro

Multi-tenant affiliate tracking + CAPI platform architecture.

## Stack

- Node.js
- Fastify
- React
- Vite
- Prisma
- PostgreSQL
- Redis
- BullMQ
- Docker
- TypeScript
- pnpm workspace
- Turborepo
- Clerk user authentication

## Apps

- `apps/web` - Clerk-authenticated React dashboard for tenants, campaigns, brands, tracking links and click events
- `apps/api` - authenticated management API for tenants, campaigns, brands, tracking links and click events
- `apps/redirect` - lightweight redirect/click capture service
- `apps/worker` - BullMQ worker for async event processing

## Packages

- `packages/db` - Prisma schema and shared Prisma client
- `packages/shared` - queue helpers and tracking utilities

## Features Implemented

- Clerk user-only authentication for API management routes
- User-owned tenants without Clerk Organizations
- Multi-tenant data model
- Campaign management API
- Brand / Offer management API
- Tracking link management API
- Shortlink redirect endpoint
- Click capture with `_fbp`, `_ttp`, `fbclid`, `ttclid`
- Facebook `fbc` fallback generation from `fbclid`
- Redis/BullMQ click event queue
- Worker-created sample CAPI event records
- Append-only click event table

## Requirements

- Node.js 20+
- pnpm 10+
- Docker
- Clerk account/application

## Setup

```bash
pnpm install
copy .env.example .env
docker compose up -d
pnpm prisma:generate
pnpm prisma:migrate
pnpm dev
```

## Environment

```bash
DATABASE_URL="postgresql://tracker:tracker@localhost:5432/tracker"
REDIS_URL="redis://localhost:6379"
API_PORT=3001
REDIRECT_PORT=3002
WORKER_CONCURRENCY=5
CLERK_SECRET_KEY="sk_test_your_clerk_secret_key"
VITE_CLERK_PUBLISHABLE_KEY="pk_test_your_clerk_publishable_key"
VITE_API_URL="http://localhost:3001"
VITE_REDIRECT_URL="http://localhost:3002"
```

## Clerk Auth

The API uses Clerk as user-only authentication. Clerk Organizations are intentionally not used.

Management API routes require this header:

```bash
Authorization: Bearer CLERK_SESSION_TOKEN
```

Public routes that do not require Clerk auth:

- `GET /health`
- `GET /r/:slug` on the redirect service

Protected API routes:

- `GET /me`
- `GET /tenants`
- `POST /tenants`
- `GET /campaigns`
- `POST /campaigns`
- `GET /brands`
- `POST /brands`
- `GET /tracking-links`
- `POST /tracking-links`
- `GET /click-events`

On each authenticated request, the API verifies the Clerk bearer token, syncs the Clerk user to the local `User` table by `clerkUserId`, and scopes tenant data by local `ownerUserId`.

## Service Ports

- Web dashboard: `http://localhost:3000`
- API: `http://localhost:3001`
- Redirect: `http://localhost:3002`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

## API Quick Start

Set a Clerk session token first:

```bash
set CLERK_TOKEN=your_clerk_session_token
```

Create a tenant:

```bash
curl -X POST http://localhost:3001/tenants ^
  -H "Authorization: Bearer %CLERK_TOKEN%" ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"Demo Tenant\"}"
```

Create a campaign:

```bash
curl -X POST http://localhost:3001/campaigns ^
  -H "Authorization: Bearer %CLERK_TOKEN%" ^
  -H "Content-Type: application/json" ^
  -d "{\"tenantId\":\"TENANT_ID\",\"name\":\"Demo Campaign\"}"
```

Create a brand:

```bash
curl -X POST http://localhost:3001/brands ^
  -H "Authorization: Bearer %CLERK_TOKEN%" ^
  -H "Content-Type: application/json" ^
  -d "{\"tenantId\":\"TENANT_ID\",\"campaignId\":\"CAMPAIGN_ID\",\"name\":\"Demo Brand\",\"affiliateNetwork\":\"demo\",\"affiliateUrl\":\"https://example.com/offer\"}"
```

Create a tracking link:

```bash
curl -X POST http://localhost:3001/tracking-links ^
  -H "Authorization: Bearer %CLERK_TOKEN%" ^
  -H "Content-Type: application/json" ^
  -d "{\"tenantId\":\"TENANT_ID\",\"campaignId\":\"CAMPAIGN_ID\",\"brandId\":\"BRAND_ID\",\"slug\":\"demo\",\"redirectUrl\":\"https://example.com/offer\",\"prelanderEnabled\":true}"
```

Open redirect URL:

```bash
http://localhost:3002/r/demo?fbclid=test_fbclid&ttclid=test_ttclid
```

List click events:

```bash
curl http://localhost:3001/click-events ^
  -H "Authorization: Bearer %CLERK_TOKEN%"
```

## Frontend Dashboard

Run the React dashboard with the rest of the monorepo:

```bash
pnpm dev
```

Open:

```bash
http://localhost:3000
```

The dashboard uses Clerk React for sign-in and calls the API with the current Clerk session token. It supports creating tenants, campaigns, brands/offers, tracking links and viewing recent click events.

## Current Scope

Aff Track Pro currently provides the first complete vertical slice:

1. Authenticate a user with Clerk.
2. Sync Clerk user into the local `User` table.
3. Create user-owned tenant/campaign/brand/tracking link.
4. Visit shortlink.
5. Capture click event in PostgreSQL.
6. Push click event to Redis/BullMQ.
7. Worker consumes job and writes a sample Meta PageView CAPI event record.

External Meta/TikTok API delivery, billing and advanced attribution are intentionally left for the next phases.
