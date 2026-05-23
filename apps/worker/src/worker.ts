import 'dotenv/config'
import { Queue, Worker } from 'bullmq'
import { createHash } from 'node:crypto'
import { Prisma, prisma } from '@repo/db'
import { CLICK_EVENTS_QUEUE, type ClickEventJob, createRedisConnection } from '@repo/shared'

const connection = createRedisConnection()
const metricsQueue = new Queue<ClickEventJob>(CLICK_EVENTS_QUEUE, { connection: createRedisConnection() })

type CapiDeliveryResult = {
  delivered: boolean
  requestPayload: Record<string, unknown>
  responsePayload?: unknown
  error?: string
}

async function getTenantPlanOrDefault(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { billingPlan: true }
  })

  if (tenant?.billingPlan) return tenant.billingPlan

  return prisma.billingPlan.findFirst({
    where: {
      isDefault: true,
      isActive: true
    },
    orderBy: {
      createdAt: 'asc'
    }
  })
}

async function assertCapiLimit(tenantId: string) {
  const plan = await getTenantPlanOrDefault(tenantId)

  if (!plan) throw new Error(`Billing plan not found for tenant ${tenantId}`)

  const periodStart = new Date()
  periodStart.setUTCDate(1)
  periodStart.setUTCHours(0, 0, 0, 0)

  const capiEvents = await prisma.capiEvent.count({
    where: {
      tenantId,
      createdAt: {
        gte: periodStart
      }
    }
  })

  if (capiEvents >= plan.capiEventLimit) {
    throw new Error(`CAPI billing limit exceeded: ${capiEvents}/${plan.capiEventLimit} for plan ${plan.name}`)
  }
}

type AnyRecord = Record<string, any>

function toJsonSafe(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(toJsonSafe)
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value as AnyRecord).filter(([, entry]) => entry !== undefined).map(([key, entry]) => [key, toJsonSafe(entry)]))
  return value
}

async function createActivityLog(input: { tenantId: string; level?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'; source: string; eventType: string; message: string; entityType?: string; entityId?: string | number | bigint | null; metadata?: unknown }) {
  try {
    await prisma.$executeRawUnsafe(
      'INSERT INTO "ActivityLog" ("tenantId", "level", "source", "eventType", "message", "entityType", "entityId", "metadata") VALUES ($1, $2::"ActivityLogLevel", $3, $4, $5, $6, $7, $8::jsonb)',
      input.tenantId,
      input.level ?? 'INFO',
      input.source,
      input.eventType,
      input.message,
      input.entityType ?? null,
      input.entityId === null || input.entityId === undefined ? null : String(input.entityId),
      input.metadata === undefined ? null : JSON.stringify(toJsonSafe(input.metadata))
    )
  } catch (error) {
    console.warn('Failed to write activity log', { error, tenantId: input.tenantId, eventType: input.eventType })
  }
}

function compactObject<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined && entry !== ''))
}

function hashSha256(value?: unknown) {
  if (typeof value !== 'string' || !value.trim()) return undefined
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
}

function getJsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function moneyToNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : undefined
}

function normalizeContentId(value: unknown) {
  if (value === null || value === undefined) return undefined
  const normalized = String(value).trim().toLowerCase().replace(/\s+/g, '')
  return normalized || undefined
}

function normalizeContentIds(value: unknown) {
  const items = Array.isArray(value) ? value : value === null || value === undefined || value === '' ? [] : [value]
  const normalized = [...new Set(items.map(normalizeContentId).filter((item): item is string => Boolean(item)))]
  return normalized.length ? normalized : undefined
}

function getConversionEnrichment(conversion: Awaited<ReturnType<typeof loadConversionEvent>>, clickUuid?: string, eventName?: string): Record<string, unknown> {
  if (!conversion) return compactObject({ eventId: clickUuid && eventName ? `${eventName}_${clickUuid}` : clickUuid })
  const extra = getJsonRecord(conversion.capiEnrichment)
  const value = moneyToNumber(extra.value) ?? moneyToNumber(conversion.payoutAmount?.toString()) ?? moneyToNumber(conversion.commissionAmount?.toString()) ?? moneyToNumber(conversion.spendAmount?.toString())

  return compactObject({
    ...extra,
    value,
    currency: extra.currency ?? conversion.currency ?? 'USD',
    customerId: extra.customerId ?? conversion.customerId,
    customerEmail: extra.customerEmail ?? conversion.customerEmail,
    eventId: conversion.clickUuid && eventName ? `${eventName}_${conversion.clickUuid}` : conversion.clickUuid ?? conversion.id.toString(),
    eventTime: conversion.createdAt
  })
}

