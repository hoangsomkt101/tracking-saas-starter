import type { FormEvent } from 'react'
import { Loader2, MousePointerClick, RefreshCw, Search } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Select } from '../../components/ui/select'
import { FieldLabel } from '../../components/common/FieldLabel'
import { PaginationControls } from '../../components/common/PaginationControls'
import { formatDate, formatLastUpdated } from '../../lib/format'
import { getActiveEventFilterCount } from '../../lib/event-filters'
import { getFormString } from '../../lib/forms'
import type { DashboardContext } from '../../types/domain'

export function EventFiltersForm({ ctx, showStatus = false }: { ctx: DashboardContext; showStatus?: boolean }) {
  const filters = ctx.eventFilters

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    ctx.applyEventFilters({
      search: getFormString(form, 'search'),
      startDate: getFormString(form, 'startDate'),
      endDate: getFormString(form, 'endDate'),
      campaignId: getFormString(form, 'campaignId'),
      trackingLinkId: getFormString(form, 'trackingLinkId'),
      affiliatePlatformId: getFormString(form, 'affiliatePlatformId'),
      status: getFormString(form, 'status')
    })
  }

  return (
    <Card className="filter-card">
      <CardHeader>
        <CardTitle><Search size={18} /> Filters</CardTitle>
        <CardDescription>{getActiveEventFilterCount(filters)} active filters. Áp dụng cho analytics và event tables.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="filters-form" onSubmit={handleSubmit}>
          <label><FieldLabel>Search</FieldLabel><Input name="search" defaultValue={filters.search} placeholder="clickUuid, slug, email, event..." /></label>
          <label><FieldLabel>Start date</FieldLabel><Input name="startDate" type="date" defaultValue={filters.startDate} /></label>
          <label><FieldLabel>End date</FieldLabel><Input name="endDate" type="date" defaultValue={filters.endDate} /></label>
          <label><FieldLabel>Campaign</FieldLabel><Select name="campaignId" defaultValue={filters.campaignId}><option value="">All campaigns</option>{ctx.tenantCampaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</Select></label>
          <label><FieldLabel>Tracking link</FieldLabel><Select name="trackingLinkId" defaultValue={filters.trackingLinkId}><option value="">All links</option>{ctx.tenantTrackingLinks.map((link) => <option key={link.id} value={link.id}>{link.slug}</option>)}</Select></label>
          <label><FieldLabel>Affiliate platform</FieldLabel><Select name="affiliatePlatformId" defaultValue={filters.affiliatePlatformId}><option value="">All platforms</option>{ctx.tenantAffiliatePlatforms.map((platform) => <option key={platform.id} value={platform.id}>{platform.name}</option>)}</Select></label>
          {showStatus && <label><FieldLabel>CAPI status</FieldLabel><Select name="status" defaultValue={filters.status}><option value="">All statuses</option><option value="PENDING">Pending</option><option value="PROCESSING">Processing</option><option value="DELIVERED">Delivered</option><option value="FAILED">Failed</option></Select></label>}
          {!showStatus && <input type="hidden" name="status" value={filters.status} />}
          <div className="filters-actions">
            <Button type="submit"><Search size={16} /> Apply filters</Button>
            <Button type="button" variant="outline" onClick={ctx.resetEventFilters}>Reset</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function ClickEventsPage({ ctx }: { ctx: DashboardContext }) {
  return (
    <section className="resource-page">
      <EventFiltersForm ctx={ctx} />
      <Card id="events" className="events-card page-card">
        <CardHeader className="section-heading">
          <div>
            <CardTitle><MousePointerClick size={18} /> Recent activity</CardTitle>
            <CardDescription>{ctx.isLoading ? 'Đang tải...' : `${ctx.clickEventsPagination.total} click events · trang này ${ctx.data.clickEvents.length} records · cập nhật ${formatLastUpdated(ctx.lastUpdatedAt)}`}</CardDescription>
          </div>
          <Button variant="outline" size="sm" type="button" onClick={() => void ctx.loadData()} disabled={ctx.isLoading}>
            {ctx.isLoading ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <div className="event-list">
            {ctx.data.clickEvents.map((event) => (
              <article key={event.id} className="event-item">
                <div className="event-dot" />
                <div>
                  <strong>{event.trackingLink?.slug ?? event.trackingLinkId}</strong>
                  <span>{formatDate(event.createdAt)} · {event.trackingLink?.affiliatePlatform?.name ?? 'No affiliate platform'}</span>
                  <small>{event.fbclid ? `fbclid: ${event.fbclid}` : event.ttclid ? `ttclid: ${event.ttclid}` : event.clickUuid}</small>
                </div>
              </article>
            ))}
            {!ctx.data.clickEvents.length && <p className="empty-state">Chưa có click event khớp bộ lọc.</p>}
          </div>
          <PaginationControls meta={ctx.clickEventsPagination} isLoading={ctx.isLoading} onPageChange={ctx.setClickEventsPage} />
        </CardContent>
      </Card>
    </section>
  )
}
