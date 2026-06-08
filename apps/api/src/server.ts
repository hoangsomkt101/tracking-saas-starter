import 'dotenv/config'
import { createClerkClient, verifyToken } from '@clerk/backend'
import { TokenVerificationError } from '@clerk/backend/errors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import { createHash, randomUUID } from 'node:crypto'
import { Prisma, prisma, type User } from '@repo/db'
import { createClickEventsQueue, createFbc, createRedisConnection, getImpactActionTrackerEventName, getImpactCapiValue, getImpactEventMatch, getImpactPayoutNumber, getImpactRefClickId, getPartnerStackCapiEnrichment, getPartnerStackClickUuid, getPartnerStackConversionMoney, getPartnerStackCustomerEmail, getPartnerStackCustomerId, getPartnerStackEventDate, getPartnerStackEventMatch, getPartnerStackIdempotencyKey, getPayloadString as getSharedPayloadString, getPayloadValue as getSharedPayloadValue, getSupportedAffiliatePlatform, isFilledPayloadValue as isSharedFilledPayloadValue, isImpactPostbackPayload, maskSecret, normalizeAffiliateEventMapping, normalizeEventName, normalizePayloadLookupKey as normalizeSharedPayloadLookupKey, parseEnvList, parseMoneyNumber, requireSupportedAffiliatePlatform, resolveAffiliateEventName, resolveImpactEventNames, validateHttpUrl, type SupportedAffiliatePlatformDefinition } from '@repo/shared'

const app = Fastify({ logger: true })
await app.register(helmet, { contentSecurityPolicy: false })
await app.register(rateLimit, { max: Number(process.env.API_RATE_LIMIT_MAX ?? 600), timeWindow: process.env.API_RATE_LIMIT_WINDOW ?? '1 minute' })

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
const clickEventsQueue = createClickEventsQueue()
const readinessRedis = createRedisConnection()
const DEFAULT_CLERK_JWT_CLOCK_SKEW_MS = 30_000
const configuredClerkJwtClockSkewInMs = Number(process.env.CLERK_JWT_CLOCK_SKEW_MS ?? DEFAULT_CLERK_JWT_CLOCK_SKEW_MS)
const clerkJwtClockSkewInMs = Number.isFinite(configuredClerkJwtClockSkewInMs) && configuredClerkJwtClockSkewInMs >= 0 ? configuredClerkJwtClockSkewInMs : DEFAULT_CLERK_JWT_CLOCK_SKEW_MS

const allowedCorsOrigins = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  ...parseEnvList(process.env.ALLOWED_ORIGINS),
  ...parseEnvList(process.env.WEB_APP_ORIGIN)
])

function applyCorsHeaders(req: FastifyRequest, reply: FastifyReply) {
  if (['/atp.js', '/atp/events'].includes(req.url.split('?')[0])) return
  const origin = req.headers.origin
  reply
    .header('vary', 'Origin')
    .header('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS')
    .header('access-control-allow-headers', 'authorization,content-type,x-idempotency-key')
    .header('access-control-max-age', '86400')
  if (origin && allowedCorsOrigins.has(origin)) reply.header('access-control-allow-origin', origin)
}

type AuthenticatedRequest = FastifyRequest & { currentUser: User }
type AnyRecord = Record<string, any>

function requireString(value: unknown, field: string) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${field} is required`)
  return value.trim()
}
function optionalString(value: unknown) { return typeof value === 'string' && value.trim() ? value.trim() : undefined }
function nullableString(value: unknown, fallback: string | null = null) { return typeof value === 'string' ? optionalString(value) ?? null : fallback }
function optionalBoolean(value: unknown, fallback: boolean) { return typeof value === 'boolean' ? value : fallback }
function optionalInteger(value: unknown, fallback: number) { const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN; return Number.isInteger(n) && n >= 0 ? n : fallback }
function normalizePrelanderTheme(value: unknown) { const v = typeof value === 'string' ? value.trim().toLowerCase() : 'clean'; return ['clean', 'dark', 'warm'].includes(v) ? v : 'clean' }
function normalizeDatasetPlatform(value: unknown) { const p = requireString(value, 'platform').toLowerCase(); if (!['meta', 'tiktok'].includes(p)) throw new Error('platform must be meta or tiktok'); return p }
function toSlug(value: string) { return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) }
function stableStringify(value: unknown): string { if (value === null || value === undefined) return JSON.stringify(value); if (typeof value === 'bigint') return JSON.stringify(value.toString()); if (value instanceof Date) return JSON.stringify(value.toISOString()); if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`; if (typeof value === 'object') { const record = value as AnyRecord; return `{${Object.keys(record).sort().filter((key) => record[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}` } return JSON.stringify(value) }
function sha256Hex(value: string) { return createHash('sha256').update(value).digest('hex') }
function getAffiliatePlatformChoice(input: AnyRecord, fallback?: { name?: string | null; slug?: string | null; trackingParamKey?: string | null }) { const candidates = [input.platform, input.platformKey, input.network, input.slug, input.trackingParamKey, fallback?.slug, fallback?.trackingParamKey, fallback?.name, input.name]; for (const candidate of candidates) { const platform = getSupportedAffiliatePlatform(candidate); if (platform) return platform } return requireSupportedAffiliatePlatform(input.platform ?? input.platformKey ?? input.network ?? input.slug ?? input.trackingParamKey ?? input.name) }
function getAffiliatePlatformBaseData(definition: SupportedAffiliatePlatformDefinition) { return { trackingParamKey: definition.trackingParamKey, webhookMethod: definition.webhookMethod, defaultEventName: definition.defaultEventName, eventMapping: [] as Prisma.InputJsonValue } }
function resolveTrackingParamKey(platform?: { slug?: string | null; name?: string | null; trackingParamKey?: string | null }, options: { preferStored?: boolean } = {}) { const stored = optionalString(platform?.trackingParamKey); if (options.preferStored && stored) return stored; const supported = getSupportedAffiliatePlatform(platform?.slug ?? '') ?? getSupportedAffiliatePlatform(stored ?? '') ?? getSupportedAffiliatePlatform(platform?.name ?? ''); return supported?.trackingParamKey ?? stored ?? 'subid1' }
function getBearerToken(req: FastifyRequest) { const h = req.headers.authorization; return h?.startsWith('Bearer ') ? h.slice('Bearer '.length).trim() : null }
function isClerkConfigured() { return Boolean(process.env.CLERK_SECRET_KEY && !process.env.CLERK_SECRET_KEY.includes('your_clerk_secret_key') && !process.env.CLERK_SECRET_KEY.includes('replace_me')) }
function isPublicRoute(req: FastifyRequest) { const path = req.url.split('?')[0]; return path === '/health' || path === '/health/live' || path === '/health/ready' || path === '/metrics' || path === '/atp.js' || path === '/atp/events' || req.method === 'OPTIONS' || path.startsWith('/affiliate-webhooks/') }

const DEFAULT_PAGE = 1
const DEFAULT_PAGE_LIMIT = 25
const MAX_PAGE_LIMIT = 100

type PaginationInput = { page: number; limit: number; skip: number; take: number }

function getQueryValue(value: unknown) { return Array.isArray(value) ? value[0] : value }
function optionalQueryString(value: unknown) { const normalized = getQueryValue(value); return typeof normalized === 'string' && normalized.trim() ? normalized.trim() : undefined }
const TRACKING_PROPERTY_PREFIX = 'DBG-'
const trackingTenantKeyPattern = /^[a-zA-Z0-9_-]{1,128}$/
function parseTrackingPropertyId(value: unknown) { const propertyId = optionalQueryString(value); if (!propertyId?.startsWith(TRACKING_PROPERTY_PREFIX)) return null; const tenantKey = propertyId.slice(TRACKING_PROPERTY_PREFIX.length).trim(); return tenantKey && trackingTenantKeyPattern.test(tenantKey) ? { propertyId, tenantKey } : null }
function parseHttpUrl(value: string) { try { const text = value.trim(); const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`; const url = new URL(candidate); return ['http:', 'https:'].includes(url.protocol) && url.hostname ? url : null } catch { return null } }
function cleanUrlPath(pathname: string) { return (pathname || '/').replace(/\/+$/, '') || '/' }
function trackingAffiliateUrlMatches(href: string | undefined, affiliateUrl: string) { if (!href) return false; const current = parseHttpUrl(href); const expected = parseHttpUrl(affiliateUrl); if (!current || !expected) return false; current.hash = ''; expected.hash = ''; if (current.origin !== expected.origin) return false; if (cleanUrlPath(current.pathname) !== cleanUrlPath(expected.pathname)) return false; for (const [key, value] of expected.searchParams.entries()) { if (current.searchParams.get(key) !== value) return false } return true }
function normalizeUrlHost(url: URL) { const hostname = url.hostname.toLowerCase().replace(/\.$/, ''); return url.port ? `${hostname}:${url.port}` : hostname }
const websiteHostPattern = /^(localhost|\[[0-9a-f:.]+\]|\d{1,3}(?:\.\d{1,3}){3}|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*)(?::\d{1,5})?$/
function normalizeWebsiteDomainInput(value: unknown) {
  const url = parseHttpUrl(requireString(value, 'domain'))
  if (!url) throw new Error('domain must be a valid http/https domain')
  const domain = normalizeUrlHost(url)
  const port = url.port ? Number(url.port) : undefined
  if (domain.length > 255 || !websiteHostPattern.test(domain) || (port !== undefined && (port < 1 || port > 65535))) throw new Error('domain must be a valid website domain')
  return domain
}
function getHostParts(host: string) {
  if (host.startsWith('[')) { const end = host.indexOf(']'); return { hostname: end >= 0 ? host.slice(0, end + 1) : host, port: end >= 0 && host[end + 1] === ':' ? host.slice(end + 2) : undefined } }
  const [hostname, port] = host.split(':')
  return { hostname, port }
}
function canAllowSubdomains(hostname: string) { return hostname !== 'localhost' && !hostname.startsWith('[') && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) }
function websiteHostMatches(requestHost: string, allowedHost: string) {
  if (requestHost === allowedHost) return true
  const request = getHostParts(requestHost)
  const allowed = getHostParts(allowedHost)
  if (allowed.port || request.port || !canAllowSubdomains(allowed.hostname)) return false
  return request.hostname.endsWith(`.${allowed.hostname}`)
}
function getRequestWebsiteOrigin(req: FastifyRequest) {
  const origin = getHeaderString(req, 'origin')
  if (origin && origin !== 'null') { const url = parseHttpUrl(origin); if (url) return { origin: url.origin, host: normalizeUrlHost(url), source: 'origin' as const } }
  const referer = getHeaderString(req, 'referer') ?? getHeaderString(req, 'referrer')
  if (referer) { const url = parseHttpUrl(referer); if (url) return { origin: url.origin, host: normalizeUrlHost(url), source: 'referer' as const } }
  return null
}
async function getAllowedWebsiteOrigin(req: FastifyRequest, tenantId: string) {
  const requestWebsite = getRequestWebsiteOrigin(req)
  if (!requestWebsite) return null
  const allowedDomains = await prisma.websiteDomain.findMany({ where: { tenantId }, select: { domain: true } })
  return allowedDomains.some((entry) => websiteHostMatches(requestWebsite.host, entry.domain)) ? requestWebsite.origin : null
}
function trackingEventHeaders(reply: FastifyReply, allowedOrigin?: string | null) {
  const response = reply
    .header('content-type', 'application/json; charset=utf-8')
    .header('vary', 'Origin, Referer')
    .header('access-control-allow-methods', 'POST,OPTIONS')
    .header('access-control-allow-headers', 'content-type')
    .header('access-control-max-age', '86400')
  if (allowedOrigin) response.header('access-control-allow-origin', allowedOrigin).header('access-control-allow-credentials', 'true')
  return response
}
function getClientIp(req: FastifyRequest) { return getHeaderString(req, 'x-forwarded-for')?.split(',')[0]?.trim() || req.ip }
function getPublicRequestOrigin(req: FastifyRequest) {
  const proto = (getHeaderString(req, 'x-forwarded-proto') ?? 'http').split(',')[0]?.trim().toLowerCase() === 'https' ? 'https' : 'http'
  const host = (getHeaderString(req, 'x-forwarded-host') ?? getHeaderString(req, 'host') ?? '').split(',')[0]?.trim()
  return host ? `${proto}://${host}` : undefined
}
function optionalLimitedString(value: unknown, maxLength = 1024) { const text = optionalString(value); return text ? text.slice(0, maxLength) : undefined }
function getUrlSearchParam(value: string | undefined, key: string) { if (!value) return undefined; const url = parseHttpUrl(value); return optionalLimitedString(url?.searchParams.get(key), 512) }
const TRACKING_SCRIPT_VIEW_CONTENT_CLICK_UUID_PREFIX = 'atp_'
const TRACKING_SCRIPT_AFFILIATE_CLICK_CAPI_EVENT_NAME = 'AddToCart'
function normalizeTrackingEventId(value: unknown) { const raw = optionalLimitedString(value, 160) ?? randomUUID(); const normalized = raw.replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 160); return normalized || randomUUID() }
function normalizeClientClickUuid(value: unknown) { const raw = optionalLimitedString(value, 160); if (!raw) return null; const normalized = raw.replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 160); return normalized || null }
function excludeTrackingScriptViewContentClicks(where: AnyRecord) { const rule = { clickUuid: { startsWith: TRACKING_SCRIPT_VIEW_CONTENT_CLICK_UUID_PREFIX } }; where.NOT = where.NOT ? Array.isArray(where.NOT) ? [...where.NOT, rule] : [where.NOT, rule] : rule; return where }
function parseTrackingEventBody(value: unknown) { if (typeof value === 'string') { try { return getPlainRecord(JSON.parse(value)) ?? {} } catch { return {} } } return getPlainRecord(value) ?? {} }
function parseStringList(value: unknown) { const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []; return [...new Set(raw.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean))] }
function parsePositiveInteger(value: unknown, fallback: number, max?: number) { const normalized = getQueryValue(value); const parsed = typeof normalized === 'number' ? normalized : typeof normalized === 'string' ? Number.parseInt(normalized, 10) : Number.NaN; if (!Number.isFinite(parsed) || parsed < 1) return fallback; const integer = Math.floor(parsed); return max ? Math.min(integer, max) : integer }
function parsePagination(q: AnyRecord): PaginationInput { const page = parsePositiveInteger(q.page, DEFAULT_PAGE); const limit = parsePositiveInteger(q.limit, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT); return { page, limit, skip: (page - 1) * limit, take: limit } }
function wantsPaginatedResponse(q: AnyRecord) { return q.page !== undefined || q.limit !== undefined || getQueryValue(q.paginated) === 'true' }
function makePaginatedResponse<T>(items: T[], total: number, pagination: PaginationInput) { const totalPages = Math.max(1, Math.ceil(total / pagination.limit)); return { items, pagination: { page: pagination.page, limit: pagination.limit, total, totalPages, hasNextPage: pagination.page < totalPages, hasPreviousPage: pagination.page > 1 } } }

function getDefaultMenuFeatures() {
  return [
    { id: 'menu-dashboard', key: 'dashboard', path: '/dashboard', label: 'Overview', group: 'Platform', icon: 'Home', sortOrder: 10, isCore: true },
    { id: 'menu-campaigns', key: 'campaigns', path: '/campaigns', label: 'Campaigns', group: 'Platform', icon: 'Megaphone', sortOrder: 20, isCore: true },
    { id: 'menu-platforms', key: 'platforms', path: '/platforms', label: 'Affiliate Platforms', group: 'Data Sources', icon: 'Globe2', sortOrder: 30, isCore: true },
    { id: 'menu-datasets', key: 'datasets', path: '/datasets', label: 'Datasets', group: 'Platform', icon: 'ShieldCheck', sortOrder: 40, isCore: true },
    { id: 'menu-tracking-links', key: 'tracking-links', path: '/tracking-links', label: 'Tracking Links', group: 'Tracking', icon: 'Link2', sortOrder: 60, isCore: true },
    { id: 'menu-activity-logs', key: 'activity-logs', path: '/logs', label: 'Activity Logs', group: 'Tracking', icon: 'ScrollText', sortOrder: 75, isCore: true },
    { id: 'menu-analytics', key: 'analytics', path: '/analytics', label: 'Analytics', group: 'Tracking', icon: 'BarChart3', sortOrder: 80, isCore: true },
    { id: 'menu-billing', key: 'billing', path: '/billing', label: 'Billing', group: 'Account', icon: 'WalletCards', sortOrder: 90, isCore: true },
    { id: 'menu-settings', key: 'settings', path: '/websites', label: 'Websites', group: 'Data Sources', icon: 'Settings', sortOrder: 35, isCore: true },
    { id: 'menu-support', key: 'support', path: '/support', label: 'Support', group: 'Account', icon: 'HelpCircle', sortOrder: 110, isCore: true },
    { id: 'menu-superadmin', key: 'superadmin', path: '/superadmin', label: 'Super Admin', group: 'Admin', icon: 'Crown', badge: 'Root', sortOrder: 1000, isCore: false }
  ]
}
async function ensureMenuFeaturesSeeded() { await prisma.menuFeature.updateMany({ where: { key: { in: ['brands', 'prelanders', 'click-events'] } }, data: { isActive: false, isCore: false } }); await Promise.all(getDefaultMenuFeatures().map((feature) => prisma.menuFeature.upsert({ where: { key: feature.key }, update: { ...feature, isActive: true }, create: feature }))) }
async function ensureTenantCoreMenuGrants(tenantId: string) { await ensureMenuFeaturesSeeded(); const core = await prisma.menuFeature.findMany({ where: { isCore: true, isActive: true } }); await Promise.all(core.map((f) => prisma.tenantMenuGrant.upsert({ where: { tenantId_menuFeatureId: { tenantId, menuFeatureId: f.id } }, update: { isEnabled: true }, create: { tenantId, menuFeatureId: f.id, isEnabled: true } }))) }

