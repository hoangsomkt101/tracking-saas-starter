import { Queue } from 'bullmq'
import { Redis } from 'ioredis'

export const CLICK_EVENTS_QUEUE = 'click-events'

export type ClickEventJob = {
  clickEventId: string
  clickUuid: string
  tenantId: string
  trackingLinkId: string
  eventName?: string
  source?: 'click' | 'affiliate_conversion'
  sourceId?: string
}

export type AffiliateEventRuleOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'exists'
  | 'not_exists'
  | 'in'
  | 'not_in'
  | 'regex'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'

export type AffiliateEventRuleMatch = 'all' | 'any'
export type AffiliateEventComparableValue = string | number | boolean

export type AffiliateEventCondition = {
  field: string
  operator?: AffiliateEventRuleOperator
  value?: AffiliateEventComparableValue | AffiliateEventComparableValue[]
  caseSensitive?: boolean
}

export type AffiliateEventRule = {
  field?: string
  operator?: AffiliateEventRuleOperator
  value?: AffiliateEventComparableValue | AffiliateEventComparableValue[]
  eventName: string
  label?: string
  match?: AffiliateEventRuleMatch
  conditions?: AffiliateEventCondition[]
  priority?: number
  caseSensitive?: boolean
}

export type AffiliateEventMatch = {
  eventName: string
  eventRule?: string
  eventMatchedField?: string
  eventMatchedValue?: string
}

export type SupportedAffiliatePlatformKey = 'impact' | 'partnerstack' | 'first_promo'

export type SupportedAffiliatePlatformDefinition = {
  key: SupportedAffiliatePlatformKey
  label: string
  slug: string
  trackingParamKey: string
  webhookMethod: 'GET' | 'POST'
  defaultEventName: string
}

export const supportedAffiliatePlatforms: SupportedAffiliatePlatformDefinition[] = [
  { key: 'impact', label: 'Impact', slug: 'impact', trackingParamKey: 'subid1', webhookMethod: 'GET', defaultEventName: 'CompleteRegistration' },
  { key: 'partnerstack', label: 'PartnerStack', slug: 'partnerstack', trackingParamKey: 'sid1', webhookMethod: 'POST', defaultEventName: 'CompleteRegistration' },
  { key: 'first_promo', label: 'First Promo', slug: 'first-promo', trackingParamKey: 'fp_sid', webhookMethod: 'POST', defaultEventName: 'CompleteRegistration' }
]

const supportedAffiliatePlatformAliases: Record<string, SupportedAffiliatePlatformKey> = {
  impact: 'impact',
  impactcom: 'impact',
  subid1: 'impact',
  partnerstack: 'partnerstack',
  sid1: 'partnerstack',
  firstpromo: 'first_promo',
  firstpromoter: 'first_promo',
  firstpromotercom: 'first_promo',
  firstpromoio: 'first_promo',
  firstpromocom: 'first_promo',
  fpsid: 'first_promo'
}

function normalizeSupportedAffiliatePlatformLookup(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]/g, '')
}

export function getSupportedAffiliatePlatform(value: unknown): SupportedAffiliatePlatformDefinition | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = normalizeSupportedAffiliatePlatformLookup(value.trim())
  const key = supportedAffiliatePlatformAliases[normalized]
  return key ? supportedAffiliatePlatforms.find((platform) => platform.key === key) : undefined
}

export function requireSupportedAffiliatePlatform(value: unknown) {
  const platform = getSupportedAffiliatePlatform(value)
  if (!platform) throw new Error('platform must be Impact, PartnerStack, or First Promo')
  return platform
}

export function getSupportedAffiliatePlatformParamKey(value: unknown) {
  return requireSupportedAffiliatePlatform(value).trackingParamKey
}

export function getRedisUrl() {
  return process.env.REDIS_URL ?? 'redis://localhost:6379'
}

export function createRedisConnection() {
  return new Redis(getRedisUrl(), {
    maxRetriesPerRequest: null
  })
}

export function createClickEventsQueue() {
  return new Queue<ClickEventJob>(CLICK_EVENTS_QUEUE, {
    connection: createRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000
      },
      removeOnComplete: 1000,
      removeOnFail: 5000
    }
  })
}

export function createFbc(fbclid?: string | null) {
  if (!fbclid) return null

  const timestamp = Math.floor(Date.now() / 1000)
  return `fb.1.${timestamp}.${fbclid}`
}

