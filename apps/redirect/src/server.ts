import 'dotenv/config'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { randomUUID } from 'node:crypto'
import { Prisma, prisma } from '@repo/db'
import { createClickEventsQueue, createFbc, createRedisConnection, escapeHtml, normalizeHeaderValue, validateHttpUrl } from '@repo/shared'

const app = Fastify({ logger: true })

await app.register(cookie)
await app.register(helmet, {
  contentSecurityPolicy: false
})
await app.register(rateLimit, {
  max: Number(process.env.REDIRECT_RATE_LIMIT_MAX ?? 300),
  timeWindow: process.env.REDIRECT_RATE_LIMIT_WINDOW ?? '1 minute'
})

const clickEventsQueue = createClickEventsQueue()
const readinessRedis = createRedisConnection()

type RedirectParams = {
  tenantKey: string
  slug: string
}

type RedirectQuery = {
  fbclid?: string
  ttclid?: string
}

async function getTenantPlanOrDefault(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, include: { billingPlan: true } })
  if (tenant?.billingPlan) return tenant.billingPlan
  return prisma.billingPlan.findFirst({ where: { isDefault: true, isActive: true }, orderBy: { createdAt: 'asc' } })
}

async function assertClickLimit(tenantId: string) {
  const plan = await getTenantPlanOrDefault(tenantId)
  if (!plan) throw new Error(`Billing plan not found for tenant ${tenantId}`)
  const periodStart = new Date()
  periodStart.setUTCDate(1)
  periodStart.setUTCHours(0, 0, 0, 0)
  const clicks = await prisma.clickEvent.count({ where: { tenantId, createdAt: { gte: periodStart } } })
  if (clicks >= plan.clickLimit) throw new Error(`Click billing limit exceeded: ${clicks}/${plan.clickLimit} for plan ${plan.name}`)
}

type AnyRecord = Record<string, any>
type BrowserPixelDataset = { platform: 'meta' | 'tiktok'; pixelId: string }
type BrowserPixelEventName = 'PageView' | 'ViewContent' | 'AddToCart'

const browserPixelEventNames: BrowserPixelEventName[] = ['PageView', 'ViewContent', 'AddToCart']

function toJsonSafe(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(toJsonSafe)
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value as AnyRecord).filter(([, entry]) => entry !== undefined).map(([key, entry]) => [key, toJsonSafe(entry)]))
  return value
}

async function createActivityLog(input: { tenantId: string; level?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'; source: string; eventType: string; message: string; entityType?: string; entityId?: string | number | bigint | null; metadata?: unknown }) {
  if (!['capi.delivered', 'capi.failed'].includes(input.eventType)) return
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
    app.log.warn({ error, tenantId: input.tenantId, eventType: input.eventType }, 'Failed to write activity log')
  }
}

function buildAffiliateRedirectUrl(affiliateUrl: string, trackingParamKey: string, clickUuid: string) {
  const url = new URL(validateHttpUrl(affiliateUrl, 'affiliateUrl'))
  url.searchParams.set(trackingParamKey, clickUuid)
  return url.toString()
}

