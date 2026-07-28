import 'dotenv/config'
import Fastify, { type FastifyRequest } from 'fastify'
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { randomUUID } from 'node:crypto'
import { Prisma, assertSubscriptionAccess, prisma } from '@repo/db'
import { createClickEventsQueue, createFbc, createRedisConnection, escapeHtml, getSupportedAffiliatePlatform, normalizeHeaderValue, validateHttpUrl } from '@repo/shared'

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
  atp_fbp?: string
  atp_fbc?: string
  atp_ttp?: string
  atp_source?: string
  fbp?: string
  fbc?: string
  ttp?: string
}

async function getTenantSubscriptionOrDefault(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, include: { subscription: true } })
  if (!tenant) return null
  if (tenant.subscription) return { tenant, subscription: tenant.subscription }
  const subscription = await prisma.subscription.findFirst({ where: { isDefault: true, isActive: true }, orderBy: { createdAt: 'asc' } })
  return subscription ? { tenant, subscription } : null
}

async function assertClickLimit(tenantId: string) {
  const billing = await getTenantSubscriptionOrDefault(tenantId)
  if (!billing) throw new Error(`Subscription not found for tenant ${tenantId}`)
  assertSubscriptionAccess(billing.tenant.subscriptionStatus)
  const { subscription } = billing
  const periodStart = new Date()
  periodStart.setUTCDate(1)
  periodStart.setUTCHours(0, 0, 0, 0)
  const clicks = await prisma.clickEvent.count({ where: { tenantId, createdAt: { gte: periodStart } } })
  if (clicks >= subscription.clickLimit) throw new Error(`Click subscription limit exceeded: ${clicks}/${subscription.clickLimit} for subscription ${subscription.name}`)
}

type AnyRecord = Record<string, any>
type BrowserPixelDataset = { platform: 'meta' | 'tiktok'; pixelId: string }
type BrowserPixelEventName = 'AddToCart'

const browserPixelEventNames: BrowserPixelEventName[] = ['AddToCart']

function compactRecord<T extends AnyRecord>(value: T): AnyRecord { return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined && entry !== '')) }
function getPlainRecord(value: unknown): AnyRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : {} }

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

function resolveTrackingParamKey(platform: { slug?: string | null; name?: string | null; trackingParamKey?: string | null }) {
  const supported = getSupportedAffiliatePlatform(platform.slug ?? '') ?? getSupportedAffiliatePlatform(platform.trackingParamKey ?? '') ?? getSupportedAffiliatePlatform(platform.name ?? '')
  return supported?.trackingParamKey ?? platform.trackingParamKey ?? 'subId1'
}

function getFirstHeaderValue(value?: string | null) { return value?.split(',')[0]?.trim() || undefined }
function getHeaderString(req: FastifyRequest, name: string) { const value = req.headers[name.toLowerCase()]; return Array.isArray(value) ? value[0] : typeof value === 'string' && value.trim() ? value.trim() : undefined }
function getClientIp(req: FastifyRequest) { return getFirstHeaderValue(getHeaderString(req, 'cf-connecting-ip')) ?? getFirstHeaderValue(getHeaderString(req, 'true-client-ip')) ?? getFirstHeaderValue(getHeaderString(req, 'x-real-ip')) ?? getFirstHeaderValue(getHeaderString(req, 'x-forwarded-for')) ?? req.ip }
function optionalLimitedString(value: unknown, maxLength = 512) { return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : undefined }

