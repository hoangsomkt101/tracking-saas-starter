import 'dotenv/config'
import { createClerkClient, verifyToken } from '@clerk/backend'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import { createHash, randomUUID } from 'node:crypto'
import { Prisma, prisma, type User } from '@repo/db'
import { createClickEventsQueue, createFbc, createRedisConnection, getSupportedAffiliatePlatform, getWebhookToken, maskSecret, normalizeAffiliateEventMapping, normalizeEventName, normalizeHeaderValue, parseEnvList, requireSupportedAffiliatePlatform, resolveAffiliateEventName, validateHttpUrl, type AffiliateEventMatch, type SupportedAffiliatePlatformDefinition } from '@repo/shared'

const app = Fastify({ logger: true })
await app.register(helmet, { contentSecurityPolicy: false })
await app.register(rateLimit, { max: Number(process.env.API_RATE_LIMIT_MAX ?? 600), timeWindow: process.env.API_RATE_LIMIT_WINDOW ?? '1 minute' })

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
const clickEventsQueue = createClickEventsQueue()
const readinessRedis = createRedisConnection()

const allowedCorsOrigins = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  ...parseEnvList(process.env.ALLOWED_ORIGINS),
  ...parseEnvList(process.env.WEB_APP_ORIGIN)
])

function applyCorsHeaders(req: FastifyRequest, reply: FastifyReply) {
  const origin = req.headers.origin
  reply
    .header('vary', 'Origin')
    .header('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS')
    .header('access-control-allow-headers', 'authorization,content-type,x-webhook-token,x-idempotency-key')
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
function optionalBoolean(value: unknown, fallback: boolean) { return typeof value === 'boolean' ? value : fallback }
function optionalInteger(value: unknown, fallback: number) { return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback }
function normalizePrelanderTheme(value: unknown) { const v = typeof value === 'string' ? value.trim().toLowerCase() : 'clean'; return ['clean', 'dark', 'warm'].includes(v) ? v : 'clean' }
function normalizeDatasetPlatform(value: unknown) { const p = requireString(value, 'platform').toLowerCase(); if (!['meta', 'tiktok'].includes(p)) throw new Error('platform must be meta or tiktok'); return p }
function toSlug(value: string) { return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) }
function getAffiliatePlatformChoice(input: AnyRecord, fallback?: { name?: string | null; slug?: string | null; trackingParamKey?: string | null }) { const candidates = [input.platform, input.platformKey, input.network, input.slug, input.trackingParamKey, fallback?.slug, fallback?.trackingParamKey, fallback?.name, input.name]; for (const candidate of candidates) { const platform = getSupportedAffiliatePlatform(candidate); if (platform) return platform } return requireSupportedAffiliatePlatform(input.platform ?? input.platformKey ?? input.network ?? input.slug ?? input.trackingParamKey ?? input.name) }
function getAffiliatePlatformBaseData(definition: SupportedAffiliatePlatformDefinition) { return { trackingParamKey: definition.trackingParamKey, webhookMethod: definition.webhookMethod, defaultEventName: definition.defaultEventName, eventMapping: [] as Prisma.InputJsonValue } }
function getBearerToken(req: FastifyRequest) { const h = req.headers.authorization; return h?.startsWith('Bearer ') ? h.slice('Bearer '.length).trim() : null }
function isClerkConfigured() { return Boolean(process.env.CLERK_SECRET_KEY && !process.env.CLERK_SECRET_KEY.includes('your_clerk_secret_key') && !process.env.CLERK_SECRET_KEY.includes('replace_me')) }
function isPublicRoute(req: FastifyRequest) { return req.url === '/health' || req.url === '/health/live' || req.url === '/health/ready' || req.url === '/metrics' || req.method === 'OPTIONS' || req.url.startsWith('/click-webhooks/') || req.url.startsWith('/affiliate-webhooks/') }

const DEFAULT_PAGE = 1
const DEFAULT_PAGE_LIMIT = 25
const MAX_PAGE_LIMIT = 100

type PaginationInput = { page: number; limit: number; skip: number; take: number }

function getQueryValue(value: unknown) { return Array.isArray(value) ? value[0] : value }
function optionalQueryString(value: unknown) { const normalized = getQueryValue(value); return typeof normalized === 'string' && normalized.trim() ? normalized.trim() : undefined }
function parseStringList(value: unknown) { const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []; return [...new Set(raw.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean))] }
function parsePositiveInteger(value: unknown, fallback: number, max?: number) { const normalized = getQueryValue(value); const parsed = typeof normalized === 'number' ? normalized : typeof normalized === 'string' ? Number.parseInt(normalized, 10) : Number.NaN; if (!Number.isFinite(parsed) || parsed < 1) return fallback; const integer = Math.floor(parsed); return max ? Math.min(integer, max) : integer }
function parsePagination(q: AnyRecord): PaginationInput { const page = parsePositiveInteger(q.page, DEFAULT_PAGE); const limit = parsePositiveInteger(q.limit, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT); return { page, limit, skip: (page - 1) * limit, take: limit } }
function wantsPaginatedResponse(q: AnyRecord) { return q.page !== undefined || q.limit !== undefined || getQueryValue(q.paginated) === 'true' }
function makePaginatedResponse<T>(items: T[], total: number, pagination: PaginationInput) { const totalPages = Math.max(1, Math.ceil(total / pagination.limit)); return { items, pagination: { page: pagination.page, limit: pagination.limit, total, totalPages, hasNextPage: pagination.page < totalPages, hasPreviousPage: pagination.page > 1 } } }

function getDefaultMenuFeatures() {
  return [
    { id: 'menu-dashboard', key: 'dashboard', path: '/dashboard', label: 'Overview', group: 'Platform', icon: 'Home', sortOrder: 10, isCore: true },
    { id: 'menu-campaigns', key: 'campaigns', path: '/campaigns', label: 'Campaigns', group: 'Platform', icon: 'Megaphone', sortOrder: 20, isCore: true },
    { id: 'menu-brands', key: 'brands', path: '/brands', label: 'Brands / Offers', group: 'Platform', icon: 'Building2', sortOrder: 30, isCore: true },
    { id: 'menu-platforms', key: 'platforms', path: '/platforms', label: 'Affiliate Platforms', group: 'Platform', icon: 'Globe2', sortOrder: 40, isCore: true },
    { id: 'menu-datasets', key: 'datasets', path: '/datasets', label: 'Datasets', group: 'Platform', icon: 'ShieldCheck', sortOrder: 50, isCore: true },
    { id: 'menu-prelanders', key: 'prelanders', path: '/prelanders', label: 'Prelanders', group: 'Tracking', icon: 'Layers3', sortOrder: 55, isCore: true },
    { id: 'menu-tracking-links', key: 'tracking-links', path: '/tracking-links', label: 'Tracking Links', group: 'Tracking', icon: 'Link2', sortOrder: 60, isCore: true },
    { id: 'menu-click-events', key: 'click-events', path: '/click-events', label: 'Click Events', group: 'Tracking', icon: 'MousePointerClick', badge: 'Manual', sortOrder: 70, isCore: true },
    { id: 'menu-activity-logs', key: 'activity-logs', path: '/logs', label: 'Activity Logs', group: 'Tracking', icon: 'ScrollText', sortOrder: 75, isCore: true },
    { id: 'menu-analytics', key: 'analytics', path: '/analytics', label: 'Analytics', group: 'Tracking', icon: 'BarChart3', sortOrder: 80, isCore: false },
    { id: 'menu-billing', key: 'billing', path: '/billing', label: 'Billing', group: 'Account', icon: 'WalletCards', sortOrder: 90, isCore: true },
    { id: 'menu-settings', key: 'settings', path: '/settings', label: 'Settings', group: 'Account', icon: 'Settings', sortOrder: 100, isCore: true },
    { id: 'menu-support', key: 'support', path: '/support', label: 'Support', group: 'Account', icon: 'HelpCircle', sortOrder: 110, isCore: true },
    { id: 'menu-superadmin', key: 'superadmin', path: '/superadmin', label: 'Super Admin', group: 'Admin', icon: 'Crown', badge: 'Root', sortOrder: 1000, isCore: false }
  ]
}
async function ensureMenuFeaturesSeeded() { await Promise.all(getDefaultMenuFeatures().map((feature) => prisma.menuFeature.upsert({ where: { key: feature.key }, update: { ...feature, isActive: true }, create: feature }))) }
async function ensureTenantCoreMenuGrants(tenantId: string) { await ensureMenuFeaturesSeeded(); const core = await prisma.menuFeature.findMany({ where: { isCore: true, isActive: true } }); await Promise.all(core.map((f) => prisma.tenantMenuGrant.upsert({ where: { tenantId_menuFeatureId: { tenantId, menuFeatureId: f.id } }, update: {}, create: { tenantId, menuFeatureId: f.id, isEnabled: true } }))) }
function requireWebhookToken(queryToken: unknown, headerToken: unknown) { const token = getWebhookToken(queryToken, headerToken); if (!token) throw new Error('Webhook token is required'); return token }

