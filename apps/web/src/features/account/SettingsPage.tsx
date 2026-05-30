import { Copy, KeyRound } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { StatusBanner } from '../../components/common/StatusBanner'
import { apiBaseUrl } from '../../config/env'
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
    const tenant = ctx.selectedTenant
    const tenantKey = getTenantKey(tenant)
    const propertyId = tenantKey ? `${TRACKING_PROPERTY_PREFIX}${tenantKey}` : ''
    const trackingScript = getTrackingScript(tenant)

    return (
        <>
            <StatusBanner status={ctx.status} />
            <section className="resource-page settings-page">
                <Card className="page-card settings-card">
                    <CardHeader>
                        <CardTitle><KeyRound size={18} /> Tracking code</CardTitle>
                        <CardDescription>Dán mã này vào website cần test. Property ID có tiền tố cố định DBG- và tenantKey là publicKey workspace.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="detail-grid settings-detail-grid">
                            <div className="detail-item"><span>Workspace</span><strong>{tenant?.name ?? 'Chưa có workspace'}</strong></div>
                            <div className="detail-item"><span>tenantKey</span><strong>{tenantKey || 'Chưa có tenantKey'}</strong></div>
                            <div className="detail-item"><span>property_id</span><strong>{propertyId || 'Chưa có property_id'}</strong></div>
                        </div>

                        <div className="tracking-code-box">
                            <div className="tracking-code-heading">
                                <strong>Mã tracking</strong>
                                <Button type="button" variant="outline" size="sm" disabled={!trackingScript} onClick={() => void copyTrackingScript(ctx, trackingScript)}><Copy size={14} /> Copy</Button>
                            </div>
                            <pre className="webhook-code-sample"><code>{trackingScript || 'Không tìm thấy workspace để tạo mã tracking.'}</code></pre>
                            <p className="form-hint">Hiện tại script gọi API /atp.js và console.log ra tên người dùng sở hữu tenantKey.</p>
                        </div>
                    </CardContent>
                </Card>
            </section>
        </>
    )
}
