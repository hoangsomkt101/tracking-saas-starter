import type { FormEvent } from 'react'
import { Bug, Info, Loader2, RefreshCw, Search, ScrollText, TriangleAlert, XCircle } from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Select } from '../../components/ui/select'
import { FieldLabel } from '../../components/common/FieldLabel'
import { PaginationControls } from '../../components/common/PaginationControls'
import { formatDate, formatLastUpdated } from '../../lib/format'
import { getActiveActivityLogFilterCount } from '../../lib/event-filters'
import { getFormString } from '../../lib/forms'
import type { ActivityLog, DashboardContext } from '../../types/domain'

const levelMeta = {
    DEBUG: { icon: Bug, badge: 'outline' as const },
    INFO: { icon: Info, badge: 'secondary' as const },
    WARN: { icon: TriangleAlert, badge: 'outline' as const },
    ERROR: { icon: XCircle, badge: 'destructive' as const }
}

function uniqueValues(logs: ActivityLog[], key: keyof ActivityLog) {
    return [...new Set(logs.map((log) => log[key]).filter((value): value is string => typeof value === 'string' && value.length > 0))].sort((a, b) => a.localeCompare(b))
}

function metadataPreview(value: unknown) {
    if (!value || typeof value !== 'object') return ''
    const entries = Object.entries(value as Record<string, unknown>).filter(([key]) => !['requestPayload', 'responseBody'].includes(key)).slice(0, 5)
    return entries.map(([key, entry]) => `${key}: ${typeof entry === 'object' ? JSON.stringify(entry) : String(entry)}`).join(' · ')
}

function getCapiResponseBody(log: ActivityLog) {
    const metadata = log.metadata
    if (!metadata || typeof metadata !== 'object') return null
    if (!String(log.eventType).startsWith('capi.')) return null
    return 'responseBody' in metadata ? metadata.responseBody : null
}

export function ActivityLogsPage({ ctx }: { ctx: DashboardContext }) {
    const filters = ctx.activityLogFilters
    const sourceOptions = uniqueValues(ctx.data.activityLogs, 'source')
    const eventTypeOptions = uniqueValues(ctx.data.activityLogs, 'eventType')
    const entityTypeOptions = uniqueValues(ctx.data.activityLogs, 'entityType')

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        ctx.applyActivityLogFilters({
            search: getFormString(form, 'search'),
            startDate: getFormString(form, 'startDate'),
            endDate: getFormString(form, 'endDate'),
            level: getFormString(form, 'level'),
            source: getFormString(form, 'source'),
            eventType: getFormString(form, 'eventType'),
            entityType: getFormString(form, 'entityType'),
            entityId: getFormString(form, 'entityId')
        })
    }

    return (
        <section className="resource-page activity-logs-page">
            <Card className="filter-card">
                <CardHeader>
                    <CardTitle><Search size={18} /> Log filters</CardTitle>
                    <CardDescription>{getActiveActivityLogFilterCount(filters)} active filters. Theo dõi click, prelander, webhook affiliate, CAPI và cấu hình pixel/link.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form className="filters-form" onSubmit={handleSubmit}>
                        <label><FieldLabel>Search</FieldLabel><Input name="search" defaultValue={filters.search} placeholder="message, event type, entity id..." /></label>
                        <label><FieldLabel>Start date</FieldLabel><Input name="startDate" type="date" defaultValue={filters.startDate} /></label>
                        <label><FieldLabel>End date</FieldLabel><Input name="endDate" type="date" defaultValue={filters.endDate} /></label>
                        <label><FieldLabel>Level</FieldLabel><Select name="level" defaultValue={filters.level}><option value="">All levels</option><option value="DEBUG">Debug</option><option value="INFO">Info</option><option value="WARN">Warn</option><option value="ERROR">Error</option></Select></label>
                        <label><FieldLabel>Source</FieldLabel><Select name="source" defaultValue={filters.source}><option value="">All sources</option>{sourceOptions.map((source) => <option key={source} value={source}>{source}</option>)}</Select></label>
                        <label><FieldLabel>Event type</FieldLabel><Select name="eventType" defaultValue={filters.eventType}><option value="">All events</option>{eventTypeOptions.map((eventType) => <option key={eventType} value={eventType}>{eventType}</option>)}</Select></label>
                        <label><FieldLabel>Entity type</FieldLabel><Select name="entityType" defaultValue={filters.entityType}><option value="">All entities</option>{entityTypeOptions.map((entityType) => <option key={entityType} value={entityType}>{entityType}</option>)}</Select></label>
                        <label><FieldLabel>Entity ID</FieldLabel><Input name="entityId" defaultValue={filters.entityId} placeholder="click/capi/link id" /></label>
                        <div className="filters-actions">
                            <Button type="submit"><Search size={16} /> Apply filters</Button>
                            <Button type="button" variant="outline" onClick={ctx.resetActivityLogFilters}>Reset</Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <Card className="events-card page-card">
                <CardHeader className="section-heading">
                    <div>
                        <CardTitle><ScrollText size={18} /> Activity logs</CardTitle>
                        <CardDescription>{ctx.isLoading ? 'Đang tải...' : `${ctx.activityLogsPagination.total} logs · trang này ${ctx.tenantActivityLogs.length} records · cập nhật ${formatLastUpdated(ctx.lastUpdatedAt)}`}</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" type="button" onClick={() => void ctx.loadData()} disabled={ctx.isLoading}>
                        {ctx.isLoading ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
                        Refresh
                    </Button>
                </CardHeader>
                <CardContent>
                    <div className="activity-log-list">
                        {ctx.tenantActivityLogs.map((log) => {
                            const meta = levelMeta[log.level] ?? levelMeta.INFO
                            const Icon = meta.icon
                            return (
                                <article key={log.id} className={`activity-log-item level-${log.level.toLowerCase()}`}>
                                    <div className="activity-log-icon"><Icon size={16} /></div>
                                    <div className="activity-log-main">
                                        <div className="activity-log-head">
                                            <strong>{log.message}</strong>
                                            <Badge variant={meta.badge}>{log.level}</Badge>
                                        </div>
                                        <span>{formatDate(log.createdAt)} · {log.source} · {log.eventType}</span>
                                        <small>{[log.entityType, log.entityId].filter(Boolean).join(' · ') || 'No entity'}{metadataPreview(log.metadata) ? ` · ${metadataPreview(log.metadata)}` : ''}</small>
                                        {getCapiResponseBody(log) !== null && <details className="activity-log-metadata" open><summary>Response body</summary><pre>{JSON.stringify(getCapiResponseBody(log), null, 2)}</pre></details>}
                                        {log.metadata && <details className="activity-log-metadata"><summary>Metadata</summary><pre>{JSON.stringify(log.metadata, null, 2)}</pre></details>}
                                    </div>
                                </article>
                            )
                        })}
                        {!ctx.tenantActivityLogs.length && <p className="empty-state">Chưa có log khớp bộ lọc.</p>}
                    </div>
                    <PaginationControls meta={ctx.activityLogsPagination} isLoading={ctx.isLoading} onPageChange={ctx.setActivityLogsPage} />
                </CardContent>
            </Card>
        </section>
    )
}