function getDefaultTenantName(clerkUser: Awaited<ReturnType<typeof clerk.users.getUser>>) { const fullName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ').trim(); const email = clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId); return fullName || email?.emailAddress || `User ${clerkUser.id}` }
function getDefaultTenantSlug(clerkUser: Awaited<ReturnType<typeof clerk.users.getUser>>) { return toSlug(getDefaultTenantName(clerkUser)) || toSlug(clerkUser.id) || 'tenant' }
async function getDefaultBillingPlanId() { const existing = await prisma.billingPlan.findFirst({ where: { isDefault: true, isActive: true }, orderBy: { createdAt: 'asc' } }); if (existing) return existing.id; const plan = await prisma.billingPlan.upsert({ where: { slug: 'free' }, update: { isDefault: true, isActive: true }, create: { slug: 'free', name: 'Free', description: 'Default free plan for newly registered accounts', monthlyPriceCents: 0, currency: 'USD', clickLimit: 1000, capiEventLimit: 1000, eapiEventLimit: 1000, campaignDatasetLimit: 2, isDefault: true, isActive: true } }); return plan.id }
async function getTenantPlanOrDefault(tenantId: string) { const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, include: { billingPlan: true } }); if (!tenant) return null; if (tenant.billingPlan) return tenant.billingPlan; const billingPlanId = await getDefaultBillingPlanId(); return (await prisma.tenant.update({ where: { id: tenantId }, data: { billingPlanId }, include: { billingPlan: true } })).billingPlan }
async function getCurrentBillingUsage(tenantId: string) { const periodStart = new Date(); periodStart.setUTCDate(1); periodStart.setUTCHours(0, 0, 0, 0); const [clicks, capiEvents, eapiEvents] = await Promise.all([prisma.clickEvent.count({ where: { tenantId, createdAt: { gte: periodStart } } }), prisma.capiEvent.count({ where: { tenantId, createdAt: { gte: periodStart } } }), prisma.affiliateConversionEvent.count({ where: { tenantId, createdAt: { gte: periodStart } } })]); return { periodStart, clicks, capiEvents, eapiEvents } }
async function assertBillingLimit(tenantId: string, metric: 'clicks' | 'capiEvents' | 'eapiEvents') { const plan = await getTenantPlanOrDefault(tenantId); if (!plan) throw new Error('Billing plan not found'); const usage = await getCurrentBillingUsage(tenantId); const limit = metric === 'clicks' ? plan.clickLimit : metric === 'capiEvents' ? plan.capiEventLimit : plan.eapiEventLimit; if (usage[metric] >= limit) throw new Error(`Billing limit exceeded: ${metric} ${usage[metric]}/${limit} for plan ${plan.name}`); return { plan, usage } }

async function requireUser(req: FastifyRequest) {
  if (!isClerkConfigured()) throw new Error('CLERK_SECRET_KEY is not configured')
  const token = getBearerToken(req); if (!token) throw new Error('Missing Clerk bearer token')
  const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY })
  const clerkUserId = payload.sub; if (!clerkUserId) throw new Error('Invalid Clerk token')
  const clerkUser = await clerk.users.getUser(clerkUserId)
  const primaryEmail = clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)
  const tenantSlug = getDefaultTenantSlug(clerkUser)
  const user = await prisma.user.upsert({ where: { clerkUserId }, update: { email: primaryEmail?.emailAddress, firstName: clerkUser.firstName, lastName: clerkUser.lastName, imageUrl: clerkUser.imageUrl }, create: { clerkUserId, email: primaryEmail?.emailAddress, firstName: clerkUser.firstName, lastName: clerkUser.lastName, imageUrl: clerkUser.imageUrl, tenant: { create: { slug: tenantSlug, name: getDefaultTenantName(clerkUser), billingPlanId: await getDefaultBillingPlanId() } } }, include: { tenant: true } })
  if (!user.tenant) { const tenant = await prisma.tenant.create({ data: { ownerUserId: user.id, slug: tenantSlug, name: getDefaultTenantName(clerkUser), billingPlanId: await getDefaultBillingPlanId() } }); await ensureTenantCoreMenuGrants(tenant.id) } else await ensureTenantCoreMenuGrants(user.tenant.id)
  return user
}
function requireAuthenticated(req: FastifyRequest) { const u = (req as Partial<AuthenticatedRequest>).currentUser; if (!u) throw new Error('Unauthorized'); return u }
async function assertTenantAccess(userId: string, tenantId: string) { const tenant = await prisma.tenant.findFirst({ where: { id: tenantId, ownerUserId: userId } }); if (!tenant) throw new Error('Tenant not found or access denied'); return tenant }
function isSuperAdmin(user: User) { const emails = new Set([...parseEnvList(process.env.SUPERADMIN_EMAILS), ...parseEnvList(process.env.SUPER_ADMIN_EMAILS), ...parseEnvList(process.env.ADMIN_EMAILS)].map((x) => x.toLowerCase())); const ids = new Set([...parseEnvList(process.env.SUPERADMIN_CLERK_USER_IDS), ...parseEnvList(process.env.SUPER_ADMIN_CLERK_USER_IDS), ...parseEnvList(process.env.ADMIN_CLERK_USER_IDS)].map((x) => x.toLowerCase())); return Boolean((user.email && emails.has(user.email.toLowerCase())) || ids.has(user.clerkUserId.toLowerCase())) }
function requireSuperAdmin(req: FastifyRequest) { const u = requireAuthenticated(req); if (!isSuperAdmin(u)) throw new Error('Super admin access denied'); return u }

