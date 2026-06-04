import { CircleDollarSign, Download, MousePointerClick, ShieldCheck } from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { EventFiltersForm } from '../events/EventPages'
import { PaginationControls } from '../../components/common/PaginationControls'
import { formatCurrencyAmount, formatDate } from '../../lib/format'
import type { DashboardContext } from '../../types/domain'

function statusVariant(status: string) {
  if (status === 'DELIVERED') return 'success'
  if (status === 'FAILED') return 'error'
  return 'pending'
}

export function AnalyticsPage({ ctx }: { ctx: DashboardContext }) {
  const summary = ctx.data.analyticsBreakdown.summary
  const exportCsv = (type: string) => { void ctx.exportAnalyticsCsv(type).catch((error) => ctx.setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Không export được CSV' })) }
  const cards = [
    { label: 'Data click', value: ctx.clickEventsPagination.total, hint: 'Click events đã capture', icon: MousePointerClick },
    { label: 'CAPI delivery', value: ctx.capiEventsPagination.total, hint: `${summary.capiDelivered} delivered · ${summary.capiFailed} failed`, icon: ShieldCheck },
    { label: 'Postback', value: ctx.conversionEventsPagination.total, hint: 'Affiliate postback records', icon: CircleDollarSign }
  ]

  return (
    <div className="analytics-page-stack">
      <EventFiltersForm ctx={ctx} showStatus />
      <Card className="table-card">
        <CardHeader className="section-heading">
          <div>
            <CardTitle><Download size={18} /> Export CSV</CardTitle>
            <CardDescription>Xuất 3 loại data đang hiển thị: click, CAPI delivery, postback.</CardDescription>
          </div>
          <div className="button-row">
            <Button type="button" variant="outline" size="sm" onClick={() => exportCsv('clicks')}>Data click CSV</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => exportCsv('capi')}>CAPI delivery CSV</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => exportCsv('conversions')}>Postback CSV</Button>
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

        <Card className="table-card">
          <CardHeader>
            <CardTitle><CircleDollarSign size={18} /> Postback</CardTitle>
            <CardDescription>{ctx.conversionEventsPagination.total} affiliate postback records · trang này {ctx.tenantConversionEvents.length} records.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Network</th><th>Event</th><th>Click UUID</th><th>Matched click</th><th>Amount</th><th>Requests</th><th>Method</th><th>Created</th></tr></thead>
                <tbody>
                  {ctx.tenantConversionEvents.map((event) => <tr key={event.id}><td>{event.affiliatePlatform?.name ?? event.affiliatePlatformId}</td><td>{event.eventName ?? '—'}</td><td>{event.clickUuid ?? '—'}</td><td>{event.attribution?.matched ? <><Badge variant="success">Matched</Badge><br /><small>{event.attribution.trackingLink?.slug ?? event.attribution.campaign?.name ?? '—'}</small></> : <Badge variant="muted">Unmatched</Badge>}</td><td>{formatCurrencyAmount(event.payoutAmount ?? event.commissionAmount ?? event.spendAmount, event.currency ?? 'USD')}</td><td>{event.requestCount ?? 1}<br /><small>{event.idempotencyKey ? event.idempotencyKey.slice(0, 14) : '—'}</small></td><td>{event.receivedMethod}</td><td>{formatDate(event.createdAt)}</td></tr>)}
                  {!ctx.tenantConversionEvents.length && <tr><td colSpan={8}>Chưa có postback.</td></tr>}
                </tbody>
              </table>
            </div>
            <PaginationControls meta={ctx.conversionEventsPagination} isLoading={ctx.isLoading} onPageChange={ctx.setConversionEventsPage} />
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
