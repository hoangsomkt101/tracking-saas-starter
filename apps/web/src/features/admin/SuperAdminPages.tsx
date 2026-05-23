import type { FormEvent } from 'react'
import { NavLink, useParams } from 'react-router'
import { Crown, Loader2, Plus, RefreshCw, Settings, WalletCards } from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Select } from '../../components/ui/select'
import { DetailGrid, DetailItem, EntityDetailCard, NotFoundEntity } from '../../components/common/EntityScaffold'
import { FieldLabel } from '../../components/common/FieldLabel'
import { StatusBanner } from '../../components/common/StatusBanner'
import { formatMoney } from '../../lib/format'
import { getFormString } from '../../lib/forms'
import { runEntityAction } from '../../lib/entity-actions'
import type { BillingPlan, DashboardContext, Tenant } from '../../types/domain'

export function SuperAdminPage({ ctx }: { ctx: DashboardContext }) {
  if (!ctx.isSuperAdmin) {
    return (
      <Card className="page-card placeholder-card">
        <CardHeader><div className="placeholder-icon"><Crown size={22} /></div><CardTitle>Super Admin</CardTitle><CardDescription>Bạn không có quyền truy cập khu vực quản trị hệ thống.</CardDescription></CardHeader>
        <CardContent><p className="empty-state">Tài khoản của bạn chưa được cấp quyền quản trị hệ thống.</p></CardContent>
      </Card>
    )
  }

  async function handleCreatePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    await runEntityAction(ctx, async () => {
      await ctx.fetchJson<BillingPlan>('/superadmin/billing-plans', { method: 'POST', body: JSON.stringify({ name: getFormString(form, 'name'), slug: getFormString(form, 'slug'), description: getFormString(form, 'description'), monthlyPriceCents: Number(form.get('monthlyPriceCents') ?? 0), currency: getFormString(form, 'currency') || 'USD', clickLimit: Number(form.get('clickLimit') ?? 0), capiEventLimit: Number(form.get('capiEventLimit') ?? 0), eapiEventLimit: Number(form.get('eapiEventLimit') ?? 0), isDefault: form.get('isDefault') === 'on', isActive: form.get('isActive') === 'on' }) })
      formElement.reset()
    }, 'Đã tạo gói thanh toán')
  }

  return (
    <>
      <StatusBanner status={ctx.status} />
      <section className="single-page-grid">
        <Card className="form-card"><CardHeader><CardTitle><WalletCards size={18} /> Create billing plan</CardTitle><CardDescription>Tạo level tài khoản với quota tháng cho click data, CAPI và EAPI/affiliate webhook.</CardDescription></CardHeader><CardContent><form onSubmit={handleCreatePlan}><label><FieldLabel>Name</FieldLabel><Input name="name" placeholder="Free / Pro / Agency" required /></label><label><FieldLabel>Slug</FieldLabel><Input name="slug" placeholder="free" /></label><label><FieldLabel>Description</FieldLabel><Input name="description" placeholder="Plan description" /></label><label><FieldLabel>Monthly price cents</FieldLabel><Input name="monthlyPriceCents" type="number" min="0" defaultValue="0" /></label><label><FieldLabel>Currency</FieldLabel><Input name="currency" defaultValue="USD" /></label><label><FieldLabel>Click data limit / month</FieldLabel><Input name="clickLimit" type="number" min="0" defaultValue="1000" /></label><label><FieldLabel>CAPI limit / month</FieldLabel><Input name="capiEventLimit" type="number" min="0" defaultValue="1000" /></label><label><FieldLabel>EAPI limit / month</FieldLabel><Input name="eapiEventLimit" type="number" min="0" defaultValue="1000" /></label><label className="checkbox"><input name="isDefault" type="checkbox" /> Default for new users</label><label className="checkbox"><input name="isActive" type="checkbox" defaultChecked /> Active</label><Button type="submit"><Plus size={16} /> Create plan</Button></form></CardContent></Card>
        <Card className="table-card"><CardHeader><CardTitle><WalletCards size={18} /> Billing plans</CardTitle><CardDescription>{ctx.billingPlans.length} account levels configured.</CardDescription></CardHeader><CardContent><div className="table-wrap"><table><thead><tr><th>Plan</th><th>Price</th><th>Limits/month</th><th>Status</th></tr></thead><tbody>{ctx.billingPlans.map((plan) => <tr key={plan.id}><td><strong>{plan.name}</strong><br /><small>{plan.slug}</small></td><td>{formatMoney(plan.monthlyPriceCents, plan.currency)}</td><td>{plan.clickLimit} clicks · {plan.capiEventLimit} CAPI · {plan.eapiEventLimit} EAPI</td><td><Badge variant={plan.isActive ? 'secondary' : 'outline'}>{plan.isDefault ? 'Default' : plan.isActive ? 'Active' : 'Inactive'}</Badge></td></tr>)}{!ctx.billingPlans.length && <tr><td colSpan={4}>Chưa có gói.</td></tr>}</tbody></table></div></CardContent></Card>
      </section>
      <Card className="table-card"><CardHeader className="section-heading"><div><CardTitle><Crown size={18} /> Registered accounts</CardTitle><CardDescription>{ctx.superAdminUsers.length} tài khoản đã đăng ký trong hệ thống.</CardDescription></div><Button variant="outline" size="sm" type="button" onClick={() => void ctx.loadData()} disabled={ctx.isLoading}>{ctx.isLoading ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}Refresh</Button></CardHeader><CardContent><div className="table-wrap"><table><thead><tr><th>User</th><th>Account ID</th><th>Workspace</th><th>Plan</th><th>Menus</th><th>Usage</th><th>Actions</th></tr></thead><tbody>{ctx.superAdminUsers.map((account) => { const fullName = [account.firstName, account.lastName].filter(Boolean).join(' ').trim(); const tenant = account.tenant; const enabledMenus = tenant?.menuGrants?.filter((grant) => grant.isEnabled).length ?? 0; return <tr key={account.id}><td><strong>{fullName || account.email || account.id}</strong><br /><small>{account.email ?? 'No email'}</small></td><td>{account.id}</td><td>{tenant ? <><strong>{tenant.name}</strong><br /><small>{tenant.slug} · {tenant.id}</small></> : '—'}</td><td>{tenant?.billingPlan?.name ?? '—'}</td><td>{tenant ? <Badge variant="outline">{enabledMenus} enabled</Badge> : '—'}</td><td>{tenant ? `${tenant._count.campaigns} campaigns · ${tenant._count.trackingLinks} links · ${tenant._count.clickEvents} clicks` : '—'}</td><td><Button asChild variant="outline" size="sm"><NavLink to={`/superadmin/users/${account.id}/manage`}><Settings size={14} /> Manage</NavLink></Button></td></tr> })}{!ctx.superAdminUsers.length && <tr><td colSpan={7}>Chưa có tài khoản hoặc bạn chưa có quyền quản trị.</td></tr>}</tbody></table></div></CardContent></Card>
    </>
  )
}

