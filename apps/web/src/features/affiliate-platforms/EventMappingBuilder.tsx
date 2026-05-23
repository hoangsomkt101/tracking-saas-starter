import { useMemo, useState } from 'react'
import { Loader2, Plus, Sparkles } from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Select } from '../../components/ui/select'
import { FieldLabel } from '../../components/common/FieldLabel'
import type { AffiliateEventCondition, AffiliateEventRule, AffiliateEventRuleMatch, AffiliateEventRuleOperator, DashboardContext } from '../../types/domain'

export const eventRuleOperatorOptions: Array<{ value: AffiliateEventRuleOperator; label: string; hint: string; needsValue: boolean }> = [
  { value: 'equals', label: '= equals', hint: 'kaof', needsValue: true },
  { value: 'not_equals', label: '≠ not equals', hint: 'cancelled', needsValue: true },
  { value: 'contains', label: 'contains', hint: 'paid', needsValue: true },
  { value: 'not_contains', label: 'not contains', hint: 'test', needsValue: true },
  { value: 'starts_with', label: 'starts with', hint: 'ord_', needsValue: true },
  { value: 'ends_with', label: 'ends with', hint: '_ok', needsValue: true },
  { value: 'exists', label: 'exists', hint: 'Không cần value', needsValue: false },
  { value: 'not_exists', label: 'not exists', hint: 'Không cần value', needsValue: false },
  { value: 'in', label: 'in list', hint: 'kaof, paid, approved', needsValue: true },
  { value: 'not_in', label: 'not in list', hint: 'cancelled, rejected', needsValue: true },
  { value: 'regex', label: 'regex', hint: '^(kaof|paid)$', needsValue: true },
  { value: 'gt', label: '> greater than', hint: '100', needsValue: true },
  { value: 'gte', label: '>= greater/equal', hint: '100', needsValue: true },
  { value: 'lt', label: '< less than', hint: '100', needsValue: true },
  { value: 'lte', label: '<= less/equal', hint: '100', needsValue: true }
]

export const eventRuleValueLessOperators = new Set<AffiliateEventRuleOperator>(['exists', 'not_exists'])
export const numericEventRuleOperators = new Set<AffiliateEventRuleOperator>(['gt', 'gte', 'lt', 'lte'])
export const listEventRuleOperators = new Set<AffiliateEventRuleOperator>(['in', 'not_in'])

export function getOperatorOption(operator?: AffiliateEventRuleOperator) {
  return eventRuleOperatorOptions.find((item) => item.value === operator) ?? eventRuleOperatorOptions[0]
}

export function createDefaultEventCondition(): AffiliateEventCondition {
  return { field: 'status', operator: 'equals', value: 'kaof' }
}

export function createImpactPurchaseEventRule(): AffiliateEventRule {
  return {
    label: 'Impact purchase when Amount or Payout > 0',
    eventName: 'Purchase',
    priority: 10,
    match: 'any',
    conditions: [
      { field: 'Amount', operator: 'gt', value: 0 },
      { field: 'Payout', operator: 'gt', value: 0 }
    ]
  }
}

export function createDefaultEventRule(): AffiliateEventRule {
  return createImpactPurchaseEventRule()
}

export function conditionValueToText(value: AffiliateEventCondition['value']) {
  if (Array.isArray(value)) return value.map(String).join(', ')
  return value === undefined || value === null ? '' : String(value)
}

export function getRuleConditionsForForm(rule: AffiliateEventRule): AffiliateEventCondition[] {
  if (Array.isArray(rule.conditions) && rule.conditions.length) return rule.conditions
  if (rule.field) return [{ field: rule.field, operator: rule.operator ?? 'equals', value: rule.value, caseSensitive: rule.caseSensitive }]
  return [createDefaultEventCondition()]
}

