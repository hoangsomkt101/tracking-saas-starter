export type ImpactPayloadRecord = Record<string, unknown>

export type ImpactEventMatch = {
    eventName: string
    eventRule?: string
    eventMatchedField?: string
    eventMatchedValue?: string
}

export function isFilledPayloadValue(value: unknown): boolean {
    if (value === undefined || value === null) return false
    if (typeof value === 'string') return value.trim().length > 0
    if (Array.isArray(value)) return value.some(isFilledPayloadValue)
    return true
}

export function normalizePayloadLookupKey(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function getPayloadValue(payload: ImpactPayloadRecord, keys: string[]) {
    for (const key of keys) {
        const value = payload[key]
        if (isFilledPayloadValue(value)) return value
    }

    const entries = Object.entries(payload)
    for (const key of keys) {
        const normalizedKey = normalizePayloadLookupKey(key)
        const match = entries.find(([entryKey, value]) => normalizePayloadLookupKey(entryKey) === normalizedKey && isFilledPayloadValue(value))
        if (match) return match[1]
    }

    return undefined
}

export function getPayloadString(payload: ImpactPayloadRecord, keys: string[]) {
    const value = getPayloadValue(payload, keys)
    if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean).join(', ') || undefined
    if (typeof value === 'string') return value.trim() || undefined
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    return undefined
}

export function parseMoneyNumber(value: unknown): number | undefined {
    if (Array.isArray(value)) return parseMoneyNumber(value.find(isFilledPayloadValue))
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
        const normalized = value.trim().replace(/,/g, '')
        const direct = Number(normalized)
        if (Number.isFinite(direct)) return direct
        const numericText = normalized.replace(/[^0-9.-]/g, '')
        const parsed = Number(numericText)
        return Number.isFinite(parsed) ? parsed : undefined
    }
    return undefined
}

export function isImpactPostbackPayload(payload: ImpactPayloadRecord) {
    const userAgent = getPayloadString(payload, ['userAgent', 'user_agent'])
    if (userAgent?.toLowerCase().includes('impact-postback-client')) return true

    const hasImpactTracker = getPayloadValue(payload, ['ActionTrackerId', 'ActionTrackerName', 'RefClickId']) !== undefined
    const hasImpactMoney = getPayloadValue(payload, ['Amount', 'Payout', 'amount', 'payout']) !== undefined
    const hasImpactClick = getPayloadValue(payload, ['SubId1', 'subid1']) !== undefined
    return Boolean(hasImpactTracker && (hasImpactMoney || hasImpactClick))
}

export function getImpactEventMatch(payload: ImpactPayloadRecord): ImpactEventMatch | null {
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

export function getImpactPayoutNumber(payload: ImpactPayloadRecord) {
    return parseMoneyNumber(getPayloadValue(payload, ['Payout', 'payout']))
}

export function getImpactAmountNumber(payload: ImpactPayloadRecord) {
    return parseMoneyNumber(getPayloadValue(payload, ['Amount', 'amount']))
}

export function getImpactActionTrackerEventName(payload: ImpactPayloadRecord) {
    return getPayloadString(payload, ['ActionTrackerName', 'actionTrackerName', 'action_tracker_name'])
}

export function getImpactRefClickId(payload: ImpactPayloadRecord) {
    return getPayloadString(payload, ['RefClickId', 'refClickId', 'ref_click_id', 'refclickid'])
}

export function resolveImpactEventNames(payload: ImpactPayloadRecord, primaryEventName: string) {
    const names = [primaryEventName]

    if (isImpactPostbackPayload(payload)) {
        const payout = getImpactPayoutNumber(payload)
        const actionTrackerName = getImpactActionTrackerEventName(payload)
        if (payout !== undefined && payout > 0) names.push('Payout')
        if (actionTrackerName) names.push(actionTrackerName)
    }

    return [...new Set(names.map((name) => name.trim()).filter(Boolean))]
}

export function getImpactCapiValue(payload: ImpactPayloadRecord) {
    if (!isImpactPostbackPayload(payload)) return undefined

    const amount = getImpactAmountNumber(payload)
    const payout = getImpactPayoutNumber(payload)
    const value = [payout, amount].find((entry) => entry !== undefined && entry !== 0) ?? payout ?? amount
    return value === undefined ? undefined : String(value)
}

export function getImpactActionTrackerAmountValue(payload: ImpactPayloadRecord, eventName?: string) {
    const actionTrackerName = getImpactActionTrackerEventName(payload)
    if (!eventName || !actionTrackerName) return undefined
    return eventName.trim().toLowerCase() === actionTrackerName.trim().toLowerCase()
        ? getImpactAmountNumber(payload)
        : undefined
}