export function SuperAdminUserManagePage({ ctx }: { ctx: DashboardContext }) {
  const { id = '' } = useParams()
  const account = ctx.superAdminUsers.find((item) => item.id === id)
  if (!ctx.isSuperAdmin) return <NotFoundEntity name="Super Admin" backPath="/superadmin" />
  if (!account?.tenant) return <NotFoundEntity name="Registered account" backPath="/superadmin" />
  const tenant = account.tenant
  async function handleAssignPlan(billingPlanId: string) { await runEntityAction(ctx, async () => { await ctx.fetchJson<Tenant>(`/superadmin/tenants/${tenant.id}/billing-plan`, { method: 'PUT', body: JSON.stringify({ billingPlanId }) }) }, 'Đã cập nhật gói cho workspace') }
  async function handleToggleMenuFeature(menuFeatureId: string, isEnabled: boolean) { const currentFeatureIds = new Set(tenant.menuGrants?.filter((grant) => grant.isEnabled).map((grant) => grant.menuFeatureId) ?? []); if (isEnabled) currentFeatureIds.add(menuFeatureId); else currentFeatureIds.delete(menuFeatureId); await runEntityAction(ctx, async () => { await ctx.fetchJson<Tenant>(`/superadmin/tenants/${tenant.id}/menu-features`, { method: 'PUT', body: JSON.stringify({ menuFeatureIds: Array.from(currentFeatureIds) }) }) }, 'Đã cập nhật menu/chức năng cho workspace') }
  return <EntityDetailCard title={<><Crown size={18} /> Manage account</>} description="Quản lý plan và menu/chức năng ở trang riêng, không hiển thị list dọc trong bảng." backPath="/superadmin"><div className="manage-grid"><div className="workspace-chip"><strong>{tenant.name}</strong><span>{account.email ?? account.id}</span></div><label><FieldLabel>Billing plan</FieldLabel><Select value={tenant.billingPlanId ?? ''} onChange={(event) => void handleAssignPlan(event.currentTarget.value)}>{ctx.billingPlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</Select></label><div className="feature-card-grid">{ctx.menuFeatures.filter((feature) => feature.key !== 'superadmin').map((feature) => { const enabled = tenant.menuGrants?.some((grant) => grant.menuFeatureId === feature.id && grant.isEnabled) ?? false; return <label key={feature.id} className="feature-card-toggle"><input type="checkbox" checked={enabled} disabled={feature.isCore} onChange={(event) => void handleToggleMenuFeature(feature.id, event.currentTarget.checked)} /><span><strong>{feature.label}</strong><small>{feature.description ?? feature.path}</small></span><Badge variant={enabled ? 'secondary' : 'outline'}>{feature.isCore ? 'Core' : enabled ? 'Enabled' : 'Off'}</Badge></label> })}</div></div></EntityDetailCard>
}