export function normalizeEventRuleForForm(rule: AffiliateEventRule): AffiliateEventRule {
  return {
    label: rule.label ?? '',
    eventName: rule.eventName || 'Purchase',
    match: rule.match === 'any' ? 'any' : 'all',
    priority: typeof rule.priority === 'number' ? rule.priority : undefined,
    caseSensitive: Boolean(rule.caseSensitive),
    conditions: getRuleConditionsForForm(rule).map((condition) => ({
      field: condition.field ?? '',
      operator: condition.operator ?? 'equals',
      value: conditionValueToText(condition.value),
      caseSensitive: Boolean(condition.caseSensitive)
    }))
  }
}

export function normalizeEventRulesForForm(mapping?: AffiliateEventRule[]) {
  const source = Array.isArray(mapping) && mapping.length ? mapping : [createDefaultEventRule()]
  return source.map(normalizeEventRuleForForm)
}

export function parsePriorityInput(value: string) {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined
}

export function parseConditionSubmitValue(operator: AffiliateEventRuleOperator, rawValue: AffiliateEventCondition['value']) {
  const text = conditionValueToText(rawValue).trim()
  if (!text) return undefined
  if (listEventRuleOperators.has(operator)) return text.split(',').map((item) => item.trim()).filter(Boolean)
  if (numericEventRuleOperators.has(operator)) {
    const parsed = Number(text)
    return Number.isFinite(parsed) ? parsed : text
  }
  if (text.toLowerCase() === 'true') return true
  if (text.toLowerCase() === 'false') return false
  return text
}

export function normalizeConditionForSubmit(condition: AffiliateEventCondition): AffiliateEventCondition | null {
  const field = condition.field.trim()
  const operator = condition.operator ?? 'equals'
  if (!field) return null
  const normalized: AffiliateEventCondition = { field, operator }
  if (!eventRuleValueLessOperators.has(operator)) {
    const value = parseConditionSubmitValue(operator, condition.value)
    if (value === undefined || (Array.isArray(value) && value.length === 0)) return null
    normalized.value = value
  }
  if (condition.caseSensitive) normalized.caseSensitive = true
  return normalized
}

export function normalizeRuleForSubmit(rule: AffiliateEventRule): AffiliateEventRule | null {
  const eventName = rule.eventName.trim()
  const conditions = getRuleConditionsForForm(rule).map(normalizeConditionForSubmit).filter((condition): condition is AffiliateEventCondition => Boolean(condition))
  if (!eventName || !conditions.length) return null
  const normalized: AffiliateEventRule = { eventName, match: rule.match === 'any' ? 'any' : 'all', conditions }
  const label = rule.label?.trim()
  if (label) normalized.label = label
  if (typeof rule.priority === 'number') normalized.priority = rule.priority
  if (rule.caseSensitive) normalized.caseSensitive = true
  return normalized
}

export function getEventMappingSubmitRules(rules: AffiliateEventRule[]) {
  return rules.map(normalizeRuleForSubmit).filter((rule): rule is AffiliateEventRule => Boolean(rule))
}

export function formatEventMappingForRules(rules: AffiliateEventRule[]) {
  return JSON.stringify(getEventMappingSubmitRules(rules), null, 2)
}

export function defaultEventMappingText() {
  return formatEventMappingForRules([createDefaultEventRule()])
}

export const impactSamplePayload = JSON.stringify({
  SubId1: 'sample-click-uuid',
  CampaignId: '25619',
  CampaignName: 'Base44',
  ActionTrackerId: '47270',
  ActionTrackerName: 'Purchase',
  Amount: '0.00',
  Payout: '100.00',
  EventDate: '2026-05-11T00:07:27+03:00',
  RefClickId: 'zLRQ0O29mxyZTyWRlh0tUVu:UkuUkm0HLXyTU40'
}, null, 2)

export function formatEventMapping(mapping?: AffiliateEventRule[]) {
  return formatEventMappingForRules(normalizeEventRulesForForm(mapping))
}

export function parseEventMappingInput(value: string) {
  const text = value.trim()
  if (!text) return []
  const parsed = JSON.parse(text)
  if (Array.isArray(parsed)) return parsed
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { rules?: unknown[] }).rules)) return (parsed as { rules: unknown[] }).rules
  throw new Error('Event mapping phải là JSON array hoặc object có rules[]')
}