type ClerkUserSnapshot = { id: string; firstName: string | null; lastName: string | null; imageUrl: string; emailAddresses: Array<{ id: string; emailAddress: string }>; primaryEmailAddressId: string | null }
const clerkUserCache = new Map<string, { user: ClerkUserSnapshot; expiresAt: number }>()
const userSessionCache = new Map<string, { user: User; expiresAt: number }>()
const DEFAULT_USER_CACHE_TTL_MS = 5 * 60 * 1000
const configuredUserCacheTtlMs = Number(process.env.USER_AUTH_CACHE_TTL_MS ?? DEFAULT_USER_CACHE_TTL_MS)
const userAuthCacheTtlMs = Number.isFinite(configuredUserCacheTtlMs) && configuredUserCacheTtlMs > 0 ? configuredUserCacheTtlMs : DEFAULT_USER_CACHE_TTL_MS
function getCachedMapEntry<T>(cache: Map<string, { expiresAt: number } & T>, key: string) { const cached = cache.get(key); if (!cached) return undefined; if (cached.expiresAt > Date.now()) return cached; cache.delete(key); return undefined }
async function getCachedClerkUser(clerkUserId: string): Promise<ClerkUserSnapshot> { const cached = getCachedMapEntry(clerkUserCache, clerkUserId); if (cached) return cached.user; const user = await clerk.users.getUser(clerkUserId) as ClerkUserSnapshot; clerkUserCache.set(clerkUserId, { user, expiresAt: Date.now() + userAuthCacheTtlMs }); return user }
function getDefaultTenantName(clerkUser: ClerkUserSnapshot) { const fullName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ').trim(); const email = clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId); return fullName || email?.emailAddress || `User ${clerkUser.id}` }
function getDefaultTenantSlug(clerkUser: ClerkUserSnapshot) { return toSlug(getDefaultTenantName(clerkUser)) || toSlug(clerkUser.id) || 'tenant' }
function getUserDisplayName(user: Pick<User, 'firstName' | 'lastName' | 'email'> | null | undefined, fallback = 'Unknown user') { const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim(); return fullName || user?.email || fallback }
async function getDefaultBillingPlanId() { const existing = await prisma.billingPlan.findFirst({ where: { isDefault: true, isActive: true }, orderBy: { createdAt: 'asc' } }); if (existing) return existing.id; const plan = await prisma.billingPlan.upsert({ where: { slug: 'free' }, update: { isDefault: true, isActive: true }, create: { slug: 'free', name: 'Free', description: 'Default free plan for newly registered accounts', monthlyPriceCents: 0, currency: 'USD', clickLimit: 1000, capiEventLimit: 1000, eapiEventLimit: 1000, campaignDatasetLimit: 2, isDefault: true, isActive: true } }); return plan.id }
async function getTenantPlanOrDefault(tenantId: string) { const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, include: { billingPlan: true } }); if (!tenant) return null; if (tenant.billingPlan) return tenant.billingPlan; const billingPlanId = await getDefaultBillingPlanId(); return (await prisma.tenant.update({ where: { id: tenantId }, data: { billingPlanId }, include: { billingPlan: true } })).billingPlan }
async function getCurrentBillingUsage(tenantId: string) { const periodStart = new Date(); periodStart.setUTCDate(1); periodStart.setUTCHours(0, 0, 0, 0); const [clicks, capiEvents, eapiEvents] = await Promise.all([prisma.clickEvent.count({ where: excludeTrackingScriptViewContentClicks({ tenantId, createdAt: { gte: periodStart } }) }), prisma.capiEvent.count({ where: { tenantId, createdAt: { gte: periodStart } } }), prisma.affiliateConversionEvent.count({ where: { tenantId, createdAt: { gte: periodStart } } })]); return { periodStart, clicks, capiEvents, eapiEvents } }
async function assertBillingLimit(tenantId: string, metric: 'clicks' | 'capiEvents' | 'eapiEvents') { const plan = await getTenantPlanOrDefault(tenantId); if (!plan) throw new Error('Billing plan not found'); const usage = await getCurrentBillingUsage(tenantId); const limit = metric === 'clicks' ? plan.clickLimit : metric === 'capiEvents' ? plan.capiEventLimit : plan.eapiEventLimit; if (usage[metric] >= limit) throw new Error(`Billing limit exceeded: ${metric} ${usage[metric]}/${limit} for plan ${plan.name}`); return { plan, usage } }

async function requireUser(req: FastifyRequest) {
  if (!isClerkConfigured()) throw new Error('CLERK_SECRET_KEY is not configured')
  const token = getBearerToken(req); if (!token) throw new Error('Missing Clerk bearer token')
  const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY, clockSkewInMs: clerkJwtClockSkewInMs })
  const clerkUserId = payload.sub; if (!clerkUserId) throw new Error('Invalid Clerk token')
  const cached = getCachedMapEntry(userSessionCache, clerkUserId); if (cached) return cached.user
  const existingUser = await prisma.user.findUnique({ where: { clerkUserId }, include: { tenant: true } })
  if (existingUser?.tenant) { userSessionCache.set(clerkUserId, { user: existingUser, expiresAt: Date.now() + userAuthCacheTtlMs }); return existingUser }
  const clerkUser = await getCachedClerkUser(clerkUserId)
  const primaryEmail = clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)
  const tenantSlug = getDefaultTenantSlug(clerkUser)
  const user = await prisma.user.upsert({ where: { clerkUserId }, update: { email: primaryEmail?.emailAddress, firstName: clerkUser.firstName, lastName: clerkUser.lastName, imageUrl: clerkUser.imageUrl }, create: { clerkUserId, email: primaryEmail?.emailAddress, firstName: clerkUser.firstName, lastName: clerkUser.lastName, imageUrl: clerkUser.imageUrl, tenant: { create: { slug: tenantSlug, name: getDefaultTenantName(clerkUser), billingPlanId: await getDefaultBillingPlanId() } } }, include: { tenant: true } })
  if (!user.tenant) { const tenant = await prisma.tenant.create({ data: { ownerUserId: user.id, slug: tenantSlug, name: getDefaultTenantName(clerkUser), billingPlanId: await getDefaultBillingPlanId() } }); await ensureTenantCoreMenuGrants(tenant.id) } else await ensureTenantCoreMenuGrants(user.tenant.id)
  userSessionCache.set(clerkUserId, { user, expiresAt: Date.now() + userAuthCacheTtlMs })
  return user
}
function requireAuthenticated(req: FastifyRequest) { const u = (req as Partial<AuthenticatedRequest>).currentUser; if (!u) throw new Error('Unauthorized'); return u }
async function assertTenantAccess(userId: string, tenantId: string) { const tenant = await prisma.tenant.findFirst({ where: { id: tenantId, ownerUserId: userId } }); if (!tenant) throw new Error('Tenant not found or access denied'); return tenant }
function isSuperAdmin(user: User) { const emails = new Set([...parseEnvList(process.env.SUPERADMIN_EMAILS), ...parseEnvList(process.env.SUPER_ADMIN_EMAILS), ...parseEnvList(process.env.ADMIN_EMAILS)].map((x) => x.toLowerCase())); const ids = new Set([...parseEnvList(process.env.SUPERADMIN_CLERK_USER_IDS), ...parseEnvList(process.env.SUPER_ADMIN_CLERK_USER_IDS), ...parseEnvList(process.env.ADMIN_CLERK_USER_IDS)].map((x) => x.toLowerCase())); return Boolean((user.email && emails.has(user.email.toLowerCase())) || ids.has(user.clerkUserId.toLowerCase())) }
function requireSuperAdmin(req: FastifyRequest) { const u = requireAuthenticated(req); if (!isSuperAdmin(u)) throw new Error('Super admin access denied'); return u }
async function deleteClerkUserAccount(clerkUserId: string) { userSessionCache.delete(clerkUserId); clerkUserCache.delete(clerkUserId); if (!isClerkConfigured()) return false; try { await clerk.users.deleteUser(clerkUserId); return true } catch (error) { const status = (error as AnyRecord)?.status ?? (error as AnyRecord)?.statusCode; if (status !== 404) app.log.warn({ error, clerkUserId }, 'Failed to delete Clerk user'); return false } }
async function deleteRegisteredUserAccount(target: Pick<User, 'id' | 'clerkUserId'> & { tenant?: { id: string } | null }) {
  const tenantId = target.tenant?.id
  await prisma.$transaction(async (tx) => {
    if (tenantId) {
      await tx.capiEvent.deleteMany({ where: { tenantId } })
      await tx.affiliateConversionEvent.deleteMany({ where: { tenantId } })
      await tx.clickEvent.deleteMany({ where: { tenantId } })
      await tx.campaignDataset.deleteMany({ where: { tenantId } })
      await tx.trackingLink.deleteMany({ where: { tenantId } })
      await tx.brand.deleteMany({ where: { tenantId } })
      await tx.dataset.deleteMany({ where: { tenantId } })
      await tx.campaign.deleteMany({ where: { tenantId } })
      await tx.affiliatePlatform.deleteMany({ where: { tenantId } })
      await tx.reportSchedule.deleteMany({ where: { tenantId } })
      await tx.websiteDomain.deleteMany({ where: { tenantId } })
      await tx.tenantMenuGrant.deleteMany({ where: { tenantId } })
      await tx.activityLog.deleteMany({ where: { tenantId } })
      await tx.tenant.deleteMany({ where: { id: tenantId } })
    }
    await tx.user.deleteMany({ where: { id: target.id } })
  })
  const clerkDeleted = await deleteClerkUserAccount(target.clerkUserId)
  return { clerkDeleted }
}

function serializeTenant<T extends AnyRecord>(tenant: T) { return tenant }
function serializeDataset<T extends { accessToken?: string | null }>(dataset: T) { return { ...dataset, accessToken: maskSecret(dataset.accessToken) } }
function serializeAffiliatePlatform<T extends { webhookToken?: string | null; slug?: string | null; trackingParamKey?: string | null; name?: string | null }>(platform: T) { const definition = getSupportedAffiliatePlatform(platform.slug ?? '') ?? getSupportedAffiliatePlatform(platform.trackingParamKey ?? '') ?? getSupportedAffiliatePlatform(platform.name ?? ''); return { ...platform, platformKey: definition?.key ?? null, platformLabel: definition?.label ?? platform.name ?? null, webhookToken: maskSecret(platform.webhookToken) } }
function serializeClick(e: AnyRecord) { return { ...e, id: e.id.toString() } }
function serializeCapi(e: AnyRecord) { return { ...e, id: e.id.toString(), clickEventId: e.clickEventId.toString(), source: e.source ?? 'click', sourceId: e.sourceId ?? '', clickEvent: e.clickEvent ? { ...e.clickEvent, id: e.clickEvent.id.toString() } : null } }
function serializeMoneyValue(value: unknown) { return value === null || value === undefined ? null : String(value) }
function toNumberAmount(value: unknown) { const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0 }

type ActivityLogLevelInput = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
const activityLogLevels = new Set<ActivityLogLevelInput>(['DEBUG', 'INFO', 'WARN', 'ERROR'])

function compactRecord<T extends AnyRecord>(value: T): AnyRecord { return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined && entry !== '')) }
function toJsonSafe(value: unknown): unknown { if (value === null || value === undefined) return value; if (typeof value === 'bigint') return value.toString(); if (value instanceof Date) return value.toISOString(); if (Array.isArray(value)) return value.map(toJsonSafe); if (typeof value === 'object') return Object.fromEntries(Object.entries(value as AnyRecord).filter(([, entry]) => entry !== undefined).map(([key, entry]) => [key, toJsonSafe(entry)])); return value }
function normalizeActivityLogLevel(value: unknown) { const level = typeof value === 'string' ? value.trim().toUpperCase() : ''; return activityLogLevels.has(level as ActivityLogLevelInput) ? level as ActivityLogLevelInput : undefined }
function serializeActivityLog(e: AnyRecord) { return { ...e, id: e.id.toString() } }
async function createActivityLog(input: { tenantId: string; level?: ActivityLogLevelInput; source: string; eventType: string; message: string; entityType?: string; entityId?: string | number | bigint | null; metadata?: unknown }) { try { await prisma.$executeRawUnsafe('INSERT INTO "ActivityLog" ("tenantId", "level", "source", "eventType", "message", "entityType", "entityId", "metadata") VALUES ($1, $2::"ActivityLogLevel", $3, $4, $5, $6, $7, $8::jsonb)', input.tenantId, input.level ?? 'INFO', input.source, input.eventType, input.message, input.entityType ?? null, input.entityId === null || input.entityId === undefined ? null : String(input.entityId), input.metadata === undefined ? null : JSON.stringify(toJsonSafe(input.metadata))) } catch (error) { app.log.warn({ error, tenantId: input.tenantId, eventType: input.eventType }, 'Failed to write activity log') } }
function getHeaderString(req: FastifyRequest, name: string) { const value = req.headers[name.toLowerCase()]; return Array.isArray(value) ? value[0] : typeof value === 'string' && value.trim() ? value.trim() : undefined }
const isFilledPayloadValue = isSharedFilledPayloadValue
const normalizePayloadLookupKey = normalizeSharedPayloadLookupKey
function getPayloadValue(payload: AnyRecord, keys: string[]) { return getSharedPayloadValue(payload, keys) }
function getPayloadString(payload: AnyRecord, keys: string[]) { return getSharedPayloadString(payload, keys) }
function getPayloadMoney(payload: AnyRecord, keys: string[]) { const value = getPayloadValue(payload, keys); if (typeof value === 'number' && Number.isFinite(value)) return String(value); if (typeof value === 'string' && value.trim()) { const normalized = value.trim().replace(/,/g, ''); if (Number.isFinite(Number(normalized))) return normalized; const parsed = parseMoneyNumber(value); return parsed === undefined ? undefined : String(parsed) } return undefined }
function parseCsvListValue(value: unknown): string[] { if (Array.isArray(value)) return value.flatMap(parseCsvListValue); if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean); if (typeof value === 'number' || typeof value === 'boolean') return [String(value)]; return [] }
function getRecordValueCaseInsensitive(record: AnyRecord, keys: string[]) { const normalizedKeys = new Set(keys.map(normalizePayloadLookupKey)); const match = Object.entries(record).find(([key, value]) => normalizedKeys.has(normalizePayloadLookupKey(key)) && isFilledPayloadValue(value)); return match?.[1] }
function getPlainRecord(value: unknown): AnyRecord | null { return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : null }
function normalizeAffiliateWebhookPayload(rawPayload: unknown): AnyRecord {
  const source = Array.isArray(rawPayload) ? rawPayload[0] : rawPayload
  const record = getPlainRecord(source)
  if (!record) return {}
  const query = getPlainRecord(record.query)
  const body = getPlainRecord(record.body)
  if (!query && !body) return record
  const passthrough = { ...record }
  delete passthrough.headers
  delete passthrough.params
  delete passthrough.query
  delete passthrough.body
  const headers = getPlainRecord(record.headers)
  return compactRecord({ ...passthrough, ...(query ?? {}), ...(body ?? {}), userAgent: headers ? getRecordValueCaseInsensitive(headers, ['user-agent', 'userAgent']) : undefined })
}
function sanitizeWebhookPayload(payload: AnyRecord) { const sanitized = { ...payload }; delete sanitized.token; delete sanitized.webhookToken; delete sanitized.accessToken; return sanitized }
function extractConversionMoney(payload: AnyRecord) {
  const partnerStackMoney = getPartnerStackConversionMoney(payload)
  if (partnerStackMoney) return {
    spendAmount: partnerStackMoney.spendAmount,
    payoutAmount: partnerStackMoney.payoutAmount,
    commissionAmount: partnerStackMoney.commissionAmount,
    currency: String(partnerStackMoney.currency ?? 'USD').toUpperCase()
  }

  const isImpact = isImpactPostbackPayload(payload)
  return {
    spendAmount: getPayloadMoney(payload, isImpact ? ['Amount', 'amount', 'spendAmount', 'spend_amount', 'spend', 'cost', 'ad_spend'] : ['spendAmount', 'spend_amount', 'spend', 'cost', 'ad_spend']),
    payoutAmount: getPayloadMoney(payload, isImpact ? ['Payout', 'payout', 'payoutAmount', 'payout_amount', 'commissionAmount', 'commission_amount', 'commission'] : ['payoutAmount', 'payout_amount', 'payout', 'revenue', 'sale_amount', 'amount', 'value']),
    commissionAmount: getPayloadMoney(payload, ['commissionAmount', 'commission_amount', 'commission', 'profit']),
    currency: (getPayloadString(payload, ['currency', 'currencyCode', 'currency_code']) ?? 'USD').toUpperCase()
  }
}
function extractAffiliateRefIds(platform: { slug?: string | null; name?: string | null; trackingParamKey?: string | null }, payload: AnyRecord) {
  const supported = getSupportedAffiliatePlatform(platform.slug ?? '') ?? getSupportedAffiliatePlatform(platform.trackingParamKey ?? '') ?? getSupportedAffiliatePlatform(platform.name ?? '')
  const partnerStackCustomerKey = supported?.key === 'partnerstack' ? getPartnerStackCustomerId(payload) : undefined
  const impactRefClickId = supported?.key === 'impact' ? getImpactRefClickId(payload) : undefined
  const affiliateRefId = partnerStackCustomerKey ?? impactRefClickId
  const affiliateRefSource = partnerStackCustomerKey ? 'partnerstack_customer_key' : impactRefClickId ? 'impact_ref_click_id' : undefined
  return { affiliateRefId, affiliateRefSource, partnerStackCustomerKey, impactRefClickId }
}
type AffiliateRefIds = ReturnType<typeof extractAffiliateRefIds>
const clickAttributionInclude = { campaign: true, trackingLink: { include: { campaign: true, affiliatePlatform: true, brand: { include: { affiliatePlatform: true } } } } } as const
function hasAffiliateRef(refs: AffiliateRefIds): refs is AffiliateRefIds & { affiliateRefId: string; affiliateRefSource: string } { return Boolean(refs.affiliateRefId && refs.affiliateRefSource) }
function getAffiliateRefAttributionWhere(platform: { tenantId: string; id: string }, refs: AffiliateRefIds) {
  if (!hasAffiliateRef(refs)) return null
  return { tenantId_affiliatePlatformId_affiliateRefSource_affiliateRefId: { tenantId: platform.tenantId, affiliatePlatformId: platform.id, affiliateRefSource: refs.affiliateRefSource, affiliateRefId: refs.affiliateRefId } }
}
async function findClickEventByUuid(tenantId: string, clickUuid?: string) {
  return clickUuid ? prisma.clickEvent.findFirst({ where: { tenantId, clickUuid }, include: clickAttributionInclude }) : null
}
async function findAffiliateRefAttribution(platform: { tenantId: string; id: string }, refs: AffiliateRefIds) {
  const where = getAffiliateRefAttributionWhere(platform, refs)
  return where ? prisma.affiliateRefAttribution.findUnique({ where, include: { clickEvent: { include: clickAttributionInclude } } }) : null
}
async function upsertAffiliateRefAttribution(platform: { tenantId: string; id: string }, refs: AffiliateRefIds, clickEvent: AnyRecord, conversion: AnyRecord | null, attributionMethod: string | undefined, eventMatch: { eventName?: string; eventRule?: string }) {
  const where = getAffiliateRefAttributionWhere(platform, refs)
  if (!where || !clickEvent) return null
  const now = new Date()
  const firstSeenAt = conversion?.createdAt instanceof Date ? conversion.createdAt : now
  const metadata = compactRecord({ source: 'affiliate_webhook', attributionMethod, conversionEventId: conversion?.id?.toString(), eventName: eventMatch.eventName, eventRule: eventMatch.eventRule, clickUuid: clickEvent.clickUuid })
  return prisma.affiliateRefAttribution.upsert({
    where,
    create: { tenantId: platform.tenantId, affiliatePlatformId: platform.id, affiliateRefSource: refs.affiliateRefSource!, affiliateRefId: refs.affiliateRefId!, clickEventId: clickEvent.id, clickUuid: clickEvent.clickUuid, firstSeenAt, lastSeenAt: now, learnedAt: now, lastMatchedAt: now, learnedFromConversionEventId: conversion?.id, metadata: metadata as Prisma.InputJsonValue },
    update: { clickEventId: clickEvent.id, clickUuid: clickEvent.clickUuid, lastSeenAt: now, lastMatchedAt: now, learnedFromConversionEventId: conversion?.id, metadata: metadata as Prisma.InputJsonValue }
  })
}
async function backfillAffiliateRefConversions(platform: { tenantId: string; id: string }, refs: AffiliateRefIds, clickEvent: AnyRecord, attributionSnapshot: AnyRecord) {
  if (!hasAffiliateRef(refs) || !clickEvent) return []
  const rows = await prisma.affiliateConversionEvent.findMany({
    where: { tenantId: platform.tenantId, affiliatePlatformId: platform.id, affiliateRefSource: refs.affiliateRefSource, affiliateRefId: refs.affiliateRefId, OR: [{ clickEventId: null }, { clickUuid: null }] },
    select: { id: true, eventName: true, rawPayload: true }
  })
  if (!rows.length) return []
  await prisma.affiliateConversionEvent.updateMany({
    where: { id: { in: rows.map((row) => row.id) } },
    data: { clickEventId: clickEvent.id, clickUuid: clickEvent.clickUuid, attributionSnapshot: attributionSnapshot as Prisma.InputJsonValue }
  })
  return rows
}
function getBackfilledConversionEventNames(platform: { slug?: string | null; name?: string | null; trackingParamKey?: string | null; eventMapping?: unknown; defaultEventName?: string | null }, row: AnyRecord) {
  const payload = getPlainRecord(row.rawPayload) ?? {}
  const match = Object.keys(payload).length ? resolvePlatformEventName(platform, payload) : null
  const primaryEventName = row.eventName ?? match?.eventName
  return primaryEventName ? resolveImpactPostbackEventNames(platform, payload, primaryEventName) : []
}
function extractClickUuid(payload: AnyRecord, trackingParamKey: string) {
  return getPartnerStackClickUuid(payload) ?? getPayloadString(payload, ['clickUuid', 'click_uuid', 'click_id', 'subid', 'sub_id', 'subid1', 'sid1', 'sid', 'fp_sid', trackingParamKey])
}
function resolveImpactPostbackEventNames(platform: { slug?: string | null; name?: string | null; trackingParamKey?: string | null }, payload: AnyRecord, primaryEventName: string) {
  const supported = getSupportedAffiliatePlatform(platform.slug ?? '') ?? getSupportedAffiliatePlatform(platform.trackingParamKey ?? '') ?? getSupportedAffiliatePlatform(platform.name ?? '')
  return supported?.key === 'impact' ? resolveImpactEventNames(payload, primaryEventName) : [primaryEventName]
}
function resolvePlatformEventName(platform: { slug?: string | null; name?: string | null; trackingParamKey?: string | null; eventMapping?: unknown; defaultEventName?: string | null }, payload: AnyRecord) {
  const supported = getSupportedAffiliatePlatform(platform.slug ?? '') ?? getSupportedAffiliatePlatform(platform.trackingParamKey ?? '') ?? getSupportedAffiliatePlatform(platform.name ?? '')
  if (supported?.key === 'impact') {
    const impactMatch = getImpactEventMatch(payload)
    if (impactMatch) return impactMatch
  }
  if (supported?.key === 'partnerstack') {
    const mappingMatch = resolveAffiliateEventName(payload, platform.eventMapping, platform.defaultEventName ?? supported.defaultEventName)
    if (mappingMatch.eventRule) return mappingMatch
    const partnerStackMatch = getPartnerStackEventMatch(payload)
    return partnerStackMatch ?? mappingMatch
  }
  if (supported) return { eventName: normalizeEventName(platform.defaultEventName ?? supported.defaultEventName) }
  const impactMatch = getImpactEventMatch(payload)
  if (impactMatch) return impactMatch
  return resolveAffiliateEventName(payload, platform.eventMapping, platform.defaultEventName)
}
function buildAffiliatePostbackIdempotencyKey(req: FastifyRequest, platformId: string, payload: AnyRecord, clickUuid: string | undefined, eventName: string | undefined) {
  const partnerStackKey = getPartnerStackIdempotencyKey(payload, eventName, clickUuid)
  if (partnerStackKey) return partnerStackKey
  const explicit = getHeaderString(req, 'x-idempotency-key') ?? getPayloadString(payload, ['idempotencyKey', 'idempotency_key'])
  const networkId = getPayloadString(payload, ['conversionId', 'conversion_id', 'transactionId', 'transaction_id', 'orderId', 'order_id', 'saleId', 'sale_id', 'leadId', 'lead_id', 'eventId', 'event_id', 'postbackId', 'postback_id', 'id'])
  const basis = explicit ? { type: 'explicit', explicit } : networkId ? { type: 'network', networkId } : { type: 'payload', clickUuid, eventName, payload }
  return 'v1:' + sha256Hex(stableStringify({ platformId, ...basis }))
}
function buildCapiEnrichment(payload: AnyRecord, money: ReturnType<typeof extractConversionMoney>, clickUuid: string | undefined, eventName: string | undefined) {
  const partnerStackEnrichment = getPartnerStackCapiEnrichment(payload, eventName, clickUuid)
  if (partnerStackEnrichment) return partnerStackEnrichment
  const contentIds = parseCsvListValue(getPayloadValue(payload, ['contentIds', 'content_ids', 'contentId', 'content_id', 'productId', 'product_id', 'sku', 'offerId', 'offer_id']))
  const value = getImpactCapiValue(payload) ?? getPayloadMoney(payload, ['value', 'amount', 'sale_amount', 'revenue', 'payout', 'payoutAmount', 'payout_amount']) ?? money.payoutAmount ?? money.commissionAmount ?? money.spendAmount
  const customerEmail = getPayloadString(payload, ['customerEmail', 'customer_email', 'email'])
  const customerId = getPayloadString(payload, ['customerId', 'customer_id', 'userId', 'user_id', 'externalId', 'external_id'])
  const impactRefClickId = getImpactRefClickId(payload)
  const impactEventDate = isImpactPostbackPayload(payload) ? getPostbackEventDate(payload) : null
  return compactRecord({ value: value !== undefined ? toNumberAmount(value) : undefined, currency: money.currency, contentId: contentIds[0], contentIds: contentIds.length ? contentIds : undefined, contentName: getPayloadString(payload, ['contentName', 'content_name', 'productName', 'product_name', 'offerName', 'offer_name', 'product', 'offer']), contentType: getPayloadString(payload, ['contentType', 'content_type', 'productType', 'product_type']) ?? (contentIds.length ? 'product' : undefined), contentCategory: getPayloadString(payload, ['contentCategory', 'content_category', 'category']), orderId: getPayloadString(payload, ['orderId', 'order_id', 'transactionId', 'transaction_id']), customerId, customerEmail, customerPhone: getPayloadString(payload, ['customerPhone', 'customer_phone', 'phone']), firstName: getPayloadString(payload, ['firstName', 'first_name', 'fn']), lastName: getPayloadString(payload, ['lastName', 'last_name', 'ln']), city: getPayloadString(payload, ['city', 'ct']), state: getPayloadString(payload, ['state', 'st']), zip: getPayloadString(payload, ['zip', 'postalCode', 'postal_code', 'zp']), country: getPayloadString(payload, ['country', 'countryCode', 'country_code']), clickUuid, eventName, impactRefClickId, eventTime: impactEventDate?.date.toISOString(), eventTimeMs: impactEventDate?.date.getTime() })
}
function buildAttributionSnapshot(click: AnyRecord | null | undefined, platform?: AnyRecord | null, attributionMethod?: string): AnyRecord { if (!click) return compactRecord({ matched: false, attributionMethod, matchedByRefId: attributionMethod === 'affiliate_ref_id', affiliatePlatform: platform ? serializeAffiliatePlatform(platform) : null }); const trackingLink = serializeTrackingLinkForAttribution(click.trackingLink); const brand = trackingLink?.brand ?? null; const campaign = click.campaign ?? trackingLink?.campaign ?? null; const affiliatePlatform = trackingLink?.affiliatePlatform ?? brand?.affiliatePlatform ?? (platform ? serializeAffiliatePlatform(platform) : null); const method = attributionMethod ?? 'direct_click_uuid'; const snapshot = { matched: true, attributionMethod: method, matchedByRefId: method === 'affiliate_ref_id', clickEvent: { id: click.id?.toString(), tenantId: click.tenantId, campaignId: click.campaignId, trackingLinkId: click.trackingLinkId, clickUuid: click.clickUuid, ip: click.ip, userAgent: click.userAgent, referrer: click.referrer, fbclid: click.fbclid, ttclid: click.ttclid, fbp: click.fbp, fbc: click.fbc, ttp: click.ttp, createdAt: click.createdAt }, campaign, trackingLink, brand, affiliatePlatform }; return toJsonSafe(snapshot) as AnyRecord }
function normalizeReportFrequency(value: unknown) { const frequency = typeof value === 'string' ? value.trim().toLowerCase() : 'weekly'; return ['daily', 'weekly', 'monthly'].includes(frequency) ? frequency : 'weekly' }
function getNextReportRunAt(frequency: string, from = new Date()) { const next = new Date(from); next.setUTCSeconds(0, 0); if (frequency === 'daily') next.setUTCDate(next.getUTCDate() + 1); else if (frequency === 'monthly') next.setUTCMonth(next.getUTCMonth() + 1); else next.setUTCDate(next.getUTCDate() + 7); return next }
function csvEscape(value: unknown) { if (value === null || value === undefined) return ''; const text = value instanceof Date ? value.toISOString() : typeof value === 'object' ? JSON.stringify(toJsonSafe(value)) : String(value); return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text }
function toCsv(headers: string[], rows: AnyRecord[]) { return [headers.join(','), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(','))].join('\n') }
function makeComparisonRange(q: AnyRecord) { const start = parseDateQuery(q.startDate ?? q.from); const end = parseDateQuery(q.endDate ?? q.to, true); if (!start || !end || end <= start) return null; const duration = end.getTime() - start.getTime(); const previousEnd = new Date(start.getTime() - 1); const previousStart = new Date(previousEnd.getTime() - duration); return { current: { start, end }, previous: { start: previousStart, end: previousEnd } } }
async function buildSummaryForPeriod(userId: string, q: AnyRecord) { const clickWhere = buildClickEventWhere(userId, q); const capiWhere = buildCapiEventWhere(userId, q); const conversionWhere = await buildConversionEventWhere(userId, q); const [clicks, capiTotal, capiDelivered, capiFailed, conversionRows] = await Promise.all([prisma.clickEvent.count({ where: clickWhere }), prisma.capiEvent.count({ where: capiWhere }), prisma.capiEvent.count({ where: { ...capiWhere, status: 'DELIVERED' } }), prisma.capiEvent.count({ where: { ...capiWhere, status: 'FAILED' } }), prisma.affiliateConversionEvent.findMany({ where: conversionWhere, include: { affiliatePlatform: true }, orderBy: { createdAt: 'desc' } })]); const conversions = await attachAttributionToConversions(conversionRows); const summary: AnyRecord = { clicks, conversions: conversions.length, attributedConversions: 0, unattributedConversions: 0, capiTotal, capiDelivered, capiFailed, conversionRate: 0, attributedConversionRate: 0, revenue: 0, payout: 0, commission: 0, spend: 0 }; for (const conversion of conversions as AnyRecord[]) { addConversionMoney(summary, conversion); if (conversion.attribution?.matched) summary.attributedConversions += 1 } summary.unattributedConversions = summary.conversions - summary.attributedConversions; summary.conversionRate = summary.clicks ? summary.conversions / summary.clicks : 0; summary.attributedConversionRate = summary.clicks ? summary.attributedConversions / summary.clicks : 0; return summary }
function metricDelta(current: number, previous: number) { return { current, previous, change: current - previous, changeRate: previous ? (current - previous) / previous : current ? 1 : 0 } }
async function buildPeriodComparison(userId: string, q: AnyRecord, currentSummary: AnyRecord) { const range = makeComparisonRange(q); if (!range) return null; const previousQuery = { ...q, startDate: range.previous.start.toISOString(), endDate: range.previous.end.toISOString(), from: undefined, to: undefined }; const previousSummary = await buildSummaryForPeriod(userId, previousQuery); return { currentPeriod: { startDate: range.current.start.toISOString(), endDate: range.current.end.toISOString() }, previousPeriod: { startDate: range.previous.start.toISOString(), endDate: range.previous.end.toISOString() }, metrics: { clicks: metricDelta(currentSummary.clicks, previousSummary.clicks), conversions: metricDelta(currentSummary.conversions, previousSummary.conversions), revenue: metricDelta(currentSummary.revenue, previousSummary.revenue), conversionRate: metricDelta(currentSummary.conversionRate, previousSummary.conversionRate), capiDelivered: metricDelta(currentSummary.capiDelivered, previousSummary.capiDelivered) }, previousSummary } }