function buildAffiliateRedirectUrl(affiliateUrl: string, trackingParamKey: string, clickUuid: string) {
  const url = new URL(validateHttpUrl(affiliateUrl, 'affiliateUrl'))
  if (trackingParamKey.toLowerCase() === 'subid1') {
    for (const key of [...url.searchParams.keys()]) if (key.toLowerCase() === 'subid1') url.searchParams.delete(key)
  }
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
        ${metaPixelIds.map((pixelId) => `<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${encodeURIComponent(pixelId)}&ev=AddToCart&noscript=1" /></noscript>`).join('\n        ')}
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

type BridgePrelander = { title?: string | null; headline: string; body: string; ctaText: string; ctaDelaySeconds: number; theme: string }
type RedirectSocialMeta = { title: string; description: string; url?: string; siteName?: string; locale?: string; type?: string }

function normalizeMetaText(value: string, maxLength = 220) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

function normalizeAbsoluteHttpUrl(value?: string | null) {
  if (!value) return undefined
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return undefined
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return undefined
  }
}

function getPublicOrigin(req: FastifyRequest) {
  const proto = getFirstHeaderValue(getHeaderString(req, 'x-forwarded-proto'))
  const host = getFirstHeaderValue(getHeaderString(req, 'x-forwarded-host')) ?? getHeaderString(req, 'host')
  if (host && /^[a-z0-9.-]+(?::\d+)?$/i.test(host)) {
    const inferredProto = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host) ? 'http' : 'https'
    const safeProto = proto === 'http' || proto === 'https' ? proto : inferredProto
    return `${safeProto}://${host}`
  }
  return normalizeAbsoluteHttpUrl(process.env.REDIRECT_PUBLIC_ORIGIN ?? process.env.PUBLIC_REDIRECT_URL ?? process.env.VITE_REDIRECT_URL)
}

function buildCanonicalShortlinkUrl(publicOrigin: string | undefined, slug: string, tenantKey: string) {
  if (!publicOrigin) return undefined
  return new URL(`${encodeURIComponent(slug)}/${encodeURIComponent(tenantKey)}`, `${publicOrigin}/`).toString()
}

function buildSocialMetaTags(meta?: RedirectSocialMeta) {
  if (!meta) return ''
  const title = normalizeMetaText(meta.title, 90)
  const description = normalizeMetaText(meta.description, 220)
  const siteName = normalizeMetaText(meta.siteName ?? meta.title, 80)
  const locale = normalizeMetaText(meta.locale ?? process.env.REDIRECT_OG_LOCALE ?? 'en_US', 16)
  const tags = [
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:type" content="${escapeHtml(meta.type ?? 'website')}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:site_name" content="${escapeHtml(siteName)}" />`,
    `<meta property="og:locale" content="${escapeHtml(locale)}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`
  ]
  if (meta.url) {
    tags.splice(1, 0, `<link rel="canonical" href="${escapeHtml(meta.url)}" />`)
    tags.splice(5, 0, `<meta property="og:url" content="${escapeHtml(meta.url)}" />`)
  }
  return tags.join('\n          ')
}

function buildTrackingLinkSocialMeta(input: { trackingLink: AnyRecord; prelander?: BridgePrelander | null; slug: string; tenantKey: string; publicOrigin?: string }): RedirectSocialMeta {
  const title = input.prelander?.title || input.prelander?.headline || input.trackingLink.prelanderTitle || input.trackingLink.brand?.name || input.trackingLink.campaign?.name || input.trackingLink.slug
  const description = input.prelander?.body || input.trackingLink.prelanderBody || input.trackingLink.prelanderHeadline || `Continue to ${input.trackingLink.brand?.name ?? input.trackingLink.slug}.`
  const siteName = input.prelander?.title || input.prelander?.headline || input.trackingLink.brand?.name || input.trackingLink.campaign?.name || input.trackingLink.tenant?.name || title
  return {
    title,
    description,
    url: buildCanonicalShortlinkUrl(input.publicOrigin, input.slug, input.tenantKey),
    siteName,
    locale: process.env.REDIRECT_OG_LOCALE ?? 'en_US',
    type: 'website'
  }
}

