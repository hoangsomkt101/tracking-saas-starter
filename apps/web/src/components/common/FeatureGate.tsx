import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ShieldCheck } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import type { DashboardContext } from '../../types/domain'

export function PlaceholderPage({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <Card className="page-card placeholder-card">
      <CardHeader>
        <div className="placeholder-icon"><Icon size={22} /></div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="empty-state">Module này đã có route riêng và sẵn sàng để triển khai chức năng chi tiết ở bước tiếp theo.</p>
      </CardContent>
    </Card>
  )
}

export function FeatureGate({ ctx, featureKey, children }: { ctx: DashboardContext; featureKey: string; children: ReactNode }) {
  if (ctx.isSuperAdmin || ctx.grantedMenuFeatureIds.has(featureKey)) return <>{children}</>

  return (
    <Card className="page-card placeholder-card">
      <CardHeader>
        <div className="placeholder-icon"><ShieldCheck size={22} /></div>
        <CardTitle>Chưa được cấp chức năng</CardTitle>
        <CardDescription>Khu vực làm việc hiện tại chưa được bật chức năng này.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="empty-state">Liên hệ quản trị viên để được cấp thêm chức năng.</p>
      </CardContent>
    </Card>
  )
}
