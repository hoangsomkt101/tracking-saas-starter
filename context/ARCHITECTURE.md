# Architecture

## Core Modules

1. Tracking
2. Attribution
3. Conversion Ingestion
4. Event Pipeline
5. Analytics
6. Billing / Quota

## Tracking Flow

Ads
↓
Shortlink
↓
Prelander
↓
Collect cookies
↓
Save click
↓
Redirect affiliate URL

## Event Pipeline

click
↓
redis queue
↓
worker
↓
meta/tiktok capi

## Performance Rules

- redirect must stay lightweight
- queue-first architecture
- append-only events
- async processing