function buildSourceAttributionQueryCleanupScript() {
  return `<script>
            (() => {
              try {
                const url = new URL(window.location.href);
                const sourceParams = ['atp_source', 'atp_fbp', 'atp_fbc', 'atp_ttp', 'fbp', 'fbc', 'ttp'];
                let changed = false;
                for (const param of sourceParams) {
                  if (url.searchParams.has(param)) {
                    url.searchParams.delete(param);
                    changed = true;
                  }
                }
                if (changed) window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
              } catch (_) {}
            })();
          </script>`
}

function buildBridgeCookieAttributionScript(clickUuid?: string, enabled = false) {
  if (!enabled || !clickUuid) return ''
  const scriptBody = `(() => {
              const clickUuid = ${jsonForHtml(clickUuid)};
              let sent = false;
              const readCookie = (name) => {
                const prefix = name + '=';
                const item = (document.cookie || '').split(';').map((part) => part.trim()).find((part) => part.indexOf(prefix) === 0);
                if (!item) return '';
                const value = item.slice(prefix.length);
                try { return decodeURIComponent(value); } catch (_) { return value; }
              };
              const send = () => {
                if (sent) return;
                const payload = { clickUuid, fbp: readCookie('_fbp'), fbc: readCookie('_fbc'), ttp: readCookie('_ttp') };
                if (!payload.fbp && !payload.fbc && !payload.ttp) return;
                sent = true;
                const body = JSON.stringify(payload);
                if (navigator.sendBeacon) {
                  try {
                    const blob = new Blob([body], { type: 'application/json' });
                    if (navigator.sendBeacon('/_atp/bridge-attribution', blob)) return;
                  } catch (_) {}
                }
                if (window.fetch) fetch('/_atp/bridge-attribution', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true, credentials: 'same-origin' }).catch(() => {});
              };
              window.setTimeout(send, 900);
              window.addEventListener('pagehide', send, { once: true });
            })();`
  return `<script>
            ${scriptBody}
          </script>`
}