function parseDateQuery(value: unknown, endOfDay = false) { const text = optionalQueryString(value); if (!text) return undefined; const date = new Date(text); if (Number.isNaN(date.getTime())) throw new Error(`${endOfDay ? 'endDate' : 'startDate'} must be a valid date`); if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(text)) date.setHours(23, 59, 59, 999); return date }
function getCreatedAtFilter(q: AnyRecord) { const gte = parseDateQuery(q.startDate ?? q.from); const lte = parseDateQuery(q.endDate ?? q.to, true); return gte || lte ? { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } : undefined }
function hasKeys(value: AnyRecord) { return Object.keys(value).length > 0 }
function containsInsensitive(value: string) { return { contains: value, mode: 'insensitive' } }
function getEventFilters(q: AnyRecord) { return { tenantId: optionalQueryString(q.tenantId), search: optionalQueryString(q.search), campaignId: optionalQueryString(q.campaignId), brandId: optionalQueryString(q.brandId), trackingLinkId: optionalQueryString(q.trackingLinkId), affiliatePlatformId: optionalQueryString(q.affiliatePlatformId) ?? optionalQueryString(q.platformId), status: optionalQueryString(q.status) } }
function buildTrackingLinkFilter(q: AnyRecord) { const f = getEventFilters(q); const trackingLink: AnyRecord = {}; if (f.brandId) trackingLink.brandId = f.brandId; if (f.affiliatePlatformId) trackingLink.affiliatePlatformId = f.affiliatePlatformId; return trackingLink }
function addCreatedAtFilter(where: AnyRecord, q: AnyRecord) { const createdAt = getCreatedAtFilter(q); if (createdAt) where.createdAt = createdAt }
function buildClickEventWhere(userId: string, q: AnyRecord, options: { includeSearch?: boolean; includeDate?: boolean; includeTrackingScriptViewContent?: boolean } = {}) { const f = getEventFilters(q); const includeSearch = options.includeSearch ?? true; const includeDate = options.includeDate ?? true; const includeTrackingScriptViewContent = options.includeTrackingScriptViewContent ?? false; const where: AnyRecord = { tenant: { ownerUserId: userId } }; if (!includeTrackingScriptViewContent) excludeTrackingScriptViewContentClicks(where); if (f.tenantId) where.tenantId = f.tenantId; if (f.campaignId) where.campaignId = f.campaignId; if (f.trackingLinkId) where.trackingLinkId = f.trackingLinkId; if (includeDate) addCreatedAtFilter(where, q); const trackingLink = buildTrackingLinkFilter(q); if (hasKeys(trackingLink)) where.trackingLink = trackingLink; if (includeSearch && f.search) where.OR = [{ clickUuid: containsInsensitive(f.search) }, { fbclid: containsInsensitive(f.search) }, { ttclid: containsInsensitive(f.search) }, { fbp: containsInsensitive(f.search) }, { fbc: containsInsensitive(f.search) }, { ip: containsInsensitive(f.search) }, { referrer: containsInsensitive(f.search) }, { trackingLink: { slug: containsInsensitive(f.search) } }]; return where }
function buildCapiEventWhere(userId: string, q: AnyRecord) { const f = getEventFilters(q); const where: AnyRecord = { tenant: { ownerUserId: userId } }; if (f.tenantId) where.tenantId = f.tenantId; addCreatedAtFilter(where, q); if (f.status) where.status = f.status.toUpperCase(); const clickEvent: AnyRecord = {}; if (f.campaignId) clickEvent.campaignId = f.campaignId; if (f.trackingLinkId) clickEvent.trackingLinkId = f.trackingLinkId; const trackingLink = buildTrackingLinkFilter(q); if (hasKeys(trackingLink)) clickEvent.trackingLink = trackingLink; if (hasKeys(clickEvent)) where.clickEvent = clickEvent; if (f.search) where.OR = [{ eventName: containsInsensitive(f.search) }, { lastError: containsInsensitive(f.search) }, { platform: containsInsensitive(f.search) }, { clickEvent: { clickUuid: containsInsensitive(f.search) } }, { clickEvent: { trackingLink: { slug: containsInsensitive(f.search) } } }]; return where }
async function getMatchingClickUuidsForConversionFilters(userId: string, q: AnyRecord) { const f = getEventFilters(q); if (!f.campaignId && !f.brandId && !f.trackingLinkId) return undefined; const rows = await prisma.clickEvent.findMany({ where: buildClickEventWhere(userId, q, { includeSearch: false, includeDate: false }), select: { clickUuid: true } }); return rows.map((row) => row.clickUuid) }
async function buildConversionEventWhere(userId: string, q: AnyRecord) {
  const f = getEventFilters(q)
  const where: AnyRecord = { tenant: { ownerUserId: userId } }
  const affiliateRefId = optionalQueryString(q.affiliateRefId) ?? optionalQueryString(q.refId)
  const affiliateRefSource = optionalQueryString(q.affiliateRefSource) ?? optionalQueryString(q.refSource)
  if (f.tenantId) where.tenantId = f.tenantId
  addCreatedAtFilter(where, q)
  if (f.affiliatePlatformId) where.affiliatePlatformId = f.affiliatePlatformId
  if (affiliateRefId) where.affiliateRefId = affiliateRefId
  if (affiliateRefSource) where.affiliateRefSource = affiliateRefSource
  if (f.search) where.OR = [{ clickUuid: containsInsensitive(f.search) }, { customerId: containsInsensitive(f.search) }, { customerEmail: containsInsensitive(f.search) }, { affiliateRefId: containsInsensitive(f.search) }, { affiliateRefSource: containsInsensitive(f.search) }, { partnerStackCustomerKey: containsInsensitive(f.search) }, { impactRefClickId: containsInsensitive(f.search) }, { eventName: containsInsensitive(f.search) }, { eventRule: containsInsensitive(f.search) }, { receivedMethod: containsInsensitive(f.search) }, { affiliatePlatform: { name: containsInsensitive(f.search) } }]
  const matchingClickUuids = await getMatchingClickUuidsForConversionFilters(userId, q)
  if (matchingClickUuids) where.clickUuid = { in: matchingClickUuids.length ? matchingClickUuids : ['__no_matching_click_uuid__'] }
  return where
}
function buildActivityLogSql(userId: string, q: AnyRecord) { const clauses = ['tenant."ownerUserId" = $1']; const params: unknown[] = [userId]; const add = (sql: string, value: unknown) => { params.push(value); clauses.push(sql.replace('?', `$${params.length}`)) }; const tenantId = optionalQueryString(q.tenantId); const source = optionalQueryString(q.source); const eventType = optionalQueryString(q.eventType); const entityType = optionalQueryString(q.entityType); const entityId = optionalQueryString(q.entityId); const search = optionalQueryString(q.search); const level = normalizeActivityLogLevel(q.level); const createdAt = getCreatedAtFilter(q); if (tenantId) add('log."tenantId" = ?', tenantId); if (source) add('log."source" = ?', source); if (eventType) add('log."eventType" = ?', eventType); if (entityType) add('log."entityType" = ?', entityType); if (entityId) add('log."entityId" = ?', entityId); if (level) add('log."level" = ?::"ActivityLogLevel"', level); if (createdAt?.gte) add('log."createdAt" >= ?', createdAt.gte); if (createdAt?.lte) add('log."createdAt" <= ?', createdAt.lte); if (search) { params.push(`%${search}%`); const ref = `$${params.length}`; clauses.push(`(log."message" ILIKE ${ref} OR log."eventType" ILIKE ${ref} OR log."source" ILIKE ${ref} OR log."entityType" ILIKE ${ref} OR log."entityId" ILIKE ${ref})`) } return { whereSql: `WHERE ${clauses.join(' AND ')}`, params } }
function serializeTrackingLinkForAttribution(link: AnyRecord | null | undefined): AnyRecord | null { if (!link) return null; const brand = link.brand ? { ...link.brand, affiliatePlatform: link.brand.affiliatePlatform ? serializeAffiliatePlatform(link.brand.affiliatePlatform) : link.brand.affiliatePlatform } : null; const affiliatePlatform = link.affiliatePlatform ? serializeAffiliatePlatform(link.affiliatePlatform) : brand?.affiliatePlatform ?? null; return { ...link, brand, affiliatePlatform } }
const postbackEventDateKeys = ['EventDate', 'eventDate', 'event_date', 'CreationDate', 'creationDate', 'creation_date', 'CreatedDate', 'createdDate', 'created_date', 'ConversionDate', 'conversionDate', 'conversion_date', 'TransactionDate', 'transactionDate', 'transaction_date', 'Timestamp', 'timestamp']
function getPostbackEventDate(payload: AnyRecord) {
  const partnerStackDate = getPartnerStackEventDate(payload)
  if (partnerStackDate) return partnerStackDate
  const keys = new Set(postbackEventDateKeys.map(normalizePayloadLookupKey))
  for (const [field, value] of Object.entries(payload)) {
    if (!keys.has(normalizePayloadLookupKey(field)) || !isFilledPayloadValue(value)) continue
    const raw = value instanceof Date ? value.toISOString() : String(value).trim()
    const date = new Date(raw)
    if (!Number.isNaN(date.getTime())) return { field, raw, date }
  }
  return null
}
function getPostbackFirstReceivedDate(payload: AnyRecord) {
  return isImpactPostbackPayload(payload) ? getPostbackEventDate(payload) : null
}
function getPostbackDelaySeconds(receivedAt: unknown, eventAt: unknown) { const received = receivedAt instanceof Date ? receivedAt : new Date(String(receivedAt)); const event = eventAt instanceof Date ? eventAt : new Date(String(eventAt)); if (Number.isNaN(received.getTime()) || Number.isNaN(event.getTime())) return null; return Math.round((received.getTime() - event.getTime()) / 1000) }
type PartnerStackMoneyInfo = AnyRecord & { transactionKey?: string; rewardKey?: string; orderAmount?: unknown; payoutAmount?: unknown; commissionAmount?: unknown; rewardStatus?: unknown }
type PartnerStackPairing = { pairedTransactionKeys: Set<string> }
type ConversionCapiTiming = { updatedAt: Date; status?: string | null }
function getPartnerStackMoneyInfo(payload: AnyRecord): PartnerStackMoneyInfo | null { return getPartnerStackConversionMoney(payload) as PartnerStackMoneyInfo | null }
function partnerStackPairKey(tenantId: unknown, affiliatePlatformId: unknown, transactionKey: unknown) { const key = typeof transactionKey === 'string' && transactionKey.trim() ? transactionKey.trim() : undefined; return typeof tenantId === 'string' && typeof affiliatePlatformId === 'string' && key ? `${tenantId}\u0000${affiliatePlatformId}\u0000${key}` : undefined }
function partnerStackTransactionIdempotencyKey(transactionKey: string) { return `partnerstack:transaction:${transactionKey}` }
function getPartnerStackPairingInfo(row: AnyRecord, payload: AnyRecord) { const money = getPartnerStackMoneyInfo(payload); const transactionKey = typeof money?.transactionKey === 'string' && money.transactionKey.trim() ? money.transactionKey.trim() : undefined; const pairKey = partnerStackPairKey(row.tenantId, row.affiliatePlatformId, transactionKey); if (!money || !transactionKey || !pairKey) return null; const idempotencyKey = typeof row.idempotencyKey === 'string' ? row.idempotencyKey : ''; const rewardKey = typeof money.rewardKey === 'string' && money.rewardKey.trim() ? money.rewardKey.trim() : undefined; const isReward = Boolean(rewardKey || idempotencyKey.startsWith('partnerstack:reward:')); const isTransaction = Boolean(!isReward && (idempotencyKey.startsWith('partnerstack:transaction:') || money.orderAmount !== undefined)); return { money, transactionKey, pairKey, isReward, isTransaction } }
async function buildPartnerStackPairing(rows: AnyRecord[]): Promise<PartnerStackPairing> {
  const pairedTransactionKeys = new Set<string>()
  const missingTransactionChecks = new Map<string, { tenantId: string; affiliatePlatformId: string; transactionKey: string; pairKey: string }>()

  for (const row of rows) {
    const payload = getPlainRecord(row.rawPayload) ?? {}
    const info = getPartnerStackPairingInfo(row, payload)
    if (!info) continue
    if (info.isTransaction) pairedTransactionKeys.add(info.pairKey)
    if (info.isReward && !pairedTransactionKeys.has(info.pairKey) && typeof row.tenantId === 'string' && typeof row.affiliatePlatformId === 'string') {
      missingTransactionChecks.set(info.pairKey, { tenantId: row.tenantId, affiliatePlatformId: row.affiliatePlatformId, transactionKey: info.transactionKey, pairKey: info.pairKey })
    }
  }

  const checks = [...missingTransactionChecks.values()].filter((check) => !pairedTransactionKeys.has(check.pairKey))
  if (checks.length) {
    const existingTransactions = await prisma.affiliateConversionEvent.findMany({
      where: { OR: checks.map((check) => ({ tenantId: check.tenantId, affiliatePlatformId: check.affiliatePlatformId, idempotencyKey: partnerStackTransactionIdempotencyKey(check.transactionKey) })) },
      select: { tenantId: true, affiliatePlatformId: true, idempotencyKey: true }
    })
    for (const transaction of existingTransactions) {
      const transactionKey = typeof transaction.idempotencyKey === 'string' && transaction.idempotencyKey.startsWith('partnerstack:transaction:') ? transaction.idempotencyKey.slice('partnerstack:transaction:'.length) : undefined
      const pairKey = partnerStackPairKey(transaction.tenantId, transaction.affiliatePlatformId, transactionKey)
      if (pairKey) pairedTransactionKeys.add(pairKey)
    }
  }

  return { pairedTransactionKeys }
}
function shouldSuppressPartnerStackRewardOrderAmount(row: AnyRecord, payload: AnyRecord, pairing?: PartnerStackPairing) { const info = pairing ? getPartnerStackPairingInfo(row, payload) : null; return Boolean(info?.isReward && pairing?.pairedTransactionKeys.has(info.pairKey)) }
function getPostbackAmount(payload: AnyRecord, e: AnyRecord, options: { suppressPartnerStackRewardOrderAmount?: boolean } = {}) { const partnerStackMoney = getPartnerStackMoneyInfo(payload); if (partnerStackMoney) return options.suppressPartnerStackRewardOrderAmount ? null : serializeMoneyValue(partnerStackMoney.orderAmount ?? partnerStackMoney.spendAmount ?? partnerStackMoney.payoutAmount); return serializeMoneyValue(getPayloadMoney(payload, ['Amount', 'amount', 'saleAmount', 'sale_amount', 'orderAmount', 'order_amount', 'customerAmount', 'customer_amount', 'value']) ?? e.spendAmount) }
function getPostbackPayout(payload: AnyRecord, e: AnyRecord) { const partnerStackMoney = getPartnerStackMoneyInfo(payload); if (partnerStackMoney) return serializeMoneyValue(partnerStackMoney.commissionAmount ?? partnerStackMoney.payoutAmount); return serializeMoneyValue(getPayloadMoney(payload, ['Payout', 'payout', 'payoutAmount', 'payout_amount', 'commissionAmount', 'commission_amount', 'commission']) ?? e.payoutAmount ?? e.commissionAmount) }
function getSerializedPayoutAmount(payload: AnyRecord, e: AnyRecord) { const partnerStackMoney = getPartnerStackMoneyInfo(payload); return serializeMoneyValue(partnerStackMoney ? partnerStackMoney.payoutAmount : e.payoutAmount) }
function getSerializedCommissionAmount(payload: AnyRecord, e: AnyRecord) { const partnerStackMoney = getPartnerStackMoneyInfo(payload); return serializeMoneyValue(partnerStackMoney ? partnerStackMoney.commissionAmount : e.commissionAmount) }
function serializeConversion(e: AnyRecord, click?: AnyRecord, pairing?: PartnerStackPairing, capiTiming?: ConversionCapiTiming) {
  const storedSnapshot = e.attributionSnapshot && typeof e.attributionSnapshot === 'object' ? e.attributionSnapshot as AnyRecord : null
  const rawPayload = getPlainRecord(e.rawPayload) ?? {}
  const postbackEventDate = getPostbackEventDate(rawPayload)
  const postbackFirstReceivedDate = getPostbackFirstReceivedDate(rawPayload)
  const firstReceivedAt = postbackFirstReceivedDate?.date ?? e.createdAt
  const partnerStackMoney = getPartnerStackMoneyInfo(rawPayload)
  const suppressRewardOrderAmount = shouldSuppressPartnerStackRewardOrderAmount(e, rawPayload, pairing)
  return {
    ...e,
    id: e.id.toString(),
    clickEventId: e.clickEventId ? e.clickEventId.toString() : null,
    spendAmount: serializeMoneyValue(e.spendAmount),
    payoutAmount: getSerializedPayoutAmount(rawPayload, e),
    commissionAmount: getSerializedCommissionAmount(rawPayload, e),
    partnerStackTransactionKey: partnerStackMoney?.transactionKey ?? null,
    partnerStackRewardKey: partnerStackMoney?.rewardKey ?? null,
    partnerStackRewardStatus: partnerStackMoney?.rewardStatus ?? null,
    affiliatePlatform: e.affiliatePlatform ? serializeAffiliatePlatform(e.affiliatePlatform) : null,
    attribution: storedSnapshot ?? buildAttributionSnapshot(click, e.affiliatePlatform),
    capiEnrichment: e.capiEnrichment ?? null,
    postbackAmount: getPostbackAmount(rawPayload, e, { suppressPartnerStackRewardOrderAmount: suppressRewardOrderAmount }),
    postbackPayout: getPostbackPayout(rawPayload, e),
    postbackEventAt: postbackEventDate ? postbackEventDate.date.toISOString() : null,
    postbackEventDateField: postbackEventDate?.field ?? null,
    postbackEventDateValue: postbackEventDate?.raw ?? null,
    firstReceivedAt: firstReceivedAt instanceof Date ? firstReceivedAt.toISOString() : new Date(String(firstReceivedAt)).toISOString(),
    firstReceivedField: postbackFirstReceivedDate?.field ?? 'createdAt',
    firstReceivedValue: postbackFirstReceivedDate?.raw ?? (e.createdAt instanceof Date ? e.createdAt.toISOString() : String(e.createdAt)),
    postbackDelaySeconds: postbackEventDate ? getPostbackDelaySeconds(firstReceivedAt, postbackEventDate.date) : null,
    lastPostbackDelaySeconds: postbackEventDate ? getPostbackDelaySeconds(e.lastReceivedAt, postbackEventDate.date) : null,
    capiUpdatedAt: capiTiming?.updatedAt ? capiTiming.updatedAt.toISOString() : null,
    capiStatus: capiTiming?.status ?? null,
    capiDelaySeconds: capiTiming?.updatedAt ? getPostbackDelaySeconds(capiTiming.updatedAt, firstReceivedAt) : null
  }
}
async function attachAttributionToConversions(rows: AnyRecord[]) {
  if (!rows.length) return []
  const rowsNeedingFallback = rows.filter((row) => !row.attributionSnapshot && typeof row.clickUuid === 'string' && row.clickUuid.length > 0)
  const uuids = [...new Set(rowsNeedingFallback.map((row) => row.clickUuid as string))]
  const tenantIds = [...new Set(rowsNeedingFallback.map((row) => row.tenantId).filter((value): value is string => typeof value === 'string'))]
  const conversionSourceIds = rows.map((row) => row.id?.toString()).filter((value): value is string => typeof value === 'string' && value.length > 0)
  const [clicks, partnerStackPairing, capiEvents] = await Promise.all([
    uuids.length ? prisma.clickEvent.findMany({ where: { clickUuid: { in: uuids }, ...(tenantIds.length ? { tenantId: { in: tenantIds } } : {}) }, include: { campaign: true, trackingLink: { include: { campaign: true, affiliatePlatform: true, brand: { include: { affiliatePlatform: true } } } } } }) : Promise.resolve([]),
    buildPartnerStackPairing(rows),
    conversionSourceIds.length ? prisma.capiEvent.findMany({ where: { source: 'affiliate_conversion', sourceId: { in: conversionSourceIds } }, select: { sourceId: true, status: true, updatedAt: true } }) : Promise.resolve([])
  ])
  const byUuid = new Map(clicks.map((click) => [click.clickUuid, click]))
  const capiTimingBySourceId = new Map<string, ConversionCapiTiming>()
  for (const capiEvent of capiEvents as AnyRecord[]) {
    const sourceId = typeof capiEvent.sourceId === 'string' ? capiEvent.sourceId : ''
    const updatedAt = capiEvent.updatedAt instanceof Date ? capiEvent.updatedAt : new Date(String(capiEvent.updatedAt))
    if (!sourceId || Number.isNaN(updatedAt.getTime())) continue
    const current = capiTimingBySourceId.get(sourceId)
    if (!current || updatedAt.getTime() < current.updatedAt.getTime()) capiTimingBySourceId.set(sourceId, { updatedAt, status: typeof capiEvent.status === 'string' ? capiEvent.status : null })
  }
  return rows.map((row) => serializeConversion(row, !row.attributionSnapshot && row.clickUuid ? byUuid.get(row.clickUuid) : undefined, partnerStackPairing, capiTimingBySourceId.get(row.id.toString())))
}
function emptyAnalyticsRow(id: string, name: string) { return { id, name, clicks: 0, conversions: 0, revenue: 0, payout: 0, commission: 0, spend: 0, conversionRate: 0 } }
function addConversionMoney(row: AnyRecord, conversion: AnyRecord) { const amount = toNumberAmount(conversion.postbackAmount); const payout = toNumberAmount(conversion.postbackPayout ?? conversion.payoutAmount); const commission = toNumberAmount(conversion.commissionAmount); const spend = toNumberAmount(conversion.spendAmount); row.payout += payout; row.commission += commission; row.spend += spend || amount; row.revenue += payout || commission }
function finalizeAnalyticsRows(map: Map<string, AnyRecord>, limit = 20): AnyRecord[] { const rows: AnyRecord[] = ([...map.values()] as AnyRecord[]).map((row) => ({ ...row, conversionRate: row.clicks ? row.conversions / row.clicks : 0 })); return rows.sort((a: AnyRecord, b: AnyRecord) => b.conversions - a.conversions || b.clicks - a.clicks || String(a.name).localeCompare(String(b.name))).slice(0, limit) }
function getAffiliateRefSourceLabel(source: unknown) { return source === 'partnerstack_customer_key' ? 'PartnerStack customer key' : source === 'impact_ref_click_id' ? 'Impact RefClickId' : 'Affiliate ref ID' }
function emptyAffiliateRefAnalyticsRow(refId: string, refSource?: string | null, platform?: AnyRecord | null) { return { id: `${refSource ?? 'unknown'}:${refId}`, name: refId, refId, refSource: refSource ?? null, sourceLabel: getAffiliateRefSourceLabel(refSource), affiliatePlatformId: platform?.id ?? null, affiliatePlatformName: platform?.name ?? null, clicks: 0, uniqueClicks: 0, conversions: 0, attributedConversions: 0, unattributedConversions: 0, revenue: 0, payout: 0, commission: 0, spend: 0, conversionRate: 0, firstSeenAt: null as string | null, lastSeenAt: null as string | null, _clickUuids: new Set<string>() } }
function addAffiliateRefConversion(map: Map<string, AnyRecord>, conversion: AnyRecord) {
  const refId = typeof conversion.affiliateRefId === 'string' && conversion.affiliateRefId.trim() ? conversion.affiliateRefId.trim() : null
  if (!refId) return
  const refSource = typeof conversion.affiliateRefSource === 'string' && conversion.affiliateRefSource.trim() ? conversion.affiliateRefSource.trim() : null
  const key = `${refSource ?? 'unknown'}:${refId}`
  if (!map.has(key)) map.set(key, emptyAffiliateRefAnalyticsRow(refId, refSource, conversion.affiliatePlatform))
  const row = map.get(key) as AnyRecord
  row.conversions += 1
  if (conversion.attribution?.matched) row.attributedConversions += 1
  else row.unattributedConversions += 1
  if (typeof conversion.clickUuid === 'string' && conversion.clickUuid.trim()) row._clickUuids.add(conversion.clickUuid)
  const createdAt = conversion.createdAt instanceof Date ? conversion.createdAt.toISOString() : String(conversion.createdAt)
  row.firstSeenAt = !row.firstSeenAt || createdAt < row.firstSeenAt ? createdAt : row.firstSeenAt
  row.lastSeenAt = !row.lastSeenAt || createdAt > row.lastSeenAt ? createdAt : row.lastSeenAt
  addConversionMoney(row, conversion)
}
function finalizeAffiliateRefRows(map: Map<string, AnyRecord>, limit = 50): AnyRecord[] {
  return ([...map.values()] as AnyRecord[]).map((row) => {
    const uniqueClicks = row._clickUuids instanceof Set ? row._clickUuids.size : 0
    const { _clickUuids, ...clean } = row
    return { ...clean, uniqueClicks, clicks: uniqueClicks, conversionRate: uniqueClicks ? clean.conversions / uniqueClicks : 0 }
  }).sort((a: AnyRecord, b: AnyRecord) => b.conversions - a.conversions || b.payout - a.payout || String(a.refId).localeCompare(String(b.refId))).slice(0, limit)
}
function getDayKey(value: string | Date) { return new Date(value).toISOString().slice(0, 10) }
async function buildAnalyticsBreakdown(userId: string, q: AnyRecord) {
  const clickWhere = buildClickEventWhere(userId, q)
  const capiWhere = buildCapiEventWhere(userId, q)
  const conversionWhere = await buildConversionEventWhere(userId, q)
  const [clickRows, capiTotal, capiDelivered, capiFailed, conversionRows] = await Promise.all([
    prisma.clickEvent.findMany({ where: clickWhere, include: { campaign: true, trackingLink: { include: { campaign: true, affiliatePlatform: true, brand: { include: { affiliatePlatform: true } } } } }, orderBy: { createdAt: 'desc' } }),
    prisma.capiEvent.count({ where: capiWhere }),
    prisma.capiEvent.count({ where: { ...capiWhere, status: 'DELIVERED' } }),
    prisma.capiEvent.count({ where: { ...capiWhere, status: 'FAILED' } }),
    prisma.affiliateConversionEvent.findMany({ where: conversionWhere, include: { affiliatePlatform: true }, orderBy: { createdAt: 'desc' } })
  ])
  const conversions = await attachAttributionToConversions(conversionRows)
  const byCampaign = new Map<string, AnyRecord>()
  const byBrand = new Map<string, AnyRecord>()
  const byPlatform = new Map<string, AnyRecord>()
  const byRefId = new Map<string, AnyRecord>()
  const byDay = new Map<string, AnyRecord>()
  const ensure = (map: Map<string, AnyRecord>, id: string, name: string): AnyRecord => { if (!map.has(id)) map.set(id, emptyAnalyticsRow(id, name)); return map.get(id) as AnyRecord }

  for (const click of clickRows as AnyRecord[]) {
    const campaign = click.campaign
    const link = click.trackingLink
    const brand = link?.brand
    const offerName = link?.slug ?? brand?.name
    const offerId = link?.id ?? brand?.id
    const platform = link?.affiliatePlatform ?? brand?.affiliatePlatform
    if (campaign) ensure(byCampaign, campaign.id, campaign.name).clicks += 1
    if (offerId && offerName) ensure(byBrand, offerId, offerName).clicks += 1
    if (platform) ensure(byPlatform, platform.id, platform.name).clicks += 1
    ensure(byDay, getDayKey(click.createdAt), getDayKey(click.createdAt)).clicks += 1
  }

  let attributedConversions = 0
  const summary: AnyRecord = { clicks: clickRows.length, conversions: conversions.length, attributedConversions: 0, unattributedConversions: 0, capiTotal, capiDelivered, capiFailed, conversionRate: 0, attributedConversionRate: 0, revenue: 0, payout: 0, commission: 0, spend: 0 }
  for (const conversion of conversions as AnyRecord[]) {
    addConversionMoney(summary, conversion)
    const day = ensure(byDay, getDayKey(conversion.createdAt), getDayKey(conversion.createdAt))
    day.conversions += 1
    addConversionMoney(day, conversion)
    addAffiliateRefConversion(byRefId, conversion)
    const attribution = conversion.attribution
    if (attribution?.matched) {
      attributedConversions += 1
      if (attribution.campaign) { const row = ensure(byCampaign, attribution.campaign.id, attribution.campaign.name); row.conversions += 1; addConversionMoney(row, conversion) }
      if (attribution.trackingLink) { const row = ensure(byBrand, attribution.trackingLink.id, attribution.trackingLink.slug); row.conversions += 1; addConversionMoney(row, conversion) }
      else if (attribution.brand) { const row = ensure(byBrand, attribution.brand.id, attribution.brand.name); row.conversions += 1; addConversionMoney(row, conversion) }
      if (attribution.affiliatePlatform) { const row = ensure(byPlatform, attribution.affiliatePlatform.id, attribution.affiliatePlatform.name); row.conversions += 1; addConversionMoney(row, conversion) }
    } else if (conversion.affiliatePlatform) {
      const row = ensure(byPlatform, conversion.affiliatePlatform.id, conversion.affiliatePlatform.name)
      row.conversions += 1
      addConversionMoney(row, conversion)
    }
  }
  summary.attributedConversions = attributedConversions
  summary.unattributedConversions = conversions.length - attributedConversions
  summary.conversionRate = summary.clicks ? summary.conversions / summary.clicks : 0
  summary.attributedConversionRate = summary.clicks ? attributedConversions / summary.clicks : 0
  summary.refIds = byRefId.size
  summary.partnerStackRefIds = [...byRefId.values()].filter((row) => row.refSource === 'partnerstack_customer_key').length
  summary.impactRefIds = [...byRefId.values()].filter((row) => row.refSource === 'impact_ref_click_id').length
  summary.refIdConversions = [...byRefId.values()].reduce((total, row) => total + row.conversions, 0)
  const funnel = [
    { key: 'clicks', label: 'Clicks', value: summary.clicks, rateFromPrevious: 1, rateFromStart: 1 },
    { key: 'attributedConversions', label: 'Attributed conversions', value: summary.attributedConversions, rateFromPrevious: summary.clicks ? summary.attributedConversions / summary.clicks : 0, rateFromStart: summary.clicks ? summary.attributedConversions / summary.clicks : 0 },
    { key: 'capiDelivered', label: 'CAPI delivered', value: summary.capiDelivered, rateFromPrevious: summary.attributedConversions ? summary.capiDelivered / summary.attributedConversions : 0, rateFromStart: summary.clicks ? summary.capiDelivered / summary.clicks : 0 }
  ]
  const comparison = await buildPeriodComparison(userId, q, summary)
  return { summary, byCampaign: finalizeAnalyticsRows(byCampaign), byBrand: finalizeAnalyticsRows(byBrand), byPlatform: finalizeAnalyticsRows(byPlatform), byRefId: finalizeAffiliateRefRows(byRefId), byDay: finalizeAnalyticsRows(byDay, 60).sort((a, b) => String(a.id).localeCompare(String(b.id))), funnel, comparison }
}

