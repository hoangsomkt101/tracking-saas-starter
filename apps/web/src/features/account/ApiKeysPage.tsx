import { useEffect, useMemo, useState } from 'react'
import { Copy, Eye, EyeOff, KeyRound, RefreshCw } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { StatusBanner } from '../../components/common/StatusBanner'
import { FieldLabel } from '../../components/common/FieldLabel'
import { apiBaseUrl } from '../../config/env'
import type { DashboardContext } from '../../types/domain'

type ClickWebhookTokenResponse = {
    clickWebhookToken: string
}

function maskToken(value?: string | null) {
    if (!value) return '—'
    if (value.includes('•')) return value
    if (value.length <= 12) return '••••'
    return `${value.slice(0, 8)}••••${value.slice(-4)}`
}

export function ApiKeysPage({ ctx }: { ctx: DashboardContext }) {
    const [fullToken, setFullToken] = useState('')
    const [isRevealed, setIsRevealed] = useState(false)
    const [isLoadingToken, setIsLoadingToken] = useState(false)
    const tenant = ctx.selectedTenant

    useEffect(() => {
        setFullToken('')
        setIsRevealed(false)
    }, [tenant?.id])

    const displayToken = useMemo(() => {
        if (!tenant) return '—'
        if (isRevealed && fullToken) return fullToken
        return maskToken(tenant.clickWebhookToken)
    }, [fullToken, isRevealed, tenant])

    async function revealToken() {
        if (!tenant) return
        setIsLoadingToken(true)
        try {
            const response = await ctx.fetchJson<ClickWebhookTokenResponse>(`/tenants/${tenant.id}/click-webhook-token`)
            setFullToken(response.clickWebhookToken)
            setIsRevealed(true)
        } catch (error) {
            ctx.setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Không lấy được API key' })
        } finally {
            setIsLoadingToken(false)
        }
    }

    async function copyToken() {
        const token = fullToken || (isRevealed ? displayToken : '')
        if (!token || token === '—' || token.includes('•')) {
            await revealToken()
            return
        }
        await navigator.clipboard.writeText(token)
        ctx.setStatus({ type: 'success', message: 'Đã copy API key' })
    }

    async function rotateToken() {
        if (!tenant) return
        const confirmed = window.confirm('Rotate API key sẽ làm token cũ không dùng được nữa. Tiếp tục?')
        if (!confirmed) return
        setIsLoadingToken(true)
        try {
            await ctx.fetchJson(`/tenants/${tenant.id}/click-webhook-token/rotate`, { method: 'POST' })
            const response = await ctx.fetchJson<ClickWebhookTokenResponse>(`/tenants/${tenant.id}/click-webhook-token`)
            setFullToken(response.clickWebhookToken)
            setIsRevealed(true)
            await ctx.loadData()
            ctx.setStatus({ type: 'success', message: 'Đã rotate API key' })
        } catch (error) {
            ctx.setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Không rotate được API key' })
        } finally {
            setIsLoadingToken(false)
        }
    }

    return (
        <>
            <StatusBanner status={ctx.status} />
            <section className="resource-page">
                <Card className="form-card api-key-card">
                    <CardHeader>
                        <CardTitle><KeyRound size={18} /> API keys</CardTitle>
                        <CardDescription>API key/token dùng để gọi Click webhook của workspace hiện tại. Token này xác thực các endpoint dạng <code>/click-webhooks/:tenantKey/:slug</code>.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {!tenant ? (
                            <p className="empty-state">Chưa chọn workspace.</p>
                        ) : (
                            <div className="api-key-panel">
                                <div className="workspace-chip api-key-workspace">
                                    <strong>{tenant.name}</strong>
                                    <span>Public key: {tenant.publicKey}</span>
                                </div>

                                <label>
                                    <FieldLabel>Click webhook API key</FieldLabel>
                                    <div className="api-key-input-row">
                                        <Input value={displayToken} readOnly type={isRevealed ? 'text' : 'password'} />
                                        <Button type="button" variant="outline" onClick={() => isRevealed ? setIsRevealed(false) : void revealToken()} disabled={isLoadingToken}>
                                            {isRevealed ? <EyeOff size={16} /> : <Eye size={16} />}
                                            {isRevealed ? 'Ẩn' : 'Hiện'}
                                        </Button>
                                        <Button type="button" variant="outline" onClick={() => void copyToken()} disabled={isLoadingToken}>
                                            <Copy size={16} /> Copy
                                        </Button>
                                    </div>
                                </label>

                                <div className="api-key-actions">
                                    <Button type="button" variant="outline" onClick={() => void rotateToken()} disabled={isLoadingToken}>
                                        <RefreshCw className={isLoadingToken ? 'spin' : undefined} size={16} /> Rotate API key
                                    </Button>
                                </div>

                                <div className="api-key-usage">
                                    <strong>Usage</strong>
                                    <pre className="webhook-code-sample">{`fetch('${apiBaseUrl}/click-webhooks/${tenant.publicKey}/your-tracking-link-slug', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-webhook-token': '${isRevealed && fullToken ? fullToken : 'YOUR_WORKSPACE_CLICK_WEBHOOK_TOKEN'}'
  },
  body: JSON.stringify({
    clickUuid: crypto.randomUUID(), // optional
    metadata: { source: 'custom-api' }
  })
})`}</pre>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </section>
        </>
    )
}