function getPlatformEventName(platform: string, eventName?: string) {
  return eventName || (platform === 'tiktok' ? 'PageView' : 'PageView')
}

function buildMetaPayload(clickEvent: Awaited<ReturnType<typeof loadClickEvent>>, eventName = 'PageView', conversion: Awaited<ReturnType<typeof loadConversionEvent>> = null) {
  if (!clickEvent) throw new Error('Missing click event')
  const enrichment = getConversionEnrichment(conversion, clickEvent.clickUuid, eventName)
  const eventTime = enrichment.eventTime instanceof Date ? enrichment.eventTime : clickEvent.createdAt
  const contentIds = normalizeContentIds(enrichment.contentIds) ?? normalizeContentIds(enrichment.contentId) ?? normalizeContentIds(clickEvent.trackingLink.brand.name)
  const contentId = normalizeContentId(enrichment.contentId) ?? contentIds?.[0]

  return {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(eventTime.getTime() / 1000),
        event_id: typeof enrichment.eventId === 'string' ? enrichment.eventId : clickEvent.clickUuid,
        action_source: 'website',
        user_data: compactObject({
          client_ip_address: clickEvent.ip,
          client_user_agent: clickEvent.userAgent,
          fbp: clickEvent.fbp,
          fbc: clickEvent.fbc,
          em: hashSha256(enrichment.customerEmail),
          external_id: hashSha256(enrichment.customerId),
          ph: hashSha256(enrichment.customerPhone),
          fn: hashSha256(enrichment.firstName),
          ln: hashSha256(enrichment.lastName),
          ct: hashSha256(enrichment.city),
          st: hashSha256(enrichment.state),
          zp: hashSha256(enrichment.zip),
          country: hashSha256(enrichment.country)
        }),
        custom_data: compactObject({
          value: enrichment.value,
          currency: enrichment.currency,
          content_ids: contentIds,
          content_id: contentId,
          content_name: enrichment.contentName,
          content_type: enrichment.contentType,
          content_category: enrichment.contentCategory,
          order_id: enrichment.orderId,
          campaign_id: clickEvent.campaignId,
          tracking_link_id: clickEvent.trackingLinkId,
          brand_id: clickEvent.trackingLink.brandId,
          affiliate_network: clickEvent.trackingLink.brand.affiliatePlatform.name
        })
      }
    ]
  }
}

function buildTikTokPayload(clickEvent: Awaited<ReturnType<typeof loadClickEvent>>, eventName = 'PageView', conversion: Awaited<ReturnType<typeof loadConversionEvent>> = null, dataset: { pixelId: string }) {
  if (!clickEvent) throw new Error('Missing click event')
  const enrichment = getConversionEnrichment(conversion, clickEvent.clickUuid, eventName)
  const eventTime = enrichment.eventTime instanceof Date ? enrichment.eventTime : clickEvent.createdAt
  const contentIds = normalizeContentIds(enrichment.contentIds) ?? normalizeContentIds(enrichment.contentId) ?? normalizeContentIds(clickEvent.trackingLink.brand.name)
  const contentId = normalizeContentId(enrichment.contentId) ?? contentIds?.[0]

  return {
    event_source: 'web',
    event_source_id: dataset.pixelId,
    data: [
      {
        event: eventName,
        event_time: Math.floor(eventTime.getTime() / 1000),
        event_id: typeof enrichment.eventId === 'string' ? enrichment.eventId : clickEvent.clickUuid,
        user: compactObject({
          ip: clickEvent.ip,
          user_agent: clickEvent.userAgent,
          ttp: clickEvent.ttp,
          ttclid: clickEvent.ttclid,
          email: hashSha256(enrichment.customerEmail),
          phone: hashSha256(enrichment.customerPhone),
          external_id: hashSha256(enrichment.customerId)
        }),
        properties: compactObject({
          value: enrichment.value,
          currency: enrichment.currency,
          content_id: contentId,
          content_ids: contentIds,
          content_name: enrichment.contentName,
          content_type: enrichment.contentType,
          order_id: enrichment.orderId,
          campaign_id: clickEvent.campaignId,
          tracking_link_id: clickEvent.trackingLinkId,
          brand_id: clickEvent.trackingLink.brandId,
          affiliate_network: clickEvent.trackingLink.brand.affiliatePlatform.name
        })
      }
    ]
  }
}

