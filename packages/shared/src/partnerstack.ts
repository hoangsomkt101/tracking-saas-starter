export type PartnerStackPayloadRecord = Record<string, unknown>

export type PartnerStackEventMatch = {
    eventName: string
    eventRule?: string
    eventMatchedField?: string
    eventMatchedValue?: string
}

type AnyRecord = Record<string, any>

function getPlainRecord(value: unknown): AnyRecord | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : null
}

function isFilledValue(value: unknown): boolean {
    if (value === undefined || value === null) return false
    if (typeof value === 'string') return value.trim().length > 0
    if (Array.isArray(value)) return value.some(isFilledValue)
    return true
}

function compactRecord<T extends AnyRecord>(value: T): AnyRecord {
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined && entry !== ''))
}

function parsePath(path: string) {
    return path
        .replace(/\[(\d+)\]/g, '.$1')
        .replace(/\[\*\]/g, '.*')
        .split('.')
        .map((part) => part.trim())
        .filter(Boolean)
}

function flattenValues(value: unknown): unknown[] {
    if (Array.isArray(value)) return value.flatMap(flattenValues)
    return [value]
}

function getPathValues(payload: AnyRecord, path: string): unknown[] {
    const segments = parsePath(path)
    if (!segments.length) return []

    let values: unknown[] = [payload]

    for (const segment of segments) {
        values = values.flatMap((current) => {
            if (current === null || current === undefined) return []
            if (Array.isArray(current)) {
                if (segment === '*') return current
                if (/^\d+$/.test(segment)) return [current[Number(segment)]]
                return current.map((item) => item && typeof item === 'object' ? (item as AnyRecord)[segment] : undefined)
            }
            if (typeof current !== 'object') return []
            return [(current as AnyRecord)[segment]]
        }).filter((current) => current !== undefined)
    }

    return values.flatMap(flattenValues)
}

function firstFilledPathValue(payload: AnyRecord, paths: string[]) {
    for (const path of paths) {
        const value = getPathValues(payload, path).find(isFilledValue)
        if (value !== undefined) return value
    }
    return undefined
}

function valueToString(value: unknown): string | undefined {
    if (Array.isArray(value)) return value.map(valueToString).filter(Boolean).join(', ') || undefined
    if (typeof value === 'string') return value.trim() || undefined
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    return undefined
}

function getStringPath(payload: AnyRecord, paths: string[]) {
    return valueToString(firstFilledPathValue(payload, paths))
}

function parseMoneyValue(value: unknown): string | undefined {
    if (Array.isArray(value)) return parseMoneyValue(value.find(isFilledValue))
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
    if (typeof value === 'string' && value.trim()) {
        const normalized = value.trim().replace(/,/g, '')
        const direct = Number(normalized)
        if (Number.isFinite(direct)) return String(direct)
        const numericText = normalized.replace(/[^0-9.-]/g, '')
        const parsed = Number(numericText)
        return Number.isFinite(parsed) ? String(parsed) : undefined
    }
    return undefined
}

function getMoneyPath(payload: AnyRecord, paths: string[]) {
    return parseMoneyValue(firstFilledPathValue(payload, paths))
}

function getPartnerStackMoneyPath(payload: AnyRecord, paths: string[]) {
    const cents = parseMoneyValue(firstFilledPathValue(payload, paths))
    if (cents === undefined) return undefined
    const amount = Number(cents) / 100
    return Number.isFinite(amount) ? String(amount) : undefined
}

function normalizeEvent(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : undefined
}

function normalizeCurrency(value: unknown) {
    const text = valueToString(value)
    return text ? text.toUpperCase() : undefined
}

function normalizeKeyPart(value: string) {
    return value.trim().replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'event'
}

function toMatchedValue(value: AnyRecord) {
    return JSON.stringify(compactRecord(value))
}

export function getPartnerStackData(payload: PartnerStackPayloadRecord) {
    return getPlainRecord(payload.data)
}

export function getPartnerStackWebhookEvent(payload: PartnerStackPayloadRecord) {
    return normalizeEvent(payload.event)
}

export function isPartnerStackPostbackPayload(payload: PartnerStackPayloadRecord) {
    const event = getPartnerStackWebhookEvent(payload)
    return Boolean(event && event.includes('.') && getPartnerStackData(payload))
}

export function getPartnerStackFieldMap(payloadOrData: PartnerStackPayloadRecord) {
    const data = getPartnerStackData(payloadOrData) ?? getPlainRecord(payloadOrData) ?? {}
    const fields = Array.isArray(data.fields) ? data.fields : []
    return Object.fromEntries(
        fields
            .map(getPlainRecord)
            .filter((field): field is AnyRecord => Boolean(field))
            .map((field) => [valueToString(field.api_name) ?? '', field.value] as const)
            .filter(([apiName, value]) => apiName && isFilledValue(value))
    )
}

