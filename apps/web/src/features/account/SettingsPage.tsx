import { Copy } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Card, CardContent } from '../../components/ui/card'
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
                    <CardContent>
                        <div className="tracking-code-box">
                            <div className="tracking-code-heading">
                                <strong>Mã tracking</strong>
                                <Button type="button" variant="outline" size="sm" disabled={!trackingScript} onClick={() => void copyTrackingScript(ctx, trackingScript)}><Copy size={14} /> Copy</Button>
                            </div>
                            <pre className="webhook-code-sample"><code>{trackingScript || 'Không tìm thấy workspace để tạo mã tracking.'}</code></pre>
                            <p className="form-hint">Dán mã này vào website hoặc landing để quét Affiliate URL hoặc Shortlink thuộc Tracking Links và console.log khi phát hiện.</p>
                        </div>
                    </CardContent>
                </Card>
            </section>
        </>
    )
}