async function deliverCapi(platform: string, pixelId: string, accessToken: string, payload: Record<string, unknown>): Promise<CapiDeliveryResult> {
  const isDryRun = process.env.CAPI_DRY_RUN !== 'false'

  if (isDryRun) {
    return {
      delivered: true,
      requestPayload: payload,
      responsePayload: { dryRun: true, platform, pixelId }
    }
  }

  const url = platform === 'tiktok'
    ? 'https://business-api.tiktok.com/open_api/v1.3/event/track/'
    : `https://graph.facebook.com/v20.0/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(accessToken)}`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(platform === 'tiktok' ? { 'Access-Token': accessToken } : {})
    },
    body: JSON.stringify(payload)
  })

  const responsePayload = await response.json().catch(() => ({ status: response.status }))

  if (!response.ok) {
    return {
      delivered: false,
      requestPayload: payload,
      responsePayload,
      error: `CAPI ${platform} failed with HTTP ${response.status}`
    }
  }

  return {
    delivered: true,
    requestPayload: payload,
    responsePayload
  }
}

async function loadClickEvent(clickEventId: bigint) {
  return prisma.clickEvent.findUnique({
    where: { id: clickEventId },
    include: {
      trackingLink: {
        include: {
          campaign: { include: { datasets: { include: { dataset: true } } } },
          brand: { include: { affiliatePlatform: true } }
        }
      }
    }
  })
}

async function loadConversionEvent(sourceId?: string) {
  if (!sourceId) return null
  try {
    return prisma.affiliateConversionEvent.findUnique({ where: { id: BigInt(sourceId) } })
  } catch {
    return null
  }
}