export function getPartnerStackClickUuid(payload: PartnerStackPayloadRecord) {
    return getStringPath(payload, ['data.sub_ids[0]', 'data.customer.sub_ids[0]'])
}

export function getPartnerStackCustomerId(payload: PartnerStackPayloadRecord) {
    const event = getPartnerStackWebhookEvent(payload)
    if (event?.startsWith('customer.')) return getStringPath(payload, ['data.key', 'data.customer.key'])
    return getStringPath(payload, ['data.customer.key', 'data.key'])
}

export function getPartnerStackCustomerEmail(payload: PartnerStackPayloadRecord) {
    const fields = getPartnerStackFieldMap(payload)
    return getStringPath(payload, ['data.customer_email', 'data.customer.email']) ?? valueToString(fields.email)
}

export function getPartnerStackCustomerName(payload: PartnerStackPayloadRecord) {
    const fields = getPartnerStackFieldMap(payload)
    return getStringPath(payload, ['data.customer_name', 'data.customer.name']) ?? valueToString(fields.name)
}

export function getPartnerStackCustomerPhone(payload: PartnerStackPayloadRecord) {
    const fields = getPartnerStackFieldMap(payload)
    return valueToString(fields.phone)
}

export function getPartnerStackCountry(payload: PartnerStackPayloadRecord) {
    const fields = getPartnerStackFieldMap(payload)
    return valueToString(fields.country_iso) ?? valueToString(fields.country) ?? getStringPath(payload, ['data.customer.country', 'data.country'])
}

export function getPartnerStackCurrency(payload: PartnerStackPayloadRecord) {
    return normalizeCurrency(firstFilledPathValue(payload, ['data.currency', 'data.transaction.currency'])) ?? 'USD'
}

export function getPartnerStackOrderAmount(payload: PartnerStackPayloadRecord) {
    const event = getPartnerStackWebhookEvent(payload)
    if (event?.startsWith('reward.')) return getPartnerStackMoneyPath(payload, ['data.transaction.amount_usd', 'data.transaction.amount'])
    return getPartnerStackMoneyPath(payload, ['data.amount_usd', 'data.amount'])
}

export function getPartnerStackRewardAmount(payload: PartnerStackPayloadRecord) {
    const event = getPartnerStackWebhookEvent(payload)
    return event?.startsWith('reward.') ? getPartnerStackMoneyPath(payload, ['data.amount']) : undefined
}

export function getPartnerStackOrderId(payload: PartnerStackPayloadRecord) {
    const event = getPartnerStackWebhookEvent(payload)
    if (event?.startsWith('transaction.')) return getStringPath(payload, ['data.key'])
    if (event?.startsWith('reward.')) return getStringPath(payload, ['data.source.key'])
    return undefined
}

export function getPartnerStackObjectKey(payload: PartnerStackPayloadRecord) {
    return getStringPath(payload, ['data.key'])
}

export function getPartnerStackConversionMoney(payload: PartnerStackPayloadRecord) {
    if (!isPartnerStackPostbackPayload(payload)) return null
    const event = getPartnerStackWebhookEvent(payload)
    const currency = getPartnerStackCurrency(payload)

    if (event?.startsWith('transaction.')) {
        return compactRecord({ payoutAmount: getPartnerStackOrderAmount(payload), currency })
    }

    if (event?.startsWith('reward.')) {
        return compactRecord({ commissionAmount: getPartnerStackRewardAmount(payload), currency })
    }

    return compactRecord({ currency })
}

export function parsePartnerStackTimestamp(value: unknown): Date | null {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
    if (typeof value === 'number' && Number.isFinite(value)) return new Date(value > 1_000_000_000_000 ? value : value * 1000)
    if (typeof value === 'string' && value.trim()) {
        const text = value.trim()
        const numeric = Number(text)
        if (Number.isFinite(numeric)) return new Date(numeric > 1_000_000_000_000 ? numeric : numeric * 1000)
        const date = new Date(text)
        return Number.isNaN(date.getTime()) ? null : date
    }
    return null
}

export function getPartnerStackEventDate(payload: PartnerStackPayloadRecord) {
    if (!isPartnerStackPostbackPayload(payload)) return null
    const raw = firstFilledPathValue(payload, ['data.created_at'])
    const date = parsePartnerStackTimestamp(raw)
    if (!date || Number.isNaN(date.getTime())) return null
    return { field: 'data.created_at', raw: raw instanceof Date ? raw.toISOString() : String(raw), date }
}

export function getPartnerStackUpdateDate(payload: PartnerStackPayloadRecord) {
    if (!isPartnerStackPostbackPayload(payload)) return null
    const raw = firstFilledPathValue(payload, ['data.updated_at'])
    const date = parsePartnerStackTimestamp(raw)
    if (!date || Number.isNaN(date.getTime())) return null
    return { field: 'data.updated_at', raw: raw instanceof Date ? raw.toISOString() : String(raw), date }
}