function buildRedirectHtml(url: string, prelander?: BridgePrelander | null, options: { pixelScripts?: string; directRedirectDelayMs?: number; socialMeta?: RedirectSocialMeta; requestId?: string; allowBridgeCookieAttribution?: boolean } = {}) {
  const encodedUrl = jsonForHtml(url)
  const pixelScripts = options.pixelScripts ?? ''
  const directRedirectDelay = options.directRedirectDelayMs ?? 250
  const socialMetaTags = buildSocialMetaTags(options.socialMeta)
  const sourceAttributionCleanupScript = buildSourceAttributionQueryCleanupScript()
  const bridgeCookieAttributionScript = buildBridgeCookieAttributionScript(options.requestId, options.allowBridgeCookieAttribution)
  const bridgeCookieAttributionScriptBody = bridgeCookieAttributionScript.replace(/^<script>\s*|\s*<\/script>$/g, '')

  if (!prelander) {
    return `<!doctype html>
      <html lang="en" prefix="og: https://ogp.me/ns#">
        <head>
          <meta charset="utf-8" />
          <title>Redirecting...</title>
          <meta name="robots" content="noindex,nofollow" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          ${socialMetaTags}
          ${sourceAttributionCleanupScript}
          ${pixelScripts}
        </head>
        <body>
          <h3>Redirecting...</h3>
          ${bridgeCookieAttributionScript}
          <script>
            setTimeout(() => {
              window.location.replace(${encodedUrl})
            }, ${directRedirectDelay})
          </script>
        </body>
      </html>
    `
  }

  const delay = Math.max(Math.max(0, prelander.ctaDelaySeconds) * 1000, directRedirectDelay)
  const isDark = prelander.theme === 'dark'
  const isWarm = prelander.theme === 'warm'
  const background = isDark ? '#0f0f10' : isWarm ? '#fbf7ef' : '#f8f8f8'
  const foreground = isDark ? '#f5f5f5' : '#1f1f1f'
  const muted = isDark ? '#b8b8b8' : '#5f6368'
  const softMuted = isDark ? '#8f8f8f' : '#777777'
  const card = isDark ? '#1c1c1f' : '#ffffff'
  const border = isDark ? '#36363a' : '#dedede'
  const inset = isDark ? '#151518' : '#f7f7f7'
  const accent = isDark ? '#f6b44b' : '#f38020'
  const title = prelander.title || prelander.headline
  const requestId = options.requestId ? options.requestId.slice(0, 18) : undefined

  return `<!doctype html>
    <html lang="en" prefix="og: https://ogp.me/ns#">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <meta name="robots" content="noindex,nofollow" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        ${socialMetaTags}
        ${sourceAttributionCleanupScript}
        ${pixelScripts}
        <style>
          :root { color-scheme: ${isDark ? 'dark' : 'light'}; }
          * { box-sizing: border-box; }
          body { background: ${background}; color: ${foreground}; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; min-height: 100vh; }
          .page { align-items: center; display: flex; justify-content: center; min-height: 100vh; padding: clamp(28px, 6vw, 72px) 20px; }
          main { width: min(100%, 720px); }
          .brand-line { color: ${softMuted}; font-size: 13px; margin-bottom: 28px; }
          h1 { font-size: clamp(30px, 5vw, 46px); font-weight: 500; letter-spacing: -0.035em; line-height: 1.12; margin: 0 0 18px; }
          .lead { color: ${muted}; font-size: clamp(16px, 2.4vw, 18px); line-height: 1.65; margin: 0 0 30px; max-width: 62ch; white-space: pre-wrap; }
          .challenge { background: ${card}; border: 1px solid ${border}; border-radius: 6px; box-shadow: 0 2px 8px rgba(0, 0, 0, ${isDark ? '.24' : '.08'}); margin: 0 0 22px; overflow: hidden; }
          .challenge-main { align-items: center; display: grid; gap: 18px; grid-template-columns: auto 1fr; min-height: 96px; padding: 22px; }
          .check { align-items: center; background: ${inset}; border: 2px solid ${border}; border-radius: 3px; display: inline-flex; height: 34px; justify-content: center; position: relative; width: 34px; }
          .check::before { animation: spin .9s linear infinite; border: 3px solid rgba(127, 127, 127, .22); border-top-color: ${accent}; border-radius: 999px; content: ""; height: 20px; width: 20px; }
          .challenge-title { display: block; font-size: 17px; font-weight: 600; line-height: 1.3; }
          .challenge-copy { color: ${muted}; display: block; font-size: 14px; line-height: 1.5; margin-top: 4px; }
          .progress { background: ${isDark ? '#2b2b2f' : '#ececec'}; height: 3px; overflow: hidden; }
          .progress span { animation: progress ${delay}ms linear forwards; background: ${accent}; display: block; height: 100%; transform-origin: left center; width: 100%; }
          .notice { color: ${muted}; font-size: 14px; line-height: 1.65; margin: 0 0 16px; }
          .fallback { align-items: center; background: transparent; border: 1px solid ${border}; border-radius: 4px; color: ${foreground}; display: inline-flex; font-size: 14px; font-weight: 600; min-height: 42px; padding: 0 16px; text-decoration: none; transition: border-color .15s ease, color .15s ease; }
          .fallback:hover { border-color: ${accent}; color: ${accent}; }
          footer { border-top: 1px solid ${border}; color: ${softMuted}; display: flex; flex-wrap: wrap; font-size: 12px; gap: 8px 14px; justify-content: space-between; margin-top: 42px; padding-top: 18px; }
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes progress { from { transform: scaleX(0); } to { transform: scaleX(1); } }
          @media (max-width: 560px) {
            .challenge-main { padding: 18px; }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <main>
            <div class="brand-line">Secure redirect verification</div>
            <h1>${escapeHtml(prelander.headline)}</h1>
            <p class="lead">${escapeHtml(prelander.body)}</p>
            <section class="challenge" aria-label="Human verification">
              <div class="challenge-main">
                <span class="check" aria-hidden="true"></span>
                <span>
                  <span class="challenge-title">Verifying you are human</span>
                  <span class="challenge-copy">Checking your browser before continuing. This usually takes a few seconds.</span>
                </span>
              </div>
              <div class="progress" aria-hidden="true"><span></span></div>
            </section>
            <p class="notice">You will be redirected automatically after the verification finishes. If nothing happens, use the button below.</p>
            <a class="fallback" href="${escapeHtml(url)}" rel="nofollow noreferrer">${escapeHtml(prelander.ctaText)}</a>
            <footer><span>Security check in progress</span>${requestId ? `<span>Request ID: ${escapeHtml(requestId)}</span>` : ''}</footer>
          </main>
        </div>
        <script>
          ${bridgeCookieAttributionScriptBody}
          setTimeout(() => {
            window.location.replace(${encodedUrl})
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

app.post('/_atp/bridge-attribution', async (req, reply) => {
  const body = getPlainRecord(req.body)
  const clickUuid = optionalLimitedString(body.clickUuid, 160)
  if (!clickUuid) return reply.code(400).send({ error: 'clickUuid is required' })

  const clickEvent = await prisma.clickEvent.findUnique({ where: { clickUuid } })
  if (!clickEvent) return reply.code(404).send({ error: 'Click event not found' })

  const metadata = getPlainRecord(clickEvent.metadata)
  if (metadata.sourceAttribution === 'atp.js') return { ok: true, skipped: true, reason: 'source attribution already captured' }

  const bridgeClickData = compactRecord({
    fbp: optionalLimitedString(body.fbp),
    fbc: optionalLimitedString(body.fbc),
    ttp: optionalLimitedString(body.ttp)
  })
  if (!Object.keys(bridgeClickData).length) return { ok: true, skipped: true, reason: 'no bridge attribution values' }

  await prisma.clickEvent.update({
    where: { id: clickEvent.id },
    data: {
      ...bridgeClickData,
      metadata: compactRecord({ ...metadata, sourceAttribution: 'bridge', bridgeCookieAttribution: true }) as Prisma.InputJsonValue
    }
  })
  return { ok: true }
})

app.get('/:slug/:tenantKey', async (req, reply) => {
  const { tenantKey, slug } = req.params as RedirectParams
  const query = req.query as RedirectQuery

  const trackingLink = await prisma.trackingLink.findFirst({
    where: { slug, tenant: { OR: [{ id: tenantKey }, { publicKey: tenantKey }] } },
    include: {
      affiliatePlatform: true,
      brand: { include: { affiliatePlatform: true } },
      campaign: { include: { datasets: { include: { dataset: true } } } },
      tenant: true
    }
  })

  if (!trackingLink || !trackingLink.isActive) return reply.code(404).send({ error: 'Tracking link not found' })

  await assertClickLimit(trackingLink.tenantId)

  const fbclid = optionalLimitedString(query.fbclid)
  const ttclid = optionalLimitedString(query.ttclid)
  const sourceFbp = optionalLimitedString(query.atp_fbp ?? query.fbp)
  const sourceFbc = optionalLimitedString(query.atp_fbc ?? query.fbc)
  const sourceTtp = optionalLimitedString(query.atp_ttp ?? query.ttp)
  const hasSourceAttribution = optionalLimitedString(query.atp_source) === '1' || Boolean(sourceFbp || sourceFbc || sourceTtp)

  const clickEvent = await prisma.clickEvent.create({
    data: {
      tenantId: trackingLink.tenantId,
      campaignId: trackingLink.campaignId ?? null,
      trackingLinkId: trackingLink.id,
      clickUuid: randomUUID(),
      ip: getClientIp(req),
      userAgent: normalizeHeaderValue(req.headers['user-agent']),
      referrer: normalizeHeaderValue(req.headers.referer),
      fbp: sourceFbp,
      fbc: sourceFbc ?? createFbc(fbclid),
      ttp: sourceTtp,
      ttclid,
      fbclid,
      metadata: compactRecord({ slug, tenantKey, tenantId: trackingLink.tenantId, source: 'redirect', sourceAttribution: hasSourceAttribution ? 'atp.js' : undefined }) as Prisma.InputJsonValue
    }
  })

  const browserPixels = getBrowserPixels(trackingLink.campaign)
  const capiEventNames = browserPixelEventNames
  const browserPixelRedirectDelayMs = Number(process.env.REDIRECT_BROWSER_PIXEL_REDIRECT_DELAY_MS ?? 1500)
  const capiDelayMs = browserPixels.length ? Number(process.env.REDIRECT_CAPI_DELAY_MS ?? 3000) : 0
  await Promise.all(capiEventNames.map((eventName) => clickEventsQueue.add('click.created', {
    clickEventId: clickEvent.id.toString(),
    clickUuid: clickEvent.clickUuid,
    tenantId: clickEvent.tenantId,
    trackingLinkId: clickEvent.trackingLinkId,
    eventName
  }, { jobId: getPixelEventId(eventName, clickEvent.clickUuid), delay: capiDelayMs })))

  const redirectUrl = buildAffiliateRedirectUrl(trackingLink.affiliateUrl, resolveTrackingParamKey(trackingLink.affiliatePlatform), clickEvent.clickUuid)
  const inlinePrelander = trackingLink.prelanderEnabled && trackingLink.prelanderHeadline && trackingLink.prelanderBody ? {
    title: trackingLink.prelanderTitle,
    headline: trackingLink.prelanderHeadline,
    body: trackingLink.prelanderBody,
    ctaText: trackingLink.prelanderCtaText || 'Continue',
    ctaDelaySeconds: trackingLink.prelanderCtaDelaySeconds ?? 2,
    theme: trackingLink.prelanderTheme || 'clean'
  } : null
  const usesPrelander = Boolean(inlinePrelander)
  const publicOrigin = getPublicOrigin(req)
  const socialMeta = buildTrackingLinkSocialMeta({ trackingLink, prelander: inlinePrelander, slug, tenantKey, publicOrigin })
  const contentName = trackingLink.brand?.name ?? trackingLink.prelanderTitle ?? trackingLink.slug
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
      prelanderTitle: trackingLink.prelanderTitle,
      prelanderHeadline: trackingLink.prelanderHeadline,
      usesPrelander,
      ip: clickEvent.ip,
      referrer: clickEvent.referrer,
      fbclid,
      ttclid,
      browserPixelEvents: browserPixels.length ? browserPixelEventNames.map((eventName) => ({ eventName, eventId: getPixelEventId(eventName, clickEvent.clickUuid) })) : []
    }
  })
  if (!usesPrelander && !browserPixels.length && !hasSourceAttribution) return reply.redirect(redirectUrl, 302)
  return reply.type('text/html').send(buildRedirectHtml(redirectUrl, inlinePrelander, { pixelScripts, directRedirectDelayMs: browserPixels.length ? browserPixelRedirectDelayMs : 250, socialMeta, requestId: clickEvent.clickUuid, allowBridgeCookieAttribution: !hasSourceAttribution }))
})

app.addHook('onClose', async () => { await clickEventsQueue.close(); await readinessRedis.quit() })
app.setErrorHandler((error, _req, reply) => {
  app.log.error(error)
  const message = error instanceof Error ? error.message : 'Unknown error'
  const statusCode = message.includes('payment overdue') ? 429 : message.includes('limit exceeded') || message.includes('not found') ? 400 : 500
  return reply.code(statusCode).send({ error: statusCode === 500 ? 'Internal server error' : message })
})

app.listen({ port: Number(process.env.REDIRECT_PORT ?? 3002), host: '0.0.0.0' })