const worker = new Worker<ClickEventJob>(
  CLICK_EVENTS_QUEUE,
  async (job) => {
    const clickEventId = BigInt(job.data.clickEventId)
    const clickEvent = await loadClickEvent(clickEventId)

    if (!clickEvent) {
      throw new Error(`Click event ${job.data.clickEventId} not found`)
    }

    const datasets = clickEvent.trackingLink.campaign?.datasets.map((entry) => entry.dataset).filter((dataset) => dataset.isActive) ?? []
    const conversion = job.data.source === 'affiliate_conversion' ? await loadConversionEvent(job.data.sourceId) : null

    if (!datasets.length) {
      return {
        processed: true,
        skipped: true,
        reason: 'No active datasets selected for campaign',
        clickEventId: job.data.clickEventId
      }
    }

    const source = job.data.source ?? 'click'
    const sourceId = job.data.sourceId ?? ''
    const deliveredEvents = []

    for (const dataset of datasets) {
      await assertCapiLimit(clickEvent.tenantId)

      const platform = dataset.platform === 'tiktok' ? 'tiktok' : 'meta'
      const eventName = getPlatformEventName(platform, job.data.eventName)
      const payload = platform === 'tiktok' ? buildTikTokPayload(clickEvent, eventName, conversion, dataset) : buildMetaPayload(clickEvent, eventName, conversion)
      const eventKey = {
        clickEventId: clickEvent.id,
        datasetId: dataset.id,
        eventName,
        source,
        sourceId
      }

      const existingDeliveredEvent = await prisma.capiEvent.findUnique({
        where: { clickEventId_datasetId_eventName_source_sourceId: eventKey }
      })

      if (existingDeliveredEvent?.status === 'DELIVERED') {
        deliveredEvents.push({ platform, datasetId: dataset.id, capiEventId: existingDeliveredEvent.id.toString(), skipped: true, reason: 'Already delivered' })
        continue
      }

      const existingEvent = await prisma.capiEvent.upsert({
        where: {
          clickEventId_datasetId_eventName_source_sourceId: eventKey
        },
        update: {
          attempts: { increment: 1 },
          status: 'PROCESSING',
          lastError: null,
          datasetId: dataset.id,
          platform,
          payload: payload as Prisma.InputJsonValue,
          source,
          sourceId
        },
        create: {
          tenantId: clickEvent.tenantId,
          clickEventId: clickEvent.id,
          datasetId: dataset.id,
          platform,
          eventName,
          source,
          sourceId,
          status: 'PROCESSING',
          attempts: 1,
          payload: payload as Prisma.InputJsonValue
        }
      })

      const result = await deliverCapi(platform, dataset.pixelId, dataset.accessToken, payload)

      await prisma.capiEvent.update({
        where: { id: existingEvent.id },
        data: {
          status: result.delivered ? 'DELIVERED' : 'FAILED',
          lastError: result.error ?? null,
          payload: {
            request: result.requestPayload,
            response: result.responsePayload ?? null,
            dryRun: process.env.CAPI_DRY_RUN !== 'false'
          } as Prisma.InputJsonValue
        }
      })

      await createActivityLog({
        tenantId: clickEvent.tenantId,
        level: result.delivered ? 'INFO' : 'ERROR',
        source: 'worker',
        eventType: result.delivered ? 'capi.delivered' : 'capi.failed',
        message: `CAPI ${platform} ${eventName} ${result.delivered ? 'delivered' : 'failed'} for dataset "${dataset.name}"${result.responsePayload === undefined ? '' : ` · response: ${JSON.stringify(result.responsePayload)}`}`,
        entityType: 'capiEvent',
        entityId: existingEvent.id,
        metadata: {
          capiEventId: existingEvent.id,
          clickEventId: clickEvent.id,
          clickUuid: clickEvent.clickUuid,
          trackingLinkId: clickEvent.trackingLinkId,
          campaignId: clickEvent.campaignId,
          datasetId: dataset.id,
          datasetName: dataset.name,
          platform,
          eventName,
          source,
          sourceId,
          attempts: existingEvent.attempts,
          delivered: result.delivered,
          requestPayload: result.requestPayload,
          responseBody: result.responsePayload ?? null,
          error: result.error,
          dryRun: process.env.CAPI_DRY_RUN !== 'false'
        }
      })

      if (!result.delivered) {
        throw new Error(result.error ?? `CAPI ${platform} delivery failed`)
      }

      deliveredEvents.push({ platform, datasetId: dataset.id, capiEventId: existingEvent.id.toString() })
    }

    return {
      processed: true,
      clickEventId: job.data.clickEventId,
      source,
      sourceId,
      deliveredEvents
    }
  },
  {
    connection,
    concurrency: Number(process.env.WORKER_CONCURRENCY ?? 5)
  }
)

worker.on('completed', (job) => {
  console.log(`Completed job ${job.id}`)
})

worker.on('failed', (job, error) => {
  console.error(`Failed job ${job?.id}`, error)
})

async function logWorkerMetrics() {
  const [waiting, active, delayed, failed] = await Promise.all([
    metricsQueue.getWaitingCount(),
    metricsQueue.getActiveCount(),
    metricsQueue.getDelayedCount(),
    metricsQueue.getFailedCount()
  ])
  console.log('Worker metrics', { queue: CLICK_EVENTS_QUEUE, waiting, active, delayed, failed })
}

const metricsInterval = setInterval(() => {
  void logWorkerMetrics().catch((error) => console.error('Failed to collect worker metrics', error))
}, Number(process.env.WORKER_METRICS_INTERVAL_MS ?? 60000))

async function shutdown() {
  clearInterval(metricsInterval)
  await worker.close()
  await metricsQueue.close()
  await connection.quit()
  await prisma.$disconnect()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

console.log(`Worker started for queue ${CLICK_EVENTS_QUEUE}`)
