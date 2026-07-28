import { useEffect, useState, type FormEvent } from 'react'
import { NavLink, useParams, useSearchParams } from 'react-router'
import { Check, Copy, CreditCard, Crown, Landmark, Loader2, Pencil, Plus, RefreshCw, Save, Settings, Trash2, Users, WalletCards, X } from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Select } from '../../components/ui/select'
import { EntityDetailCard, NotFoundEntity } from '../../components/common/EntityScaffold'
import { FieldLabel } from '../../components/common/FieldLabel'
import { StatusBanner } from '../../components/common/StatusBanner'
import { formatDate, formatMoney } from '../../lib/format'
import { getFormString } from '../../lib/forms'
import { runEntityAction } from '../../lib/entity-actions'
import type { DashboardContext, Subscription, SuperAdminUser, SuperAdminWalletTopUp, Tenant } from '../../types/domain'

function getAccountLabel(account: SuperAdminUser) {
  return [account.firstName, account.lastName].filter(Boolean).join(' ').trim() || account.email || account.id
}

export function SuperAdminPage({ ctx }: { ctx: DashboardContext }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [editingSubscription, setEditingSubscription] = useState<Subscription | null>(null)
  const [isSubscriptionModalOpen, setIsSubscriptionModalOpen] = useState(false)
  const requestedTab = searchParams.get('tab')
  const activeTab = requestedTab === 'users' || requestedTab === 'payment' ? requestedTab : 'subscriptions'

  useEffect(() => {
    if (!isSubscriptionModalOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !ctx.isLoading) setIsSubscriptionModalOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [ctx.isLoading, isSubscriptionModalOpen])

  if (!ctx.isSuperAdmin) {
    return (
      <Card className="page-card placeholder-card">
        <CardHeader><div className="placeholder-icon"><Crown size={22} /></div><CardTitle>Super Admin</CardTitle><CardDescription>Bạn không có quyền truy cập khu vực quản trị hệ thống.</CardDescription></CardHeader>
        <CardContent><p className="empty-state">Tài khoản của bạn chưa được cấp quyền quản trị hệ thống.</p></CardContent>
      </Card>
    )
  }

  async function handleSubscriptionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const subscription = editingSubscription
    await runEntityAction(ctx, async () => {
      await ctx.fetchJson<Subscription>(subscription ? `/superadmin/subscriptions/${subscription.id}` : '/superadmin/subscriptions', {
        method: subscription ? 'PUT' : 'POST',
        body: JSON.stringify({
          name: getFormString(form, 'name'),
          slug: getFormString(form, 'slug'),
          description: getFormString(form, 'description'),
          monthlyPriceCents: Number(form.get('monthlyPriceCents') ?? 0),
          currency: getFormString(form, 'currency') || 'USD',
          clickLimit: Number(form.get('clickLimit') ?? 0),
          capiEventLimit: Number(form.get('capiEventLimit') ?? 0),
          eapiEventLimit: Number(form.get('eapiEventLimit') ?? 0),
          campaignDatasetLimit: Number(form.get('campaignDatasetLimit') ?? 0),
          isDefault: form.get('isDefault') === 'on',
          isActive: form.get('isActive') === 'on'
        })
      })
      formElement.reset()
      setEditingSubscription(null)
      setIsSubscriptionModalOpen(false)
      await ctx.refreshEntity('subscriptions')
    }, subscription ? 'Đã cập nhật gói subscription' : 'Đã tạo gói subscription')
  }

  async function handleDeleteSubscription(subscription: Subscription) {
    if (!window.confirm(`Xoá gói subscription "${subscription.name}"? Chỉ có thể xoá gói không phải default và chưa được gán cho workspace.`)) return
    await runEntityAction(ctx, async () => {
      await ctx.fetchJson<{ ok: boolean }>(`/superadmin/subscriptions/${subscription.id}`, { method: 'DELETE' })
      if (editingSubscription?.id === subscription.id) {
        setEditingSubscription(null)
        setIsSubscriptionModalOpen(false)
      }
      await ctx.refreshEntity('subscriptions')
    }, `Đã xoá gói subscription ${subscription.name}`)
  }

  async function handleDeleteUser(account: SuperAdminUser) {
    const label = getAccountLabel(account)
    if (!window.confirm(`Xoá vĩnh viễn tài khoản "${label}" và toàn bộ workspace/data liên quan? Không thể hoàn tác.`)) return
    await runEntityAction(ctx, async () => {
      await ctx.fetchJson<{ ok: boolean }>(`/superadmin/users/${account.id}`, { method: 'DELETE' })
      await ctx.refreshEntity('superadmin-users')
    }, `Đã xoá tài khoản ${label}`)
  }

  async function handleDeleteAllUsers() {
    if (!window.confirm(`Xoá hết Registered accounts (${ctx.superAdminUsers.length} tài khoản)? Super Admin sẽ được giữ lại. Không thể hoàn tác.`)) return
    if (window.prompt('Nhập DELETE để xác nhận xoá hết Registered accounts.') !== 'DELETE') {
      ctx.setStatus({ type: 'error', message: 'Đã huỷ xoá hàng loạt' })
      return
    }
    await runEntityAction(ctx, async () => {
      await ctx.fetchJson<{ ok: boolean; deletedCount: number; skippedCount: number; clerkDeletedCount: number }>('/superadmin/users', { method: 'DELETE' })
      await ctx.refreshEntity('superadmin-users')
    }, 'Đã xoá hết Registered accounts không phải Super Admin')
  }

  async function handleApproveTopUp(topUp: SuperAdminWalletTopUp) {
    await runEntityAction(ctx, async () => {
      await ctx.fetchJson(`/superadmin/wallet-top-ups/${topUp.id}/approve`, { method: 'POST' })
      await ctx.refreshEntity('wallet-top-ups')
    }, `Đã duyệt nạp ${formatMoney(topUp.amountCents, topUp.currency)} cho ${topUp.tenant.name}`)
  }

  async function handleRejectTopUp(topUp: SuperAdminWalletTopUp) {
    const rejectionReason = window.prompt('Lý do từ chối (không bắt buộc):')
    if (rejectionReason === null) return
    await runEntityAction(ctx, async () => {
      await ctx.fetchJson(`/superadmin/wallet-top-ups/${topUp.id}/reject`, { method: 'POST', body: JSON.stringify({ rejectionReason }) })
      await ctx.refreshEntity('wallet-top-ups')
    }, `Đã từ chối yêu cầu nạp tiền ${topUp.reference}`)
  }

  async function handleSavePaymentSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await runEntityAction(ctx, async () => {
      await ctx.fetchJson('/superadmin/payment-settings', {
          method: 'PUT',
          body: JSON.stringify({
            sepayAccountNumber: getFormString(form, 'sepayAccountNumber'),
            sepayAccountName: getFormString(form, 'sepayAccountName'),
            sepayBankCode: getFormString(form, 'sepayBankCode'),
            sepayWebhookApiKey: getFormString(form, 'sepayWebhookApiKey')
        })
      })
      await ctx.refreshEntity('payment-settings')
    }, 'Đã lưu cấu hình thanh toán SePay')
  }

  async function handleCopyWebhookUrl() {
    const webhookUrl = ctx.paymentSettings?.webhookUrl
    if (!webhookUrl) return
    try {
      await navigator.clipboard.writeText(webhookUrl)
      ctx.setStatus({ type: 'success', message: 'Đã sao chép webhook URL' })
    } catch {
      ctx.setStatus({ type: 'error', message: 'Không thể sao chép webhook URL' })
    }
  }

  function handleTabChange(tab: 'subscriptions' | 'users' | 'payment') {
    setIsSubscriptionModalOpen(false)
    if (tab === 'subscriptions') setSearchParams({})
    else setSearchParams({ tab })
  }

  function openCreateSubscription() {
    setEditingSubscription(null)
    setIsSubscriptionModalOpen(true)
  }

  function openEditSubscription(subscription: Subscription) {
    setEditingSubscription(subscription)
    setIsSubscriptionModalOpen(true)
  }

  return (
    <>
      <StatusBanner status={ctx.status} />
      <div className="superadmin-tabs" role="tablist" aria-label="Super Admin management">
        <button className="superadmin-tab" type="button" role="tab" id="superadmin-subscriptions-tab" aria-selected={activeTab === 'subscriptions'} aria-controls="superadmin-subscriptions-panel" onClick={() => handleTabChange('subscriptions')}><CreditCard size={16} /> Subscription <span>{ctx.subscriptions.length}</span></button>
        <button className="superadmin-tab" type="button" role="tab" id="superadmin-users-tab" aria-selected={activeTab === 'users'} aria-controls="superadmin-users-panel" onClick={() => handleTabChange('users')}><Users size={16} /> User <span>{ctx.superAdminUsers.length}</span></button>
        <button className="superadmin-tab" type="button" role="tab" id="superadmin-payment-tab" aria-selected={activeTab === 'payment'} aria-controls="superadmin-payment-panel" onClick={() => handleTabChange('payment')}><Landmark size={16} /> Payment</button>
      </div>
      {activeTab === 'subscriptions' && <section id="superadmin-subscriptions-panel" role="tabpanel" aria-labelledby="superadmin-subscriptions-tab" className="superadmin-tab-panel">
        <Card className="table-card">
          <CardHeader className="section-heading">
            <div><CardTitle><CreditCard size={18} /> Subscriptions</CardTitle><CardDescription>{ctx.subscriptions.length} subscriptions configured.</CardDescription></div>
            <Button type="button" size="sm" onClick={openCreateSubscription} disabled={ctx.isLoading}><Plus size={16} /> Create subscription</Button>
          </CardHeader>
          <CardContent>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Plan</th><th>Price</th><th>Limits/month</th><th>Datasets/campaign</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {ctx.subscriptions.map((subscription) => <tr key={subscription.id}><td><strong>{subscription.name}</strong><br /><small>{subscription.slug}</small></td><td>{formatMoney(subscription.monthlyPriceCents, subscription.currency)}</td><td>{subscription.clickLimit} clicks · {subscription.capiEventLimit} CAPI · {subscription.eapiEventLimit} EAPI</td><td>{subscription.campaignDatasetLimit}</td><td><Badge variant={subscription.isActive ? 'active' : 'muted'}>{subscription.isDefault ? 'Default' : subscription.isActive ? 'Active' : 'Inactive'}</Badge></td><td><div className="button-row"><Button variant="outline" size="sm" type="button" onClick={() => openEditSubscription(subscription)} disabled={ctx.isLoading}><Pencil size={14} /> Edit</Button><Button variant="destructive" size="sm" type="button" onClick={() => void handleDeleteSubscription(subscription)} disabled={ctx.isLoading || subscription.isDefault}><Trash2 size={14} /> Delete</Button></div></td></tr>)}
                  {!ctx.subscriptions.length && <tr><td colSpan={6}>Chưa có subscription.</td></tr>}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <Card className="table-card">
          <CardHeader className="section-heading">
            <div><CardTitle><WalletCards size={18} /> Wallet top-up requests</CardTitle><CardDescription>{ctx.superAdminWalletTopUps.filter((topUp) => topUp.status === 'PENDING').length} yêu cầu đang chờ xác nhận chuyển khoản.</CardDescription></div>
            <Button variant="outline" size="sm" type="button" onClick={() => void ctx.refreshEntity('wallet-top-ups')} disabled={ctx.isLoading}><RefreshCw size={16} /> Refresh</Button>
          </CardHeader>
          <CardContent>
            <div className="table-wrap"><table><thead><tr><th>Workspace</th><th>Mã yêu cầu</th><th>Số tiền</th><th>Mã chuyển khoản</th><th>Thời gian</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
              {ctx.superAdminWalletTopUps.map((topUp) => <tr key={topUp.id}><td><strong>{topUp.tenant.name}</strong><br /><small>{topUp.tenant.ownerUser.email ?? topUp.tenant.slug}</small></td><td>{topUp.reference}</td><td>{formatMoney(topUp.amountCents, topUp.currency)}</td><td>{topUp.paymentReference || '—'}</td><td>{formatDate(topUp.createdAt)}</td><td><Badge variant={topUp.status === 'APPROVED' ? 'success' : topUp.status === 'PENDING' ? 'pending' : topUp.status === 'REJECTED' ? 'error' : 'muted'}>{topUp.status}</Badge></td><td>{topUp.status === 'PENDING' && <div className="button-row"><Button type="button" size="sm" onClick={() => void handleApproveTopUp(topUp)} disabled={ctx.isLoading}><Check size={14} /> Duyệt</Button><Button variant="outline" type="button" size="sm" onClick={() => void handleRejectTopUp(topUp)} disabled={ctx.isLoading}><X size={14} /> Từ chối</Button></div>}</td></tr>)}
              {!ctx.superAdminWalletTopUps.length && <tr><td colSpan={7}>Chưa có yêu cầu nạp tiền.</td></tr>}
            </tbody></table></div>
          </CardContent>
        </Card>
      </section>}
      {isSubscriptionModalOpen && <div className="subscription-modal-backdrop" role="presentation" onMouseDown={() => !ctx.isLoading && setIsSubscriptionModalOpen(false)}>
        <section className="subscription-modal" role="dialog" aria-modal="true" aria-labelledby="subscription-modal-title" onMouseDown={(event) => event.stopPropagation()}>
          <button className="subscription-modal-close" type="button" onClick={() => setIsSubscriptionModalOpen(false)} disabled={ctx.isLoading} aria-label="Close subscription form"><X size={18} /></button>
          <div className="subscription-modal-heading">
            <span className="subscription-modal-icon">{editingSubscription ? <Pencil size={19} /> : <Plus size={19} />}</span>
            <div><h2 id="subscription-modal-title">{editingSubscription ? 'Edit subscription' : 'Create subscription'}</h2><p>{editingSubscription ? `Cập nhật cấu hình cho gói ${editingSubscription.name}. Thay đổi có hiệu lực ngay với workspace đang dùng gói này.` : 'Tạo gói subscription với quota tháng cho click data, CAPI và EAPI/affiliate webhook.'}</p></div>
          </div>
          <form key={editingSubscription?.id ?? 'new'} className="subscription-modal-form" onSubmit={handleSubscriptionSubmit}>
            <label><FieldLabel>Name</FieldLabel><Input name="name" placeholder="Free / Pro / Agency" defaultValue={editingSubscription?.name ?? ''} autoFocus required /></label>
            <label><FieldLabel>Slug</FieldLabel><Input name="slug" placeholder="free" defaultValue={editingSubscription?.slug ?? ''} /></label>
            <label className="subscription-modal-wide"><FieldLabel>Description</FieldLabel><Input name="description" placeholder="Plan description" defaultValue={editingSubscription?.description ?? ''} /></label>
            <label><FieldLabel>Monthly price cents</FieldLabel><Input name="monthlyPriceCents" type="number" min="0" defaultValue={editingSubscription?.monthlyPriceCents ?? 0} required /></label>
            <label><FieldLabel>Currency</FieldLabel><Input name="currency" defaultValue={editingSubscription?.currency ?? 'VND'} required /></label>
            <label><FieldLabel>Click data limit / month</FieldLabel><Input name="clickLimit" type="number" min="0" defaultValue={editingSubscription?.clickLimit ?? 1000} required /></label>
            <label><FieldLabel>CAPI limit / month</FieldLabel><Input name="capiEventLimit" type="number" min="0" defaultValue={editingSubscription?.capiEventLimit ?? 1000} required /></label>
            <label><FieldLabel>EAPI limit / month</FieldLabel><Input name="eapiEventLimit" type="number" min="0" defaultValue={editingSubscription?.eapiEventLimit ?? 1000} required /></label>
            <label><FieldLabel>Datasets / campaign</FieldLabel><Input name="campaignDatasetLimit" type="number" min="0" defaultValue={editingSubscription?.campaignDatasetLimit ?? 2} required /></label>
            <div className="subscription-modal-options"><label className="checkbox"><input name="isDefault" type="checkbox" defaultChecked={editingSubscription?.isDefault ?? false} /> Default for new users</label><label className="checkbox"><input name="isActive" type="checkbox" defaultChecked={editingSubscription?.isActive ?? true} /> Active</label></div>
            <div className="subscription-modal-actions"><Button variant="outline" type="button" onClick={() => setIsSubscriptionModalOpen(false)} disabled={ctx.isLoading}>Cancel</Button><Button type="submit" disabled={ctx.isLoading}>{editingSubscription ? <><Save size={16} /> Save changes</> : <><Plus size={16} /> Create subscription</>}</Button></div>
          </form>
        </section>
      </div>}
      {activeTab === 'users' && <section id="superadmin-users-panel" role="tabpanel" aria-labelledby="superadmin-users-tab" className="superadmin-tab-panel">
        <Card className="table-card">
          <CardHeader className="section-heading">
            <div><CardTitle><Crown size={18} /> Registered accounts</CardTitle><CardDescription>{ctx.superAdminUsers.length} tài khoản đã đăng ký trong hệ thống.</CardDescription></div>
            <div className="button-row">
              <Button variant="destructive" size="sm" type="button" onClick={() => void handleDeleteAllUsers()} disabled={ctx.isLoading || ctx.superAdminUsers.length === 0}><Trash2 size={16} /> Delete all</Button>
              <Button variant="outline" size="sm" type="button" onClick={() => void ctx.refreshEntity('superadmin-users')} disabled={ctx.isLoading}>{ctx.isLoading ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}Refresh</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="table-wrap">
              <table>
                <thead><tr><th>User</th><th>Account ID</th><th>Workspace</th><th>Subscription</th><th>Menus</th><th>Usage</th><th>Actions</th></tr></thead>
                <tbody>
                  {ctx.superAdminUsers.map((account) => {
                    const fullName = getAccountLabel(account)
                    const tenant = account.tenant
                    const enabledMenus = tenant?.menuGrants?.filter((grant) => grant.isEnabled).length ?? 0
                    const isCurrentUser = account.id === ctx.data.currentUser?.id
                    return <tr key={account.id}><td><strong>{fullName}</strong><br /><small>{account.email ?? 'No email'}</small></td><td>{account.id}</td><td>{tenant ? <><strong>{tenant.name}</strong><br /><small>{tenant.slug} · {tenant.id}</small></> : '—'}</td><td>{tenant?.subscription?.name ?? '—'}</td><td>{tenant ? <Badge variant="outline">{enabledMenus} enabled</Badge> : '—'}</td><td>{tenant ? `${tenant._count.campaigns} campaigns · ${tenant._count.trackingLinks} links · ${tenant._count.clickEvents} clicks` : '—'}</td><td><div className="button-row"><Button asChild variant="outline" size="sm"><NavLink to={`/superadmin/users/${account.id}/manage`}><Settings size={14} /> Manage</NavLink></Button><Button variant="destructive" size="sm" type="button" onClick={() => void handleDeleteUser(account)} disabled={ctx.isLoading || isCurrentUser}><Trash2 size={14} /> Delete</Button></div></td></tr>
                  })}
                  {!ctx.superAdminUsers.length && <tr><td colSpan={7}>Chưa có tài khoản đăng ký.</td></tr>}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>}
      {activeTab === 'payment' && <section id="superadmin-payment-panel" role="tabpanel" aria-labelledby="superadmin-payment-tab" className="superadmin-tab-panel">
        <Card className="form-card">
          <CardHeader>
            <CardTitle><Landmark size={18} /> SePay payment settings</CardTitle>
            <CardDescription>Cấu hình tài khoản nhận tiền, mã ngân hàng và webhook để SePay tự động đối soát yêu cầu nạp wallet VND bằng mã ATP + public key của workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <form key={ctx.paymentSettings?.updatedAt ?? 'new'} className="payment-settings-form" onSubmit={(event) => void handleSavePaymentSettings(event)}>
              <label><FieldLabel>Số tài khoản SePay</FieldLabel><Input name="sepayAccountNumber" defaultValue={ctx.paymentSettings?.sepayAccountNumber ?? ''} placeholder="VD: 0123456789" required /></label>
              <label><FieldLabel>Tên tài khoản</FieldLabel><Input name="sepayAccountName" defaultValue={ctx.paymentSettings?.sepayAccountName ?? ''} placeholder="VD: NGUYEN VAN A" required /></label>
              <label><FieldLabel>Mã ngân hàng VietQR</FieldLabel><Input name="sepayBankCode" defaultValue={ctx.paymentSettings?.sepayBankCode ?? ''} placeholder="VD: MB, VCB, ACB" required /></label>
              <label><FieldLabel>SePay webhook API key</FieldLabel><Input name="sepayWebhookApiKey" type="password" placeholder={ctx.paymentSettings?.hasSepayWebhookApiKey ? 'Đã cấu hình, để trống để giữ nguyên' : 'API key dùng để xác thực webhook'} required={!ctx.paymentSettings?.hasSepayWebhookApiKey} /></label>
              <p className="form-hint">Tại SePay, chọn xác thực API Key và dùng đúng giá trị ở trên. API key được lưu riêng và không hiển thị lại sau khi lưu.</p>
              <Button type="submit" disabled={ctx.isLoading}>Lưu cấu hình SePay</Button>
            </form>
          </CardContent>
        </Card>
        <Card className="table-card payment-webhook-card">
          <CardHeader>
            <CardTitle>Webhook URL</CardTitle>
            <CardDescription>Dán URL này vào webhook SePay, chọn sự kiện <strong>Có tiền vào</strong>, và chọn đúng tài khoản ngân hàng đã cấu hình.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="payment-webhook-url">
              <code>{ctx.paymentSettings?.webhookUrl ?? 'Không thể xác định URL. Hãy cấu hình API_PUBLIC_ORIGIN trên server.'}</code>
              <Button variant="outline" size="sm" type="button" onClick={() => void handleCopyWebhookUrl()} disabled={!ctx.paymentSettings?.webhookUrl}><Copy size={15} /> Copy</Button>
            </div>
            <div className="detail-grid payment-settings-summary">
              <span>Tài khoản nhận</span><strong>{ctx.paymentSettings?.sepayAccountNumber ?? 'Chưa cấu hình'}</strong>
              <span>Chủ tài khoản</span><strong>{ctx.paymentSettings?.sepayAccountName ?? 'Chưa cấu hình'}</strong>
              <span>Mã ngân hàng VietQR</span><strong>{ctx.paymentSettings?.sepayBankCode ?? 'Chưa cấu hình'}</strong>
              <span>Xác thực webhook</span><strong>{ctx.paymentSettings?.hasSepayWebhookApiKey ? 'API key đã cấu hình' : 'Chưa cấu hình API key'}</strong>
            </div>
          </CardContent>
        </Card>
      </section>}
    </>
  )
}

