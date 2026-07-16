import { CalendarClock, CreditCard, History, ReceiptText, WalletCards } from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
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
  return (
    <section className="single-page-grid">
      <Card className="page-card">
        <CardHeader className="section-heading">
          <div>
            <CardTitle><CreditCard size={18} /> Subscriptions</CardTitle>
            <CardDescription>Gói dịch vụ, chu kỳ gia hạn và quota vận hành sẽ được quản lý độc lập với thanh toán.</CardDescription>
          </div>
          <Badge variant="secondary">Coming soon</Badge>
        </CardHeader>
        <CardContent>
          <WorkspaceContext ctx={ctx} />
          <div className="detail-grid">
            <span>Gói hiện tại</span><strong>Chưa chuyển đổi dữ liệu subscription</strong>
            <span>Chu kỳ gia hạn</span><strong>Chưa thiết lập</strong>
            <span>Quota</span><strong>Sẽ hiển thị theo subscription đang hoạt động</strong>
          </div>
        </CardContent>
      </Card>
      <Card className="table-card">
        <CardHeader>
          <CardTitle><CalendarClock size={18} /> Vòng đời subscription</CardTitle>
          <CardDescription>Khung này sẽ quản lý đăng ký mới, nâng/hạ gói, gia hạn, tạm dừng và hết hạn.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="empty-state">Subscription sẽ trở thành nguồn dữ liệu cho quota. Model `BillingPlan` hiện tại chưa bị thay đổi để không ảnh hưởng tracking đang chạy.</p>
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