app.addHook('onSend', async (req, reply, payload) => { applyCorsHeaders(req, reply); return payload })
app.options('/*', async (req, reply) => {
  if (req.url.split('?')[0] === '/atp/events') {
    const parsed = parseTrackingPropertyId((req.query as AnyRecord).property_id)
    if (parsed) {
      const tenant = await prisma.tenant.findFirst({ where: { OR: [{ publicKey: parsed.tenantKey }, { id: parsed.tenantKey }] }, select: { id: true } })
      const allowedOrigin = tenant ? await getAllowedWebsiteOrigin(req, tenant.id) : null
      if (allowedOrigin) return trackingEventHeaders(reply, allowedOrigin).code(204).send()
    }
    return trackingEventHeaders(reply).code(403).send()
  }
  applyCorsHeaders(req, reply)
  return reply.code(204).send()
})
app.addHook('preHandler', async (req) => { if (isPublicRoute(req)) return; (req as AuthenticatedRequest).currentUser = await requireUser(req) })

app.get('/health', async () => ({ status: 'ok', service: 'api' }))
app.get('/health/live', async () => ({ status: 'ok', service: 'api' }))
app.get('/health/ready', async (req, reply) => {
  try {
    await Promise.all([prisma.$queryRaw`SELECT 1`, readinessRedis.ping()])
    return { status: 'ready', service: 'api' }
  } catch (error) {
    req.log.error(error)
    return reply.code(503).send({ status: 'not_ready', service: 'api' })
  }
})
app.get('/metrics', async () => {
  const [waiting, active, delayed, failed] = await Promise.all([
    clickEventsQueue.getWaitingCount(),
    clickEventsQueue.getActiveCount(),
    clickEventsQueue.getDelayedCount(),
    clickEventsQueue.getFailedCount()
  ])
  return { service: 'api', queue: { clickEvents: { waiting, active, delayed, failed } } }
})
app.get('/atp.js', { config: { rateLimit: { max: Number(process.env.PUBLIC_SCRIPT_RATE_LIMIT_MAX ?? 600), timeWindow: process.env.PUBLIC_SCRIPT_RATE_LIMIT_WINDOW ?? '1 minute' } } }, async (req, reply) => {
  const parsed = parseTrackingPropertyId((req.query as AnyRecord).property_id)
  const scriptHeaders = (allowedOrigin?: string) => {
    const response = reply
      .header('content-type', 'application/javascript; charset=utf-8')
      .header('cache-control', 'no-store')
      .header('vary', 'Origin, Referer')
      .header('cross-origin-resource-policy', 'cross-origin')
    if (allowedOrigin) response.header('access-control-allow-origin', allowedOrigin)
    return response
  }
  if (!parsed) return scriptHeaders().code(400).send('console.warn("[AffTrackPro] Invalid property_id. Expected DBG-{tenantKey}.");\n')

  const tenant = await prisma.tenant.findFirst({ where: { OR: [{ publicKey: parsed.tenantKey }, { id: parsed.tenantKey }] }, include: { ownerUser: true } })
  if (!tenant) return scriptHeaders().code(404).send('console.warn("[AffTrackPro] Unknown property_id.");\n')

  const allowedOrigin = await getAllowedWebsiteOrigin(req, tenant.id)
  if (!allowedOrigin) return scriptHeaders().code(403).send('console.warn("[AffTrackPro] Website domain is not allowed for this tracking code.");\n')

  const [trackingLinks, userName] = await Promise.all([
    prisma.trackingLink.findMany({
      where: { tenantId: tenant.id, isActive: true },
      select: {
        id: true,
        slug: true,
        affiliateUrl: true,
        affiliatePlatform: { select: { name: true, slug: true, trackingParamKey: true } }
      }
    }),
    Promise.resolve(getUserDisplayName(tenant.ownerUser, tenant.name))
  ])
  const payload = {
    propertyId: parsed.propertyId,
    tenantKey: tenant.publicKey,
    tenantId: tenant.id,
    userName,
    eventEndpointPath: `/atp/events?property_id=${encodeURIComponent(parsed.propertyId)}`,
    trackingLinks: trackingLinks.map((link) => ({
      id: link.id,
      slug: link.slug,
      affiliateUrl: link.affiliateUrl,
      trackingParamKey: resolveTrackingParamKey(link.affiliatePlatform),
      affiliatePlatform: link.affiliatePlatform,
      shortlinkPaths: [`/${link.slug}/${tenant.publicKey}`, `/${link.slug}/${tenant.id}`]
    }))
  }

  return scriptHeaders(allowedOrigin).send(`(() => {
  const config = ${JSON.stringify(payload)};
  const detectedKeys = new Set();
  const sentClickKeys = new Set();
  let loggedEmpty = false;
  let mutationTimer = null;
  const scriptBaseUrl = document.currentScript && document.currentScript.src ? document.currentScript.src : window.location.href;
  const eventEndpointUrl = resolveEventEndpoint();

  console.log(config.userName);

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    }
    return String(Date.now()) + '_' + Math.random().toString(36).slice(2);
  }

  function resolveEventEndpoint() {
    try {
      return config.eventEndpointPath ? new URL(config.eventEndpointPath, scriptBaseUrl).href : null;
    } catch (_) {
      return null;
    }
  }

  function toUrl(value) {
    try {
      return new URL(value, window.location.href);
    } catch (_) {
      return null;
    }
  }

  function cleanPath(pathname) {
    return (pathname || '/').replace(/\\/+$/, '') || '/';
  }

  function shortlinkPathMatches(href, shortlinkPaths) {
    const url = toUrl(href);
    if (!url) return false;
    const currentPath = cleanPath(url.pathname);
    return shortlinkPaths.some((path) => cleanPath(path) === currentPath);
  }

  function affiliateUrlMatches(href, affiliateUrl) {
    const current = toUrl(href);
    const expected = toUrl(affiliateUrl);
    if (!current || !expected) return false;
    current.hash = '';
    expected.hash = '';
    if (current.origin !== expected.origin) return false;
    if (cleanPath(current.pathname) !== cleanPath(expected.pathname)) return false;
    for (const [key, value] of expected.searchParams.entries()) {
      if (current.searchParams.get(key) !== value) return false;
    }
    return true;
  }

  function getSearchParam(urlValue, name) {
    const url = toUrl(urlValue);
    return url ? url.searchParams.get(name) || '' : '';
  }

  function readCookie(name) {
    const prefix = name + '=';
    const item = (document.cookie || '').split(';').map((part) => part.trim()).find((part) => part.indexOf(prefix) === 0);
    if (!item) return '';
    const value = item.slice(prefix.length);
    try {
      return decodeURIComponent(value);
    } catch (_) {
      return value;
    }
  }

  function getKnownCookies() {
    return {
      fbp: readCookie('_fbp'),
      fbc: readCookie('_fbc'),
      ttp: readCookie('_ttp'),
      ga: readCookie('_ga'),
      gid: readCookie('_gid'),
      gclAu: readCookie('_gcl_au')
    };
  }

  function safeIdentifier(value) {
    return String(value || '').replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 80) || createId();
  }

  function getTrackingParamKey(trackingLink) {
    const key = String(trackingLink.trackingParamKey || 'subid1').trim();
    return key || 'subid1';
  }

  function getCandidateUrl(detection) {
    if (!detection || !detection.element) return detection && detection.href ? detection.href : '';
    if (detection.source === 'form') return detection.element.getAttribute('action') || detection.element.action || '';
    return detection.element.getAttribute('href') || detection.element.href || '';
  }

  function getElementBinding(element, trackingLink) {
    let bindings = element.__affTrackProBindings;
    if (!bindings) {
      bindings = {};
      try {
        Object.defineProperty(element, '__affTrackProBindings', { value: bindings, configurable: true });
      } catch (_) {
        element.__affTrackProBindings = bindings;
      }
    }
    if (!bindings[trackingLink.id]) bindings[trackingLink.id] = { clickUuid: createId(), bound: false };
    return bindings[trackingLink.id];
  }

  function withClickUuid(href, trackingLink, clickUuid) {
    const url = toUrl(href);
    if (!url) return '';
    url.searchParams.set(getTrackingParamKey(trackingLink), clickUuid);
    return url.href;
  }

  function postEventPayload(payload) {
    if (!eventEndpointUrl) return Promise.resolve({ ok: false });
    const body = JSON.stringify(payload);
    if (window.navigator && typeof window.navigator.sendBeacon === 'function') {
      try {
        const blob = new Blob([body], { type: 'application/json' });
        if (window.navigator.sendBeacon(eventEndpointUrl, blob)) return Promise.resolve({ ok: true, beacon: true });
      } catch (_) {}
    }
    if (!window.fetch) return Promise.resolve({ ok: false });
    return window.fetch(eventEndpointUrl, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
      body
    });
  }

  function sendAffiliateClickEvent(detection, trackingLink, clickUuid) {
    if (!eventEndpointUrl || !clickUuid) return;
    const clickKey = trackingLink.id + ':' + clickUuid;
    if (sentClickKeys.has(clickKey)) return;
    sentClickKeys.add(clickKey);

    const currentHref = getCandidateUrl(detection) || detection.href;
    const originalHref = detection.originalHref || detection.href;
    const cookies = getKnownCookies();
    const fbclid = getSearchParam(window.location.href, 'fbclid') || getSearchParam(currentHref, 'fbclid') || getSearchParam(originalHref, 'fbclid');
    const ttclid = getSearchParam(window.location.href, 'ttclid') || getSearchParam(currentHref, 'ttclid') || getSearchParam(originalHref, 'ttclid');
    const payload = {
      eventName: 'AffiliateClick',
      eventId: 'AffiliateClick_atp_' + safeIdentifier(clickUuid),
      clickUuid,
      trackingLinkId: trackingLink.id,
      slug: trackingLink.slug,
      matchType: 'affiliate_url',
      href: currentHref,
      originalHref,
      source: detection.source,
      index: detection.index,
      text: detection.text,
      trackingParamKey: getTrackingParamKey(trackingLink),
      pageUrl: window.location.href,
      pageTitle: document.title || '',
      referrer: document.referrer || '',
      fbp: cookies.fbp,
      fbc: cookies.fbc,
      ttp: cookies.ttp,
      fbclid,
      ttclid,
      cookies
    };

    postEventPayload(payload).then((response) => {
      if (response && response.ok === false) console.warn('[AffTrackPro] Không gửi được affiliate click', response.status || 'beacon/fetch unavailable');
      else console.log('[AffTrackPro] Đã gửi affiliate click', { trackingLinkId: trackingLink.id, slug: trackingLink.slug, clickUuid });
    }).catch((error) => {
      console.warn('[AffTrackPro] Không gửi được affiliate click', error);
    });
  }

  function applyAffiliateClickUuid(detection, trackingLink) {
    if (!detection.element || detection.type !== 'affiliate_url') return;
    const binding = getElementBinding(detection.element, trackingLink);
    const originalHref = detection.originalHref || detection.href;
    const currentHref = getCandidateUrl(detection) || detection.href;
    const nextHref = withClickUuid(currentHref, trackingLink, binding.clickUuid);
    if (nextHref) {
      if (detection.source === 'form') detection.element.setAttribute('action', nextHref);
      else detection.element.setAttribute('href', nextHref);
      detection.originalHref = originalHref;
      detection.href = nextHref;
      detection.clickUuid = binding.clickUuid;
      detection.trackingParamKey = getTrackingParamKey(trackingLink);
    }
    if (!binding.bound) {
      detection.element.addEventListener(detection.source === 'form' ? 'submit' : 'click', () => sendAffiliateClickEvent(detection, trackingLink, binding.clickUuid), { capture: true });
      binding.bound = true;
    }
  }

  function getCandidates() {
    const links = Array.from(document.querySelectorAll('a[href], area[href]')).map((element, index) => ({
      element,
      source: element.tagName.toLowerCase(),
      index,
      text: (element.textContent || '').trim().slice(0, 120),
      href: element.getAttribute('href') || element.href || ''
    }));
    const forms = Array.from(document.querySelectorAll('form[action]')).map((element, index) => ({
      element,
      source: 'form',
      index,
      text: '',
      href: element.getAttribute('action') || element.action || ''
    }));
    return links.concat(forms);
  }

  function scanTrackingLinks() {
    const detections = [];
    const candidates = getCandidates();

    for (const candidate of candidates) {
      if (!candidate.href) continue;
      for (const trackingLink of config.trackingLinks) {
        const matchType = affiliateUrlMatches(candidate.href, trackingLink.affiliateUrl)
          ? 'affiliate_url'
          : shortlinkPathMatches(candidate.href, trackingLink.shortlinkPaths)
            ? 'shortlink'
            : null;
        if (!matchType) continue;
        const key = trackingLink.id + ':' + matchType + ':' + candidate.href;
        if (detectedKeys.has(key)) continue;
        detectedKeys.add(key);
        const detection = {
          detected: true,
          type: matchType,
          element: candidate.element,
          source: candidate.source,
          index: candidate.index,
          text: candidate.text,
          href: candidate.href,
          trackingLinkId: trackingLink.id,
          slug: trackingLink.slug,
          affiliateUrl: trackingLink.affiliateUrl,
          trackingParamKey: getTrackingParamKey(trackingLink),
          shortlinkPaths: trackingLink.shortlinkPaths
        };
        if (matchType === 'affiliate_url') applyAffiliateClickUuid(detection, trackingLink);
        detections.push({ ...detection, element: undefined });
      }
    }

    if (detections.length) {
      console.log('[AffTrackPro] Đã phát hiện Affiliate URL hoặc Shortlink', detections);
    } else if (!loggedEmpty) {
      loggedEmpty = true;
      console.log('[AffTrackPro] Chưa phát hiện Affiliate URL hoặc Shortlink trên trang này.');
    }
  }

  function scheduleScan() {
    if (mutationTimer) window.clearTimeout(mutationTimer);
    mutationTimer = window.setTimeout(scanTrackingLinks, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanTrackingLinks, { once: true });
  } else {
    scanTrackingLinks();
  }

  if (document.documentElement && window.MutationObserver) {
    new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', 'action'] });
  }
})();
`)
})

