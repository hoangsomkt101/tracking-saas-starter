import type { FormEvent, ReactNode } from 'react'
import { Activity, BarChart3, CalendarClock, CircleDollarSign, Download, Globe2, Link2, Megaphone, MousePointerClick, Plus, ShieldCheck } from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Select } from '../../components/ui/select'
import { EventFiltersForm } from '../events/EventPages'
import { PaginationControls } from '../../components/common/PaginationControls'
import { formatCurrencyAmount, formatDate, formatPercent } from '../../lib/format'
import { eventFilterParams } from '../../lib/event-filters'
import { getFormString } from '../../lib/forms'
import { runEntityAction } from '../../lib/entity-actions'
import type { AnalyticsComparison, AnalyticsRow, DashboardContext, FunnelStep, ReportSchedule } from '../../types/domain'

export function AnalyticsTable({ title, description, rows }: { title: ReactNode; description: string; rows: AnalyticsRow[] }) {
  return <Card className="table-card"><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent><div className="table-wrap"><table><thead><tr><th>Name</th><th>Clicks</th><th>Conversions</th><th>CVR</th><th>Revenue</th><th>Spend</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.name}</strong><br /><small>{row.id}</small></td><td>{row.clicks}</td><td>{row.conversions}</td><td>{formatPercent(row.conversionRate)}</td><td>{formatCurrencyAmount(row.revenue)}</td><td>{formatCurrencyAmount(row.spend)}</td></tr>)}{!rows.length && <tr><td colSpan={6}>Chưa có dữ liệu.</td></tr>}</tbody></table></div></CardContent></Card>
}

export function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(1, ...steps.map((step) => step.value))
  return <Card className="table-card"><CardHeader><CardTitle><BarChart3 size={18} /> Funnel</CardTitle><CardDescription>Click → conversion → delivered CAPI, tính theo bộ lọc hiện tại.</CardDescription></CardHeader><CardContent><div className="funnel-list">{steps.map((step) => <div className="funnel-row" key={step.key}><div><strong>{step.label}</strong><span>{step.value} · {formatPercent(step.rateFromStart)} from clicks</span></div><div className="funnel-bar"><span style={{ width: `${Math.max(4, (step.value / max) * 100)}%` }} /></div></div>)}{!steps.length && <p className="empty-state">Chưa có funnel data.</p>}</div></CardContent></Card>
}

export function PeriodComparisonCard({ comparison }: { comparison?: AnalyticsComparison | null }) {
  if (!comparison) return <Card className="table-card"><CardHeader><CardTitle><Activity size={18} /> Period comparison</CardTitle><CardDescription>Chọn Start date và End date để so sánh với kỳ liền trước cùng độ dài.</CardDescription></CardHeader><CardContent><p className="empty-state">Chưa đủ date range để so sánh.</p></CardContent></Card>
  const metrics = Object.entries(comparison.metrics)
  return <Card className="table-card"><CardHeader><CardTitle><Activity size={18} /> Period comparison</CardTitle><CardDescription>{comparison.currentPeriod.startDate.slice(0, 10)} → {comparison.currentPeriod.endDate.slice(0, 10)} vs previous period.</CardDescription></CardHeader><CardContent><div className="comparison-grid">{metrics.map(([key, metric]) => <div key={key} className="comparison-item"><span>{key}</span><strong>{key.toLowerCase().includes('rate') ? formatPercent(metric.current) : key === 'revenue' ? formatCurrencyAmount(metric.current) : metric.current}</strong><small>{metric.change >= 0 ? '+' : ''}{key.toLowerCase().includes('rate') ? formatPercent(metric.change) : key === 'revenue' ? formatCurrencyAmount(metric.change) : metric.change} · {formatPercent(metric.changeRate)}</small></div>)}</div></CardContent></Card>
}

