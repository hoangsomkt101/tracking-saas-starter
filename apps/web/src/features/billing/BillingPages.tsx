import type { FormEvent } from 'react'
import { CalendarClock, CheckCircle2, CircleDollarSign, Clock3, CreditCard, Database, History, Landmark, MousePointerClick, ReceiptText, RotateCcw, WalletCards, Webhook } from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { FieldLabel } from '../../components/common/FieldLabel'
import { StatusBanner } from '../../components/common/StatusBanner'
import { runEntityAction } from '../../lib/entity-actions'
import { formatDate, formatMoney } from '../../lib/format'
import type { DashboardContext, WalletTopUp } from '../../types/domain'

function WorkspaceContext({ ctx }: { ctx: DashboardContext }) {
  return (
    <div className="workspace-chip">
      <strong>{ctx.selectedTenant?.name ?? 'Đang tải workspace...'}</strong>
      <span>{ctx.selectedTenant?.slug ?? 'workspace'}</span>
    </div>
  )
}

export function WalletPage({ ctx }: { ctx: DashboardContext }) {
  const overview = ctx.walletOverview
  const wallet = overview?.wallet
  const subscription = overview?.subscription
  const currency = wallet?.currency ?? subscription?.currency ?? 'USD'
  const paymentSettings = overview?.paymentSettings
  const pendingTopUps = overview?.topUps.filter((topUp) => topUp.status === 'PENDING') ?? []
  const dueAmountCents = subscription?.monthlyPriceCents ?? 0
  const canCoverNextCharge = wallet ? wallet.balanceCents >= dueAmountCents : false

  async function handleTopUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!wallet || !ctx.selectedTenant) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const amount = Number(form.get('amount') ?? 0)
    const amountCents = Math.round(amount * 100)
    let topUpReference = ''

    await runEntityAction(ctx, async () => {
      const topUp = await ctx.fetchJson<WalletTopUp>('/wallet/top-ups', {
        method: 'POST',
        body: JSON.stringify({
          tenantId: ctx.selectedTenant?.id,
          amountCents,
          currency: wallet.currency,
          paymentMethod: 'bank_transfer',
          paymentReference: String(form.get('paymentReference') ?? ''),
          note: String(form.get('note') ?? '')
        })
      })
      topUpReference = topUp.reference
      formElement.reset()
      await ctx.refreshEntity('wallet')
    }, paymentSettings ? `Đã tạo yêu cầu ${topUpReference}. Chuyển đúng số tiền và dùng mã này làm nội dung để SePay tự động cộng ví.` : 'Đã gửi yêu cầu nạp tiền. Số dư được cộng sau khi được xác nhận.')
  }

  async function handleCancelTopUp(topUp: WalletTopUp) {
    await runEntityAction(ctx, async () => {
      await ctx.fetchJson<WalletTopUp>(`/wallet/top-ups/${topUp.id}`, { method: 'DELETE' })
      await ctx.refreshEntity('wallet')
    }, 'Đã huỷ yêu cầu nạp tiền')
  }

  const transactionLabel = (type: string) => {
    if (type === 'TOP_UP') return 'Nạp tiền'
    if (type === 'SUBSCRIPTION_CHARGE') return 'Thanh toán subscription'
    if (type === 'REFUND') return 'Hoàn tiền'
    return 'Điều chỉnh số dư'
  }

  return (
    <>
      <StatusBanner status={ctx.status} />
      <section className="single-page-grid wallet-page">
        <Card className="wallet-balance-card">
          <CardHeader className="section-heading">
            <div>
              <CardTitle><WalletCards size={18} /> Số dư khả dụng</CardTitle>
              <CardDescription>Credit trong ví được dùng tự động vào mỗi kỳ gia hạn subscription.</CardDescription>
            </div>
            <Badge variant={overview?.subscriptionStatus === 'PAST_DUE' ? 'warning' : 'active'}>{overview?.subscriptionStatus === 'PAST_DUE' ? 'Cần thanh toán' : 'Sẵn sàng thanh toán'}</Badge>
          </CardHeader>
          <CardContent>
            <div className="wallet-balance-value">
              <div className="wallet-balance-icon"><CircleDollarSign size={25} /></div>
              <strong>{wallet ? formatMoney(wallet.balanceCents, wallet.currency) : 'Đang tải...'}</strong>
              <span>{currency} · áp dụng cho workspace hiện tại</span>
            </div>
            <div className="wallet-balance-meta">
              <div><span>Gói hiện tại</span><strong>{subscription?.name ?? 'Chưa có subscription'}</strong></div>
              <div><span>Phí chu kỳ kế tiếp</span><strong>{subscription ? formatMoney(subscription.monthlyPriceCents, subscription.currency) : '—'}</strong></div>
              <div><span>Khả năng thanh toán</span><strong className={canCoverNextCharge ? 'wallet-positive' : 'wallet-negative'}>{subscription && dueAmountCents > 0 ? canCoverNextCharge ? 'Đủ số dư' : 'Cần nạp thêm' : 'Không có phí định kỳ'}</strong></div>
            </div>
          </CardContent>
        </Card>

        <div className="wallet-overview-grid">
          <Card className="wallet-cycle-card">
            <CardHeader>
              <CardTitle><Clock3 size={18} /> Chu kỳ thanh toán</CardTitle>
              <CardDescription>Mỗi lần tới hạn, hệ thống sẽ tự trừ từ Wallet trước khi tiếp tục gia hạn.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="wallet-cycle-list">
                <div><span>Kỳ đang áp dụng</span><strong>{overview?.subscriptionPeriodStartAt && overview?.subscriptionPeriodEndAt ? `${formatDate(overview.subscriptionPeriodStartAt)} - ${formatDate(overview.subscriptionPeriodEndAt)}` : subscription?.monthlyPriceCents ? 'Đang chờ thanh toán kỳ đầu' : 'Không áp dụng cho gói miễn phí'}</strong></div>
                <div><span>Ngày trừ tiền kế tiếp</span><strong>{overview?.subscriptionNextBillingAt ? formatDate(overview.subscriptionNextBillingAt) : subscription?.monthlyPriceCents ? 'Chưa xác định' : 'Không có'}</strong></div>
                <div><span>Số tiền sẽ trừ</span><strong>{subscription ? formatMoney(subscription.monthlyPriceCents, subscription.currency) : '—'}</strong></div>
              </div>
            </CardContent>
          </Card>

          <Card className="wallet-top-up-card">
            <CardHeader>
              <CardTitle><Landmark size={18} /> Yêu cầu nạp tiền</CardTitle>
              <CardDescription>{paymentSettings ? `Chuyển khoản đến ${paymentSettings.sepayAccountName} · ${paymentSettings.sepayAccountNumber}. SePay tự động đối soát theo mã ATP của workspace.` : 'Gửi yêu cầu kèm mã giao dịch ngân hàng. Credit sẽ được cộng sau khi đội ngũ xác nhận.'}</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="wallet-top-up-form" onSubmit={(event) => void handleTopUp(event)}>
                <label><FieldLabel>Số tiền ({currency})</FieldLabel><Input name="amount" type="number" min="0.01" step="0.01" placeholder="100.00" required disabled={!wallet} /></label>
                {paymentSettings ? <p className="form-hint">Sau khi gửi yêu cầu, dùng đúng mã <strong>ATP{ctx.selectedTenant?.publicKey}</strong> ở thông báo hoặc bảng bên dưới làm nội dung chuyển khoản.</p> : <label><FieldLabel>Mã giao dịch ngân hàng</FieldLabel><Input name="paymentReference" placeholder="VD: FT260716123456" disabled={!wallet} /></label>}
                <label><FieldLabel>Ghi chú</FieldLabel><Input name="note" placeholder="Nội dung chuyển khoản (không bắt buộc)" disabled={!wallet} /></label>
                <Button type="submit" disabled={!wallet || ctx.isLoading}><Landmark size={16} /> Gửi yêu cầu nạp tiền</Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {overview?.subscriptionStatus === 'PAST_DUE' && <Card className="wallet-overdue-card">
          <CardContent><div><RotateCcw size={20} /><span><strong>Subscription đang chờ thanh toán.</strong> Nạp ít nhất {formatMoney(dueAmountCents, currency)} để hệ thống tự gia hạn từ Wallet.</span></div></CardContent>
        </Card>}

        <Card className="table-card">
          <CardHeader className="section-heading">
            <div>
              <CardTitle><History size={18} /> Lịch sử giao dịch ví</CardTitle>
              <CardDescription>Ledger chỉ ghi thêm mới: mọi lượt nạp tiền, hoàn tiền và khoản trừ subscription đều được lưu vĩnh viễn.</CardDescription>
            </div>
            <Badge variant="outline">{overview?.transactions.length ?? 0} giao dịch</Badge>
          </CardHeader>
          <CardContent>
            {overview?.transactions.length ? <div className="table-wrap"><table className="wallet-table"><thead><tr><th>Thời gian</th><th>Loại</th><th>Mô tả</th><th>Số tiền</th><th>Số dư sau giao dịch</th></tr></thead><tbody>{overview.transactions.map((transaction) => <tr key={transaction.id}><td>{formatDate(transaction.createdAt)}</td><td><Badge variant={transaction.amountCents >= 0 ? 'success' : 'secondary'}>{transactionLabel(transaction.type)}</Badge></td><td>{transaction.description}</td><td className={transaction.amountCents >= 0 ? 'wallet-positive' : 'wallet-negative'}>{transaction.amountCents >= 0 ? '+' : ''}{formatMoney(transaction.amountCents, transaction.currency)}</td><td>{formatMoney(transaction.balanceAfterCents, transaction.currency)}</td></tr>)}</tbody></table></div> : <p className="empty-state">Chưa có giao dịch trong Wallet.</p>}
          </CardContent>
        </Card>

        <Card className="table-card">
          <CardHeader>
            <CardTitle><ReceiptText size={18} /> Yêu cầu nạp tiền gần đây</CardTitle>
            <CardDescription>{pendingTopUps.length ? `${pendingTopUps.length} yêu cầu đang chờ xác nhận.` : 'Không có yêu cầu nạp tiền đang chờ xác nhận.'}</CardDescription>
          </CardHeader>
          <CardContent>
            {overview?.topUps.length ? <div className="table-wrap"><table className="wallet-table"><thead><tr><th>Mã yêu cầu</th><th>Thời gian</th><th>Số tiền</th><th>Mã giao dịch</th><th>Trạng thái</th><th></th></tr></thead><tbody>{overview.topUps.map((topUp) => <tr key={topUp.id}><td><strong>{topUp.reference}</strong></td><td>{formatDate(topUp.createdAt)}</td><td>{formatMoney(topUp.amountCents, topUp.currency)}</td><td>{topUp.paymentReference || '—'}</td><td><Badge variant={topUp.status === 'APPROVED' ? 'success' : topUp.status === 'PENDING' ? 'pending' : topUp.status === 'REJECTED' ? 'error' : 'muted'}>{topUp.status === 'APPROVED' ? 'Đã duyệt' : topUp.status === 'PENDING' ? 'Đang chờ' : topUp.status === 'REJECTED' ? 'Từ chối' : 'Đã huỷ'}</Badge></td><td>{topUp.status === 'PENDING' && <Button variant="ghost" size="sm" type="button" onClick={() => void handleCancelTopUp(topUp)} disabled={ctx.isLoading}>Huỷ</Button>}</td></tr>)}</tbody></table></div> : <p className="empty-state">Bạn chưa gửi yêu cầu nạp tiền nào.</p>}
          </CardContent>
        </Card>
      </section>
    </>
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