function serializeTenant<T extends { clickWebhookToken?: string | null }>(tenant: T) { return { ...tenant, clickWebhookToken: maskSecret(tenant.clickWebhookToken) } }
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
function stableStringify(value: unknown): string { if (value === null || value === undefined) return JSON.stringify(value); if (typeof value === 'bigint') return JSON.stringify(value.toString()); if (value instanceof Date) return JSON.stringify(value.toISOString()); if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`; if (typeof value === 'object') { const record = value as AnyRecord; return `{${Object.keys(record).sort().filter((key) => record[key] !== undefined).map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}` } return JSON.stringify(value) }
function sha256Hex(value: string) { return createHash('sha256').update(value).digest('hex') }
function getHeaderString(req: FastifyRequest, name: string) { const value = req.headers[name.toLowerCase()]; return Array.isArray(value) ? value[0] : typeof value === 'string' && value.trim() ? value.trim() : undefined }
function isFilledPayloadValue(value: unknown): boolean { if (value === undefined || value === null) return false; if (typeof value === 'string') return value.trim().length > 0; if (Array.isArray(value)) return value.some(isFilledPayloadValue); return true }
function normalizePayloadLookupKey(value: string) { return value.toLowerCase().replace(/[^a-z0-9]/g, '') }
function getPayloadValue(payload: AnyRecord, keys: string[]) {
  for (const key of keys) { const value = payload[key]; if (isFilledPayloadValue(value)) return value }
  const entries = Object.entries(payload)
  for (const key of keys) {
    const normalizedKey = normalizePayloadLookupKey(key)
    const match = entries.find(([entryKey, value]) => normalizePayloadLookupKey(entryKey) === normalizedKey && isFilledPayloadValue(value))
    if (match) return match[1]
  }
  return undefined
}
function getPayloadString(payload: AnyRecord, keys: string[]) { const value = getPayloadValue(payload, keys); if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean).join(', ') || undefined; if (typeof value === 'string') return value.trim() || undefined; if (typeof value === 'number' || typeof value === 'boolean') return String(value); return undefined }
function parseMoneyNumber(value: unknown): number | undefined { if (Array.isArray(value)) return parseMoneyNumber(value.find(isFilledPayloadValue)); if (typeof value === 'number' && Number.isFinite(value)) return value; if (typeof value === 'string' && value.trim()) { const normalized = value.trim().replace(/,/g, ''); const direct = Number(normalized); if (Number.isFinite(direct)) return direct; const numericText = normalized.replace(/[^0-9.-]/g, ''); const parsed = Number(numericText); return Number.isFinite(parsed) ? parsed : undefined } return undefined }
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
function extractConversionMoney(payload: AnyRecord) { return { spendAmount: getPayloadMoney(payload, ['spendAmount', 'spend_amount', 'spend', 'cost', 'ad_spend']), payoutAmount: getPayloadMoney(payload, ['payoutAmount', 'payout_amount', 'payout', 'revenue', 'sale_amount', 'amount', 'value']), commissionAmount: getPayloadMoney(payload, ['commissionAmount', 'commission_amount', 'commission', 'profit']), currency: (getPayloadString(payload, ['currency', 'currencyCode', 'currency_code']) ?? 'USD').toUpperCase() } }
function extractClickUuid(payload: AnyRecord, trackingParamKey: string) { return getPayloadString(payload, ['clickUuid', 'click_uuid', 'click_id', 'subid', 'sub_id', 'subid1', 'sid1', 'fp_sid', trackingParamKey]) }
function isImpactPostbackPayload(payload: AnyRecord) { const userAgent = getPayloadString(payload, ['userAgent', 'user_agent']); if (userAgent?.toLowerCase().includes('impact-postback-client')) return true; const hasImpactTracker = getPayloadValue(payload, ['ActionTrackerId', 'ActionTrackerName', 'RefClickId']) !== undefined; const hasImpactMoney = getPayloadValue(payload, ['Amount', 'Payout', 'amount', 'payout']) !== undefined; const hasImpactClick = getPayloadValue(payload, ['SubId1', 'subid1']) !== undefined; return Boolean(hasImpactTracker && (hasImpactMoney || hasImpactClick)) }
function getImpactEventMatch(payload: AnyRecord): AffiliateEventMatch | null {
  if (!isImpactPostbackPayload(payload)) return null
  const amount = parseMoneyNumber(getPayloadValue(payload, ['Amount', 'amount'])) ?? 0
  const payout = parseMoneyNumber(getPayloadValue(payload, ['Payout', 'payout'])) ?? 0
  const isCompleteRegistration = amount === 0 && payout === 0
  return {
    eventName: isCompleteRegistration ? 'CompleteRegistration' : 'Purchase',
    eventRule: isCompleteRegistration ? 'Impact Amount/Payout both 0' : 'Impact Amount/Payout non-zero',
    eventMatchedField: 'Amount, Payout',
    eventMatchedValue: `Amount=${amount}; Payout=${payout}`
  }
}
function resolvePlatformEventName(platform: { slug?: string | null; name?: string | null; trackingParamKey?: string | null; eventMapping?: unknown; defaultEventName?: string | null }, payload: AnyRecord) { const supported = getSupportedAffiliatePlatform(platform.slug ?? '') ?? getSupportedAffiliatePlatform(platform.trackingParamKey ?? '') ?? getSupportedAffiliatePlatform(platform.name ?? ''); if (supported?.key === 'impact') { const impactMatch = getImpactEventMatch(payload); if (impactMatch) return impactMatch } if (supported) return { eventName: normalizeEventName(platform.defaultEventName ?? supported.defaultEventName) }; const impactMatch = getImpactEventMatch(payload); if (impactMatch) return impactMatch; return resolveAffiliateEventName(payload, platform.eventMapping, platform.defaultEventName) }
function getImpactCapiValue(payload: AnyRecord) { if (!isImpactPostbackPayload(payload)) return undefined; const amount = parseMoneyNumber(getPayloadValue(payload, ['Amount', 'amount'])); const payout = parseMoneyNumber(getPayloadValue(payload, ['Payout', 'payout'])); const value = [payout, amount].find((entry) => entry !== undefined && entry !== 0) ?? payout ?? amount; return value === undefined ? undefined : String(value) }
function buildAffiliatePostbackIdempotencyKey(req: FastifyRequest, platformId: string, payload: AnyRecord, clickUuid: string | undefined, eventName: string | undefined) { const explicit = getHeaderString(req, 'x-idempotency-key') ?? getPayloadString(payload, ['idempotencyKey', 'idempotency_key']); const networkId = getPayloadString(payload, ['conversionId', 'conversion_id', 'transactionId', 'transaction_id', 'orderId', 'order_id', 'saleId', 'sale_id', 'leadId', 'lead_id', 'eventId', 'event_id', 'postbackId', 'postback_id', 'id']); const basis = explicit ? { type: 'explicit', explicit } : networkId ? { type: 'network', networkId } : { type: 'payload', clickUuid, eventName, payload }; return `v1:${sha256Hex(stableStringify({ platformId, ...basis }))}` }
function buildCapiEnrichment(payload: AnyRecord, money: ReturnType<typeof extractConversionMoney>, clickUuid: string | undefined, eventName: string | undefined) { const contentIds = parseCsvListValue(getPayloadValue(payload, ['contentIds', 'content_ids', 'contentId', 'content_id', 'productId', 'product_id', 'sku', 'offerId', 'offer_id'])); const value = getImpactCapiValue(payload) ?? getPayloadMoney(payload, ['value', 'amount', 'sale_amount', 'revenue', 'payout', 'payoutAmount', 'payout_amount']) ?? money.payoutAmount ?? money.commissionAmount ?? money.spendAmount; const customerEmail = getPayloadString(payload, ['customerEmail', 'customer_email', 'email']); const customerId = getPayloadString(payload, ['customerId', 'customer_id', 'userId', 'user_id', 'externalId', 'external_id']); return compactRecord({ value: value !== undefined ? toNumberAmount(value) : undefined, currency: money.currency, contentId: contentIds[0], contentIds: contentIds.length ? contentIds : undefined, contentName: getPayloadString(payload, ['contentName', 'content_name', 'productName', 'product_name', 'offerName', 'offer_name', 'product', 'offer']), contentType: getPayloadString(payload, ['contentType', 'content_type', 'productType', 'product_type']) ?? (contentIds.length ? 'product' : undefined), contentCategory: getPayloadString(payload, ['contentCategory', 'content_category', 'category']), orderId: getPayloadString(payload, ['orderId', 'order_id', 'transactionId', 'transaction_id']), customerId, customerEmail, customerPhone: getPayloadString(payload, ['customerPhone', 'customer_phone', 'phone']), firstName: getPayloadString(payload, ['firstName', 'first_name', 'fn']), lastName: getPayloadString(payload, ['lastName', 'last_name', 'ln']), city: getPayloadString(payload, ['city', 'ct']), state: getPayloadString(payload, ['state', 'st']), zip: getPayloadString(payload, ['zip', 'postalCode', 'postal_code', 'zp']), country: getPayloadString(payload, ['country', 'countryCode', 'country_code']), clickUuid, eventName }) }
function buildAttributionSnapshot(click: AnyRecord | null | undefined, platform?: AnyRecord | null): AnyRecord { if (!click) return compactRecord({ matched: false, affiliatePlatform: platform ? serializeAffiliatePlatform(platform) : null }); const trackingLink = serializeTrackingLinkForAttribution(click.trackingLink); const brand = trackingLink?.brand ?? null; const campaign = click.campaign ?? trackingLink?.campaign ?? null; const affiliatePlatform = brand?.affiliatePlatform ?? (platform ? serializeAffiliatePlatform(platform) : null); const snapshot = { matched: true, clickEvent: { id: click.id?.toString(), tenantId: click.tenantId, campaignId: click.campaignId, trackingLinkId: click.trackingLinkId, clickUuid: click.clickUuid, ip: click.ip, userAgent: click.userAgent, referrer: click.referrer, fbclid: click.fbclid, ttclid: click.ttclid, fbp: click.fbp, fbc: click.fbc, ttp: click.ttp, createdAt: click.createdAt }, campaign, trackingLink, brand, affiliatePlatform }; return toJsonSafe(snapshot) as AnyRecord }
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
function buildTrackingLinkFilter(q: AnyRecord) { const f = getEventFilters(q); const trackingLink: AnyRecord = {}; if (f.brandId) trackingLink.brandId = f.brandId; if (f.affiliatePlatformId) trackingLink.brand = { affiliatePlatformId: f.affiliatePlatformId }; return trackingLink }
function addCreatedAtFilter(where: AnyRecord, q: AnyRecord) { const createdAt = getCreatedAtFilter(q); if (createdAt) where.createdAt = createdAt }
function buildClickEventWhere(userId: string, q: AnyRecord, options: { includeSearch?: boolean; includeDate?: boolean } = {}) { const f = getEventFilters(q); const includeSearch = options.includeSearch ?? true; const includeDate = options.includeDate ?? true; const where: AnyRecord = { tenant: { ownerUserId: userId } }; if (f.tenantId) where.tenantId = f.tenantId; if (f.campaignId) where.campaignId = f.campaignId; if (f.trackingLinkId) where.trackingLinkId = f.trackingLinkId; if (includeDate) addCreatedAtFilter(where, q); const trackingLink = buildTrackingLinkFilter(q); if (hasKeys(trackingLink)) where.trackingLink = trackingLink; if (includeSearch && f.search) where.OR = [{ clickUuid: containsInsensitive(f.search) }, { fbclid: containsInsensitive(f.search) }, { ttclid: containsInsensitive(f.search) }, { fbp: containsInsensitive(f.search) }, { fbc: containsInsensitive(f.search) }, { ip: containsInsensitive(f.search) }, { referrer: containsInsensitive(f.search) }, { trackingLink: { slug: containsInsensitive(f.search) } }]; return where }
function buildCapiEventWhere(userId: string, q: AnyRecord) { const f = getEventFilters(q); const where: AnyRecord = { tenant: { ownerUserId: userId } }; if (f.tenantId) where.tenantId = f.tenantId; addCreatedAtFilter(where, q); if (f.status) where.status = f.status.toUpperCase(); const clickEvent: AnyRecord = {}; if (f.campaignId) clickEvent.campaignId = f.campaignId; if (f.trackingLinkId) clickEvent.trackingLinkId = f.trackingLinkId; const trackingLink = buildTrackingLinkFilter(q); if (hasKeys(trackingLink)) clickEvent.trackingLink = trackingLink; if (hasKeys(clickEvent)) where.clickEvent = clickEvent; if (f.search) where.OR = [{ eventName: containsInsensitive(f.search) }, { lastError: containsInsensitive(f.search) }, { platform: containsInsensitive(f.search) }, { clickEvent: { clickUuid: containsInsensitive(f.search) } }, { clickEvent: { trackingLink: { slug: containsInsensitive(f.search) } } }]; return where }
async function getMatchingClickUuidsForConversionFilters(userId: string, q: AnyRecord) { const f = getEventFilters(q); if (!f.campaignId && !f.brandId && !f.trackingLinkId) return undefined; const rows = await prisma.clickEvent.findMany({ where: buildClickEventWhere(userId, q, { includeSearch: false, includeDate: false }), select: { clickUuid: true } }); return rows.map((row) => row.clickUuid) }
async function buildConversionEventWhere(userId: string, q: AnyRecord) { const f = getEventFilters(q); const where: AnyRecord = { tenant: { ownerUserId: userId } }; if (f.tenantId) where.tenantId = f.tenantId; addCreatedAtFilter(where, q); if (f.affiliatePlatformId) where.affiliatePlatformId = f.affiliatePlatformId; if (f.search) where.OR = [{ clickUuid: containsInsensitive(f.search) }, { customerId: containsInsensitive(f.search) }, { customerEmail: containsInsensitive(f.search) }, { eventName: containsInsensitive(f.search) }, { eventRule: containsInsensitive(f.search) }, { receivedMethod: containsInsensitive(f.search) }, { affiliatePlatform: { name: containsInsensitive(f.search) } }]; const matchingClickUuids = await getMatchingClickUuidsForConversionFilters(userId, q); if (matchingClickUuids) where.clickUuid = { in: matchingClickUuids.length ? matchingClickUuids : ['__no_matching_click_uuid__'] }; return where }
function buildActivityLogSql(userId: string, q: AnyRecord) { const clauses = ['tenant."ownerUserId" = $1']; const params: unknown[] = [userId]; const add = (sql: string, value: unknown) => { params.push(value); clauses.push(sql.replace('?', `$${params.length}`)) }; const tenantId = optionalQueryString(q.tenantId); const source = optionalQueryString(q.source); const eventType = optionalQueryString(q.eventType); const entityType = optionalQueryString(q.entityType); const entityId = optionalQueryString(q.entityId); const search = optionalQueryString(q.search); const level = normalizeActivityLogLevel(q.level); const createdAt = getCreatedAtFilter(q); if (tenantId) add('log."tenantId" = ?', tenantId); if (source) add('log."source" = ?', source); if (eventType) add('log."eventType" = ?', eventType); if (entityType) add('log."entityType" = ?', entityType); if (entityId) add('log."entityId" = ?', entityId); if (level) add('log."level" = ?::"ActivityLogLevel"', level); if (createdAt?.gte) add('log."createdAt" >= ?', createdAt.gte); if (createdAt?.lte) add('log."createdAt" <= ?', createdAt.lte); if (search) { params.push(`%${search}%`); const ref = `$${params.length}`; clauses.push(`(log."message" ILIKE ${ref} OR log."eventType" ILIKE ${ref} OR log."source" ILIKE ${ref} OR log."entityType" ILIKE ${ref} OR log."entityId" ILIKE ${ref})`) } return { whereSql: `WHERE ${clauses.join(' AND ')}`, params } }
function serializeTrackingLinkForAttribution(link: AnyRecord | null | undefined): AnyRecord | null { if (!link) return null; const brand = link.brand ? { ...link.brand, affiliatePlatform: link.brand.affiliatePlatform ? serializeAffiliatePlatform(link.brand.affiliatePlatform) : link.brand.affiliatePlatform } : null; return { ...link, brand } }
function serializeConversion(e: AnyRecord, click?: AnyRecord) { const storedSnapshot = e.attributionSnapshot && typeof e.attributionSnapshot === 'object' ? e.attributionSnapshot as AnyRecord : null; return { ...e, id: e.id.toString(), clickEventId: e.clickEventId ? e.clickEventId.toString() : null, spendAmount: serializeMoneyValue(e.spendAmount), payoutAmount: serializeMoneyValue(e.payoutAmount), commissionAmount: serializeMoneyValue(e.commissionAmount), affiliatePlatform: e.affiliatePlatform ? serializeAffiliatePlatform(e.affiliatePlatform) : null, attribution: storedSnapshot ?? buildAttributionSnapshot(click, e.affiliatePlatform), capiEnrichment: e.capiEnrichment ?? null } }
async function attachAttributionToConversions(rows: AnyRecord[]) { const rowsNeedingFallback = rows.filter((row) => !row.attributionSnapshot && typeof row.clickUuid === 'string' && row.clickUuid.length > 0); const uuids = [...new Set(rowsNeedingFallback.map((row) => row.clickUuid as string))]; const tenantIds = [...new Set(rowsNeedingFallback.map((row) => row.tenantId).filter((value): value is string => typeof value === 'string'))]; const clicks = uuids.length ? await prisma.clickEvent.findMany({ where: { clickUuid: { in: uuids }, ...(tenantIds.length ? { tenantId: { in: tenantIds } } : {}) }, include: { campaign: true, trackingLink: { include: { campaign: true, brand: { include: { affiliatePlatform: true } }, prelander: true } } } }) : []; const byUuid = new Map(clicks.map((click) => [click.clickUuid, click])); return rows.map((row) => serializeConversion(row, !row.attributionSnapshot && row.clickUuid ? byUuid.get(row.clickUuid) : undefined)) }
function emptyAnalyticsRow(id: string, name: string) { return { id, name, clicks: 0, conversions: 0, revenue: 0, payout: 0, commission: 0, spend: 0, conversionRate: 0 } }
function addConversionMoney(row: AnyRecord, conversion: AnyRecord) { const payout = toNumberAmount(conversion.payoutAmount); const commission = toNumberAmount(conversion.commissionAmount); const spend = toNumberAmount(conversion.spendAmount); row.payout += payout; row.commission += commission; row.spend += spend; row.revenue += payout || commission }
function finalizeAnalyticsRows(map: Map<string, AnyRecord>, limit = 20): AnyRecord[] { const rows: AnyRecord[] = ([...map.values()] as AnyRecord[]).map((row) => ({ ...row, conversionRate: row.clicks ? row.conversions / row.clicks : 0 })); return rows.sort((a: AnyRecord, b: AnyRecord) => b.conversions - a.conversions || b.clicks - a.clicks || String(a.name).localeCompare(String(b.name))).slice(0, limit) }
function getDayKey(value: string | Date) { return new Date(value).toISOString().slice(0, 10) }
async function buildAnalyticsBreakdown(userId: string, q: AnyRecord) {
  const clickWhere = buildClickEventWhere(userId, q)
  const capiWhere = buildCapiEventWhere(userId, q)
  const conversionWhere = await buildConversionEventWhere(userId, q)
  const [clickRows, capiTotal, capiDelivered, capiFailed, conversionRows] = await Promise.all([
    prisma.clickEvent.findMany({ where: clickWhere, include: { campaign: true, trackingLink: { include: { campaign: true, brand: { include: { affiliatePlatform: true } } } } }, orderBy: { createdAt: 'desc' } }),
    prisma.capiEvent.count({ where: capiWhere }),
    prisma.capiEvent.count({ where: { ...capiWhere, status: 'DELIVERED' } }),
    prisma.capiEvent.count({ where: { ...capiWhere, status: 'FAILED' } }),
    prisma.affiliateConversionEvent.findMany({ where: conversionWhere, include: { affiliatePlatform: true }, orderBy: { createdAt: 'desc' } })
  ])
  const conversions = await attachAttributionToConversions(conversionRows)
  const byCampaign = new Map<string, AnyRecord>()
  const byBrand = new Map<string, AnyRecord>()
  const byPlatform = new Map<string, AnyRecord>()
  const byDay = new Map<string, AnyRecord>()
  const ensure = (map: Map<string, AnyRecord>, id: string, name: string): AnyRecord => { if (!map.has(id)) map.set(id, emptyAnalyticsRow(id, name)); return map.get(id) as AnyRecord }

  for (const click of clickRows as AnyRecord[]) {
    const campaign = click.campaign
    const brand = click.trackingLink?.brand
    const platform = brand?.affiliatePlatform
    if (campaign) ensure(byCampaign, campaign.id, campaign.name).clicks += 1
    if (brand) ensure(byBrand, brand.id, brand.name).clicks += 1
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
    const attribution = conversion.attribution
    if (attribution?.matched) {
      attributedConversions += 1
      if (attribution.campaign) { const row = ensure(byCampaign, attribution.campaign.id, attribution.campaign.name); row.conversions += 1; addConversionMoney(row, conversion) }
      if (attribution.brand) { const row = ensure(byBrand, attribution.brand.id, attribution.brand.name); row.conversions += 1; addConversionMoney(row, conversion) }
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
  const funnel = [
    { key: 'clicks', label: 'Clicks', value: summary.clicks, rateFromPrevious: 1, rateFromStart: 1 },
    { key: 'attributedConversions', label: 'Attributed conversions', value: summary.attributedConversions, rateFromPrevious: summary.clicks ? summary.attributedConversions / summary.clicks : 0, rateFromStart: summary.clicks ? summary.attributedConversions / summary.clicks : 0 },
    { key: 'capiDelivered', label: 'CAPI delivered', value: summary.capiDelivered, rateFromPrevious: summary.attributedConversions ? summary.capiDelivered / summary.attributedConversions : 0, rateFromStart: summary.clicks ? summary.capiDelivered / summary.clicks : 0 }
  ]
  const comparison = await buildPeriodComparison(userId, q, summary)
  return { summary, byCampaign: finalizeAnalyticsRows(byCampaign), byBrand: finalizeAnalyticsRows(byBrand), byPlatform: finalizeAnalyticsRows(byPlatform), byDay: finalizeAnalyticsRows(byDay, 60).sort((a, b) => String(a.id).localeCompare(String(b.id))), funnel, comparison }
}

app.addHook('onSend', async (req, reply, payload) => { applyCorsHeaders(req, reply); return payload })
app.options('/*', async (req, reply) => { applyCorsHeaders(req, reply); return reply.code(204).send() })
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
app.get('/me', async (req) => ({ ...requireAuthenticated(req), isSuperAdmin: isSuperAdmin(requireAuthenticated(req)) }))

app.get('/superadmin/users', async (req) => { requireSuperAdmin(req); const users = await prisma.user.findMany({ include: { tenant: { include: { billingPlan: true, menuGrants: { include: { menuFeature: true }, orderBy: { menuFeature: { sortOrder: 'asc' } } }, _count: { select: { campaigns: true, brands: true, affiliatePlatforms: true, datasets: true, trackingLinks: true, clickEvents: true, conversionEvents: true, capiEvents: true } } } } }, orderBy: { createdAt: 'desc' } }); return users.map((u) => ({ ...u, tenant: u.tenant ? serializeTenant(u.tenant) : u.tenant })) })
app.get('/superadmin/billing-plans', async (req) => { requireSuperAdmin(req); return prisma.billingPlan.findMany({ orderBy: [{ isDefault: 'desc' }, { monthlyPriceCents: 'asc' }, { createdAt: 'desc' }] }) })
app.post('/superadmin/billing-plans', async (req, reply) => { requireSuperAdmin(req); const b = req.body as AnyRecord; const name = requireString(b.name, 'name'); const isDefault = optionalBoolean(b.isDefault, false); if (isDefault) await prisma.billingPlan.updateMany({ data: { isDefault: false } }); const plan = await prisma.billingPlan.create({ data: { slug: toSlug(optionalString(b.slug) ?? name), name, description: optionalString(b.description), monthlyPriceCents: optionalInteger(b.monthlyPriceCents, 0), currency: optionalString(b.currency) ?? 'USD', clickLimit: optionalInteger(b.clickLimit, 1000), capiEventLimit: optionalInteger(b.capiEventLimit, 1000), eapiEventLimit: optionalInteger(b.eapiEventLimit, 1000), campaignDatasetLimit: optionalInteger(b.campaignDatasetLimit, 2), isDefault, isActive: optionalBoolean(b.isActive, true) } }); return reply.code(201).send(plan) })
app.put('/superadmin/billing-plans/:id', async (req, reply) => { requireSuperAdmin(req); const { id } = req.params as { id: string }; const b = req.body as AnyRecord; const p = await prisma.billingPlan.findUnique({ where: { id } }); if (!p) return reply.code(404).send({ error: 'Billing plan not found' }); const isDefault = optionalBoolean(b.isDefault, p.isDefault); if (isDefault) await prisma.billingPlan.updateMany({ where: { id: { not: id } }, data: { isDefault: false } }); const currentDatasetLimit = 'campaignDatasetLimit' in p ? Number(p.campaignDatasetLimit) : 2; return prisma.billingPlan.update({ where: { id }, data: { slug: b.slug ? toSlug(b.slug) : p.slug, name: optionalString(b.name) ?? p.name, description: typeof b.description === 'string' ? b.description : p.description, monthlyPriceCents: optionalInteger(b.monthlyPriceCents, p.monthlyPriceCents), currency: optionalString(b.currency) ?? p.currency, clickLimit: optionalInteger(b.clickLimit, p.clickLimit), capiEventLimit: optionalInteger(b.capiEventLimit, p.capiEventLimit), eapiEventLimit: optionalInteger(b.eapiEventLimit, p.eapiEventLimit), campaignDatasetLimit: optionalInteger(b.campaignDatasetLimit, currentDatasetLimit), isDefault, isActive: optionalBoolean(b.isActive, p.isActive) } }) })
app.get('/superadmin/menu-features', async (req) => { requireSuperAdmin(req); await ensureMenuFeaturesSeeded(); return prisma.menuFeature.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }] }) })
app.put('/superadmin/tenants/:id/menu-features', async (req, reply) => { requireSuperAdmin(req); const { id } = req.params as { id: string }; const b = req.body as { menuFeatureIds?: string[] }; const tenant = await prisma.tenant.findUnique({ where: { id } }); if (!tenant) return reply.code(404).send({ error: 'Tenant not found' }); await ensureMenuFeaturesSeeded(); const active = await prisma.menuFeature.findMany({ where: { isActive: true } }); const activeIds = new Set(active.map((f) => f.id)); const coreIds = active.filter((f) => f.isCore).map((f) => f.id); const desired = new Set([...coreIds, ...(Array.isArray(b.menuFeatureIds) ? b.menuFeatureIds.filter((x) => activeIds.has(x)) : [])]); await Promise.all(active.map((f) => prisma.tenantMenuGrant.upsert({ where: { tenantId_menuFeatureId: { tenantId: id, menuFeatureId: f.id } }, update: { isEnabled: desired.has(f.id) }, create: { tenantId: id, menuFeatureId: f.id, isEnabled: desired.has(f.id) } }))); return prisma.tenant.findUnique({ where: { id }, include: { menuGrants: { include: { menuFeature: true }, orderBy: { menuFeature: { sortOrder: 'asc' } } } } }) })
app.put('/superadmin/tenants/:id/billing-plan', async (req, reply) => { requireSuperAdmin(req); const { id } = req.params as { id: string }; const billingPlanId = requireString((req.body as AnyRecord).billingPlanId, 'billingPlanId'); const [tenant, plan] = await Promise.all([prisma.tenant.findUnique({ where: { id } }), prisma.billingPlan.findUnique({ where: { id: billingPlanId } })]); if (!tenant) return reply.code(404).send({ error: 'Tenant not found' }); if (!plan) return reply.code(404).send({ error: 'Billing plan not found' }); return prisma.tenant.update({ where: { id }, data: { billingPlanId }, include: { billingPlan: true } }) })

app.get('/tenants', async (req) => { const u = requireAuthenticated(req); const tenants = await prisma.tenant.findMany({ where: { ownerUserId: u.id }, include: { billingPlan: true, menuGrants: { where: { isEnabled: true, menuFeature: { isActive: true } }, include: { menuFeature: true }, orderBy: { menuFeature: { sortOrder: 'asc' } } } }, orderBy: { createdAt: 'desc' } }); return tenants.map(serializeTenant) })
app.get('/tenants/:id/click-webhook-token', async (req) => { const u = requireAuthenticated(req); const { id } = req.params as { id: string }; const tenant = await assertTenantAccess(u.id, id); return { clickWebhookToken: tenant.clickWebhookToken } })
app.post('/tenants/:id/click-webhook-token/rotate', async (req) => { const u = requireAuthenticated(req); const { id } = req.params as { id: string }; await assertTenantAccess(u.id, id); const tenant = serializeTenant(await prisma.tenant.update({ where: { id }, data: { clickWebhookToken: randomUUID() } })); await createActivityLog({ tenantId: id, source: 'api', eventType: 'tenant.click_webhook_token_rotated', message: 'Click webhook token was rotated', entityType: 'tenant', entityId: id, metadata: { actorUserId: u.id } }); return tenant })

const campaignInclude = { tenant: true, datasets: { include: { dataset: true }, orderBy: { createdAt: 'asc' as const } }, trackingLinks: { include: { brand: { include: { affiliatePlatform: true } }, prelander: true }, orderBy: { createdAt: 'desc' as const } } }
async function assertCampaignDatasetLimit(tenantId: string, desiredCount: number) { const plan = await getTenantPlanOrDefault(tenantId); const limit = plan?.campaignDatasetLimit ?? 2; if (desiredCount > limit) throw new Error(`Dataset limit exceeded: ${desiredCount}/${limit} for plan ${plan?.name ?? 'current'}`); return limit }
async function validateCampaignDatasetIds(tenantId: string, datasetIds: string[]) { if (!datasetIds.length) return; const count = await prisma.dataset.count({ where: { tenantId, id: { in: datasetIds }, isActive: true } }); if (count !== datasetIds.length) throw new Error('One or more datasets were not found in this workspace') }

app.get('/campaigns', async (req) => { const u = requireAuthenticated(req); const q = req.query as AnyRecord; const tenantId = optionalQueryString(q.tenantId); if (tenantId) await assertTenantAccess(u.id, tenantId); const where = { tenantId, tenant: { ownerUserId: u.id } }; if (!wantsPaginatedResponse(q)) return prisma.campaign.findMany({ where, include: campaignInclude, orderBy: { createdAt: 'desc' } }); const pagination = parsePagination(q); const [items, total] = await Promise.all([prisma.campaign.findMany({ where, include: campaignInclude, orderBy: { createdAt: 'desc' }, skip: pagination.skip, take: pagination.take }), prisma.campaign.count({ where })]); return makePaginatedResponse(items, total, pagination) })
app.post('/campaigns', async (req, reply) => { const u = requireAuthenticated(req); const b = req.body as AnyRecord; const tenantId = requireString(b.tenantId, 'tenantId'); const name = requireString(b.name, 'name'); await assertTenantAccess(u.id, tenantId); const campaign = await prisma.campaign.create({ data: { tenantId, name }, include: campaignInclude }); await createActivityLog({ tenantId, source: 'api', eventType: 'campaign.created', message: `Campaign "${campaign.name}" was created`, entityType: 'campaign', entityId: campaign.id, metadata: { actorUserId: u.id, campaignId: campaign.id } }); return reply.code(201).send(campaign) })
app.put('/campaigns/:id', async (req, reply) => { const u = requireAuthenticated(req); const { id } = req.params as { id: string }; const b = req.body as AnyRecord; const c = await prisma.campaign.findFirst({ where: { id, tenant: { ownerUserId: u.id } } }); if (!c) return reply.code(404).send({ error: 'Campaign not found' }); return prisma.campaign.update({ where: { id }, data: { name: optionalString(b.name) ?? c.name }, include: campaignInclude }) })
app.put('/campaigns/:id/datasets', async (req, reply) => { const u = requireAuthenticated(req); const { id } = req.params as { id: string }; const campaign = await prisma.campaign.findFirst({ where: { id, tenant: { ownerUserId: u.id } } }); if (!campaign) return reply.code(404).send({ error: 'Campaign not found' }); const datasetIds = parseStringList((req.body as AnyRecord).datasetIds); await assertCampaignDatasetLimit(campaign.tenantId, datasetIds.length); await validateCampaignDatasetIds(campaign.tenantId, datasetIds); await prisma.$transaction([prisma.campaignDataset.deleteMany({ where: { campaignId: id } }), ...datasetIds.map((datasetId) => prisma.campaignDataset.create({ data: { tenantId: campaign.tenantId, campaignId: id, datasetId } }))]); const updated = await prisma.campaign.findUnique({ where: { id }, include: campaignInclude }); await createActivityLog({ tenantId: campaign.tenantId, source: 'api', eventType: 'campaign.datasets_updated', message: `Campaign "${campaign.name}" dataset selection was updated`, entityType: 'campaign', entityId: id, metadata: { actorUserId: u.id, campaignId: id, datasetIds, datasetCount: datasetIds.length } }); return updated })
app.post('/campaigns/:id/tracking-links', async (req, reply) => { const u = requireAuthenticated(req); const { id } = req.params as { id: string }; const campaign = await prisma.campaign.findFirst({ where: { id, tenant: { ownerUserId: u.id } } }); if (!campaign) return reply.code(404).send({ error: 'Campaign not found' }); const trackingLinkId = requireString((req.body as AnyRecord).trackingLinkId, 'trackingLinkId'); const trackingLink = await prisma.trackingLink.findFirst({ where: { id: trackingLinkId, tenantId: campaign.tenantId } }); if (!trackingLink) return reply.code(404).send({ error: 'Tracking link not found in this workspace' }); await prisma.trackingLink.update({ where: { id: trackingLinkId }, data: { campaignId: id } }); return prisma.campaign.findUnique({ where: { id }, include: campaignInclude }) })
app.delete('/campaigns/:id/tracking-links/:trackingLinkId', async (req, reply) => { const u = requireAuthenticated(req); const { id, trackingLinkId } = req.params as { id: string; trackingLinkId: string }; const campaign = await prisma.campaign.findFirst({ where: { id, tenant: { ownerUserId: u.id } } }); if (!campaign) return reply.code(404).send({ error: 'Campaign not found' }); const trackingLink = await prisma.trackingLink.findFirst({ where: { id: trackingLinkId, tenantId: campaign.tenantId, campaignId: id } }); if (!trackingLink) return reply.code(404).send({ error: 'Tracking link not found in this campaign' }); await prisma.trackingLink.update({ where: { id: trackingLinkId }, data: { campaignId: null } }); return prisma.campaign.findUnique({ where: { id }, include: campaignInclude }) })
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

app.get('/prelanders', async (req) => { const u = requireAuthenticated(req); const q = req.query as AnyRecord; if (q.tenantId) await assertTenantAccess(u.id, q.tenantId); return prisma.prelander.findMany({ where: { tenantId: q.tenantId, tenant: { ownerUserId: u.id } }, orderBy: { createdAt: 'desc' } }) })
app.post('/prelanders', async (req, reply) => { const u = requireAuthenticated(req); const b = req.body as AnyRecord; const tenantId = requireString(b.tenantId, 'tenantId'); await assertTenantAccess(u.id, tenantId); const prelander = await prisma.prelander.create({ data: { tenantId, name: requireString(b.name, 'name'), headline: requireString(b.headline, 'headline'), body: requireString(b.body, 'body'), ctaText: optionalString(b.ctaText) ?? 'Continue', ctaDelaySeconds: optionalInteger(b.ctaDelaySeconds, 2), theme: normalizePrelanderTheme(b.theme), isActive: optionalBoolean(b.isActive, true) } }); await createActivityLog({ tenantId, source: 'api', eventType: 'prelander.created', message: `Prelander "${prelander.name}" was created`, entityType: 'prelander', entityId: prelander.id, metadata: { actorUserId: u.id, prelanderId: prelander.id, theme: prelander.theme, ctaDelaySeconds: prelander.ctaDelaySeconds, isActive: prelander.isActive } }); return reply.code(201).send(prelander) })
app.put('/prelanders/:id', async (req, reply) => { const u = requireAuthenticated(req); const { id } = req.params as { id: string }; const b = req.body as AnyRecord; const row = await prisma.prelander.findFirst({ where: { id, tenant: { ownerUserId: u.id } } }); if (!row) return reply.code(404).send({ error: 'Prelander not found' }); const updated = await prisma.prelander.update({ where: { id }, data: { name: optionalString(b.name) ?? row.name, headline: optionalString(b.headline) ?? row.headline, body: optionalString(b.body) ?? row.body, ctaText: optionalString(b.ctaText) ?? row.ctaText, ctaDelaySeconds: optionalInteger(b.ctaDelaySeconds, row.ctaDelaySeconds), theme: b.theme ? normalizePrelanderTheme(b.theme) : row.theme, isActive: optionalBoolean(b.isActive, row.isActive) } }); await createActivityLog({ tenantId: row.tenantId, source: 'api', eventType: 'prelander.updated', message: `Prelander "${updated.name}" was updated`, entityType: 'prelander', entityId: id, metadata: { actorUserId: u.id, prelanderId: id, theme: updated.theme, ctaDelaySeconds: updated.ctaDelaySeconds, isActive: updated.isActive } }); return updated })
app.delete('/prelanders/:id', async (req, reply) => { const u = requireAuthenticated(req); const { id } = req.params as { id: string }; if (!await prisma.prelander.findFirst({ where: { id, tenant: { ownerUserId: u.id } } })) return reply.code(404).send({ error: 'Prelander not found' }); await prisma.prelander.delete({ where: { id } }); return { ok: true } })

app.get('/tracking-links', async (req) => { const u = requireAuthenticated(req); const q = req.query as AnyRecord; const tenantId = optionalQueryString(q.tenantId); if (tenantId) await assertTenantAccess(u.id, tenantId); const where = { tenantId, campaignId: optionalQueryString(q.campaignId), brandId: optionalQueryString(q.brandId), tenant: { ownerUserId: u.id } }; const include = { tenant: true, campaign: true, brand: { include: { affiliatePlatform: true } }, prelander: true }; if (!wantsPaginatedResponse(q)) return prisma.trackingLink.findMany({ where, include, orderBy: { createdAt: 'desc' } }); const pagination = parsePagination(q); const [items, total] = await Promise.all([prisma.trackingLink.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip: pagination.skip, take: pagination.take }), prisma.trackingLink.count({ where })]); return makePaginatedResponse(items, total, pagination) })
app.post('/tracking-links', async (req, reply) => { const u = requireAuthenticated(req); const b = req.body as AnyRecord; const tenantId = requireString(b.tenantId, 'tenantId'); await assertTenantAccess(u.id, tenantId); const slug = requireString(b.slug, 'slug'); if (await prisma.trackingLink.findUnique({ where: { tenantId_slug: { tenantId, slug } } })) return reply.code(409).send({ error: `Slug "${slug}" đã tồn tại trong workspace này` }); const brand = await prisma.brand.findFirst({ where: { id: requireString(b.brandId, 'brandId'), tenantId } }); if (!brand) return reply.code(404).send({ error: 'Brand not found in this workspace' }); const campaignId = optionalString(b.campaignId) ?? null; if (campaignId && !await prisma.campaign.findFirst({ where: { id: campaignId, tenantId } })) return reply.code(404).send({ error: 'Campaign not found in this workspace' }); const prelanderId = optionalString(b.prelanderId); if (prelanderId && !await prisma.prelander.findFirst({ where: { id: prelanderId, tenantId, isActive: true } })) return reply.code(404).send({ error: 'Prelander not found in this workspace' }); const link = await prisma.trackingLink.create({ data: { tenantId, campaignId, brandId: brand.id, prelanderId, slug, prelanderEnabled: optionalBoolean(b.prelanderEnabled, true), isActive: optionalBoolean(b.isActive, true) } }); await createActivityLog({ tenantId, source: 'api', eventType: 'tracking_link.created', message: `Tracking link "${link.slug}" was created`, entityType: 'trackingLink', entityId: link.id, metadata: { actorUserId: u.id, trackingLinkId: link.id, slug: link.slug, campaignId, brandId: brand.id, prelanderId, prelanderEnabled: link.prelanderEnabled, isActive: link.isActive } }); return reply.code(201).send(link) })
app.put('/tracking-links/:id', async (req, reply) => { const u = requireAuthenticated(req); const { id } = req.params as { id: string }; const b = req.body as AnyRecord; const row = await prisma.trackingLink.findFirst({ where: { id, tenant: { ownerUserId: u.id } } }); if (!row) return reply.code(404).send({ error: 'Tracking link not found' }); const brandId = optionalString(b.brandId) ?? row.brandId; const prelanderId = optionalString(b.prelanderId); const brand = await prisma.brand.findFirst({ where: { id: brandId, tenantId: row.tenantId } }); if (!brand) return reply.code(404).send({ error: 'Brand not found in this workspace' }); const campaignId = typeof b.campaignId === 'string' ? optionalString(b.campaignId) ?? null : row.campaignId; if (campaignId && !await prisma.campaign.findFirst({ where: { id: campaignId, tenantId: row.tenantId } })) return reply.code(404).send({ error: 'Campaign not found in this workspace' }); if (prelanderId && !await prisma.prelander.findFirst({ where: { id: prelanderId, tenantId: row.tenantId } })) return reply.code(404).send({ error: 'Prelander not found in this workspace' }); const updated = await prisma.trackingLink.update({ where: { id }, data: { brandId, prelanderId: prelanderId ?? null, campaignId, slug: optionalString(b.slug) ?? row.slug, prelanderEnabled: optionalBoolean(b.prelanderEnabled, row.prelanderEnabled), isActive: optionalBoolean(b.isActive, row.isActive) }, include: { tenant: true, campaign: true, brand: { include: { affiliatePlatform: true } }, prelander: true } }); await createActivityLog({ tenantId: row.tenantId, source: 'api', eventType: 'tracking_link.updated', message: `Tracking link "${updated.slug}" was updated`, entityType: 'trackingLink', entityId: id, metadata: { actorUserId: u.id, trackingLinkId: id, slug: updated.slug, campaignId, brandId, prelanderId: updated.prelanderId, prelanderEnabled: updated.prelanderEnabled, isActive: updated.isActive } }); return updated })
app.delete('/tracking-links/:id', async (req, reply) => { const u = requireAuthenticated(req); const { id } = req.params as { id: string }; if (!await prisma.trackingLink.findFirst({ where: { id, tenant: { ownerUserId: u.id } } })) return reply.code(404).send({ error: 'Tracking link not found' }); await prisma.trackingLink.delete({ where: { id } }); return { ok: true } })

async function enqueueClick(clickEvent: { id: bigint; clickUuid: string; tenantId: string; trackingLinkId: string }, eventName?: string, source: 'click' | 'affiliate_conversion' = 'click', sourceId?: string) { await clickEventsQueue.add('click.created', { clickEventId: clickEvent.id.toString(), clickUuid: clickEvent.clickUuid, tenantId: clickEvent.tenantId, trackingLinkId: clickEvent.trackingLinkId, eventName, source, sourceId }, { jobId: sourceId ? `${clickEvent.clickUuid}-${sourceId}` : clickEvent.clickUuid }) }
function getSafeMetadata(value: unknown): AnyRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : {} }
app.post('/click-webhooks/:tenantKey/:slug', { config: { rateLimit: { max: Number(process.env.PUBLIC_WEBHOOK_RATE_LIMIT_MAX ?? 120), timeWindow: process.env.PUBLIC_WEBHOOK_RATE_LIMIT_WINDOW ?? '1 minute' } } }, async (req, reply) => {
  const { tenantKey, slug } = req.params as { tenantKey: string; slug: string }
  const q = req.query as AnyRecord
  const b = (req.body ?? {}) as AnyRecord
  const token = requireWebhookToken(q.token, req.headers['x-webhook-token'])
  const trackingLink = await prisma.trackingLink.findFirst({
    where: { slug, tenant: { OR: [{ id: tenantKey }, { publicKey: tenantKey }], clickWebhookToken: token } },
    include: { tenant: true, campaign: true, brand: { include: { affiliatePlatform: true } } }
  })
  if (!trackingLink?.isActive) return reply.code(404).send({ error: 'Click webhook not found' })

  await assertBillingLimit(trackingLink.tenantId, 'clicks')
  const fbclid = optionalString(b.fbclid)
  const ttclid = optionalString(b.ttclid)
  const clickEvent = await prisma.clickEvent.create({
    data: {
      tenantId: trackingLink.tenantId,
      campaignId: trackingLink.campaignId ?? null,
      trackingLinkId: trackingLink.id,
      clickUuid: optionalString(b.clickUuid) ?? randomUUID(),
      ip: optionalString(b.ip) ?? req.ip,
      userAgent: optionalString(b.userAgent) ?? normalizeHeaderValue(req.headers['user-agent']),
      referrer: optionalString(b.referrer) ?? normalizeHeaderValue(req.headers.referer),
      fbp: optionalString(b.fbp),
      fbc: optionalString(b.fbc) ?? createFbc(fbclid),
      ttp: optionalString(b.ttp),
      ttclid,
      fbclid,
      metadata: compactRecord({
        ...getSafeMetadata(b.metadata),
        tenantKey,
        tenantId: trackingLink.tenantId,
        campaignId: trackingLink.campaignId,
        campaign: trackingLink.campaign?.name,
        trackingLinkId: trackingLink.id,
        slug: trackingLink.slug,
        brandId: trackingLink.brandId,
        brand: trackingLink.brand.name,
        source: 'tracking_link_webhook',
        affiliatePlatform: trackingLink.brand.affiliatePlatform.slug,
        trackingParamKey: trackingLink.brand.affiliatePlatform.trackingParamKey
      }) as Prisma.InputJsonValue
    }
  })
  await enqueueClick(clickEvent)
  await createActivityLog({ tenantId: trackingLink.tenantId, source: 'click-webhook', eventType: 'click.created', message: `Click captured for tracking link "${trackingLink.slug}"`, entityType: 'clickEvent', entityId: clickEvent.id, metadata: { clickEventId: clickEvent.id, clickUuid: clickEvent.clickUuid, tenantKey, trackingLinkId: trackingLink.id, slug: trackingLink.slug, campaignId: trackingLink.campaignId, brandId: trackingLink.brandId, brand: trackingLink.brand.name, affiliatePlatform: trackingLink.brand.affiliatePlatform.slug, ip: clickEvent.ip, referrer: clickEvent.referrer, fbclid, ttclid, source: 'tracking_link_webhook' } })
  return reply.code(201).send({
    ok: true,
    id: clickEvent.id.toString(),
    clickUuid: clickEvent.clickUuid,
    tenantId: clickEvent.tenantId,
    trackingLinkId: clickEvent.trackingLinkId,
    slug: trackingLink.slug,
    brandId: trackingLink.brandId,
    brand: trackingLink.brand.name,
    trackingParamKey: trackingLink.brand.affiliatePlatform.trackingParamKey
  })
})

app.get('/click-events', async (req) => { const u = requireAuthenticated(req); const q = req.query as AnyRecord; const tenantId = optionalQueryString(q.tenantId); if (tenantId) await assertTenantAccess(u.id, tenantId); const where = buildClickEventWhere(u.id, q); const include = { campaign: true, trackingLink: { include: { brand: { include: { affiliatePlatform: true } } } } }; if (!wantsPaginatedResponse(q)) return (await prisma.clickEvent.findMany({ where, include, orderBy: { createdAt: 'desc' }, take: 100 })).map(serializeClick); const pagination = parsePagination(q); const [rows, total] = await Promise.all([prisma.clickEvent.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip: pagination.skip, take: pagination.take }), prisma.clickEvent.count({ where })]); return makePaginatedResponse(rows.map(serializeClick), total, pagination) })
app.get('/capi-events', async (req) => { const u = requireAuthenticated(req); const q = req.query as AnyRecord; const tenantId = optionalQueryString(q.tenantId); if (tenantId) await assertTenantAccess(u.id, tenantId); const where = buildCapiEventWhere(u.id, q); const include = { clickEvent: { include: { campaign: true, trackingLink: { include: { brand: { include: { affiliatePlatform: true } } } } } } }; if (!wantsPaginatedResponse(q)) return (await prisma.capiEvent.findMany({ where, include, orderBy: { createdAt: 'desc' }, take: 100 })).map(serializeCapi); const pagination = parsePagination(q); const [rows, total] = await Promise.all([prisma.capiEvent.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip: pagination.skip, take: pagination.take }), prisma.capiEvent.count({ where })]); return makePaginatedResponse(rows.map(serializeCapi), total, pagination) })
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
    const clickRows = await prisma.clickEvent.findMany({ where: buildClickEventWhere(u.id, q), include: { campaign: true, trackingLink: { include: { brand: { include: { affiliatePlatform: true } } } } }, orderBy: { createdAt: 'desc' }, take: limit })
    headers = ['id', 'createdAt', 'tenantId', 'campaign', 'trackingLink', 'brand', 'affiliatePlatform', 'clickUuid', 'ip', 'fbclid', 'ttclid', 'referrer']
    rows = clickRows.map((row: AnyRecord) => ({ id: row.id.toString(), createdAt: row.createdAt, tenantId: row.tenantId, campaign: row.campaign?.name, trackingLink: row.trackingLink?.slug, brand: row.trackingLink?.brand?.name, affiliatePlatform: row.trackingLink?.brand?.affiliatePlatform?.name, clickUuid: row.clickUuid, ip: row.ip, fbclid: row.fbclid, ttclid: row.ttclid, referrer: row.referrer }))
  } else if (type === 'capi') {
    const capiRows = await prisma.capiEvent.findMany({ where: buildCapiEventWhere(u.id, q), include: { clickEvent: { include: { trackingLink: { include: { brand: true } } } } }, orderBy: { createdAt: 'desc' }, take: limit })
    headers = ['id', 'createdAt', 'platform', 'eventName', 'source', 'sourceId', 'status', 'attempts', 'clickUuid', 'trackingLink', 'lastError']
    rows = capiRows.map((row: AnyRecord) => ({ id: row.id.toString(), createdAt: row.createdAt, platform: row.platform, eventName: row.eventName, source: row.source, sourceId: row.sourceId, status: row.status, attempts: row.attempts, clickUuid: row.clickEvent?.clickUuid, trackingLink: row.clickEvent?.trackingLink?.slug, lastError: row.lastError }))
  } else if (type === 'breakdown') {
    const breakdown = await buildAnalyticsBreakdown(u.id, q)
    headers = ['group', 'id', 'name', 'clicks', 'conversions', 'conversionRate', 'revenue', 'payout', 'commission', 'spend']
    rows = ['byCampaign', 'byBrand', 'byPlatform', 'byDay'].flatMap((group) => (breakdown as AnyRecord)[group].map((row: AnyRecord) => ({ group, ...row })))
  } else {
    const conversionRows = await attachAttributionToConversions(await prisma.affiliateConversionEvent.findMany({ where: await buildConversionEventWhere(u.id, q), include: { affiliatePlatform: true }, orderBy: { createdAt: 'desc' }, take: limit }))
    headers = ['id', 'createdAt', 'tenantId', 'affiliatePlatform', 'eventName', 'clickUuid', 'matched', 'campaign', 'brand', 'trackingLink', 'customerId', 'customerEmail', 'payoutAmount', 'commissionAmount', 'spendAmount', 'currency', 'requestCount', 'idempotencyKey']
    rows = conversionRows.map((row: AnyRecord) => ({ id: row.id, createdAt: row.createdAt, tenantId: row.tenantId, affiliatePlatform: row.affiliatePlatform?.name, eventName: row.eventName, clickUuid: row.clickUuid, matched: row.attribution?.matched, campaign: row.attribution?.campaign?.name, brand: row.attribution?.brand?.name, trackingLink: row.attribution?.trackingLink?.slug, customerId: row.customerId, customerEmail: row.customerEmail, payoutAmount: row.payoutAmount, commissionAmount: row.commissionAmount, spendAmount: row.spendAmount, currency: row.currency, requestCount: row.requestCount, idempotencyKey: row.idempotencyKey }))
  }

  return reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="${type}-export.csv"`).send(toCsv(headers, rows))
})