export function ReportSchedulesPanel({ ctx }: { ctx: DashboardContext }) {
  async function handleCreateSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ctx.selectedTenant) return
    const form = new FormData(event.currentTarget)
    const formElement = event.currentTarget
    await runEntityAction(ctx, async () => {
      await ctx.fetchJson<ReportSchedule>('/report-schedules', { method: 'POST', body: JSON.stringify({ tenantId: ctx.selectedTenant?.id, name: getFormString(form, 'name'), frequency: getFormString(form, 'frequency'), recipientEmail: getFormString(form, 'recipientEmail'), filters: eventFilterParams(ctx.eventFilters), isActive: true }) })
      formElement.reset()
    }, 'Đã tạo lịch gửi report')
  }
  return <Card className="table-card"><CardHeader><CardTitle><CalendarClock size={18} /> Report scheduler</CardTitle><CardDescription>CSV/report định kỳ lưu kèm bộ lọc hiện tại.</CardDescription></CardHeader><CardContent><form className="scheduler-form" onSubmit={handleCreateSchedule}><Input name="name" placeholder="Weekly performance" required /><Select name="frequency" defaultValue="weekly"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></Select><Input name="recipientEmail" type="email" placeholder="ops@example.com" /><Button type="submit" disabled={!ctx.selectedTenant}><Plus size={16} /> Schedule</Button></form><div className="table-wrap"><table><thead><tr><th>Name</th><th>Frequency</th><th>Next run</th><th>Status</th></tr></thead><tbody>{ctx.tenantReportSchedules.map((schedule) => <tr key={schedule.id}><td><strong>{schedule.name}</strong><br /><small>{schedule.recipientEmail ?? 'No email'}</small></td><td>{schedule.frequency}</td><td>{schedule.nextRunAt ? formatDate(schedule.nextRunAt) : '—'}</td><td><Badge variant={schedule.isActive ? 'secondary' : 'outline'}>{schedule.isActive ? 'Active' : 'Off'}</Badge></td></tr>)}{!ctx.tenantReportSchedules.length && <tr><td colSpan={4}>Chưa có lịch report.</td></tr>}</tbody></table></div></CardContent></Card>
}

