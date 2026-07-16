import { CalendarClock, CheckCircle2, CreditCard, Database, History, MousePointerClick, ReceiptText, Webhook, WalletCards } from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { formatMoney } from '../../lib/format'
import type { DashboardContext } from '../../types/domain'

function WorkspaceContext({ ctx }: { ctx: DashboardContext }) {
  return (
    <div className="workspace-chip">
      <strong>{ctx.selectedTenant?.name ?? 'Đang tải workspace...'}</strong>
      <span>{ctx.selectedTenant?.slug ?? 'workspace'}</span>
    </div>
  )
}

export function WalletPage({ ctx }: { ctx: DashboardContext }) {
  return (
    <section className="single-page-grid">
      <Card className="page-card">
        <CardHeader className="section-heading">
          <div>
            <CardTitle><WalletCards size={18} /> Wallet</CardTitle>
            <CardDescription>Quản lý số dư dùng để thanh toán dịch vụ và đối soát các giao dịch nạp tiền.</CardDescription>
          </div>
          <Badge variant="secondary">Coming soon</Badge>
        </CardHeader>
        <CardContent>
          <WorkspaceContext ctx={ctx} />
          <div className="detail-grid">
            <span>Số dư khả dụng</span><strong>Chưa kết nối dữ liệu ví</strong>
            <span>Giao dịch gần đây</span><strong>Chưa có dữ liệu</strong>
            <span>Đơn vị tiền tệ</span><strong>Sẽ cấu hình theo workspace</strong>
          </div>
        </CardContent>
      </Card>
      <Card className="table-card">
        <CardHeader>
          <CardTitle><History size={18} /> Lịch sử ví</CardTitle>
          <CardDescription>Các lượt nạp tiền, điều chỉnh số dư, sử dụng credit và hoàn tiền sẽ được ghi nhận tại đây.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="empty-state">Khung Wallet đã sẵn sàng. Bước tiếp theo sẽ bổ sung số dư, ledger bất biến và luồng yêu cầu nạp tiền.</p>
        </CardContent>
      </Card>
    </section>
  )
}

export function SubscriptionsPage({ ctx }: { ctx: DashboardContext }) {
  const subscription = ctx.selectedTenant?.subscription

  return (
    <section className="single-page-grid">
      <Card className="page-card">
        <CardHeader className="section-heading">
          <div>
            <CardTitle><CreditCard size={18} /> Subscriptions</CardTitle>
            <CardDescription>Gói dịch vụ, chu kỳ gia hạn và quota vận hành sẽ được quản lý độc lập với thanh toán.</CardDescription>
          </div>
          <Badge variant={subscription?.isActive ? 'active' : 'secondary'}>{subscription?.isActive ? 'Active' : 'No subscription'}</Badge>
        </CardHeader>
        <CardContent>
          <WorkspaceContext ctx={ctx} />
          {subscription ? (
            <div className="detail-grid">
              <span>Subscription hiện tại</span><strong>{subscription.name}{subscription.isDefault ? ' · Default' : ''}</strong>
              <span>Giá subscription</span><strong>{formatMoney(subscription.monthlyPriceCents, subscription.currency)} / tháng</strong>
              <span>Trạng thái</span><strong>{subscription.isActive ? 'Đang hoạt động' : 'Ngừng cung cấp'}</strong>
              <span>Mô tả</span><strong>{subscription.description || 'Chưa có mô tả cho subscription này'}</strong>
            </div>
          ) : <p className="empty-state">Workspace chưa có subscription. Hệ thống sẽ tự gán gói mặc định khi dữ liệu được đồng bộ.</p>}
        </CardContent>
      </Card>
      <Card className="table-card">
        <CardHeader>
          <CardTitle><CalendarClock size={18} /> Quota subscription</CardTitle>
          <CardDescription>Giới hạn hiện được áp dụng theo gói đang gắn với workspace. Các quota click, CAPI và EAPI tự tính lại từ đầu tháng UTC.</CardDescription>
        </CardHeader>
        <CardContent>
           {subscription ? (
            <div className="detail-grid">
              <span><MousePointerClick size={15} /> Click / tháng</span><strong>{subscription.clickLimit.toLocaleString('en-US')}</strong>
              <span><Webhook size={15} /> CAPI event / tháng</span><strong>{subscription.capiEventLimit.toLocaleString('en-US')}</strong>
              <span><CheckCircle2 size={15} /> EAPI event / tháng</span><strong>{subscription.eapiEventLimit.toLocaleString('en-US')}</strong>
              <span><Database size={15} /> Dataset / campaign</span><strong>{subscription.campaignDatasetLimit.toLocaleString('en-US')}</strong>
            </div>
          ) : <p className="empty-state">Chưa thể xác định quota vì workspace chưa có subscription.</p>}
        </CardContent>
      </Card>
    </section>
  )
}

export function BillingPage({ ctx }: { ctx: DashboardContext }) {
  return (
    <section className="single-page-grid">
      <Card className="page-card">
        <CardHeader className="section-heading">
          <div>
            <CardTitle><ReceiptText size={18} /> Billing</CardTitle>
            <CardDescription>Billing chỉ lưu và đối soát thanh toán: yêu cầu nạp tiền, chứng từ và trạng thái giao dịch.</CardDescription>
          </div>
          <Badge variant="secondary">Coming soon</Badge>
        </CardHeader>
        <CardContent>
          <WorkspaceContext ctx={ctx} />
          <div className="detail-grid">
            <span>Yêu cầu nạp tiền đang xử lý</span><strong>Chưa có dữ liệu</strong>
            <span>Thanh toán thành công</span><strong>Chưa có dữ liệu</strong>
            <span>Hóa đơn / chứng từ</span><strong>Chưa có dữ liệu</strong>
          </div>
        </CardContent>
      </Card>
      <Card className="table-card">
        <CardHeader className="section-heading">
          <div>
            <CardTitle><History size={18} /> Lịch sử thanh toán</CardTitle>
            <CardDescription>Mỗi giao dịch sẽ có mã tham chiếu, phương thức, số tiền, trạng thái và thời điểm đối soát.</CardDescription>
          </div>
          <Button type="button" variant="outline" disabled>Yêu cầu nạp tiền</Button>
        </CardHeader>
        <CardContent>
          <p className="empty-state">Chưa có payment ledger. Màn hình đã được tách khỏi Subscription và Wallet để sẵn sàng cho lịch sử nạp tiền.</p>
        </CardContent>
      </Card>
    </section>
  )
}
