import { Activity, ArrowUpRight, CircleDollarSign, FolderKanban, Layers3, Link2, Megaphone, MousePointerClick, Users2 } from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { StatusBanner } from '../../components/common/StatusBanner'
import type { DashboardContext } from '../../types/domain'

export function OverviewPage({ ctx }: { ctx: DashboardContext }) {
  const stats = [
    { label: 'Total Revenue', value: '$12,485', icon: CircleDollarSign, hint: '+12.5% from last month', accent: 'green' },
    { label: 'Campaigns', value: ctx.data.campaigns.length, icon: Megaphone, hint: `${ctx.tenantCampaigns.length} in current workspace`, accent: 'blue' },
    { label: 'Tracking Links', value: ctx.data.trackingLinks.length, icon: Link2, hint: `${ctx.tenantTrackingLinks.length} visible links`, accent: 'violet' },
    { label: 'Click Events', value: ctx.data.clickEvents.length, icon: Activity, hint: 'Latest 100 events', accent: 'orange' }
  ]

  return (
    <>
      <StatusBanner status={ctx.status} />
      <section className="stats-grid">
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
              <CardDescription>Traffic trend mô phỏng theo dữ liệu click hiện tại.</CardDescription>
            </div>
            <Badge variant="secondary">Last 30 days</Badge>
          </CardHeader>
          <CardContent>
            <div className="chart-bars" aria-label="Performance chart">
              {[38, 54, 42, 78, 61, 88, 74, 92, 68, 83, 96, 72].map((height, index) => (
                <div key={index} style={{ height: `${height}%` }} />
              ))}
            </div>
            <div className="chart-footer">
              <span><Users2 size={15} /> {ctx.data.clickEvents.length} total clicks</span>
              <span><FolderKanban size={15} /> {ctx.data.campaigns.length} campaigns</span>
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