export function EventMappingBuilder({ name, defaultValue, ctx, tenantId, platformId, defaultEventName }: { name: string; defaultValue?: AffiliateEventRule[]; ctx?: DashboardContext; tenantId?: string; platformId?: string; defaultEventName?: string | null }) {
  const [rules, setRules] = useState<AffiliateEventRule[]>(() => normalizeEventRulesForForm(defaultValue))
  const [samplePayload, setSamplePayload] = useState(impactSamplePayload)
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null)
  const [isTestingMapping, setIsTestingMapping] = useState(false)
  const mappingJson = useMemo(() => formatEventMappingForRules(rules), [rules])

  function updateRule(ruleIndex: number, patch: Partial<AffiliateEventRule>) {
    setRules((current) => current.map((rule, index) => index === ruleIndex ? { ...rule, ...patch } : rule))
  }

  function updateCondition(ruleIndex: number, conditionIndex: number, patch: Partial<AffiliateEventCondition>) {
    setRules((current) => current.map((rule, index) => {
      if (index !== ruleIndex) return rule
      const conditions = getRuleConditionsForForm(rule).map((condition, currentConditionIndex) => currentConditionIndex === conditionIndex ? { ...condition, ...patch } : condition)
      return { ...rule, conditions }
    }))
  }

  function addRule() {
    setRules((current) => [...current, { ...createDefaultEventRule(), label: '', eventName: 'Purchase', priority: (current.length + 1) * 10 }])
  }

  function removeRule(ruleIndex: number) {
    setRules((current) => current.length === 1 ? [normalizeEventRuleForForm(createDefaultEventRule())] : current.filter((_, index) => index !== ruleIndex))
  }

  function addCondition(ruleIndex: number) {
    setRules((current) => current.map((rule, index) => index === ruleIndex ? { ...rule, conditions: [...getRuleConditionsForForm(rule), { ...createDefaultEventCondition(), value: '' }] } : rule))
  }

  function removeCondition(ruleIndex: number, conditionIndex: number) {
    setRules((current) => current.map((rule, index) => {
      if (index !== ruleIndex) return rule
      const nextConditions = getRuleConditionsForForm(rule).filter((_, currentConditionIndex) => currentConditionIndex !== conditionIndex)
      return { ...rule, conditions: nextConditions.length ? nextConditions : [createDefaultEventCondition()] }
    }))
  }

  async function testCurrentMapping() {
    if (!ctx) return
    try {
      setIsTestingMapping(true)
      const sample = JSON.parse(samplePayload || '{}')
      const response = await ctx.fetchJson<Record<string, unknown>>('/affiliate-platforms/test-event-mapping', {
        method: 'POST',
        body: JSON.stringify({ tenantId, platformId, defaultEventName: defaultEventName ?? 'CompleteRegistration', eventMapping: parseEventMappingInput(mappingJson), samplePayload: sample })
      })
      setTestResult(response)
      ctx.setStatus({ type: 'success', message: 'Đã test event mapping với sample payload' })
    } catch (error) {
      setTestResult({ error: error instanceof Error ? error.message : 'Không test được mapping' })
      ctx.setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Không test được mapping' })
    } finally {
      setIsTestingMapping(false)
    }
  }

  return (
    <div className="event-rule-builder">
      <input type="hidden" name={name} value={mappingJson} />
      <div className="rule-builder-toolbar">
        <div>
          <strong>Advanced event matching</strong>
          <small>Mặc định phù hợp Impact: Amount=0 và Payout=0 gửi CompleteRegistration; nếu Amount hoặc Payout {'>'} 0 gửi Purchase.</small>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addRule}><Plus size={14} /> Add rule</Button>
      </div>
      {rules.map((rule, ruleIndex) => {
        const conditions = getRuleConditionsForForm(rule)
        return (
          <div className="event-rule-card" key={ruleIndex}>
            <div className="event-rule-card-header">
              <Badge variant="secondary">Rule #{ruleIndex + 1}</Badge>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeRule(ruleIndex)}>Remove rule</Button>
            </div>
            <div className="event-rule-grid">
              <label><FieldLabel>Label</FieldLabel><Input value={rule.label ?? ''} placeholder="High payout purchase" onChange={(event) => updateRule(ruleIndex, { label: event.currentTarget.value })} /></label>
              <label><FieldLabel>Send event</FieldLabel><Input value={rule.eventName} placeholder="Purchase / Lead / CompleteRegistration" onChange={(event) => updateRule(ruleIndex, { eventName: event.currentTarget.value })} /></label>
              <label><FieldLabel>Match mode</FieldLabel><Select value={rule.match ?? 'all'} onChange={(event) => updateRule(ruleIndex, { match: event.currentTarget.value as AffiliateEventRuleMatch })}><option value="all">ALL conditions</option><option value="any">ANY condition</option></Select></label>
              <label><FieldLabel>Priority</FieldLabel><Input type="number" value={rule.priority ?? ''} placeholder="10" onChange={(event) => updateRule(ruleIndex, { priority: parsePriorityInput(event.currentTarget.value) })} /></label>
              <label className="checkbox event-rule-checkbox"><input type="checkbox" checked={Boolean(rule.caseSensitive)} onChange={(event) => updateRule(ruleIndex, { caseSensitive: event.currentTarget.checked })} /> Case sensitive by default</label>
            </div>
            <div className="condition-list">
              <div className="condition-list-header"><span>Conditions</span><Button type="button" variant="outline" size="sm" onClick={() => addCondition(ruleIndex)}>Add condition</Button></div>
              {conditions.map((condition, conditionIndex) => {
                const operator = condition.operator ?? 'equals'
                const operatorOption = getOperatorOption(operator)
                return (
                  <div className="condition-row" key={`${ruleIndex}-${conditionIndex}`}>
                    <Input value={condition.field} placeholder="status / data.status / items[0].sku" onChange={(event) => updateCondition(ruleIndex, conditionIndex, { field: event.currentTarget.value })} />
                    <Select value={operator} onChange={(event) => {
                      const nextOperator = event.currentTarget.value as AffiliateEventRuleOperator
                      updateCondition(ruleIndex, conditionIndex, { operator: nextOperator, value: eventRuleValueLessOperators.has(nextOperator) ? '' : conditionValueToText(condition.value) })
                    }}>{eventRuleOperatorOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select>
                    {operatorOption.needsValue
                      ? <Input value={conditionValueToText(condition.value)} placeholder={operatorOption.hint} onChange={(event) => updateCondition(ruleIndex, conditionIndex, { value: event.currentTarget.value })} />
                      : <Badge variant="outline" className="condition-no-value">No value</Badge>}
                    <label className="checkbox compact-checkbox"><input type="checkbox" checked={Boolean(condition.caseSensitive)} onChange={(event) => updateCondition(ruleIndex, conditionIndex, { caseSensitive: event.currentTarget.checked })} /> Aa</label>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeCondition(ruleIndex, conditionIndex)}>Remove</Button>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
      <div className="mapping-test-panel">
        <div>
          <strong>Test sample payload</strong>
          <small>Chạy thử rule trước khi save để biết event nào sẽ được gửi sang CAPI.</small>
        </div>
        <textarea className="mapping-sample-input" value={samplePayload} rows={6} onChange={(event) => setSamplePayload(event.currentTarget.value)} />
        <div className="button-row">
          <Button type="button" variant="outline" size="sm" onClick={() => void testCurrentMapping()} disabled={!ctx || isTestingMapping}>
            {isTestingMapping ? <Loader2 className="spin" size={14} /> : <Sparkles size={14} />} Test mapping
          </Button>
          {testResult && <Badge variant={(testResult as { error?: unknown }).error ? 'destructive' : 'secondary'}>{(testResult as { error?: unknown }).error ? 'Test failed' : 'Matched'}</Badge>}
        </div>
        {testResult && <pre>{JSON.stringify(testResult, null, 2)}</pre>}
      </div>
      <details className="mapping-json-preview">
        <summary>JSON preview / advanced edit format</summary>
        <pre>{mappingJson || '[]'}</pre>
      </details>
    </div>
  )
}
