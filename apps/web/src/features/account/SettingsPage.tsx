import { type FormEvent } from 'react'
import { Copy, Globe2, Plus, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Badge } from '../../components/ui/badge'
import { FieldLabel } from '../../components/common/FieldLabel'
import { StatusBanner } from '../../components/common/StatusBanner'
import { apiBaseUrl } from '../../config/env'
import { runEntityAction } from '../../lib/entity-actions'
import { getFormString } from '../../lib/forms'
import type { DashboardContext, Tenant } from '../../types/domain'

const TRACKING_PROPERTY_PREFIX = 'DBG-'

function getTenantKey(tenant?: Tenant) {
    return tenant?.publicKey || tenant?.id || ''
}

function getTrackingScript(tenant?: Tenant) {
    const tenantKey = getTenantKey(tenant)
    return tenantKey ? `<script src="${apiBaseUrl}/atp.js?property_id=${TRACKING_PROPERTY_PREFIX}${tenantKey}" defer></script>` : ''
}

async function copyTrackingScript(ctx: DashboardContext, script: string) {
    if (!script) return

    try {
        await navigator.clipboard.writeText(script)
        ctx.setStatus({ type: 'success', message: 'Đã copy mã tracking' })
    } catch {
        ctx.setStatus({ type: 'error', message: 'Không copy được mã tracking' })
    }
}

export function SettingsPage({ ctx }: { ctx: DashboardContext }) {
    const trackingScript = getTrackingScript(ctx.selectedTenant)

    async function handleDomainSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (!ctx.selectedTenant) return
        const form = event.currentTarget
        const data = new FormData(form)
        await runEntityAction(ctx, async () => {
            await ctx.fetchJson('/website-domains', {
                method: 'POST',
                body: JSON.stringify({ tenantId: ctx.selectedTenant?.id, domain: getFormString(data, 'domain') })
            })
            form.reset()
        }, 'Đã thêm domain website')
    }

    async function handleDeleteDomain(id: string) {
        await runEntityAction(ctx, async () => {
            await ctx.fetchJson<{ ok: boolean }>(`/website-domains/${id}`, { method: 'DELETE' })
        }, 'Đã xóa domain website')
    }

    return (
        <>
            <StatusBanner status={ctx.status} />
            <section className="resource-page settings-page">
                <Card className="page-card settings-card">
                    <CardHeader className="websites-card-header">
                        <div>
                            <CardTitle><Copy size={18} /> Mã tracking</CardTitle>
                            <CardDescription>Dán mã này vào website hoặc landing đã khai báo domain.</CardDescription>
                        </div>
                        <Button type="button" variant="outline" size="sm" disabled={!trackingScript} onClick={() => void copyTrackingScript(ctx, trackingScript)}><Copy size={14} /> Copy</Button>
                    </CardHeader>
                    <CardContent>
                        <div className="tracking-code-box">
                            <pre className="webhook-code-sample"><code>{trackingScript || 'Không tìm thấy workspace để tạo mã tracking.'}</code></pre>
                            <p className="form-hint">Mã sẽ quét Affiliate URL/Shortlink thuộc Tracking Links và tự gắn click ID vào Affiliate URL; chỉ khi người dùng click thật mới gửi click và CAPI AddToCart.</p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="page-card settings-card">
                    <CardHeader className="websites-card-header">
                        <CardTitle><Globe2 size={18} /> Website domains</CardTitle>
                        <CardDescription>Chỉ các website được thêm ở đây mới sử dụng được mã tracking.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form className="route-form website-domain-form" onSubmit={(event) => void handleDomainSubmit(event)}>
                            <label>
                                <FieldLabel>Domain</FieldLabel>
                                <Input name="domain" placeholder="example.com" autoComplete="off" required />
                                <span className="form-hint">Có thể nhập domain hoặc URL đầy đủ, ví dụ: example.com, https://landing.example.com.</span>
                            </label>
                            <Button type="submit" disabled={!ctx.selectedTenant}><Plus size={16} /> Thêm domain</Button>
                        </form>

                        <div className="table-wrap website-domain-table-wrap">
                            <table>
                                <thead><tr><th>Domain</th><th>Status</th><th>Actions</th></tr></thead>
                                <tbody>
                                    {ctx.tenantWebsiteDomains.map((domain) => (
                                        <tr key={domain.id}>
                                            <td><strong>{domain.domain}</strong></td>
                                            <td><Badge variant="success">Allowed</Badge></td>
                                            <td><Button type="button" variant="outline" size="sm" onClick={() => void handleDeleteDomain(domain.id)}><Trash2 size={14} /> Xóa</Button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {!ctx.tenantWebsiteDomains.length && <p className="empty-state">Chưa có domain nào. Mã tracking sẽ bị chặn cho tới khi thêm website hợp lệ.</p>}
                    </CardContent>
                </Card>
            </section>
        </>
    )
}
