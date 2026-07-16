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
  const currentSubscription = ctx.selectedTenant?.subscription

  return (
    <section className="single-page-grid">
      <Card className="page-card">
        <CardHeader className="section-heading">
          <div>
            <CardTitle><CreditCard size={18} /> Subscriptions</CardTitle>
            <CardDescription>Xem tất cả gói dịch vụ và quota vận hành. Gói đang áp dụng cho workspace được làm nổi bật.</CardDescription>
          </div>
          <Badge variant={currentSubscription?.isActive ? 'active' : 'secondary'}>{currentSubscription?.isActive ? 'Active' : 'No subscription'}</Badge>
        </CardHeader>
        <CardContent>
          <WorkspaceContext ctx={ctx} />
          {currentSubscription ? (
            <div className="detail-grid">
              <span>Subscription hiện tại</span><strong>{currentSubscription.name}{currentSubscription.isDefault ? ' · Default' : ''}</strong>
              <span>Giá subscription</span><strong>{formatMoney(currentSubscription.monthlyPriceCents, currentSubscription.currency)} / tháng</strong>
              <span>Trạng thái</span><strong>{currentSubscription.isActive ? 'Đang hoạt động' : 'Ngừng cung cấp'}</strong>
              <span>Mô tả</span><strong>{currentSubscription.description || 'Chưa có mô tả cho subscription này'}</strong>
            </div>
          ) : <p className="empty-state">Workspace chưa có subscription. Hệ thống sẽ tự gán gói mặc định khi dữ liệu được đồng bộ.</p>}
        </CardContent>
      </Card>
      <Card className="table-card">
        <CardHeader>
          <CardTitle><CalendarClock size={18} /> Tất cả subscription</CardTitle>
          <CardDescription>{ctx.subscriptions.length} gói đã cấu hình. Các gói ngừng cung cấp vẫn được hiển thị để đối chiếu.</CardDescription>
        </CardHeader>
        <CardContent>
          {ctx.subscriptions.length ? <div className="subscription-plan-grid">
            {ctx.subscriptions.map((subscription) => {
              const isCurrentSubscription = subscription.id === currentSubscription?.id

              return <article className={`subscription-plan-card${isCurrentSubscription ? ' is-current' : ''}`} key={subscription.id}>
                <div className="subscription-plan-heading">
                  <div><h3>{subscription.name}</h3><span>{subscription.slug}</span></div>
                  <div className="subscription-plan-badges">
                    {isCurrentSubscription && <Badge variant="active">Gói hiện tại</Badge>}
                    <Badge variant={subscription.isActive ? 'success' : 'muted'}>{subscription.isActive ? 'Đang cung cấp' : 'Ngừng cung cấp'}</Badge>
                  </div>
                </div>
                <strong className="subscription-plan-price">{formatMoney(subscription.monthlyPriceCents, subscription.currency)}<small>/ tháng</small></strong>
                <p>{subscription.description || 'Chưa có mô tả cho subscription này.'}</p>
                <div className="subscription-plan-limits">
                  <span><MousePointerClick size={15} /> {subscription.clickLimit.toLocaleString('en-US')} click / tháng</span>
                  <span><Webhook size={15} /> {subscription.capiEventLimit.toLocaleString('en-US')} CAPI / tháng</span>
                  <span><CheckCircle2 size={15} /> {subscription.eapiEventLimit.toLocaleString('en-US')} EAPI / tháng</span>
                  <span><Database size={15} /> {subscription.campaignDatasetLimit.toLocaleString('en-US')} dataset / campaign</span>
                </div>
              </article>
            })}
          </div> : <p className="empty-state">Chưa có subscription nào được cấu hình.</p>}
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
