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
    const trackingScript = getTrackingScript(ctx.selectedTenant)

    return (
        <>
            <StatusBanner status={ctx.status} />
            <section className="resource-page settings-page">
                <Card className="page-card settings-card">
                    <CardHeader>
                        <CardTitle><KeyRound size={18} /> Tracking code</CardTitle>
                        <CardDescription>Dán mã này vào website hoặc landing để quét link tracking đã gắn trên trang.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="tracking-code-box">
                            <div className="tracking-code-heading">
                                <strong>Mã tracking</strong>
                                <Button type="button" variant="outline" size="sm" disabled={!trackingScript} onClick={() => void copyTrackingScript(ctx, trackingScript)}><Copy size={14} /> Copy</Button>
                            </div>
                            <pre className="webhook-code-sample"><code>{trackingScript || 'Không tìm thấy workspace để tạo mã tracking.'}</code></pre>
                            <p className="form-hint">Chức năng hiện tại: quét các Affiliate URL hoặc Shortlink thuộc Tracking Links trên website đã gắn mã và console.log khi phát hiện.</p>
                        </div>
                    </CardContent>
                </Card>
            </section>
        </>
    )
}