function jsonForHtml(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function normalizeContentId(value: unknown) {
  if (value === null || value === undefined) return undefined
  const normalized = String(value).trim().toLowerCase().replace(/\s+/g, '')
  return normalized || undefined
}

function getBrowserPixels(campaign: AnyRecord | null | undefined): BrowserPixelDataset[] {
  const datasets = Array.isArray(campaign?.datasets) ? campaign.datasets : []
  const pixels = datasets
    .map((entry) => entry?.dataset)
    .filter((dataset): dataset is AnyRecord => Boolean(dataset?.isActive && dataset?.pixelId && ['meta', 'tiktok'].includes(String(dataset.platform).toLowerCase())))
    .map((dataset) => ({ platform: String(dataset.platform).toLowerCase() as BrowserPixelDataset['platform'], pixelId: String(dataset.pixelId) }))
  return [...new Map(pixels.map((pixel) => [`${pixel.platform}:${pixel.pixelId}`, pixel])).values()]
}

function getPixelEventId(eventName: BrowserPixelEventName | string, clickUuid: string) {
  return `${eventName}_${clickUuid}`
}

function buildBrowserPixelScripts(pixels: BrowserPixelDataset[], clickUuid: string, brandName: string) {
  if (!pixels.length) return ''
  const metaPixelIds = pixels.filter((pixel) => pixel.platform === 'meta').map((pixel) => pixel.pixelId)
  const tiktokPixelIds = pixels.filter((pixel) => pixel.platform === 'tiktok').map((pixel) => pixel.pixelId)
  const contentId = normalizeContentId(brandName)
  const baseEventProperties = contentId ? { content_id: contentId, content_ids: [contentId], content_type: 'product' } : { content_type: 'product' }
  const metaEventProperties = jsonForHtml(baseEventProperties)
  const tiktokEventProperties = (eventId: string) => jsonForHtml({ ...baseEventProperties, event_id: eventId })
  const metaEvents = browserPixelEventNames.map((eventName) => {
    const eventId = getPixelEventId(eventName, clickUuid)
    return `fbq('track', ${jsonForHtml(eventName)}, ${metaEventProperties}, { eventID: ${jsonForHtml(eventId)} });`
  }).join('\n          ')
  const tiktokEvents = browserPixelEventNames.map((eventName) => {
    const eventId = getPixelEventId(eventName, clickUuid)
    return `ttq.track(${jsonForHtml(eventName)}, ${tiktokEventProperties(eventId)}, { event_id: ${jsonForHtml(eventId)} });`
  }).join('\n          ')
  const metaScript = metaPixelIds.length ? `
        <script>
          !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window, document,'script','https://connect.facebook.net/en_US/fbevents.js');
          ${metaPixelIds.map((pixelId) => `fbq('init', ${jsonForHtml(pixelId)});`).join('\n          ')}
          ${metaEvents}
        </script>
        ${metaPixelIds.map((pixelId) => `<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${encodeURIComponent(pixelId)}&ev=PageView&noscript=1" /></noscript>`).join('\n        ')}
      ` : ''
  const tiktokScript = tiktokPixelIds.length ? `
        <script>
          !function (w, d, t) { w.TiktokAnalyticsObject=t; var ttq=w[t]=w[t]||[]; ttq.methods=['page','track','identify','instances','debug','on','off','once','ready','alias','group','enableCookie','disableCookie','holdConsent','revokeConsent','grantConsent']; ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}; for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]); ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]); return e}; ttq.load=function(e,n){var r='https://analytics.tiktok.com/i18n/pixel/events.js',o=n&&n.partner; ttq._i=ttq._i||{}; ttq._i[e]=[]; ttq._i[e]._u=r; ttq._t=ttq._t||{}; ttq._t[e]=+new Date; ttq._o=ttq._o||{}; ttq._o[e]=n||{}; n=document.createElement('script'); n.type='text/javascript'; n.async=!0; n.src=r+'?sdkid='+e+'&lib='+t; e=document.getElementsByTagName('script')[0]; e.parentNode.insertBefore(n,e)}; }(window, document, 'ttq');
          ${tiktokPixelIds.map((pixelId) => `ttq.load(${jsonForHtml(pixelId)});`).join('\n          ')}
          ${tiktokEvents}
        </script>
      ` : ''
  return `${metaScript}${tiktokScript}`
}

function buildRedirectHtml(url: string, prelander?: { headline: string; body: string; ctaText: string; ctaDelaySeconds: number; theme: string } | null, options: { pixelScripts?: string; directRedirectDelayMs?: number } = {}) {
  const encodedUrl = jsonForHtml(url)
  const pixelScripts = options.pixelScripts ?? ''
  const directRedirectDelay = options.directRedirectDelayMs ?? 250

  if (!prelander) {
    return `
      <html>
        <head>
          <title>Redirecting...</title>
          <meta name="robots" content="noindex,nofollow" />
          ${pixelScripts}
        </head>
        <body>
          <h3>Redirecting...</h3>
          <script>
            setTimeout(() => {
              window.location.href = ${encodedUrl}
            }, ${directRedirectDelay})
          </script>
        </body>
      </html>
    `
  }

  const delay = Math.max(Math.max(0, prelander.ctaDelaySeconds) * 1000, directRedirectDelay)
  const isDark = prelander.theme === 'dark'
  const background = isDark ? '#09090b' : prelander.theme === 'warm' ? '#fff7ed' : '#f8fafc'
  const foreground = isDark ? '#fafafa' : '#111827'
  const card = isDark ? '#18181b' : '#ffffff'

  return `
    <html>
      <head>
        <title>${escapeHtml(prelander.headline)}</title>
        <meta name="robots" content="noindex,nofollow" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        ${pixelScripts}
        <style>
          body { align-items: center; background: ${background}; color: ${foreground}; display: flex; font-family: Inter, system-ui, sans-serif; justify-content: center; margin: 0; min-height: 100vh; padding: 24px; }
          main { background: ${card}; border: 1px solid rgba(148, 163, 184, 0.22); border-radius: 24px; box-shadow: 0 24px 80px rgba(15, 23, 42, 0.16); max-width: 680px; padding: clamp(28px, 6vw, 56px); text-align: center; }
          h1 { font-size: clamp(2rem, 5vw, 3.5rem); letter-spacing: -0.06em; line-height: 1; margin: 0 0 18px; }
          p { color: ${isDark ? '#d4d4d8' : '#475569'}; font-size: 1.05rem; line-height: 1.7; margin: 0 0 28px; white-space: pre-wrap; }
          a { background: ${isDark ? '#fafafa' : '#111827'}; border-radius: 999px; color: ${isDark ? '#111827' : '#fafafa'}; display: inline-flex; font-weight: 700; padding: 14px 22px; text-decoration: none; }
          small { color: ${isDark ? '#a1a1aa' : '#64748b'}; display: block; margin-top: 18px; }
        </style>
      </head>
      <body>
        <main>
          <h1>${escapeHtml(prelander.headline)}</h1>
          <p>${escapeHtml(prelander.body)}</p>
          <a href="${escapeHtml(url)}" rel="nofollow">${escapeHtml(prelander.ctaText)}</a>
          <small>Auto-redirecting...</small>
        </main>
        <script>
          setTimeout(() => {
            window.location.href = ${encodedUrl}
          }, ${delay})
        </script>
      </body>
    </html>
  `
}

app.get('/health', async () => ({ status: 'ok', service: 'redirect' }))
app.get('/health/live', async () => ({ status: 'ok', service: 'redirect' }))
app.get('/health/ready', async (req, reply) => {
  try {
    await Promise.all([prisma.$queryRaw`SELECT 1`, readinessRedis.ping()])
    return { status: 'ready', service: 'redirect' }
  } catch (error) {
    req.log.error(error)
    return reply.code(503).send({ status: 'not_ready', service: 'redirect' })
  }
})
app.get('/metrics', async () => {
  const [waiting, active, delayed, failed] = await Promise.all([
    clickEventsQueue.getWaitingCount(),
    clickEventsQueue.getActiveCount(),
    clickEventsQueue.getDelayedCount(),
    clickEventsQueue.getFailedCount()
  ])
  return { service: 'redirect', queue: { clickEvents: { waiting, active, delayed, failed } } }
})

app.get('/:slug/:tenantKey', async (req, reply) => {
  const { tenantKey, slug } = req.params as RedirectParams
  const query = req.query as RedirectQuery
  const cookies = req.cookies

  const trackingLink = await prisma.trackingLink.findFirst({
    where: { slug, tenant: { OR: [{ id: tenantKey }, { publicKey: tenantKey }] } },
    include: {
      affiliatePlatform: true,
      brand: { include: { affiliatePlatform: true } },
      campaign: { include: { datasets: { include: { dataset: true } } } },
      prelander: true,
      tenant: true
    }
  })

  if (!trackingLink || !trackingLink.isActive) return reply.code(404).send({ error: 'Tracking link not found' })

  await assertClickLimit(trackingLink.tenantId)

  const clickEvent = await prisma.clickEvent.create({
    data: {
      tenantId: trackingLink.tenantId,
      campaignId: trackingLink.campaignId ?? null,
      trackingLinkId: trackingLink.id,
      clickUuid: randomUUID(),
      ip: req.ip,
      userAgent: normalizeHeaderValue(req.headers['user-agent']),
      referrer: normalizeHeaderValue(req.headers.referer),
      fbp: cookies._fbp,
      fbc: createFbc(query.fbclid),
      ttp: cookies._ttp,
      ttclid: query.ttclid,
      fbclid: query.fbclid,
      metadata: { slug, tenantKey, tenantId: trackingLink.tenantId, source: 'redirect' }
    }
  })

  const browserPixels = getBrowserPixels(trackingLink.campaign)
  const capiEventNames = browserPixels.length ? browserPixelEventNames : ['PageView' as BrowserPixelEventName]
  const browserPixelRedirectDelayMs = Number(process.env.REDIRECT_BROWSER_PIXEL_REDIRECT_DELAY_MS ?? 1500)
  const capiDelayMs = browserPixels.length ? Number(process.env.REDIRECT_CAPI_DELAY_MS ?? 3000) : 0
  await Promise.all(capiEventNames.map((eventName) => clickEventsQueue.add('click.created', {
    clickEventId: clickEvent.id.toString(),
    clickUuid: clickEvent.clickUuid,
    tenantId: clickEvent.tenantId,
    trackingLinkId: clickEvent.trackingLinkId,
    eventName
  }, { jobId: getPixelEventId(eventName, clickEvent.clickUuid), delay: capiDelayMs })))

  const redirectUrl = buildAffiliateRedirectUrl(trackingLink.affiliateUrl, trackingLink.affiliatePlatform.trackingParamKey, clickEvent.clickUuid)
  const usesPrelander = Boolean(trackingLink.prelanderEnabled && trackingLink.prelander?.isActive)
  const contentName = trackingLink.brand?.name ?? trackingLink.slug
  const pixelScripts = buildBrowserPixelScripts(browserPixels, clickEvent.clickUuid, contentName)
  await createActivityLog({
    tenantId: trackingLink.tenantId,
    source: 'redirect',
    eventType: usesPrelander ? 'prelander.viewed' : 'redirect.direct',
    message: usesPrelander ? `Prelander shown for tracking link "${trackingLink.slug}"` : `Direct redirect for tracking link "${trackingLink.slug}"`,
    entityType: 'clickEvent',
    entityId: clickEvent.id,
    metadata: {
      clickEventId: clickEvent.id,
      clickUuid: clickEvent.clickUuid,
      tenantKey,
      slug,
      trackingLinkId: trackingLink.id,
      campaignId: trackingLink.campaignId,
      brandId: trackingLink.brandId,
      brand: trackingLink.brand?.name,
      affiliatePlatform: trackingLink.affiliatePlatform.slug,
      prelanderId: trackingLink.prelander?.id,
      usesPrelander,
      ip: clickEvent.ip,
      referrer: clickEvent.referrer,
      fbclid: query.fbclid,
      ttclid: query.ttclid,
      browserPixelEvents: browserPixels.length ? browserPixelEventNames.map((eventName) => ({ eventName, eventId: getPixelEventId(eventName, clickEvent.clickUuid) })) : []
    }
  })
  if (!usesPrelander && !browserPixels.length) return reply.redirect(redirectUrl, 302)
  return reply.type('text/html').send(buildRedirectHtml(redirectUrl, usesPrelander ? trackingLink.prelander : null, { pixelScripts, directRedirectDelayMs: browserPixels.length ? browserPixelRedirectDelayMs : 250 }))
})

app.addHook('onClose', async () => { await clickEventsQueue.close(); await readinessRedis.quit() })
app.setErrorHandler((error, _req, reply) => {
  app.log.error(error)
  const message = error instanceof Error ? error.message : 'Unknown error'
  const statusCode = message.includes('limit exceeded') || message.includes('not found') ? 400 : 500
  return reply.code(statusCode).send({ error: statusCode === 500 ? 'Internal server error' : message })
})

app.listen({ port: Number(process.env.REDIRECT_PORT ?? 3002), host: '0.0.0.0' })