export function normalizeHeaderValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.join(', ')
  return value ?? null
}

export function parseEnvList(value?: string) {
  return new Set(
    (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  )
}

export function maskSecret(value?: string | null, visiblePrefix = 6, visibleSuffix = 4) {
  if (!value) return null
  if (value.length <= visiblePrefix + visibleSuffix) return '••••'
  return `${value.slice(0, visiblePrefix)}••••${value.slice(-visibleSuffix)}`
}


export function validateHttpUrl(value: string, field = 'url') {
  let url: URL

  try {
    url = new URL(value)
  } catch {
    throw new Error(`${field} must be a valid URL`)
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${field} must use http or https`)
  }

  return url.toString()
}

export function normalizeEventName(value?: unknown, fallback = 'CompleteRegistration') {
  const eventName = typeof value === 'string' ? value.trim() : ''
  return eventName || fallback
}

const affiliateEventRuleOperators: AffiliateEventRuleOperator[] = [
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'exists',
  'not_exists',
  'in',
  'not_in',
  'regex',
  'gt',
  'gte',
  'lt',
  'lte'
]

const affiliateEventRuleOperatorSet = new Set<AffiliateEventRuleOperator>(affiliateEventRuleOperators)
const operatorsWithoutValue = new Set<AffiliateEventRuleOperator>(['exists', 'not_exists'])

type ConditionEvaluation = {
  matched: boolean
  field: string
  value?: string
  description: string
}

function normalizeRuleOperator(value: unknown): AffiliateEventRuleOperator {
  return typeof value === 'string' && affiliateEventRuleOperatorSet.has(value as AffiliateEventRuleOperator)
    ? value as AffiliateEventRuleOperator
    : 'equals'
}

function normalizeRuleMatch(value: unknown, fallback: AffiliateEventRuleMatch): AffiliateEventRuleMatch {
  return value === 'any' || value === 'all' ? value : fallback
}

function isComparableValue(value: unknown): value is AffiliateEventComparableValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function normalizeComparableValue(value: unknown): AffiliateEventComparableValue | AffiliateEventComparableValue[] | undefined {
  if (Array.isArray(value)) {
    const normalized = value
      .filter(isComparableValue)
      .map((item) => typeof item === 'string' ? item.trim() : item)
      .filter((item) => typeof item !== 'string' || item.length > 0)
    return normalized.length ? normalized : undefined
  }

  if (!isComparableValue(value)) return undefined
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : undefined
  }
  return value
}

function comparableValueHasContent(value: AffiliateEventComparableValue | AffiliateEventComparableValue[] | undefined) {
  if (Array.isArray(value)) return value.length > 0
  return value !== undefined
}

function parsePriority(value: unknown) {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : Number.NaN
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined
}

function normalizeAffiliateEventCondition(item: unknown, inheritedCaseSensitive?: boolean): AffiliateEventCondition | null {
  if (!item || typeof item !== 'object') return null
  const record = item as Record<string, unknown>
  const field = typeof record.field === 'string' ? record.field.trim() : ''
  if (!field) return null

  const operator = normalizeRuleOperator(record.operator)
  const condition: AffiliateEventCondition = { field, operator }
  const rawValue = normalizeComparableValue(record.value)

  if (!operatorsWithoutValue.has(operator)) {
    if (!comparableValueHasContent(rawValue)) return null
    condition.value = rawValue
  }

  if (typeof record.caseSensitive === 'boolean') condition.caseSensitive = record.caseSensitive
  else if (typeof inheritedCaseSensitive === 'boolean') condition.caseSensitive = inheritedCaseSensitive

  return condition
}

function getRawRuleList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).rules)) {
    return (value as { rules: unknown[] }).rules
  }
  return []
}

export function normalizeAffiliateEventMapping(value: unknown): AffiliateEventRule[] {
  const rawRules = getRawRuleList(value)

  return rawRules
    .reduce<Array<{ rule: AffiliateEventRule; index: number }>>((rules, item, index) => {
      if (!item || typeof item !== 'object') return rules
      const record = item as Record<string, unknown>
      const eventName = normalizeEventName(record.eventName, '')
      const label = typeof record.label === 'string' && record.label.trim() ? record.label.trim() : undefined
      const priority = parsePriority(record.priority)
      const caseSensitive = typeof record.caseSensitive === 'boolean' ? record.caseSensitive : undefined
      const conditionSources = Array.isArray(record.conditions)
        ? record.conditions
        : Array.isArray(record.any)
          ? record.any
          : Array.isArray(record.all)
            ? record.all
            : []
      const inferredMatch: AffiliateEventRuleMatch = Array.isArray(record.any) ? 'any' : 'all'
      const match = normalizeRuleMatch(record.match, inferredMatch)
      const conditions = conditionSources
        .map((condition) => normalizeAffiliateEventCondition(condition, caseSensitive))
        .filter((condition): condition is AffiliateEventCondition => Boolean(condition))

      if (!conditions.length) {
        const legacyCondition = normalizeAffiliateEventCondition(record, caseSensitive)
        if (legacyCondition) conditions.push(legacyCondition)
      }

      if (!eventName || !conditions.length) return rules

      const rule: AffiliateEventRule = { eventName, conditions, match }
      if (label) rule.label = label
      if (priority !== undefined) rule.priority = priority
      if (caseSensitive !== undefined) rule.caseSensitive = caseSensitive
      if (conditions.length === 1) {
        rule.field = conditions[0].field
        rule.operator = conditions[0].operator
        if (conditions[0].value !== undefined) rule.value = conditions[0].value
      }

      rules.push({ rule, index })
      return rules
    }, [])
    .sort((a, b) => {
      const priorityA = a.rule.priority ?? Number.MAX_SAFE_INTEGER
      const priorityB = b.rule.priority ?? Number.MAX_SAFE_INTEGER
      return priorityA - priorityB || a.index - b.index
    })
    .map(({ rule }) => rule)
}

function parsePayloadPath(path: string) {
  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean)
}

function flattenPayloadValues(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(flattenPayloadValues)
  return [value]
}

function getNestedPayloadValues(payload: Record<string, unknown>, path: string): unknown[] {
  const segments = parsePayloadPath(path)
  if (!segments.length) return []

  let values: unknown[] = [payload]

  for (const segment of segments) {
    values = values.flatMap((current) => {
      if (current === null || current === undefined) return []
      if (Array.isArray(current)) {
        if (/^\d+$/.test(segment)) return [current[Number(segment)]]
        return current.map((item) => item && typeof item === 'object' ? (item as Record<string, unknown>)[segment] : undefined)
      }
      if (typeof current !== 'object') return []
      return [(current as Record<string, unknown>)[segment]]
    }).filter((current) => current !== undefined)
  }

  return values.flatMap(flattenPayloadValues)
}

function isPresentPayloadValue(value: unknown) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

function valueToText(value: unknown) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function normalizeTextForCompare(value: unknown, caseSensitive: boolean) {
  const text = valueToText(value)
  return caseSensitive ? text : text.toLowerCase()
}

function getExpectedValues(value: AffiliateEventComparableValue | AffiliateEventComparableValue[] | undefined): AffiliateEventComparableValue[] {
  if (Array.isArray(value)) return value
  return value === undefined ? [] : [value]
}

function toNumberValue(value: unknown) {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : undefined
}

function describeExpectedValue(value: AffiliateEventComparableValue | AffiliateEventComparableValue[] | undefined) {
  if (Array.isArray(value)) return `[${value.map(String).join(', ')}]`
  return value === undefined ? '' : String(value)
}

function describeCondition(condition: AffiliateEventCondition) {
  return `${condition.field} ${condition.operator ?? 'equals'} ${describeExpectedValue(condition.value)}`.trim()
}

function evaluateCondition(payload: Record<string, unknown>, condition: AffiliateEventCondition, rule: AffiliateEventRule): ConditionEvaluation {
  const operator = condition.operator ?? 'equals'
  const values = getNestedPayloadValues(payload, condition.field)
  const valuesForComparison = values.length ? values : [undefined]
  const expectedValues = getExpectedValues(condition.value)
  const caseSensitive = condition.caseSensitive ?? rule.caseSensitive ?? false
  const present = values.some(isPresentPayloadValue)
  const compareText = (matcher: (actual: string, expected: string) => boolean) => valuesForComparison.some((actual) => {
    const actualText = normalizeTextForCompare(actual, caseSensitive)
    return expectedValues.some((expected) => matcher(actualText, normalizeTextForCompare(expected, caseSensitive)))
  })
  const compareNumber = (matcher: (actual: number, expected: number) => boolean) => valuesForComparison.some((actual) => {
    const actualNumber = toNumberValue(actual)
    if (actualNumber === undefined) return false
    return expectedValues.some((expected) => {
      const expectedNumber = toNumberValue(expected)
      return expectedNumber !== undefined && matcher(actualNumber, expectedNumber)
    })
  })

  const matched = operator === 'exists'
    ? present
    : operator === 'not_exists'
      ? !present
      : operator === 'contains'
        ? compareText((actual, expected) => actual.includes(expected))
        : operator === 'not_contains'
          ? present && !compareText((actual, expected) => actual.includes(expected))
          : operator === 'starts_with'
            ? compareText((actual, expected) => actual.startsWith(expected))
            : operator === 'ends_with'
              ? compareText((actual, expected) => actual.endsWith(expected))
              : operator === 'in'
                ? compareText((actual, expected) => actual === expected)
                : operator === 'not_in'
                  ? present && !compareText((actual, expected) => actual === expected)
                  : operator === 'regex'
                    ? expectedValues.some((expected) => {
                      try {
                        const regex = new RegExp(String(expected), caseSensitive ? undefined : 'i')
                        return valuesForComparison.some((actual) => regex.test(valueToText(actual)))
                      } catch {
                        return false
                      }
                    })
                    : operator === 'gt'
                      ? compareNumber((actual, expected) => actual > expected)
                      : operator === 'gte'
                        ? compareNumber((actual, expected) => actual >= expected)
                        : operator === 'lt'
                          ? compareNumber((actual, expected) => actual < expected)
                          : operator === 'lte'
                            ? compareNumber((actual, expected) => actual <= expected)
                            : operator === 'not_equals'
                              ? present && !compareText((actual, expected) => actual === expected)
                              : compareText((actual, expected) => actual === expected)

  const matchedValue = values.filter(isPresentPayloadValue).map(valueToText).slice(0, 5).join(', ')
  return {
    matched,
    field: condition.field,
    value: matchedValue || undefined,
    description: describeCondition(condition)
  }
}

function getRuleConditions(rule: AffiliateEventRule): AffiliateEventCondition[] {
  if (Array.isArray(rule.conditions) && rule.conditions.length) return rule.conditions
  const condition = normalizeAffiliateEventCondition(rule, rule.caseSensitive)
  return condition ? [condition] : []
}

function describeRule(rule: AffiliateEventRule, conditions: AffiliateEventCondition[]) {
  const joiner = (rule.match ?? 'all') === 'any' ? ' OR ' : ' AND '
  return `${(rule.match ?? 'all').toUpperCase()}: ${conditions.map(describeCondition).join(joiner)}`
}

export function resolveAffiliateEventName(payload: Record<string, unknown>, mapping: unknown, defaultEventName?: unknown): AffiliateEventMatch {
  const normalizedDefault = normalizeEventName(defaultEventName)
  const rules = normalizeAffiliateEventMapping(mapping)

  for (const rule of rules) {
    const conditions = getRuleConditions(rule)
    if (!conditions.length) continue
    const evaluations = conditions.map((condition) => evaluateCondition(payload, condition, rule))
    const matchType = rule.match ?? 'all'
    const matched = matchType === 'any'
      ? evaluations.some((evaluation) => evaluation.matched)
      : evaluations.every((evaluation) => evaluation.matched)

    if (matched) {
      const matchedEvaluations = evaluations.filter((evaluation) => evaluation.matched)
      return {
        eventName: rule.eventName,
        eventRule: rule.label ?? describeRule(rule, conditions),
        eventMatchedField: (matchType === 'all' ? evaluations : matchedEvaluations).map((evaluation) => evaluation.field).join(', ') || undefined,
        eventMatchedValue: matchedEvaluations.map((evaluation) => evaluation.value).filter(Boolean).join(' | ') || undefined
      }
    }
  }

  return { eventName: normalizedDefault }
}

export function escapeHtml(value: string) {
  const entities: Record<string, string> = {
    '&': '\u0026amp;',
    '<': '\u0026lt;',
    '>': '\u0026gt;',
    '"': '\u0026quot;',
    "'": '\u0026#039;'
  }

  return value.replace(/[&<>"']/g, (char) => entities[char] ?? char)
}