export function AnalyticsPage({ ctx }: { ctx: DashboardContext }) {
  const breakdown = ctx.data.analyticsBreakdown
  const summary = breakdown.summary
  const exportCsv = (type: string) => { void ctx.exportAnalyticsCsv(type).catch((error) => ctx.setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Không export được CSV' })) }
  const cards = [
    { label: 'Clicks', value: summary.clicks, hint: `${ctx.clickEventsPagination.total} filtered click records`, icon: MousePointerClick },
    { label: 'Conversions', value: summary.conversions, hint: `${formatPercent(summary.conversionRate)} total CVR`, icon: CircleDollarSign },
    { label: 'Attributed', value: summary.attributedConversions ?? 0, hint: `${summary.unattributedConversions ?? 0} unattributed`, icon: Link2 },
    { label: 'Revenue', value: formatCurrencyAmount(summary.revenue), hint: `${formatCurrencyAmount(summary.spend)} spend`, icon: Activity },
    { label: 'CAPI Delivered', value: summary.capiDelivered, hint: `${summary.capiFailed} failed / ${summary.capiTotal} total`, icon: ShieldCheck }
  ]

  return (
    <>
      <EventFiltersForm ctx={ctx} showStatus />
      <Card className="table-card"><CardHeader className="section-heading"><div><CardTitle><Download size={18} /> Export reports</CardTitle><CardDescription>Xuất CSV theo bộ lọc hiện tại.</CardDescription></div><div className="button-row"><Button type="button" variant="outline" size="sm" onClick={() => exportCsv('conversions')}>Conversions CSV</Button><Button type="button" variant="outline" size="sm" onClick={() => exportCsv('clicks')}>Clicks CSV</Button><Button type="button" variant="outline" size="sm" onClick={() => exportCsv('breakdown')}>Breakdown CSV</Button></div></CardHeader></Card>
      <section className="stats-grid analytics-stats-grid">{cards.map((card) => { const Icon = card.icon; return <Card key={card.label} className="stat-card"><CardHeader><CardDescription>{card.label}</CardDescription><div className="stat-icon accent-blue"><Icon size={17} /></div></CardHeader><CardContent><strong>{card.value}</strong><span>{card.hint}</span></CardContent></Card> })}</section>
      <section className="single-page-grid">
        <FunnelChart steps={breakdown.funnel ?? []} />
        <PeriodComparisonCard comparison={breakdown.comparison} />
        <AnalyticsTable title={<><Megaphone size={18} /> By campaign</>} description="Click/conversion attribution grouped by campaign." rows={breakdown.byCampaign} />
        <AnalyticsTable title={<><Link2 size={18} /> By tracking link / offer</>} description="Performance per tracking link after click UUID attribution." rows={breakdown.byBrand} />
        <AnalyticsTable title={<><Globe2 size={18} /> By affiliate platform</>} description="Network-level click and conversion performance." rows={breakdown.byPlatform} />
        <AnalyticsTable title={<><BarChart3 size={18} /> By day</>} description="Daily trend based on click/conversion timestamps." rows={breakdown.byDay} />
        <Card className="table-card"><CardHeader><CardTitle><ShieldCheck size={18} /> CAPI delivery</CardTitle><CardDescription>{ctx.capiEventsPagination.total} Meta/TikTok delivery records · trang này {ctx.tenantCapiEvents.length} records.</CardDescription></CardHeader><CardContent><div className="table-wrap"><table><thead><tr><th>Platform</th><th>Event</th><th>Click</th><th>Status</th><th>Attempts</th><th>Error</th><th>Created</th></tr></thead><tbody>{ctx.tenantCapiEvents.map((event) => <tr key={event.id}><td>{event.platform.toUpperCase()}</td><td>{event.eventName}</td><td>{event.clickEvent?.trackingLink?.slug ?? event.clickEvent?.clickUuid ?? '—'}</td><td><Badge variant={event.status === 'DELIVERED' ? 'secondary' : event.status === 'FAILED' ? 'destructive' : 'outline'}>{event.status}</Badge></td><td>{event.attempts}</td><td>{event.lastError ?? '—'}</td><td>{formatDate(event.createdAt)}</td></tr>)}{!ctx.tenantCapiEvents.length && <tr><td colSpan={7}>Chưa có CAPI event.</td></tr>}</tbody></table></div><PaginationControls meta={ctx.capiEventsPagination} isLoading={ctx.isLoading} onPageChange={ctx.setCapiEventsPage} /></CardContent></Card>
        <ReportSchedulesPanel ctx={ctx} />
        <Card className="table-card"><CardHeader><CardTitle><CircleDollarSign size={18} /> Conversion attribution</CardTitle><CardDescription>{ctx.conversionEventsPagination.total} affiliate/EAPI conversions · trang này {ctx.tenantConversionEvents.length} records.</CardDescription></CardHeader><CardContent><div className="table-wrap"><table><thead><tr><th>Network</th><th>Event</th><th>Click UUID</th><th>Attribution</th><th>Payout</th><th>Requests</th><th>Method</th><th>Created</th></tr></thead><tbody>{ctx.tenantConversionEvents.map((event) => <tr key={event.id}><td>{event.affiliatePlatform?.name ?? event.affiliatePlatformId}</td><td>{event.eventName ?? '—'}</td><td>{event.clickUuid ?? '—'}</td><td>{event.attribution?.matched ? <><Badge variant="secondary">Matched</Badge><br /><small>{event.attribution.campaign?.name ?? '—'} · {event.attribution.trackingLink?.slug ?? '—'} · {event.attribution.affiliatePlatform?.name ?? event.affiliatePlatform?.name ?? '—'}</small></> : <Badge variant="outline">Unattributed</Badge>}</td><td>{formatCurrencyAmount(event.payoutAmount ?? event.commissionAmount ?? event.spendAmount, event.currency ?? 'USD')}</td><td>{event.requestCount ?? 1}<br /><small>{event.idempotencyKey ? event.idempotencyKey.slice(0, 14) : '—'}</small></td><td>{event.receivedMethod}</td><td>{formatDate(event.createdAt)}</td></tr>)}{!ctx.tenantConversionEvents.length && <tr><td colSpan={8}>Chưa có conversion.</td></tr>}</tbody></table></div><PaginationControls meta={ctx.conversionEventsPagination} isLoading={ctx.isLoading} onPageChange={ctx.setConversionEventsPage} /></CardContent></Card>
      </section>
    </>
  )
}
