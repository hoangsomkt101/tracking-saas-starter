# Codex Rules

## General

- Use TypeScript everywhere
- Prefer Fastify over Express
- Use async-first architecture
- Never block redirect requests
- Queue all external API calls

## Database

- Multi-tenant via tenant_id
- Append-only event tables
- Use UUID for public IDs
- Avoid excessive indexes

## Tracking

- Prefer browser-generated cookies
- Read _fbp and _ttp from cookies
- Fallback generate fbc from fbclid
- Use prelander instead of direct 302 when possible

## Workers

- BullMQ for queues
- Retry failed jobs
- Dead-letter queues
- Idempotent event processing

## Architecture

- apps/api
- apps/redirect
- apps/worker
- packages/db
- packages/shared

## Future Scaling

Phase 1:
- Fastify
- Postgres
- Redis

Phase 2:
- separate services

Phase 3:
- ClickHouse
- Kafka