app.post('/atp/events', { config: { rateLimit: { max: Number(process.env.PUBLIC_TRACKING_EVENT_RATE_LIMIT_MAX ?? 300), timeWindow: process.env.PUBLIC_TRACKING_EVENT_RATE_LIMIT_WINDOW ?? '1 minute' } } }, async (req, reply) => {
  const parsed = parseTrackingPropertyId((req.query as AnyRecord).property_id)
  let allowedOrigin: string | null = null
  const send = (code: number, payload: AnyRecord) => trackingEventHeaders(reply, allowedOrigin).code(code).send(payload)

  if (!parsed) return send(400, { error: 'Invalid property_id' })

  const tenant = await prisma.tenant.findFirst({ where: { OR: [{ publicKey: parsed.tenantKey }, { id: parsed.tenantKey }] }, select: { id: true, publicKey: true } })
  if (!tenant) return send(404, { error: 'Unknown property_id' })

  allowedOrigin = await getAllowedWebsiteOrigin(req, tenant.id)
  if (!allowedOrigin) return send(403, { error: 'Website domain is not allowed for this tracking code' })

  const body = parseTrackingEventBody(req.body)
  const cookies = getPlainRecord(body.cookies) ?? {}
  const trackingLinkId = optionalLimitedString(body.trackingLinkId, 128)
  if (!trackingLinkId) return send(400, { error: 'trackingLinkId is required' })

  const trackingLink = await prisma.trackingLink.findFirst({
    where: { id: trackingLinkId, tenantId: tenant.id, isActive: true },
    select: {
      id: true,
      slug: true,
      affiliateUrl: true,
      campaignId: true,
      affiliatePlatform: { select: { id: true, name: true, slug: true, trackingParamKey: true } }
    }
  })
  if (!trackingLink) return send(404, { error: 'Tracking link not found' })

  const requestedEventName = optionalLimitedString(body.eventName, 64) ?? ''
  const normalizedRequestedEventName = requestedEventName.toLowerCase()
  const pageUrl = optionalLimitedString(body.pageUrl, 2048)
  const pageTitle = optionalLimitedString(body.pageTitle, 512)
  const matchedHref = optionalLimitedString(body.href, 2048)
  const originalHref = optionalLimitedString(body.originalHref, 2048)
  const requestReferer = getHeaderString(req, 'referer') ?? getHeaderString(req, 'referrer')
  const pageReferrer = optionalLimitedString(body.referrer, 2048)
  const fbclid = optionalLimitedString(body.fbclid, 512) ?? getUrlSearchParam(pageUrl, 'fbclid') ?? getUrlSearchParam(matchedHref, 'fbclid') ?? getUrlSearchParam(originalHref, 'fbclid') ?? getUrlSearchParam(requestReferer, 'fbclid')
  const ttclid = optionalLimitedString(body.ttclid, 512) ?? getUrlSearchParam(pageUrl, 'ttclid') ?? getUrlSearchParam(matchedHref, 'ttclid') ?? getUrlSearchParam(originalHref, 'ttclid') ?? getUrlSearchParam(requestReferer, 'ttclid')
  const fbp = optionalLimitedString(body.fbp, 512) ?? optionalLimitedString(cookies.fbp, 512) ?? optionalLimitedString(cookies._fbp, 512)
  const fbc = optionalLimitedString(body.fbc, 512) ?? optionalLimitedString(cookies.fbc, 512) ?? optionalLimitedString(cookies._fbc, 512) ?? createFbc(fbclid)
  const ttp = optionalLimitedString(body.ttp, 512) ?? optionalLimitedString(cookies.ttp, 512) ?? optionalLimitedString(cookies._ttp, 512)
  const eventId = normalizeTrackingEventId(body.eventId)
  const commonMetadata = compactRecord({
    source: 'atp.js',
    eventId,
    propertyId: parsed.propertyId,
    tenantKey: tenant.publicKey,
    slug: trackingLink.slug,
    matchType: optionalLimitedString(body.matchType, 64),
    matchedHref,
    originalHref,
    elementSource: optionalLimitedString(body.source, 64),
    elementIndex: typeof body.index === 'number' && Number.isFinite(body.index) ? Math.max(0, Math.floor(body.index)) : undefined,
    elementText: optionalLimitedString(body.text, 512),
    pageUrl,
    pageTitle,
    pageReferrer,
    requestOrigin: allowedOrigin,
    requestReferer,
    affiliateUrl: trackingLink.affiliateUrl,
    affiliatePlatform: trackingLink.affiliatePlatform,
    cookies: compactRecord({
      fbp,
      fbc,
      ttp,
      ga: optionalLimitedString(cookies.ga ?? cookies._ga, 512),
      gid: optionalLimitedString(cookies.gid ?? cookies._gid, 512),
      gclAu: optionalLimitedString(cookies.gclAu ?? cookies._gcl_au, 512)
    })
  })

  if (normalizedRequestedEventName === 'affiliateclick' || normalizedRequestedEventName === 'click') {
    const clickUuid = normalizeClientClickUuid(body.clickUuid) ?? randomUUID()
    const trackingParamKey = resolveTrackingParamKey(trackingLink.affiliatePlatform)
    const paramClickUuid = getUrlSearchParam(matchedHref, trackingParamKey)
    if (paramClickUuid && paramClickUuid !== clickUuid) return send(409, { error: 'clickUuid does not match affiliate URL tracking parameter' })
    if (![matchedHref, originalHref].some((href) => trackingAffiliateUrlMatches(href, trackingLink.affiliateUrl))) return send(400, { error: 'Affiliate URL does not match tracking link' })

    const metadata = compactRecord({ ...commonMetadata, source: 'atp.affiliate_click', eventName: 'AffiliateClick', capiEventName: TRACKING_SCRIPT_AFFILIATE_CLICK_CAPI_EVENT_NAME, trackingParamKey, clickUuid })
    try {
      let duplicate = false
      let clickEvent = await prisma.clickEvent.findUnique({ where: { clickUuid } })

      if (clickEvent) {
        duplicate = true
        if (clickEvent.tenantId !== tenant.id || clickEvent.trackingLinkId !== trackingLink.id) return send(409, { error: 'Duplicate clickUuid conflict' })
      } else {
        await assertBillingLimit(tenant.id, 'clicks')
        try {
          clickEvent = await prisma.clickEvent.create({
            data: {
              tenantId: tenant.id,
              campaignId: trackingLink.campaignId ?? null,
              trackingLinkId: trackingLink.id,
              clickUuid,
              ip: getClientIp(req),
              userAgent: getHeaderString(req, 'user-agent'),
              referrer: pageReferrer ?? requestReferer,
              fbp,
              fbc,
              ttp,
              ttclid,
              fbclid,
              metadata: metadata as Prisma.InputJsonValue
            }
          })
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            duplicate = true
            clickEvent = await prisma.clickEvent.findUnique({ where: { clickUuid } })
          } else {
            throw error
          }
        }
      }

      if (!clickEvent) throw new Error('Click event was not created')
      if (!duplicate) {
        await enqueueClick(clickEvent, TRACKING_SCRIPT_AFFILIATE_CLICK_CAPI_EVENT_NAME)
        await createActivityLog({ tenantId: tenant.id, source: 'atp.js', eventType: 'tracking_script.affiliate_click', message: `Affiliate URL click tracked for "${trackingLink.slug}"`, entityType: 'clickEvent', entityId: clickEvent.id, metadata: { clickEventId: clickEvent.id, clickUuid, trackingLinkId: trackingLink.id, campaignId: trackingLink.campaignId, trackingParamKey, matchedHref, originalHref, pageUrl, capiEventName: TRACKING_SCRIPT_AFFILIATE_CLICK_CAPI_EVENT_NAME } })
      }

      return send(duplicate ? 200 : 201, { ok: true, duplicate, eventName: 'AffiliateClick', eventId, clickUuid: clickEvent.clickUuid, trackingLinkId: trackingLink.id, slug: trackingLink.slug })
    } catch (error) {
      req.log.error({ error, tenantId: tenant.id, trackingLinkId: trackingLink.id }, 'Failed to process atp affiliate click')
      const message = error instanceof Error ? error.message : 'Internal server error'
      const statusCode = message.toLowerCase().includes('billing limit exceeded') ? 429 : 500
      return send(statusCode, { error: statusCode === 500 ? 'Internal server error' : message })
    }
  }

  return send(202, { ok: true, skipped: true, reason: 'Tracking script ViewContent is disabled', eventName: requestedEventName || 'Unknown', trackingLinkId: trackingLink.id, slug: trackingLink.slug })
})

