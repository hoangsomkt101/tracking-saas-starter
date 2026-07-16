import type { FormEvent } from 'react'
import { NavLink, useParams } from 'react-router'
import { CreditCard, Crown, Loader2, Plus, RefreshCw, Settings, Trash2, WalletCards } from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Select } from '../../components/ui/select'
import { EntityDetailCard, NotFoundEntity } from '../../components/common/EntityScaffold'
import { FieldLabel } from '../../components/common/FieldLabel'
import { StatusBanner } from '../../components/common/StatusBanner'
import { formatMoney } from '../../lib/format'
import { getFormString } from '../../lib/forms'
import { runEntityAction } from '../../lib/entity-actions'
import type { DashboardContext, Subscription, SuperAdminUser, Tenant } from '../../types/domain'

function getAccountLabel(account: SuperAdminUser) {
  return [account.firstName, account.lastName].filter(Boolean).join(' ').trim() || account.email || account.id
}

export function SuperAdminPage({ ctx }: { ctx: DashboardContext }) {
  if (!ctx.isSuperAdmin) {
    return (
      <Card className="page-card placeholder-card">
        <CardHeader><div className="placeholder-icon"><Crown size={22} /></div><CardTitle>Super Admin</CardTitle><CardDescription>Bạn không có quyền truy cập khu vực quản trị hệ thống.</CardDescription></CardHeader>
        <CardContent><p className="empty-state">Tài khoản của bạn chưa được cấp quyền quản trị hệ thống.</p></CardContent>
      </Card>
    )
  }

  async function handleCreateSubscription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    await runEntityAction(ctx, async () => {
      await ctx.fetchJson<Subscription>('/superadmin/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          name: getFormString(form, 'name'),
          slug: getFormString(form, 'slug'),
          description: getFormString(form, 'description'),
          monthlyPriceCents: Number(form.get('monthlyPriceCents') ?? 0),
          currency: getFormString(form, 'currency') || 'USD',
          clickLimit: Number(form.get('clickLimit') ?? 0),
          capiEventLimit: Number(form.get('capiEventLimit') ?? 0),
          eapiEventLimit: Number(form.get('eapiEventLimit') ?? 0),
          isDefault: form.get('isDefault') === 'on',
          isActive: form.get('isActive') === 'on'
        })
      })
      formElement.reset()
      await ctx.refreshEntity('subscriptions')
    }, 'Đã tạo gói subscription')
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

  return (
    <>
      <StatusBanner status={ctx.status} />
      <section className="single-page-grid">
        <Card className="form-card">
          <CardHeader>
            <CardTitle><WalletCards size={18} /> Create subscription</CardTitle>
            <CardDescription>Tạo gói subscription với quota tháng cho click data, CAPI và EAPI/affiliate webhook.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateSubscription}>
              <label><FieldLabel>Name</FieldLabel><Input name="name" placeholder="Free / Pro / Agency" required /></label>
              <label><FieldLabel>Slug</FieldLabel><Input name="slug" placeholder="free" /></label>
              <label><FieldLabel>Description</FieldLabel><Input name="description" placeholder="Plan description" /></label>
              <label><FieldLabel>Monthly price cents</FieldLabel><Input name="monthlyPriceCents" type="number" min="0" defaultValue="0" /></label>
              <label><FieldLabel>Currency</FieldLabel><Input name="currency" defaultValue="USD" /></label>
              <label><FieldLabel>Click data limit / month</FieldLabel><Input name="clickLimit" type="number" min="0" defaultValue="1000" /></label>
              <label><FieldLabel>CAPI limit / month</FieldLabel><Input name="capiEventLimit" type="number" min="0" defaultValue="1000" /></label>
              <label><FieldLabel>EAPI limit / month</FieldLabel><Input name="eapiEventLimit" type="number" min="0" defaultValue="1000" /></label>
              <label className="checkbox"><input name="isDefault" type="checkbox" /> Default for new users</label>
              <label className="checkbox"><input name="isActive" type="checkbox" defaultChecked /> Active</label>
              <Button type="submit"><Plus size={16} /> Create subscription</Button>
            </form>
          </CardContent>
        </Card>
        <Card className="table-card">
          <CardHeader>
            <CardTitle><CreditCard size={18} /> Subscriptions</CardTitle>
            <CardDescription>{ctx.subscriptions.length} subscriptions configured.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Plan</th><th>Price</th><th>Limits/month</th><th>Status</th></tr></thead>
                <tbody>
                  {ctx.subscriptions.map((subscription) => <tr key={subscription.id}><td><strong>{subscription.name}</strong><br /><small>{subscription.slug}</small></td><td>{formatMoney(subscription.monthlyPriceCents, subscription.currency)}</td><td>{subscription.clickLimit} clicks · {subscription.capiEventLimit} CAPI · {subscription.eapiEventLimit} EAPI</td><td><Badge variant={subscription.isActive ? 'active' : 'muted'}>{subscription.isDefault ? 'Default' : subscription.isActive ? 'Active' : 'Inactive'}</Badge></td></tr>)}
                  {!ctx.subscriptions.length && <tr><td colSpan={4}>Chưa có subscription.</td></tr>}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>
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