app.get('/report-schedules', async (req) => { const u = requireAuthenticated(req); const q = req.query as AnyRecord; const tenantId = optionalQueryString(q.tenantId); if (tenantId) await assertTenantAccess(u.id, tenantId); return prisma.reportSchedule.findMany({ where: { tenantId, tenant: { ownerUserId: u.id } }, orderBy: { createdAt: 'desc' } }) })
app.post('/report-schedules', async (req, reply) => { const u = requireAuthenticated(req); const b = req.body as AnyRecord; const tenantId = requireString(b.tenantId, 'tenantId'); await assertTenantAccess(u.id, tenantId); const frequency = normalizeReportFrequency(b.frequency); const row = await prisma.reportSchedule.create({ data: { tenantId, name: requireString(b.name, 'name'), reportType: optionalString(b.reportType) ?? 'analytics', frequency, recipientEmail: optionalString(b.recipientEmail), filters: b.filters && typeof b.filters === 'object' ? b.filters as Prisma.InputJsonValue : undefined, isActive: optionalBoolean(b.isActive, true), nextRunAt: b.nextRunAt ? parseDateQuery(b.nextRunAt) : getNextReportRunAt(frequency) } }); return reply.code(201).send(row) })
app.put('/report-schedules/:id', async (req, reply) => { const u = requireAuthenticated(req); const { id } = req.params as { id: string }; const b = req.body as AnyRecord; const row = await prisma.reportSchedule.findFirst({ where: { id, tenant: { ownerUserId: u.id } } }); if (!row) return reply.code(404).send({ error: 'Report schedule not found' }); const frequency = normalizeReportFrequency(b.frequency ?? row.frequency); return prisma.reportSchedule.update({ where: { id }, data: { name: optionalString(b.name) ?? row.name, reportType: optionalString(b.reportType) ?? row.reportType, frequency, recipientEmail: typeof b.recipientEmail === 'string' ? b.recipientEmail : row.recipientEmail, filters: b.filters && typeof b.filters === 'object' ? b.filters as Prisma.InputJsonValue : row.filters as Prisma.InputJsonValue, isActive: optionalBoolean(b.isActive, row.isActive), nextRunAt: b.nextRunAt ? parseDateQuery(b.nextRunAt) : row.nextRunAt ?? getNextReportRunAt(frequency) } }) })
app.delete('/report-schedules/:id', async (req, reply) => { const u = requireAuthenticated(req); const { id } = req.params as { id: string }; if (!await prisma.reportSchedule.findFirst({ where: { id, tenant: { ownerUserId: u.id } } })) return reply.code(404).send({ error: 'Report schedule not found' }); await prisma.reportSchedule.delete({ where: { id } }); return { ok: true } })