app.get('/me', async (req) => ({ ...requireAuthenticated(req), isSuperAdmin: isSuperAdmin(requireAuthenticated(req)) }))

app.get('/superadmin/users', async (req) => { requireSuperAdmin(req); const users = await prisma.user.findMany({ include: { tenant: { include: { billingPlan: true, menuGrants: { include: { menuFeature: true }, orderBy: { menuFeature: { sortOrder: 'asc' } } }, _count: { select: { campaigns: true, brands: true, affiliatePlatforms: true, datasets: true, trackingLinks: true, clickEvents: true, conversionEvents: true, capiEvents: true } } } } }, orderBy: { createdAt: 'desc' } }); return users.map((u) => ({ ...u, tenant: u.tenant ? serializeTenant(u.tenant) : u.tenant })) })
app.delete('/superadmin/users', async (req) => { const admin = requireSuperAdmin(req); const users = await prisma.user.findMany({ include: { tenant: { select: { id: true } } }, orderBy: { createdAt: 'desc' } }); const targets = users.filter((user) => user.id !== admin.id && !isSuperAdmin(user)); let clerkDeletedCount = 0; for (const user of targets) { const result = await deleteRegisteredUserAccount(user); if (result.clerkDeleted) clerkDeletedCount += 1 } return { ok: true, deletedCount: targets.length, skippedCount: users.length - targets.length, clerkDeletedCount } })
app.delete('/superadmin/users/:id', async (req, reply) => { const admin = requireSuperAdmin(req); const { id } = req.params as { id: string }; const user = await prisma.user.findUnique({ where: { id }, include: { tenant: { select: { id: true } } } }); if (!user) return reply.code(404).send({ error: 'User not found' }); if (user.id === admin.id) return reply.code(400).send({ error: 'Không thể xoá tài khoản Super Admin đang đăng nhập' }); if (isSuperAdmin(user)) return reply.code(400).send({ error: 'Không thể xoá tài khoản Super Admin' }); const result = await deleteRegisteredUserAccount(user); return { ok: true, id, clerkDeleted: result.clerkDeleted } })
app.get('/superadmin/billing-plans', async (req) => { requireSuperAdmin(req); return prisma.billingPlan.findMany({ orderBy: [{ isDefault: 'desc' }, { monthlyPriceCents: 'asc' }, { createdAt: 'desc' }] }) })
app.post('/superadmin/billing-plans', async (req, reply) => { requireSuperAdmin(req); const b = req.body as AnyRecord; const name = requireString(b.name, 'name'); const isDefault = optionalBoolean(b.isDefault, false); if (isDefault) await prisma.billingPlan.updateMany({ data: { isDefault: false } }); const plan = await prisma.billingPlan.create({ data: { slug: toSlug(optionalString(b.slug) ?? name), name, description: optionalString(b.description), monthlyPriceCents: optionalInteger(b.monthlyPriceCents, 0), currency: optionalString(b.currency) ?? 'USD', clickLimit: optionalInteger(b.clickLimit, 1000), capiEventLimit: optionalInteger(b.capiEventLimit, 1000), eapiEventLimit: optionalInteger(b.eapiEventLimit, 1000), campaignDatasetLimit: optionalInteger(b.campaignDatasetLimit, 2), isDefault, isActive: optionalBoolean(b.isActive, true) } }); return reply.code(201).send(plan) })
app.put('/superadmin/billing-plans/:id', async (req, reply) => { requireSuperAdmin(req); const { id } = req.params as { id: string }; const b = req.body as AnyRecord; const p = await prisma.billingPlan.findUnique({ where: { id } }); if (!p) return reply.code(404).send({ error: 'Billing plan not found' }); const isDefault = optionalBoolean(b.isDefault, p.isDefault); if (isDefault) await prisma.billingPlan.updateMany({ where: { id: { not: id } }, data: { isDefault: false } }); const currentDatasetLimit = 'campaignDatasetLimit' in p ? Number(p.campaignDatasetLimit) : 2; return prisma.billingPlan.update({ where: { id }, data: { slug: b.slug ? toSlug(b.slug) : p.slug, name: optionalString(b.name) ?? p.name, description: typeof b.description === 'string' ? b.description : p.description, monthlyPriceCents: optionalInteger(b.monthlyPriceCents, p.monthlyPriceCents), currency: optionalString(b.currency) ?? p.currency, clickLimit: optionalInteger(b.clickLimit, p.clickLimit), capiEventLimit: optionalInteger(b.capiEventLimit, p.capiEventLimit), eapiEventLimit: optionalInteger(b.eapiEventLimit, p.eapiEventLimit), campaignDatasetLimit: optionalInteger(b.campaignDatasetLimit, currentDatasetLimit), isDefault, isActive: optionalBoolean(b.isActive, p.isActive) } }) })
app.get('/superadmin/menu-features', async (req) => { requireSuperAdmin(req); await ensureMenuFeaturesSeeded(); return prisma.menuFeature.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] }) })
app.put('/superadmin/tenants/:id/menu-features', async (req, reply) => { requireSuperAdmin(req); const { id } = req.params as { id: string }; const b = req.body as { menuFeatureIds?: string[] }; const tenant = await prisma.tenant.findUnique({ where: { id } }); if (!tenant) return reply.code(404).send({ error: 'Tenant not found' }); await ensureMenuFeaturesSeeded(); const active = await prisma.menuFeature.findMany({ where: { isActive: true } }); const activeIds = new Set(active.map((f) => f.id)); const coreIds = active.filter((f) => f.isCore).map((f) => f.id); const desired = new Set([...coreIds, ...(Array.isArray(b.menuFeatureIds) ? b.menuFeatureIds.filter((x) => activeIds.has(x)) : [])]); await Promise.all(active.map((f) => prisma.tenantMenuGrant.upsert({ where: { tenantId_menuFeatureId: { tenantId: id, menuFeatureId: f.id } }, update: { isEnabled: desired.has(f.id) }, create: { tenantId: id, menuFeatureId: f.id, isEnabled: desired.has(f.id) } }))); return prisma.tenant.findUnique({ where: { id }, include: { menuGrants: { include: { menuFeature: true }, orderBy: { menuFeature: { sortOrder: 'asc' } } } } }) })
app.put('/superadmin/tenants/:id/billing-plan', async (req, reply) => { requireSuperAdmin(req); const { id } = req.params as { id: string }; const billingPlanId = requireString((req.body as AnyRecord).billingPlanId, 'billingPlanId'); const [tenant, plan] = await Promise.all([prisma.tenant.findUnique({ where: { id } }), prisma.billingPlan.findUnique({ where: { id: billingPlanId } })]); if (!tenant) return reply.code(404).send({ error: 'Tenant not found' }); if (!plan) return reply.code(404).send({ error: 'Billing plan not found' }); return prisma.tenant.update({ where: { id }, data: { billingPlanId }, include: { billingPlan: true } }) })

app.get('/tenants', async (req) => { const u = requireAuthenticated(req); const tenants = await prisma.tenant.findMany({ where: { ownerUserId: u.id }, include: { billingPlan: true, menuGrants: { where: { isEnabled: true, menuFeature: { isActive: true } }, include: { menuFeature: true }, orderBy: { menuFeature: { sortOrder: 'asc' } } } }, orderBy: { createdAt: 'desc' } }); return tenants.map(serializeTenant) })

app.get('/website-domains', async (req) => {
  const u = requireAuthenticated(req)
  const q = req.query as AnyRecord
  const tenantId = optionalQueryString(q.tenantId)
  if (tenantId) await assertTenantAccess(u.id, tenantId)
  return prisma.websiteDomain.findMany({ where: { tenantId, tenant: { ownerUserId: u.id } }, orderBy: { createdAt: 'desc' } })
})
app.post('/website-domains', async (req, reply) => {
  const u = requireAuthenticated(req)
  const b = req.body as AnyRecord
  const tenantId = requireString(b.tenantId, 'tenantId')
  await assertTenantAccess(u.id, tenantId)
  const domain = normalizeWebsiteDomainInput(b.domain)
  const duplicateError = 'Domain này đã được whitelist, vui lòng dùng domain khác'
  const existing = await prisma.websiteDomain.findFirst({ where: { domain }, select: { id: true } })
  if (existing) return reply.code(409).send({ error: duplicateError, domain })

  try {
    const row = await prisma.websiteDomain.create({ data: { tenantId, domain } })
    await createActivityLog({ tenantId, source: 'api', eventType: 'website_domain.created', message: `Website domain "${domain}" was added`, entityType: 'websiteDomain', entityId: row.id, metadata: { actorUserId: u.id, websiteDomainId: row.id, domain } })
    return reply.code(201).send(row)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return reply.code(409).send({ error: duplicateError, domain })
    throw error
  }
})
app.delete('/website-domains/:id', async (req, reply) => {
  const u = requireAuthenticated(req)
  const { id } = req.params as { id: string }
  const row = await prisma.websiteDomain.findFirst({ where: { id, tenant: { ownerUserId: u.id } } })
  if (!row) return reply.code(404).send({ error: 'Website domain not found' })
  await prisma.websiteDomain.delete({ where: { id } })
  await createActivityLog({ tenantId: row.tenantId, source: 'api', eventType: 'website_domain.deleted', message: `Website domain "${row.domain}" was removed`, entityType: 'websiteDomain', entityId: row.id, metadata: { actorUserId: u.id, websiteDomainId: row.id, domain: row.domain } })
  return { ok: true }
})

const trackingLinkInclude = { tenant: true, campaign: true, affiliatePlatform: true, brand: { include: { affiliatePlatform: true } } } as const
const campaignListInclude = { datasets: { include: { dataset: true }, orderBy: { createdAt: 'asc' as const } }, _count: { select: { trackingLinks: true } } }
const campaignDetailInclude = { tenant: true, datasets: { include: { dataset: true }, orderBy: { createdAt: 'asc' as const } }, trackingLinks: { include: trackingLinkInclude, orderBy: { createdAt: 'desc' as const } } }
async function assertCampaignDatasetLimit(tenantId: string, desiredCount: number) { const plan = await getTenantPlanOrDefault(tenantId); const limit = plan?.campaignDatasetLimit ?? 2; if (desiredCount > limit) throw new Error(`Dataset limit exceeded: ${desiredCount}/${limit} for plan ${plan?.name ?? 'current'}`); return limit }
async function validateCampaignDatasetIds(tenantId: string, datasetIds: string[]) { if (!datasetIds.length) return; const count = await prisma.dataset.count({ where: { tenantId, id: { in: datasetIds }, isActive: true } }); if (count !== datasetIds.length) throw new Error('One or more datasets were not found in this workspace') }

app.get('/campaigns', async (req) => { const u = requireAuthenticated(req); const q = req.query as AnyRecord; const tenantId = optionalQueryString(q.tenantId); if (tenantId) await assertTenantAccess(u.id, tenantId); const where = { tenantId, tenant: { ownerUserId: u.id } }; if (!wantsPaginatedResponse(q)) return prisma.campaign.findMany({ where, include: campaignListInclude, orderBy: { createdAt: 'desc' } }); const pagination = parsePagination(q); const [items, total] = await Promise.all([prisma.campaign.findMany({ where, include: campaignListInclude, orderBy: { createdAt: 'desc' }, skip: pagination.skip, take: pagination.take }), prisma.campaign.count({ where })]); return makePaginatedResponse(items, total, pagination) })
app.get('/campaigns/:id', async (req, reply) => { const u = requireAuthenticated(req); const { id } = req.params as { id: string }; const campaign = await prisma.campaign.findFirst({ where: { id, tenant: { ownerUserId: u.id } }, include: campaignDetailInclude }); if (!campaign) return reply.code(404).send({ error: 'Campaign not found' }); return campaign })
app.post('/campaigns', async (req, reply) => { const u = requireAuthenticated(req); const b = req.body as AnyRecord; const tenantId = requireString(b.tenantId, 'tenantId'); const name = requireString(b.name, 'name'); await assertTenantAccess(u.id, tenantId); const campaign = await prisma.campaign.create({ data: { tenantId, name }, include: campaignListInclude }); await createActivityLog({ tenantId, source: 'api', eventType: 'campaign.created', message: `Campaign "${campaign.name}" was created`, entityType: 'campaign', entityId: campaign.id, metadata: { actorUserId: u.id, campaignId: campaign.id } }); return reply.code(201).send(campaign) })
app.put('/campaigns/:id', async (req, reply) => { const u = requireAuthenticated(req); const { id } = req.params as { id: string }; const b = req.body as AnyRecord; const c = await prisma.campaign.findFirst({ where: { id, tenant: { ownerUserId: u.id } } }); if (!c) return reply.code(404).send({ error: 'Campaign not found' }); return prisma.campaign.update({ where: { id }, data: { name: optionalString(b.name) ?? c.name }, include: campaignListInclude }) })
app.put('/campaigns/:id/datasets', async (req, reply) => { const u = requireAuthenticated(req); const { id } = req.params as { id: string }; const campaign = await prisma.campaign.findFirst({ where: { id, tenant: { ownerUserId: u.id } } }); if (!campaign) return reply.code(404).send({ error: 'Campaign not found' }); const datasetIds = parseStringList((req.body as AnyRecord).datasetIds); await assertCampaignDatasetLimit(campaign.tenantId, datasetIds.length); await validateCampaignDatasetIds(campaign.tenantId, datasetIds); await prisma.$transaction([prisma.campaignDataset.deleteMany({ where: { campaignId: id } }), ...datasetIds.map((datasetId) => prisma.campaignDataset.create({ data: { tenantId: campaign.tenantId, campaignId: id, datasetId } }))]); const updated = await prisma.campaign.findUnique({ where: { id }, include: campaignDetailInclude }); await createActivityLog({ tenantId: campaign.tenantId, source: 'api', eventType: 'campaign.datasets_updated', message: `Campaign "${campaign.name}" dataset selection was updated`, entityType: 'campaign', entityId: id, metadata: { actorUserId: u.id, campaignId: id, datasetIds, datasetCount: datasetIds.length } }); return updated })
app.delete('/campaigns/:id', async (req, reply) => { const u = requireAuthenticated(req); const { id } = req.params as { id: string }; if (!await prisma.campaign.findFirst({ where: { id, tenant: { ownerUserId: u.id } } })) return reply.code(404).send({ error: 'Campaign not found' }); await prisma.campaign.delete({ where: { id } }); return { ok: true } })