export function getPartnerStackEventMatch(payload: PartnerStackPayloadRecord): PartnerStackEventMatch | null {
    if (!isPartnerStackPostbackPayload(payload)) return null
    const event = getPartnerStackWebhookEvent(payload)
    const clickUuid = getPartnerStackClickUuid(payload)
    const customerKey = getPartnerStackCustomerId(payload)
    const objectKey = getPartnerStackObjectKey(payload)

    if (event?.startsWith('transaction.')) {
        const amount = getPartnerStackOrderAmount(payload)
        return {
            eventName: 'Purchase',
            eventRule: `PartnerStack ${event}`,
            eventMatchedField: 'event, data.customer.sub_ids[0], data.amount',
            eventMatchedValue: toMatchedValue({ event, clickUuid, transactionKey: objectKey, amount })
        }
    }

    if (event?.startsWith('reward.')) {
        const amount = getPartnerStackRewardAmount(payload)
        return {
            eventName: 'Payout',
            eventRule: `PartnerStack ${event}`,
            eventMatchedField: 'event, data.customer.sub_ids[0], data.amount',
            eventMatchedValue: toMatchedValue({ event, clickUuid, rewardKey: objectKey, amount })
        }
    }

    if (event?.startsWith('customer.')) {
        return {
            eventName: 'CompleteRegistration',
            eventRule: `PartnerStack ${event}`,
            eventMatchedField: 'event, data.key, data.sub_ids[0], data.created_at',
            eventMatchedValue: toMatchedValue({ event, clickUuid, customerKey })
        }
    }

    return null
}

export function getPartnerStackIdempotencyKey(payload: PartnerStackPayloadRecord, eventName?: string, clickUuid?: string) {
    if (!isPartnerStackPostbackPayload(payload)) return undefined
    const event = getPartnerStackWebhookEvent(payload)
    const objectKey = getPartnerStackObjectKey(payload)
    const customerKey = getPartnerStackCustomerId(payload)

    if (event?.startsWith('customer.') && customerKey) {
        if (eventName === 'CompleteRegistration') return `partnerstack:complete_registration:${customerKey}`
        return `partnerstack:${normalizeKeyPart(event)}:${customerKey}`
    }

    if (event?.startsWith('transaction.') && objectKey) return `partnerstack:transaction:${objectKey}`
    if (event?.startsWith('reward.') && objectKey) return `partnerstack:reward:${objectKey}`
    if (event && objectKey) return `partnerstack:${normalizeKeyPart(event)}:${objectKey}`
    return undefined
}

export function getPartnerStackCapiValue(payload: PartnerStackPayloadRecord, eventName?: string) {
    if (!isPartnerStackPostbackPayload(payload)) return undefined
    if (eventName === 'Payout' || eventName === 'Commission') return getPartnerStackRewardAmount(payload)
    if (eventName === 'Purchase') return getPartnerStackOrderAmount(payload)
    return undefined
}

export function getPartnerStackCapiEnrichment(payload: PartnerStackPayloadRecord, eventName: string | undefined, clickUuid?: string) {
    if (!isPartnerStackPostbackPayload(payload)) return null
    const eventDate = getPartnerStackEventDate(payload)
    const fields = getPartnerStackFieldMap(payload)
    const event = getPartnerStackWebhookEvent(payload)
    const customerId = getPartnerStackCustomerId(payload)
    const customerEmail = getPartnerStackCustomerEmail(payload)
    const customerName = getPartnerStackCustomerName(payload)
    const orderId = getPartnerStackOrderId(payload)
    const orderValue = getPartnerStackOrderAmount(payload)
    const commissionValue = getPartnerStackRewardAmount(payload)
    const companyName = valueToString(fields.company_name) ?? getStringPath(payload, ['data.company.name'])
    const website = valueToString(fields.website)
    const sourceType = valueToString(fields.source_type)
    const value = getPartnerStackCapiValue(payload, eventName)
    const objectKey = getPartnerStackObjectKey(payload)
    const eventId = eventName === 'CompleteRegistration' && clickUuid
        ? `${eventName}_${clickUuid}`
        : eventName && objectKey
            ? `${eventName}_${objectKey}`
            : clickUuid && eventName
                ? `${eventName}_${clickUuid}`
                : undefined

    return compactRecord({
        value: value === undefined ? undefined : Number(value),
        currency: getPartnerStackCurrency(payload),
        orderId,
        customerId,
        customerEmail,
        customerName,
        customerPhone: getPartnerStackCustomerPhone(payload),
        country: getPartnerStackCountry(payload),
        companyName,
        website,
        sourceType,
        orderValue: orderValue === undefined ? undefined : Number(orderValue),
        commissionValue: commissionValue === undefined ? undefined : Number(commissionValue),
        partnerstackEvent: event,
        partnerstackCustomerKey: customerId,
        partnerstackObjectKey: objectKey,
        partnerstackFields: Object.keys(fields).length ? fields : undefined,
        eventTime: eventDate?.date.toISOString(),
        eventTimeMs: eventDate?.date.getTime(),
        eventId
    })
}