app.route({
  method: ['GET', 'POST'],
  url: '/affiliate-webhooks/:tenantId/:platformSlug',
  config: { rateLimit: { max: Number(process.env.PUBLIC_WEBHOOK_RATE_LIMIT_MAX ?? 120), timeWindow: process.env.PUBLIC_WEBHOOK_RATE_LIMIT_WINDOW ?? '1 minute' } },
  handler: async (req, reply) => {
    const p = req.params as { tenantId: string; platformSlug: string }
    const q = req.query as AnyRecord
    const method = req.method.toUpperCase()
    const platform = await prisma.affiliatePlatform.findFirst({ where: { tenantId: p.tenantId, slug: p.platformSlug, webhookToken: requireWebhookToken(q.token, req.headers['x-webhook-token']) } })
    if (!platform) return reply.code(404).send({ error: 'Affiliate webhook not found' })

    const payload = sanitizeWebhookPayload(normalizeAffiliateWebhookPayload(method === 'GET' ? { ...(req.query as AnyRecord) } : req.body ?? {}))
    const clickUuid = extractClickUuid(payload, platform.trackingParamKey)
    const eventMatch = resolvePlatformEventName(platform, payload)
    const money = extractConversionMoney(payload)
    const capiEnrichment = buildCapiEnrichment(payload, money, clickUuid, eventMatch.eventName)
    const idempotencyKey = buildAffiliatePostbackIdempotencyKey(req, platform.id, payload, clickUuid, eventMatch.eventName)
    const now = new Date()
    const clickEvent = clickUuid ? await prisma.clickEvent.findFirst({ where: { tenantId: platform.tenantId, clickUuid }, include: { campaign: true, trackingLink: { include: { campaign: true, brand: { include: { affiliatePlatform: true } }, prelander: true } } } }) : null
    const attributionSnapshot = buildAttributionSnapshot(clickEvent, platform)
    const baseData = {
      tenantId: platform.tenantId,
      affiliatePlatformId: platform.id,
      clickEventId: clickEvent?.id,
      clickUuid,
      idempotencyKey,
      lastReceivedAt: now,
      eventName: eventMatch.eventName,
      eventRule: eventMatch.eventRule,
      eventMatchedField: eventMatch.eventMatchedField,
      eventMatchedValue: eventMatch.eventMatchedValue,
      customerId: getPayloadString(payload, ['customerId', 'customer_id', 'userId', 'user_id', 'externalId', 'external_id']),
      customerEmail: getPayloadString(payload, ['customerEmail', 'customer_email', 'email']),
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

    if (!duplicate && clickEvent && conversion) await enqueueClick(clickEvent, eventMatch.eventName, 'affiliate_conversion', conversion.id.toString())
    if (conversion) await createActivityLog({ tenantId: platform.tenantId, source: 'affiliate-webhook', eventType: duplicate ? 'affiliate_conversion.duplicate' : 'affiliate_conversion.received', message: `${duplicate ? 'Duplicate' : 'New'} affiliate conversion received from "${platform.name}"`, entityType: 'conversionEvent', entityId: conversion.id, metadata: { conversionEventId: conversion.id, affiliatePlatformId: platform.id, platformSlug: platform.slug, method, eventName: eventMatch.eventName, eventRule: eventMatch.eventRule, clickUuid, matchedClick: Boolean(clickEvent), clickEventId: clickEvent?.id, duplicate, requestCount: conversion.requestCount, idempotencyKey, payoutAmount: money.payoutAmount, commissionAmount: money.commissionAmount, spendAmount: money.spendAmount, currency: money.currency } })
    return reply.code(duplicate ? 200 : 201).send({ ok: true, duplicate, id: conversion?.id.toString(), requestCount: conversion?.requestCount, eventName: eventMatch.eventName, idempotencyKey })
  }
})

app.addHook('onClose', async () => { await clickEventsQueue.close(); await readinessRedis.quit() })
app.setErrorHandler((error, _req, reply) => { app.log.error(error); if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return reply.code(409).send({ error: 'Dữ liệu đã tồn tại, vui lòng dùng tên hoặc slug khác' }); const message = error instanceof Error ? error.message : 'Unknown error'; const unauthorized = ['Unauthorized', 'Missing Clerk bearer token', 'Invalid Clerk token']; const hints = ['required', 'must', 'not found', 'access denied', 'exceeded', 'tồn tại']; const statusCode = unauthorized.includes(message) ? 401 : hints.some((h) => message.toLowerCase().includes(h.toLowerCase())) ? 400 : 500; return reply.code(statusCode).send({ error: statusCode === 500 ? 'Internal server error' : message }) })

app.listen({ port: Number(process.env.API_PORT ?? 3001), host: '0.0.0.0' })