app.get('/brands', async (req) => { const u = requireAuthenticated(req); const q = req.query as AnyRecord; const tenantId = optionalQueryString(q.tenantId); if (tenantId) await assertTenantAccess(u.id, tenantId); const where = { tenantId, tenant: { ownerUserId: u.id } }; if (!wantsPaginatedResponse(q)) return prisma.brand.findMany({ where, include: { tenant: true, affiliatePlatform: true }, orderBy: { createdAt: 'desc' } }); const pagination = parsePagination(q); const [items, total] = await Promise.all([prisma.brand.findMany({ where, include: { tenant: true, affiliatePlatform: true }, orderBy: { createdAt: 'desc' }, skip: pagination.skip, take: pagination.take }), prisma.brand.count({ where })]); return makePaginatedResponse(items, total, pagination) })
app.post('/brands', async (req, reply) => { const u = requireAuthenticated(req); const b = req.body as AnyRecord; const tenantId = requireString(b.tenantId, 'tenantId'); await assertTenantAccess(u.id, tenantId); const affiliatePlatformId = requireString(b.affiliatePlatformId, 'affiliatePlatformId'); if (!await prisma.affiliatePlatform.findFirst({ where: { id: affiliatePlatformId, tenantId } })) return reply.code(404).send({ error: 'Affiliate platform not found in this workspace' }); const brand = await prisma.brand.create({ data: { tenantId, affiliatePlatformId, name: requireString(b.name, 'name'), affiliateUrl: validateHttpUrl(requireString(b.affiliateUrl, 'affiliateUrl'), 'affiliateUrl') }, include: { tenant: true, affiliatePlatform: true } }); await createActivityLog({ tenantId, source: 'api', eventType: 'brand.created', message: `Brand / offer "${brand.name}" was created`, entityType: 'brand', entityId: brand.id, metadata: { actorUserId: u.id, brandId: brand.id, affiliatePlatformId } }); return reply.code(201).send(brand) })
app.put('/brands/:id', async (req, reply) => { const u = requireAuthenticated(req); const { id } = req.params as { id: string }; const b = req.body as AnyRecord; const brand = await prisma.brand.findFirst({ where: { id, tenant: { ownerUserId: u.id } } }); if (!brand) return reply.code(404).send({ error: 'Brand not found' }); const affiliatePlatformId = optionalString(b.affiliatePlatformId) ?? brand.affiliatePlatformId; if (!await prisma.affiliatePlatform.findFirst({ where: { id: affiliatePlatformId, tenantId: brand.tenantId } })) return reply.code(404).send({ error: 'Affiliate platform not found in this workspace' }); return prisma.brand.update({ where: { id }, data: { affiliatePlatformId, name: optionalString(b.name) ?? brand.name, affiliateUrl: b.affiliateUrl ? validateHttpUrl(requireString(b.affiliateUrl, 'affiliateUrl'), 'affiliateUrl') : brand.affiliateUrl }, include: { tenant: true, affiliatePlatform: true } }) })
app.delete('/brands/:id', async (req, reply) => { const u = requireAuthenticated(req); const { id } = req.params as { id: string }; if (!await prisma.brand.findFirst({ where: { id, tenant: { ownerUserId: u.id } } })) return reply.code(404).send({ error: 'Brand not found' }); await prisma.brand.delete({ where: { id } }); return { ok: true } })

app.get('/affiliate-platforms', async (req) => { const u = requireAuthenticated(req); const q = req.query as AnyRecord; if (q.tenantId) await assertTenantAccess(u.id, q.tenantId); const rows = await prisma.affiliatePlatform.findMany({ where: { tenantId: q.tenantId, tenant: { ownerUserId: u.id } }, orderBy: { createdAt: 'desc' } }); return rows.map(serializeAffiliatePlatform) })
app.post('/affiliate-platforms', async (req, reply) => { const u = requireAuthenticated(req); const b = req.body as AnyRecord; const tenantId = requireString(b.tenantId, 'tenantId'); const name = requireString(b.name, 'name'); const platform = getAffiliatePlatformChoice(b); await assertTenantAccess(u.id, tenantId); const row = await prisma.affiliatePlatform.create({ data: { tenantId, name, slug: toSlug(name) || platform.slug, ...getAffiliatePlatformBaseData(platform) } }); await createActivityLog({ tenantId, source: 'api', eventType: 'affiliate_platform.created', message: `Affiliate platform "${row.name}" was created`, entityType: 'affiliatePlatform', entityId: row.id, metadata: { actorUserId: u.id, platformId: row.id, platformKey: platform.key, slug: row.slug, trackingParamKey: row.trackingParamKey, webhookMethod: row.webhookMethod } }); return reply.code(201).send(serializeAffiliatePlatform(row)) })
app.put('/affiliate-platforms/:id', async (req, reply) => { const u = requireAuthenticated(req); const { id } = req.params as { id: string }; const b = req.body as AnyRecord; const row = await prisma.affiliatePlatform.findFirst({ where: { id, tenant: { ownerUserId: u.id } } }); if (!row) return reply.code(404).send({ error: 'Affiliate platform not found' }); const name = optionalString(b.name) ?? row.name; const platform = getAffiliatePlatformChoice(b, row); const updated = await prisma.affiliatePlatform.update({ where: { id }, data: { name, ...getAffiliatePlatformBaseData(platform) } }); return serializeAffiliatePlatform(updated) })
app.get('/affiliate-platforms/:id/webhook-token', async (req, reply) => { const u = requireAuthenticated(req); const { id } = req.params as { id: string }; const row = await prisma.affiliatePlatform.findFirst({ where: { id, tenant: { ownerUserId: u.id } } }); if (!row) return reply.code(404).send({ error: 'Affiliate platform not found' }); return { webhookToken: row.webhookToken } })
app.post('/affiliate-platforms/:id/webhook-token/rotate', async (req, reply) => { const u = requireAuthenticated(req); const { id } = req.params as { id: string }; const platform = await prisma.affiliatePlatform.findFirst({ where: { id, tenant: { ownerUserId: u.id } } }); if (!platform) return reply.code(404).send({ error: 'Affiliate platform not found' }); const updated = await prisma.affiliatePlatform.update({ where: { id }, data: { webhookToken: randomUUID() } }); await createActivityLog({ tenantId: platform.tenantId, source: 'api', eventType: 'affiliate_platform.webhook_token_rotated', message: `Webhook token for "${platform.name}" was rotated`, entityType: 'affiliatePlatform', entityId: id, metadata: { actorUserId: u.id, platformId: id, slug: platform.slug } }); return serializeAffiliatePlatform(updated) })
app.delete('/affiliate-platforms/:id', async (req, reply) => { const u = requireAuthenticated(req); const { id } = req.params as { id: string }; if (!await prisma.affiliatePlatform.findFirst({ where: { id, tenant: { ownerUserId: u.id } } })) return reply.code(404).send({ error: 'Affiliate platform not found' }); await prisma.affiliatePlatform.delete({ where: { id } }); return { ok: true } })

app.post('/affiliate-platforms/test-event-mapping', async (req, reply) => {
  const u = requireAuthenticated(req)
  const b = req.body as AnyRecord
  const platformId = optionalString(b.platformId)
  let tenantId = optionalString(b.tenantId)
  let defaultEventName = normalizeEventName(b.defaultEventName)
  let mapping: unknown = b.eventMapping
  let platformForResolution: { slug?: string | null; name?: string | null; trackingParamKey?: string | null; eventMapping?: unknown; defaultEventName?: string | null } = { eventMapping: mapping, defaultEventName }

  if (platformId) {
    const platform = await prisma.affiliatePlatform.findFirst({ where: { id: platformId, tenant: { ownerUserId: u.id } } })
    if (!platform) return reply.code(404).send({ error: 'Affiliate platform not found' })
    tenantId = platform.tenantId
    defaultEventName = normalizeEventName(b.defaultEventName ?? platform.defaultEventName)
    mapping = b.eventMapping ?? platform.eventMapping
    platformForResolution = { ...platform, eventMapping: mapping, defaultEventName }
  } else {
    platformForResolution = { slug: optionalString(b.slug), name: optionalString(b.name), eventMapping: mapping, defaultEventName }
  }

  if (tenantId) await assertTenantAccess(u.id, tenantId)
  const samplePayload = b.samplePayload && typeof b.samplePayload === 'object' ? b.samplePayload as AnyRecord : {}
  const normalizedMapping = normalizeAffiliateEventMapping(mapping)
  const result = resolvePlatformEventName(platformForResolution, samplePayload)
  return { result, normalizedMapping, samplePayload }
})


app.get('/datasets', async (req) => { const u = requireAuthenticated(req); const q = req.query as AnyRecord; if (q.tenantId) await assertTenantAccess(u.id, q.tenantId); const rows = await prisma.dataset.findMany({ where: { tenantId: q.tenantId, platform: q.platform, tenant: { ownerUserId: u.id } }, orderBy: { createdAt: 'desc' } }); return rows.map(serializeDataset) })
app.post('/datasets', async (req, reply) => { const u = requireAuthenticated(req); const b = req.body as AnyRecord; const tenantId = requireString(b.tenantId, 'tenantId'); await assertTenantAccess(u.id, tenantId); const row = await prisma.dataset.create({ data: { tenantId, platform: normalizeDatasetPlatform(b.platform), name: requireString(b.name, 'name'), pixelId: requireString(b.pixelId, 'pixelId'), accessToken: requireString(b.accessToken, 'accessToken'), isActive: optionalBoolean(b.isActive, true) } }); await createActivityLog({ tenantId, source: 'api', eventType: 'dataset.created', message: `Dataset / pixel "${row.name}" was created`, entityType: 'dataset', entityId: row.id, metadata: { actorUserId: u.id, datasetId: row.id, platform: row.platform, pixelId: row.pixelId, isActive: row.isActive } }); return reply.code(201).send(serializeDataset(row)) })
app.put('/datasets/:id', async (req, reply) => { const u = requireAuthenticated(req); const { id } = req.params as { id: string }; const b = req.body as AnyRecord; const row = await prisma.dataset.findFirst({ where: { id, tenant: { ownerUserId: u.id } } }); if (!row) return reply.code(404).send({ error: 'Dataset not found' }); const updated = await prisma.dataset.update({ where: { id }, data: { platform: b.platform ? normalizeDatasetPlatform(b.platform) : row.platform, name: optionalString(b.name) ?? row.name, pixelId: optionalString(b.pixelId) ?? row.pixelId, accessToken: optionalString(b.accessToken) ?? row.accessToken, isActive: optionalBoolean(b.isActive, row.isActive) } }); await createActivityLog({ tenantId: row.tenantId, source: 'api', eventType: 'dataset.updated', message: `Dataset / pixel "${updated.name}" was updated`, entityType: 'dataset', entityId: id, metadata: { actorUserId: u.id, datasetId: id, platform: updated.platform, pixelId: updated.pixelId, isActive: updated.isActive, changedAccessToken: Boolean(optionalString(b.accessToken)) } }); return serializeDataset(updated) })
app.delete('/datasets/:id', async (req, reply) => { const u = requireAuthenticated(req); const { id } = req.params as { id: string }; if (!await prisma.dataset.findFirst({ where: { id, tenant: { ownerUserId: u.id } } })) return reply.code(404).send({ error: 'Dataset not found' }); await prisma.dataset.delete({ where: { id } }); return { ok: true } })

app.get('/tracking-links', async (req) => {
  const u = requireAuthenticated(req)
  const q = req.query as AnyRecord
  const tenantId = optionalQueryString(q.tenantId)
  if (tenantId) await assertTenantAccess(u.id, tenantId)
  const where = {
    tenantId,
    campaignId: optionalQueryString(q.campaignId),
    brandId: optionalQueryString(q.brandId),
    affiliatePlatformId: optionalQueryString(q.affiliatePlatformId) ?? optionalQueryString(q.platformId),
    tenant: { ownerUserId: u.id }
  }
  if (!wantsPaginatedResponse(q)) return prisma.trackingLink.findMany({ where, include: trackingLinkInclude, orderBy: { createdAt: 'desc' } })
  const pagination = parsePagination(q)
  const [items, total] = await Promise.all([
    prisma.trackingLink.findMany({ where, include: trackingLinkInclude, orderBy: { createdAt: 'desc' }, skip: pagination.skip, take: pagination.take }),
    prisma.trackingLink.count({ where })
  ])
  return makePaginatedResponse(items, total, pagination)
})

app.post('/tracking-links', async (req, reply) => {
  const u = requireAuthenticated(req)
  const b = req.body as AnyRecord
  const tenantId = requireString(b.tenantId, 'tenantId')
  await assertTenantAccess(u.id, tenantId)
  const slug = requireString(b.slug, 'slug')
  if (await prisma.trackingLink.findUnique({ where: { tenantId_slug: { tenantId, slug } } })) return reply.code(409).send({ error: 'Slug "' + slug + '" đã tồn tại trong workspace này' })
  const affiliatePlatformId = requireString(b.affiliatePlatformId, 'affiliatePlatformId')
  const affiliatePlatform = await prisma.affiliatePlatform.findFirst({ where: { id: affiliatePlatformId, tenantId } })
  if (!affiliatePlatform) return reply.code(404).send({ error: 'Affiliate platform not found in this workspace' })
  const campaignId = optionalString(b.campaignId) ?? null
  if (campaignId && !await prisma.campaign.findFirst({ where: { id: campaignId, tenantId } })) return reply.code(404).send({ error: 'Campaign not found in this workspace' })
  const brandId = optionalString(b.brandId)
  if (brandId && !await prisma.brand.findFirst({ where: { id: brandId, tenantId } })) return reply.code(404).send({ error: 'Brand not found in this workspace' })
  const link = await prisma.trackingLink.create({
    data: {
      tenantId,
      campaignId,
      brandId: brandId ?? null,
      affiliatePlatformId: affiliatePlatform.id,
      affiliateUrl: validateHttpUrl(requireString(b.affiliateUrl, 'affiliateUrl'), 'affiliateUrl'),
      slug,
      prelanderEnabled: optionalBoolean(b.prelanderEnabled, false),
      prelanderTitle: nullableString(b.prelanderTitle),
      prelanderHeadline: nullableString(b.prelanderHeadline),
      prelanderBody: nullableString(b.prelanderBody),
      prelanderCtaText: optionalString(b.prelanderCtaText) ?? 'Continue',
      prelanderCtaDelaySeconds: optionalInteger(b.prelanderCtaDelaySeconds, 2),
      prelanderTheme: normalizePrelanderTheme(b.prelanderTheme),
      isActive: optionalBoolean(b.isActive, true)
    },
    include: trackingLinkInclude
  })
  await createActivityLog({ tenantId, source: 'api', eventType: 'tracking_link.created', message: 'Tracking link "' + link.slug + '" was created', entityType: 'trackingLink', entityId: link.id, metadata: { actorUserId: u.id, trackingLinkId: link.id, slug: link.slug, campaignId, affiliatePlatformId: affiliatePlatform.id, affiliateUrl: link.affiliateUrl, brandId: brandId ?? null, prelanderEnabled: link.prelanderEnabled, prelanderTitle: link.prelanderTitle, prelanderHeadline: link.prelanderHeadline, prelanderCtaDelaySeconds: link.prelanderCtaDelaySeconds, isActive: link.isActive } })
  return reply.code(201).send(link)
})

app.put('/tracking-links/:id', async (req, reply) => {
  const u = requireAuthenticated(req)
  const { id } = req.params as { id: string }
  const b = req.body as AnyRecord
  const row = await prisma.trackingLink.findFirst({ where: { id, tenant: { ownerUserId: u.id } } })
  if (!row) return reply.code(404).send({ error: 'Tracking link not found' })
  const affiliatePlatformId = optionalString(b.affiliatePlatformId) ?? row.affiliatePlatformId
  if (!await prisma.affiliatePlatform.findFirst({ where: { id: affiliatePlatformId, tenantId: row.tenantId } })) return reply.code(404).send({ error: 'Affiliate platform not found in this workspace' })
  const brandId = typeof b.brandId === 'string' ? optionalString(b.brandId) ?? null : row.brandId
  if (brandId && !await prisma.brand.findFirst({ where: { id: brandId, tenantId: row.tenantId } })) return reply.code(404).send({ error: 'Brand not found in this workspace' })
  const campaignId = typeof b.campaignId === 'string' ? optionalString(b.campaignId) ?? null : row.campaignId
  if (campaignId && !await prisma.campaign.findFirst({ where: { id: campaignId, tenantId: row.tenantId } })) return reply.code(404).send({ error: 'Campaign not found in this workspace' })
  const nextSlug = optionalString(b.slug) ?? row.slug
  if (nextSlug !== row.slug && await prisma.trackingLink.findUnique({ where: { tenantId_slug: { tenantId: row.tenantId, slug: nextSlug } } })) return reply.code(409).send({ error: 'Slug "' + nextSlug + '" đã tồn tại trong workspace này' })
  const updated = await prisma.trackingLink.update({
    where: { id },
    data: {
      brandId,
      affiliatePlatformId,
      affiliateUrl: b.affiliateUrl ? validateHttpUrl(requireString(b.affiliateUrl, 'affiliateUrl'), 'affiliateUrl') : row.affiliateUrl,
      campaignId,
      slug: nextSlug,
      prelanderEnabled: optionalBoolean(b.prelanderEnabled, row.prelanderEnabled),
      prelanderTitle: nullableString(b.prelanderTitle, row.prelanderTitle),
      prelanderHeadline: nullableString(b.prelanderHeadline, row.prelanderHeadline),
      prelanderBody: nullableString(b.prelanderBody, row.prelanderBody),
      prelanderCtaText: optionalString(b.prelanderCtaText) ?? row.prelanderCtaText,
      prelanderCtaDelaySeconds: optionalInteger(b.prelanderCtaDelaySeconds, row.prelanderCtaDelaySeconds),
      prelanderTheme: typeof b.prelanderTheme === 'string' ? normalizePrelanderTheme(b.prelanderTheme) : row.prelanderTheme,
      isActive: optionalBoolean(b.isActive, row.isActive)
    },
    include: trackingLinkInclude
  })
  await createActivityLog({ tenantId: row.tenantId, source: 'api', eventType: 'tracking_link.updated', message: 'Tracking link "' + updated.slug + '" was updated', entityType: 'trackingLink', entityId: id, metadata: { actorUserId: u.id, trackingLinkId: id, slug: updated.slug, campaignId, affiliatePlatformId, affiliateUrl: updated.affiliateUrl, brandId, prelanderEnabled: updated.prelanderEnabled, prelanderTitle: updated.prelanderTitle, prelanderHeadline: updated.prelanderHeadline, prelanderCtaDelaySeconds: updated.prelanderCtaDelaySeconds, isActive: updated.isActive } })
  return updated
})

app.delete('/tracking-links/:id', async (req, reply) => { const u = requireAuthenticated(req); const { id } = req.params as { id: string }; if (!await prisma.trackingLink.findFirst({ where: { id, tenant: { ownerUserId: u.id } } })) return reply.code(404).send({ error: 'Tracking link not found' }); await prisma.trackingLink.delete({ where: { id } }); return { ok: true } })

type ClickEventSource = 'click' | 'affiliate_conversion' | 'tracking_script'
function buildClickEventQueueJobId(clickEvent: { id: bigint; clickUuid: string }, eventName?: string, source: ClickEventSource = 'click', sourceId?: string) { return `click-${sha256Hex(stableStringify({ clickEventId: clickEvent.id, clickUuid: clickEvent.clickUuid, eventName: eventName ?? '', source, sourceId: sourceId ?? '' }))}` }
async function enqueueClick(clickEvent: { id: bigint; clickUuid: string; tenantId: string; trackingLinkId: string }, eventName?: string, source: ClickEventSource = 'click', sourceId?: string) { await clickEventsQueue.add('click.created', { clickEventId: clickEvent.id.toString(), clickUuid: clickEvent.clickUuid, tenantId: clickEvent.tenantId, trackingLinkId: clickEvent.trackingLinkId, eventName, source, sourceId }, { jobId: buildClickEventQueueJobId(clickEvent, eventName, source, sourceId) }) }

