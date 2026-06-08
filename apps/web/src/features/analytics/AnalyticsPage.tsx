import { CircleDollarSign, Download, Filter, KeyRound, MousePointerClick, ShieldCheck } from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { EventFiltersForm } from '../events/EventPages'
import { PaginationControls } from '../../components/common/PaginationControls'
import { formatCurrencyAmount, formatDate, formatPercent } from '../../lib/format'
import type { DashboardContext } from '../../types/domain'

function statusVariant(status: string) {
  if (status === 'DELIVERED') return 'success'
  if (status === 'FAILED') return 'error'
  return 'pending'
}

function formatPostbackDelay(seconds?: number | null) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—'
  const sign = seconds < 0 ? '-' : ''
  const abs = Math.abs(seconds)
  const days = Math.floor(abs / 86400)
  const hours = Math.floor((abs % 86400) / 3600)
  const minutes = Math.floor((abs % 3600) / 60)
  const secs = Math.floor(abs % 60)
  if (days) return `${sign}${days}d ${hours}h`
  if (hours) return `${sign}${hours}h ${minutes}m`
  if (minutes) return `${sign}${minutes}m ${secs}s`
  return `${sign}${secs}s`
}

export function AnalyticsPage({ ctx }: { ctx: DashboardContext }) {
  const summary = ctx.data.analyticsBreakdown.summary
  const refRows = ctx.data.analyticsBreakdown.byRefId ?? []
  const exportCsv = (type: string) => { void ctx.exportAnalyticsCsv(type).catch((error) => ctx.setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Không export được CSV' })) }
  const applyRefFilter = (refId: string, refSource?: string | null) => ctx.applyEventFilters({ ...ctx.eventFilters, affiliateRefId: refId, affiliateRefSource: refSource ?? '' })
  const cards = [
    { label: 'Data click', value: ctx.clickEventsPagination.total, hint: 'Click events đã capture', icon: MousePointerClick },
    { label: 'Postback', value: ctx.conversionEventsPagination.total, hint: 'Affiliate postback records', icon: CircleDollarSign },
    { label: 'Ref IDs', value: summary.refIds ?? 0, hint: `${summary.partnerStackRefIds ?? 0} PartnerStack · ${summary.impactRefIds ?? 0} Impact`, icon: KeyRound },
    { label: 'CAPI delivery', value: ctx.capiEventsPagination.total, hint: `${summary.capiDelivered} delivered · ${summary.capiFailed} failed`, icon: ShieldCheck }
  ]

  return (
    <div className="analytics-page-stack">
      <EventFiltersForm ctx={ctx} showStatus />
      <Card className="table-card">
        <CardHeader className="section-heading">
          <div>
            <CardTitle><Download size={18} /> Export CSV</CardTitle>
            <CardDescription>Xuất data đang hiển thị: click, postback, CAPI delivery, breakdown/ref IDs.</CardDescription>
          </div>
          <div className="button-row">
            <Button type="button" variant="outline" size="sm" onClick={() => exportCsv('clicks')}>Data click CSV</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => exportCsv('conversions')}>Postback CSV</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => exportCsv('capi')}>CAPI delivery CSV</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => exportCsv('breakdown')}>Breakdown + Ref IDs CSV</Button>
          </div>
        </CardHeader>
      </Card>
      <section className="stats-grid analytics-stats-grid">
        {cards.map((card) => {
          const Icon = card.icon
          return <Card key={card.label} className="stat-card"><CardHeader><CardDescription>{card.label}</CardDescription><div className="stat-icon accent-blue"><Icon size={17} /></div></CardHeader><CardContent><strong>{card.value}</strong><span>{card.hint}</span></CardContent></Card>
        })}
      </section>
      <section className="single-page-grid">
        <Card className="table-card">
          <CardHeader>
            <CardTitle><MousePointerClick size={18} /> Data click</CardTitle>
            <CardDescription>{ctx.clickEventsPagination.total} click records · trang này {ctx.data.clickEvents.length} records.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Created</th><th>Tracking link</th><th>Offer / Network</th><th>Click UUID</th><th>Signal</th><th>IP</th></tr></thead>
                <tbody>
                  {ctx.data.clickEvents.map((event) => <tr key={event.id}><td>{formatDate(event.createdAt)}</td><td><strong>{event.trackingLink?.slug ?? event.trackingLinkId}</strong><br /><small>{event.campaignId ?? 'No campaign'}</small></td><td>{event.trackingLink?.brand?.name ?? '—'}<br /><small>{event.trackingLink?.affiliatePlatform?.name ?? 'No platform'}</small></td><td><small>{event.clickUuid}</small></td><td>{event.fbclid ? `fbclid: ${event.fbclid}` : event.ttclid ? `ttclid: ${event.ttclid}` : event.referrer ?? '—'}</td><td>{event.ip ?? '—'}</td></tr>)}
                  {!ctx.data.clickEvents.length && <tr><td colSpan={6}>Chưa có data click khớp bộ lọc.</td></tr>}
                </tbody>
              </table>
            </div>
            <PaginationControls meta={ctx.clickEventsPagination} isLoading={ctx.isLoading} onPageChange={ctx.setClickEventsPage} />
          </CardContent>
        </Card>

        <Card className="table-card">
          <CardHeader>
            <CardTitle><CircleDollarSign size={18} /> Postback</CardTitle>
            <CardDescription>{ctx.conversionEventsPagination.total} affiliate postback records · trang này {ctx.tenantConversionEvents.length} records.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Matched click</th><th>Ref ID</th><th>Amount</th><th>Payout</th><th>Postback time</th><th>CAPI time</th><th>Delay</th></tr></thead>
                <tbody>
                  {ctx.tenantConversionEvents.map((event) => <tr key={event.id}><td>{event.attribution?.matched ? <><Badge variant="success">{event.attribution.matchedByRefId ? 'Matched by Ref ID' : 'Matched'}</Badge><br /><small>{event.attribution.trackingLink?.slug ?? event.clickUuid ?? '—'}</small></> : <><Badge variant="muted">Unmatched</Badge><br /><small>{event.clickUuid ?? 'No click UUID'}</small></>}</td><td>{event.affiliateRefId ? <><Badge variant="secondary">{event.affiliateRefSource === 'impact_ref_click_id' ? 'Impact' : event.affiliateRefSource === 'partnerstack_customer_key' ? 'PartnerStack' : 'Ref'}</Badge><br /><button type="button" className="text-button" onClick={() => applyRefFilter(event.affiliateRefId!, event.affiliateRefSource)}><small>{event.affiliateRefId}</small></button></> : '—'}</td><td>{formatCurrencyAmount(event.postbackAmount ?? event.spendAmount, event.currency ?? 'USD')}</td><td>{formatCurrencyAmount(event.postbackPayout ?? event.payoutAmount ?? event.commissionAmount, event.currency ?? 'USD')}</td><td>{event.postbackEventAt ? <>{formatDate(event.postbackEventAt)}<br /><small>{event.postbackEventDateField ?? 'event date'}: {event.postbackEventDateValue ?? event.postbackEventAt}</small></> : '—'}</td><td>{event.capiSentAt ? <>{formatDate(event.capiSentAt)}<br /><small>CAPI {event.capiStatus ?? 'sent'}</small></> : '—'}</td><td>{formatPostbackDelay(event.capiDelaySeconds)}</td></tr>)}
                  {!ctx.tenantConversionEvents.length && <tr><td colSpan={7}>Chưa có postback.</td></tr>}
                </tbody>
              </table>
            </div>
            <PaginationControls meta={ctx.conversionEventsPagination} isLoading={ctx.isLoading} onPageChange={ctx.setConversionEventsPage} />
          </CardContent>
        </Card>

        <Card className="table-card">
          <CardHeader>
            <CardTitle><KeyRound size={18} /> Ref ID analytics</CardTitle>
            <CardDescription>{refRows.length} ref IDs đang hiển thị · {summary.refIdConversions ?? 0} conversions có ref ID.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Ref ID</th><th>Source</th><th>Platform</th><th>Conversions</th><th>Matched</th><th>Payout</th><th>CVR</th><th>Last seen</th><th>Action</th></tr></thead>
                <tbody>
                  {refRows.map((row) => <tr key={row.id}><td><strong>{row.refId}</strong><br /><small>{row.id}</small></td><td><Badge variant={row.refSource === 'impact_ref_click_id' ? 'secondary' : 'muted'}>{row.sourceLabel}</Badge></td><td>{row.affiliatePlatformName ?? '—'}</td><td>{row.conversions}<br /><small>{row.uniqueClicks} unique click UUID</small></td><td>{row.attributedConversions} matched<br /><small>{row.unattributedConversions} unmatched</small></td><td>{formatCurrencyAmount(row.payout || row.commission || row.revenue, 'USD')}</td><td>{formatPercent(row.conversionRate)}</td><td>{row.lastSeenAt ? formatDate(row.lastSeenAt) : '—'}</td><td><Button type="button" variant="outline" size="sm" onClick={() => applyRefFilter(row.refId, row.refSource)}><Filter size={14} /> Filter</Button></td></tr>)}
                  {!refRows.length && <tr><td colSpan={9}>Chưa có PartnerStack customer key hoặc Impact RefClickId.</td></tr>}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="table-card">
          <CardHeader>
            <CardTitle><ShieldCheck size={18} /> CAPI delivery</CardTitle>
            <CardDescription>{ctx.capiEventsPagination.total} Meta/TikTok endpoint post records · trang này {ctx.tenantCapiEvents.length} records.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Platform</th><th>Event</th><th>Source</th><th>Click</th><th>Status</th><th>Attempts</th><th>Error</th><th>Created</th></tr></thead>
                <tbody>
                  {ctx.tenantCapiEvents.map((event) => <tr key={event.id}><td>{event.platform.toUpperCase()}</td><td>{event.eventName}</td><td>{event.source ?? 'click'}<br /><small>{event.sourceId || '—'}</small></td><td>{event.clickEvent?.trackingLink?.slug ?? event.clickEvent?.clickUuid ?? '—'}</td><td><Badge variant={statusVariant(event.status)}>{event.status}</Badge></td><td>{event.attempts}</td><td>{event.lastError ?? '—'}</td><td>{formatDate(event.createdAt)}</td></tr>)}
                  {!ctx.tenantCapiEvents.length && <tr><td colSpan={8}>Chưa có CAPI delivery.</td></tr>}
                </tbody>
              </table>
            </div>
            <PaginationControls meta={ctx.capiEventsPagination} isLoading={ctx.isLoading} onPageChange={ctx.setCapiEventsPage} />
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