export function SuperAdminUserManagePage({ ctx }: { ctx: DashboardContext }) {
  const { id = '' } = useParams()
  const account = ctx.superAdminUsers.find((item) => item.id === id)
  if (!ctx.isSuperAdmin) return <NotFoundEntity name="Super Admin" backPath="/superadmin" />
  if (!account?.tenant) return <NotFoundEntity name="Registered account" backPath="/superadmin" />
  const tenant = account.tenant

  async function handleAssignSubscription(subscriptionId: string) {
    await runEntityAction(ctx, async () => {
      await ctx.fetchJson<Tenant>(`/superadmin/tenants/${tenant.id}/subscription`, { method: 'PUT', body: JSON.stringify({ subscriptionId }) })
      await ctx.refreshEntity('superadmin-users')
    }, 'Đã cập nhật subscription cho workspace')
  }

  async function handleToggleMenuFeature(menuFeatureId: string, isEnabled: boolean) {
    const currentFeatureIds = new Set(tenant.menuGrants?.filter((grant) => grant.isEnabled).map((grant) => grant.menuFeatureId) ?? [])
    if (isEnabled) currentFeatureIds.add(menuFeatureId)
    else currentFeatureIds.delete(menuFeatureId)
    await runEntityAction(ctx, async () => {
      await ctx.fetchJson<Tenant>(`/superadmin/tenants/${tenant.id}/menu-features`, { method: 'PUT', body: JSON.stringify({ menuFeatureIds: Array.from(currentFeatureIds) }) })
      await ctx.refreshEntity('superadmin-users')
    }, 'Đã cập nhật menu/chức năng cho workspace')
  }

  return <EntityDetailCard title={<><Crown size={18} /> Manage account</>} description="Quản lý subscription và menu/chức năng ở trang riêng, không hiển thị list dọc trong bảng." backPath="/superadmin"><div className="manage-grid"><div className="workspace-chip"><strong>{tenant.name}</strong><span>{account.email ?? account.id}</span></div><label><FieldLabel>Subscription</FieldLabel><Select value={tenant.subscriptionId ?? ''} onChange={(event) => void handleAssignSubscription(event.currentTarget.value)}>{ctx.subscriptions.map((subscription) => <option key={subscription.id} value={subscription.id}>{subscription.name}</option>)}</Select></label><div className="feature-card-grid">{ctx.menuFeatures.filter((feature) => feature.key !== 'superadmin').map((feature) => { const enabled = tenant.menuGrants?.some((grant) => grant.menuFeatureId === feature.id && grant.isEnabled) ?? false; return <label key={feature.id} className="feature-card-toggle"><input type="checkbox" checked={enabled} disabled={feature.isCore} onChange={(event) => void handleToggleMenuFeature(feature.id, event.currentTarget.checked)} /><span><strong>{feature.label}</strong><small>{feature.description ?? feature.path}</small></span><Badge variant={enabled ? 'active' : 'muted'}>{feature.isCore ? 'Core' : enabled ? 'Enabled' : 'Off'}</Badge></label> })}</div></div></EntityDetailCard>
}