app.get('/click-events', async (req) => { const u = requireAuthenticated(req); const q = req.query as AnyRecord; const tenantId = optionalQueryString(q.tenantId); if (tenantId) await assertTenantAccess(u.id, tenantId); const where = buildClickEventWhere(u.id, q); const include = { campaign: true, trackingLink: { include: { affiliatePlatform: true, brand: { include: { affiliatePlatform: true } } } } }; if (!wantsPaginatedResponse(q)) return (await prisma.clickEvent.findMany({ where, include, orderBy: { createdAt: 'desc' }, take: 100 })).map(serializeClick); const pagination = parsePagination(q); const [rows, total] = await Promise.all([prisma.clickEvent.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip: pagination.skip, take: pagination.take }), prisma.clickEvent.count({ where })]); return makePaginatedResponse(rows.map(serializeClick), total, pagination) })
app.get('/capi-events', async (req) => { const u = requireAuthenticated(req); const q = req.query as AnyRecord; const tenantId = optionalQueryString(q.tenantId); if (tenantId) await assertTenantAccess(u.id, tenantId); const where = buildCapiEventWhere(u.id, q); const include = { clickEvent: { include: { campaign: true, trackingLink: { include: { affiliatePlatform: true, brand: { include: { affiliatePlatform: true } } } } } } }; if (!wantsPaginatedResponse(q)) return (await prisma.capiEvent.findMany({ where, include, orderBy: { createdAt: 'desc' }, take: 100 })).map(serializeCapi); const pagination = parsePagination(q); const [rows, total] = await Promise.all([prisma.capiEvent.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip: pagination.skip, take: pagination.take }), prisma.capiEvent.count({ where })]); return makePaginatedResponse(rows.map(serializeCapi), total, pagination) })
app.get('/conversion-events', async (req) => { const u = requireAuthenticated(req); const q = req.query as AnyRecord; const tenantId = optionalQueryString(q.tenantId); if (tenantId) await assertTenantAccess(u.id, tenantId); const where = await buildConversionEventWhere(u.id, q); const include = { affiliatePlatform: true }; if (!wantsPaginatedResponse(q)) return attachAttributionToConversions(await prisma.affiliateConversionEvent.findMany({ where, include, orderBy: { createdAt: 'desc' }, take: 100 })); const pagination = parsePagination(q); const [rows, total] = await Promise.all([prisma.affiliateConversionEvent.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip: pagination.skip, take: pagination.take }), prisma.affiliateConversionEvent.count({ where })]); return makePaginatedResponse(await attachAttributionToConversions(rows), total, pagination) })
app.get('/activity-logs', async (req) => { const u = requireAuthenticated(req); const q = req.query as AnyRecord; const tenantId = optionalQueryString(q.tenantId); if (tenantId) await assertTenantAccess(u.id, tenantId); const { whereSql, params } = buildActivityLogSql(u.id, q); const baseSelect = 'SELECT log."id"::text AS "id", log."tenantId", log."level"::text AS "level", log."source", log."eventType", log."message", log."entityType", log."entityId", log."metadata", log."createdAt" FROM "ActivityLog" log JOIN "Tenant" tenant ON tenant."id" = log."tenantId"'; if (!wantsPaginatedResponse(q)) return (await prisma.$queryRawUnsafe<AnyRecord[]>(`${baseSelect} ${whereSql} ORDER BY log."createdAt" DESC LIMIT 100`, ...params)).map(serializeActivityLog); const pagination = parsePagination(q); const rowsParams = [...params, pagination.take, pagination.skip]; const [rows, countRows] = await Promise.all([prisma.$queryRawUnsafe<AnyRecord[]>(`${baseSelect} ${whereSql} ORDER BY log."createdAt" DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, ...rowsParams), prisma.$queryRawUnsafe<Array<{ total: number }>>(`SELECT COUNT(*)::int AS total FROM "ActivityLog" log JOIN "Tenant" tenant ON tenant."id" = log."tenantId" ${whereSql}`, ...params)]); return makePaginatedResponse(rows.map(serializeActivityLog), Number(countRows[0]?.total ?? 0), pagination) })
app.get('/analytics/summary', async (req) => { const u = requireAuthenticated(req); const q = req.query as AnyRecord; const tenantId = optionalQueryString(q.tenantId); if (tenantId) await assertTenantAccess(u.id, tenantId); return (await buildAnalyticsBreakdown(u.id, q)).summary })
app.get('/analytics/breakdown', async (req) => { const u = requireAuthenticated(req); const q = req.query as AnyRecord; const tenantId = optionalQueryString(q.tenantId); if (tenantId) await assertTenantAccess(u.id, tenantId); return buildAnalyticsBreakdown(u.id, q) })

app.get('/analytics/export.csv', async (req, reply) => {
  const u = requireAuthenticated(req)
  const q = req.query as AnyRecord
  const tenantId = optionalQueryString(q.tenantId)
  if (tenantId) await assertTenantAccess(u.id, tenantId)
  const type = (optionalQueryString(q.type) ?? 'conversions').toLowerCase()
  const limit = parsePositiveInteger(q.limit, 5000, 20000)
  let headers: string[]
  let rows: AnyRecord[]

  if (type === 'clicks') {
    const clickRows = await prisma.clickEvent.findMany({ where: buildClickEventWhere(u.id, q), include: { campaign: true, trackingLink: { include: { affiliatePlatform: true, brand: { include: { affiliatePlatform: true } } } } }, orderBy: { createdAt: 'desc' }, take: limit })
    headers = ['id', 'createdAt', 'tenantId', 'campaign', 'trackingLink', 'brand', 'affiliatePlatform', 'clickUuid', 'ip', 'fbclid', 'ttclid', 'referrer']
    rows = clickRows.map((row: AnyRecord) => ({ id: row.id.toString(), createdAt: row.createdAt, tenantId: row.tenantId, campaign: row.campaign?.name, trackingLink: row.trackingLink?.slug, brand: row.trackingLink?.brand?.name ?? row.trackingLink?.slug, affiliatePlatform: row.trackingLink?.affiliatePlatform?.name ?? row.trackingLink?.brand?.affiliatePlatform?.name, clickUuid: row.clickUuid, ip: row.ip, fbclid: row.fbclid, ttclid: row.ttclid, referrer: row.referrer }))
  } else if (type === 'capi') {
    const capiRows = await prisma.capiEvent.findMany({ where: buildCapiEventWhere(u.id, q), include: { clickEvent: { include: { trackingLink: { include: { brand: true } } } } }, orderBy: { createdAt: 'desc' }, take: limit })
    headers = ['id', 'createdAt', 'platform', 'eventName', 'source', 'sourceId', 'status', 'attempts', 'clickUuid', 'trackingLink', 'lastError']
    rows = capiRows.map((row: AnyRecord) => ({ id: row.id.toString(), createdAt: row.createdAt, platform: row.platform, eventName: row.eventName, source: row.source, sourceId: row.sourceId, status: row.status, attempts: row.attempts, clickUuid: row.clickEvent?.clickUuid, trackingLink: row.clickEvent?.trackingLink?.slug, lastError: row.lastError }))
  } else if (type === 'breakdown') {
    const breakdown = await buildAnalyticsBreakdown(u.id, q)
    headers = ['group', 'id', 'name', 'refId', 'refSource', 'sourceLabel', 'affiliatePlatform', 'clicks', 'uniqueClicks', 'conversions', 'attributedConversions', 'unattributedConversions', 'conversionRate', 'revenue', 'payout', 'commission', 'spend']
    rows = ['byCampaign', 'byBrand', 'byPlatform', 'byRefId', 'byDay'].flatMap((group) => (breakdown as AnyRecord)[group].map((row: AnyRecord) => ({ group, affiliatePlatform: row.affiliatePlatformName, ...row })))
  } else {
    const conversionRows = await attachAttributionToConversions(await prisma.affiliateConversionEvent.findMany({ where: await buildConversionEventWhere(u.id, q), include: { affiliatePlatform: true }, orderBy: { createdAt: 'desc' }, take: limit }))
    headers = ['id', 'createdAt', 'tenantId', 'affiliatePlatform', 'eventName', 'clickUuid', 'affiliateRefId', 'affiliateRefSource', 'partnerStackCustomerKey', 'impactRefClickId', 'matched', 'attributionMethod', 'matchedByRefId', 'amount', 'payout', 'currency', 'postbackEventAt', 'postbackDateField', 'firstReceivedAt', 'firstReceivedField', 'capiUpdatedAt', 'capiStatus', 'capiDelaySeconds', 'trackingLink', 'requestCount', 'idempotencyKey']
    rows = conversionRows.map((row: AnyRecord) => ({ id: row.id, createdAt: row.createdAt, tenantId: row.tenantId, affiliatePlatform: row.affiliatePlatform?.name, eventName: row.eventName, clickUuid: row.clickUuid, affiliateRefId: row.affiliateRefId, affiliateRefSource: row.affiliateRefSource, partnerStackCustomerKey: row.partnerStackCustomerKey, impactRefClickId: row.impactRefClickId, matched: row.attribution?.matched, attributionMethod: row.attribution?.attributionMethod, matchedByRefId: row.attribution?.matchedByRefId, amount: row.postbackAmount, payout: row.postbackPayout, currency: row.currency, postbackEventAt: row.postbackEventAt, postbackDateField: row.postbackEventDateField, firstReceivedAt: row.firstReceivedAt, firstReceivedField: row.firstReceivedField, capiUpdatedAt: row.capiUpdatedAt, capiStatus: row.capiStatus, capiDelaySeconds: row.capiDelaySeconds, trackingLink: row.attribution?.trackingLink?.slug, requestCount: row.requestCount, idempotencyKey: row.idempotencyKey }))
  }

  return reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="${type}-export.csv"`).send(toCsv(headers, rows))
})

app.get('/report-schedules', async (req) => { const u = requireAuthenticated(req); const q = req.query as AnyRecord; const tenantId = optionalQueryString(q.tenantId); if (tenantId) await assertTenantAccess(u.id, tenantId); return prisma.reportSchedule.findMany({ where: { tenantId, tenant: { ownerUserId: u.id } }, orderBy: { createdAt: 'desc' } }) })
app.post('/report-schedules', async (req, reply) => { const u = requireAuthenticated(req); const b = req.body as AnyRecord; const tenantId = requireString(b.tenantId, 'tenantId'); await assertTenantAccess(u.id, tenantId); const frequency = normalizeReportFrequency(b.frequency); const row = await prisma.reportSchedule.create({ data: { tenantId, name: requireString(b.name, 'name'), reportType: optionalString(b.reportType) ?? 'analytics', frequency, recipientEmail: optionalString(b.recipientEmail), filters: b.filters && typeof b.filters === 'object' ? b.filters as Prisma.InputJsonValue : undefined, isActive: optionalBoolean(b.isActive, true), nextRunAt: b.nextRunAt ? parseDateQuery(b.nextRunAt) : getNextReportRunAt(frequency) } }); return reply.code(201).send(row) })
app.put('/report-schedules/:id', async (req, reply) => { const u = requireAuthenticated(req); const { id } = req.params as { id: string }; const b = req.body as AnyRecord; const row = await prisma.reportSchedule.findFirst({ where: { id, tenant: { ownerUserId: u.id } } }); if (!row) return reply.code(404).send({ error: 'Report schedule not found' }); const frequency = normalizeReportFrequency(b.frequency ?? row.frequency); return prisma.reportSchedule.update({ where: { id }, data: { name: optionalString(b.name) ?? row.name, reportType: optionalString(b.reportType) ?? row.reportType, frequency, recipientEmail: typeof b.recipientEmail === 'string' ? b.recipientEmail : row.recipientEmail, filters: b.filters && typeof b.filters === 'object' ? b.filters as Prisma.InputJsonValue : row.filters as Prisma.InputJsonValue, isActive: optionalBoolean(b.isActive, row.isActive), nextRunAt: b.nextRunAt ? parseDateQuery(b.nextRunAt) : row.nextRunAt ?? getNextReportRunAt(frequency) } }) })
app.delete('/report-schedules/:id', async (req, reply) => { const u = requireAuthenticated(req); const { id } = req.params as { id: string }; if (!await prisma.reportSchedule.findFirst({ where: { id, tenant: { ownerUserId: u.id } } })) return reply.code(404).send({ error: 'Report schedule not found' }); await prisma.reportSchedule.delete({ where: { id } }); return { ok: true } })


app.route({
  method: ['GET', 'POST'],
  url: '/affiliate-webhooks/:tenantKey/:platformSlug',
  config: { rateLimit: { max: Number(process.env.PUBLIC_WEBHOOK_RATE_LIMIT_MAX ?? 120), timeWindow: process.env.PUBLIC_WEBHOOK_RATE_LIMIT_WINDOW ?? '1 minute' } },
  handler: async (req, reply) => {
    const p = req.params as { tenantKey: string; platformSlug: string }
    const q = req.query as AnyRecord
    const method = req.method.toUpperCase()
    const platform = await prisma.affiliatePlatform.findFirst({ where: { slug: p.platformSlug, tenant: { OR: [{ id: p.tenantKey }, { publicKey: p.tenantKey }] } } })
    if (!platform) return reply.code(404).send({ error: 'Affiliate webhook not found' })

    const payload = sanitizeWebhookPayload(normalizeAffiliateWebhookPayload(method === 'GET' ? { ...q } : req.body ?? {}))
    const rawClickUuid = extractClickUuid(payload, resolveTrackingParamKey(platform, { preferStored: true }))
    const eventMatch = resolvePlatformEventName(platform, payload)
    const eventNamesToSend = resolveImpactPostbackEventNames(platform, payload, eventMatch.eventName)
    const money = extractConversionMoney(payload)
    const affiliateRefs = extractAffiliateRefIds(platform, payload)
    const idempotencyKey = buildAffiliatePostbackIdempotencyKey(req, platform.id, payload, rawClickUuid, eventMatch.eventName)
    const now = new Date()
    const directClickEvent = await findClickEventByUuid(platform.tenantId, rawClickUuid)
    const learnedAttribution = directClickEvent ? null : await findAffiliateRefAttribution(platform, affiliateRefs)
    const clickEvent = directClickEvent ?? learnedAttribution?.clickEvent ?? null
    const resolvedClickUuid = clickEvent?.clickUuid ?? rawClickUuid
    const attributionMethod = directClickEvent ? 'direct_click_uuid' : learnedAttribution?.clickEvent ? 'affiliate_ref_id' : undefined
    const attributionSnapshot = buildAttributionSnapshot(clickEvent, platform, attributionMethod)
    const capiEnrichment = buildCapiEnrichment(payload, money, resolvedClickUuid, eventMatch.eventName)
    const baseData = {
      tenantId: platform.tenantId,
      affiliatePlatformId: platform.id,
      clickEventId: clickEvent?.id,
      clickUuid: resolvedClickUuid,
      idempotencyKey,
      lastReceivedAt: now,
      eventName: eventMatch.eventName,
      eventRule: eventMatch.eventRule,
      eventMatchedField: eventMatch.eventMatchedField,
      eventMatchedValue: eventMatch.eventMatchedValue,
      customerId: getPartnerStackCustomerId(payload) ?? getPayloadString(payload, ['customerId', 'customer_id', 'userId', 'user_id', 'externalId', 'external_id']),
      customerEmail: getPartnerStackCustomerEmail(payload) ?? getPayloadString(payload, ['customerEmail', 'customer_email', 'email']),
      affiliateRefId: affiliateRefs.affiliateRefId,
      affiliateRefSource: affiliateRefs.affiliateRefSource,
      partnerStackCustomerKey: affiliateRefs.partnerStackCustomerKey,
      impactRefClickId: affiliateRefs.impactRefClickId,
      spendAmount: money.spendAmount,
      payoutAmount: money.payoutAmount,
      commissionAmount: money.commissionAmount,
      currency: money.currency,
      attributionSnapshot: attributionSnapshot as Prisma.InputJsonValue,
      capiEnrichment: capiEnrichment as Prisma.InputJsonValue,
      rawPayload: payload as Prisma.InputJsonValue,
      receivedMethod: method
    }

    let duplicate = false
    let conversion: AnyRecord | null = null
    const uniqueWhere = { tenantId_affiliatePlatformId_idempotencyKey: { tenantId: platform.tenantId, affiliatePlatformId: platform.id, idempotencyKey } }
    const existing = await prisma.affiliateConversionEvent.findUnique({ where: uniqueWhere })
    if (existing) {
      duplicate = true
      conversion = await prisma.affiliateConversionEvent.update({ where: { id: existing.id }, data: { ...baseData, requestCount: { increment: 1 } }, include: { affiliatePlatform: true } })
    } else {
      await assertBillingLimit(platform.tenantId, 'eapiEvents')
      try {
        conversion = await prisma.affiliateConversionEvent.create({ data: baseData, include: { affiliatePlatform: true } })
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          duplicate = true
          conversion = await prisma.affiliateConversionEvent.update({ where: uniqueWhere, data: { ...baseData, requestCount: { increment: 1 } }, include: { affiliatePlatform: true } })
        } else {
          throw error
        }
      }
    }

    const learnedRef = clickEvent ? await upsertAffiliateRefAttribution(platform, affiliateRefs, clickEvent, conversion, attributionMethod, eventMatch) : null
    const backfilledConversions = clickEvent ? await backfillAffiliateRefConversions(platform, affiliateRefs, clickEvent, attributionSnapshot) : []
    const shouldEnqueueConversion = Boolean(clickEvent && conversion && (!duplicate || !existing?.clickEventId))
    if (shouldEnqueueConversion && clickEvent && conversion) await Promise.all(eventNamesToSend.map((eventName) => enqueueClick(clickEvent, eventName, 'affiliate_conversion', conversion.id.toString())))
    if (clickEvent && backfilledConversions.length) await Promise.all(backfilledConversions.flatMap((row: AnyRecord) => getBackfilledConversionEventNames(platform, row).map((eventName) => enqueueClick(clickEvent, eventName, 'affiliate_conversion', row.id.toString()))))
    if (conversion) await createActivityLog({ tenantId: platform.tenantId, source: 'affiliate-webhook', eventType: duplicate ? 'affiliate_conversion.duplicate' : 'affiliate_conversion.received', message: `${duplicate ? 'Duplicate' : 'New'} affiliate conversion received from "${platform.name}"`, entityType: 'conversionEvent', entityId: conversion.id, metadata: { conversionEventId: conversion.id, affiliatePlatformId: platform.id, platformSlug: platform.slug, method, eventName: eventMatch.eventName, eventNames: eventNamesToSend, eventRule: eventMatch.eventRule, rawClickUuid, clickUuid: resolvedClickUuid, affiliateRefId: affiliateRefs.affiliateRefId, affiliateRefSource: affiliateRefs.affiliateRefSource, partnerStackCustomerKey: affiliateRefs.partnerStackCustomerKey, impactRefClickId: affiliateRefs.impactRefClickId, matchedClick: Boolean(clickEvent), clickEventId: clickEvent?.id, attributionMethod, learnedRefAttributionId: learnedRef?.id, backfilledConversions: backfilledConversions.length, duplicate, requestCount: conversion.requestCount, idempotencyKey, payoutAmount: money.payoutAmount, impactPayoutNumber: getImpactPayoutNumber(payload), impactActionTrackerName: getImpactActionTrackerEventName(payload), commissionAmount: money.commissionAmount, spendAmount: money.spendAmount, currency: money.currency } })
    return reply.code(duplicate ? 200 : 201).send({ ok: true, duplicate, id: conversion?.id.toString(), requestCount: conversion?.requestCount, eventName: eventMatch.eventName, eventNames: eventNamesToSend, idempotencyKey, affiliateRefId: affiliateRefs.affiliateRefId, affiliateRefSource: affiliateRefs.affiliateRefSource, attributionMethod, matchedByRefId: attributionMethod === 'affiliate_ref_id' })
  }
})

app.addHook('onClose', async () => { clerkUserCache.clear(); userSessionCache.clear(); await clickEventsQueue.close(); await readinessRedis.quit() })
app.setErrorHandler((error, _req, reply) => {
  app.log.error(error)
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return reply.code(409).send({ error: 'Dữ liệu đã tồn tại, vui lòng dùng tên hoặc slug khác' })
  if (error instanceof TokenVerificationError) {
    const isServerConfigError = error.reason === 'invalid-secret-key' || error.reason === 'remote-jwk-failed-to-load' || error.reason === 'local-jwk-missing'
    return reply.code(isServerConfigError ? 500 : 401).send({ error: isServerConfigError ? 'Internal server error' : 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn, vui lòng tải lại trang/đăng nhập lại' })
  }
  const message = error instanceof Error ? error.message : 'Unknown error'
  const unauthorized = ['Unauthorized', 'Missing Clerk bearer token', 'Invalid Clerk token']
  const hints = ['required', 'must', 'not found', 'access denied', 'exceeded', 'tồn tại']
  const statusCode = unauthorized.includes(message) ? 401 : hints.some((h) => message.toLowerCase().includes(h.toLowerCase())) ? 400 : 500
  return reply.code(statusCode).send({ error: statusCode === 500 ? 'Internal server error' : message })
})

app.listen({ port: Number(process.env.API_PORT ?? 3001), host: '0.0.0.0' })

