import { Activity, ArrowUpRight, CircleDollarSign, FolderKanban, Layers3, Link2, Megaphone, MousePointerClick, Users2 } from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { StatusBanner } from '../../components/common/StatusBanner'
import { formatCurrencyAmount, formatPercent } from '../../lib/format'
import type { AnalyticsRow, DashboardContext } from '../../types/domain'

function formatDashboardDay(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(new Date(value))
}

function getChartMetric(row: AnalyticsRow) {
  return row.revenue || row.conversions || row.clicks
}

export function OverviewPage({ ctx }: { ctx: DashboardContext }) {
  const analytics = ctx.data.analyticsBreakdown
  const summary = analytics.summary
  const chartRows = [...(analytics.byDay ?? [])].sort((a, b) => String(a.id).localeCompare(String(b.id))).slice(-12)
  const maxChartMetric = Math.max(1, ...chartRows.map(getChartMetric))
  const stats = [
    { label: 'Total Revenue', value: formatCurrencyAmount(summary.revenue), icon: CircleDollarSign, hint: `${formatCurrencyAmount(summary.payout)} payout · ${formatCurrencyAmount(summary.spend)} spend`, accent: 'green' },
    { label: 'Campaigns', value: ctx.tenantCampaigns.length, icon: Megaphone, hint: `${ctx.tenantCampaigns.length} in current workspace`, accent: 'blue' },
    { label: 'Tracking Links', value: ctx.tenantTrackingLinks.length, icon: Link2, hint: `${ctx.tenantTrackingLinks.length} visible links`, accent: 'violet' },
    { label: 'Click Events', value: summary.clicks, icon: MousePointerClick, hint: `${summary.conversions} conversions · ${formatPercent(summary.conversionRate)} CVR`, accent: 'orange' }
  ]

  return (
    <>
      <StatusBanner status={ctx.status} />
      <section className="stats-grid dashboard-stats-grid">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.label} className="stat-card">
              <CardHeader>
                <CardDescription>{stat.label}</CardDescription>
                <div className={`stat-icon accent-${stat.accent}`}><Icon size={17} /></div>
              </CardHeader>
              <CardContent>
                <strong>{stat.value}</strong>
                <span><ArrowUpRight size={13} /> {stat.hint}</span>
              </CardContent>
            </Card>
          )
        })}
      </section>

      <section className="dashboard-grid">
        <Card className="overview-card">
          <CardHeader>
            <div>
              <CardTitle>Performance overview</CardTitle>
              <CardDescription>Daily trend lấy trực tiếp từ analytics database: revenue, conversions và clicks.</CardDescription>
            </div>
            <Badge variant="secondary">Latest {chartRows.length || 0} days</Badge>
          </CardHeader>
          <CardContent>
            {chartRows.length ? (
              <div className="chart-bars" aria-label="Performance chart" style={{ gridTemplateColumns: `repeat(${chartRows.length}, 1fr)` }}>
                {chartRows.map((row) => {
                  const metric = getChartMetric(row)
                  const height = Math.max(8, (metric / maxChartMetric) * 100)
                  return (
                    <div
                      key={row.id}
                      title={`${formatDashboardDay(row.id)} · ${formatCurrencyAmount(row.revenue)} revenue · ${row.conversions} conversions · ${row.clicks} clicks`}
                      style={{ height: `${height}%` }}
                    />
                  )
                })}
              </div>
            ) : (
              <p className="empty-state">Chưa có dữ liệu analytics trong database.</p>
            )}
            <div className="chart-footer">
              <span><Users2 size={15} /> {summary.clicks} total clicks</span>
              <span><CircleDollarSign size={15} /> {formatCurrencyAmount(summary.revenue)} revenue</span>
              <span><FolderKanban size={15} /> {ctx.tenantCampaigns.length} campaigns</span>
            </div>
          </CardContent>
        </Card>

        <Card className="workspace-card">
          <CardHeader>
            <CardTitle><Layers3 size={18} /> Workspace</CardTitle>
            <CardDescription>Workspace riêng cho tài khoản của bạn.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="workspace-chip">
              <strong>{ctx.selectedTenant?.name ?? 'Đang khởi tạo workspace...'}</strong>
              {ctx.selectedTenant && <span>{ctx.selectedTenant.id}</span>}
            </div>
            <div className="workspace-mini-stats">
              <div><span>Campaigns</span><strong>{ctx.tenantCampaigns.length}</strong></div>
              <div><span>Datasets</span><strong>{ctx.tenantDatasets.length}</strong></div>
              <div><span>Platforms</span><strong>{ctx.tenantAffiliatePlatforms.length}</strong></div>
              <div><span>Links</span><strong>{ctx.tenantTrackingLinks.length}</strong></div>
            </div>
            <div className="workspace-metrics">
              <span>Mã workspace</span><strong>{ctx.selectedTenant?.slug ?? 'workspace'}</strong>
              <span>Status</span><Badge variant="secondary">Active</Badge>
            </div>
          </CardContent>
        </Card>

      </section>
    </>
  )
}
