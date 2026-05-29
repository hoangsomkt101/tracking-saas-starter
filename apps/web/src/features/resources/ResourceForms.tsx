import type { FormEvent } from 'react'
import { Building2, Globe2, Layers3, Link2, Megaphone, Plus, ShieldCheck } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Select } from '../../components/ui/select'
import { FieldLabel } from '../../components/common/FieldLabel'
import { getFormString } from '../../lib/forms'
import type { AffiliatePlatform, Brand, Campaign, DashboardContext, Dataset, Prelander, TrackingLink } from '../../types/domain'

type CreateResourceCardProps = {
  ctx: DashboardContext
  onCreated?: () => void | Promise<void>
}

const affiliatePlatformOptions = [
  { value: 'impact', label: 'Impact' },
  { value: 'partnerstack', label: 'PartnerStack' },
  { value: 'first_promo', label: 'First Promo' }
]

export function CreateCampaignCard({ ctx, onCreated }: CreateResourceCardProps) {
  async function handleCreateCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ctx.selectedTenant) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)

    try {
      await ctx.fetchJson<Campaign>('/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          tenantId: ctx.selectedTenant.id,
          name: String(form.get('campaignName') ?? '')
        })
      })
      ctx.setStatus({ type: 'success', message: 'Đã tạo campaign' })
      formElement.reset()
      await ctx.loadData()
      await onCreated?.()
    } catch (error) {
      ctx.setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Không tạo được campaign' })
    }
  }

  return (
    <Card id="campaigns" className="form-card">
      <CardHeader>
        <CardTitle><Megaphone size={18} /> Create Campaign</CardTitle>
        <CardDescription>Tạo chiến dịch để nhóm dữ liệu và chọn dataset Meta/TikTok đã tạo.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleCreateCampaign}>
          <label><FieldLabel>Campaign name</FieldLabel><Input name="campaignName" placeholder="Facebook VN" required disabled={!ctx.selectedTenant} /></label>
          <p className="form-hint">Tạo campaign chỉ cần tên. Sau đó vào chi tiết campaign để chọn nhiều Dataset theo giới hạn gói tài khoản.</p>
          <Button type="submit" disabled={!ctx.selectedTenant}><Plus size={16} /> Create campaign</Button>
        </form>
      </CardContent>
    </Card>
  )
}

export function CreateBrandCard({ ctx, onCreated }: CreateResourceCardProps) {
  async function handleCreateBrand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ctx.selectedTenant) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)

    try {
      await ctx.fetchJson<Brand>('/brands', {
        method: 'POST',
        body: JSON.stringify({
          tenantId: ctx.selectedTenant.id,
          affiliatePlatformId: String(form.get('affiliatePlatformId') ?? ''),
          name: String(form.get('brandName') ?? ''),
          affiliateUrl: String(form.get('affiliateUrl') ?? '')
        })
      })
      ctx.setStatus({ type: 'success', message: 'Đã tạo brand/offer' })
      formElement.reset()
      await ctx.loadData()
      await onCreated?.()
    } catch (error) {
      ctx.setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Không tạo được brand' })
    }
  }

  return (
    <Card id="brands" className="form-card">
      <CardHeader>
        <CardTitle><Building2 size={18} /> Create Brand / Offer</CardTitle>
        <CardDescription>Tạo sản phẩm/offer độc lập, chỉ chọn nguồn affiliate platform và nhập link aff trực tiếp.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleCreateBrand}>
          <label><FieldLabel>Affiliate platform</FieldLabel><Select name="affiliatePlatformId" required disabled={!ctx.tenantAffiliatePlatforms.length}>{ctx.tenantAffiliatePlatforms.map((platform) => <option key={platform.id} value={platform.id}>{platform.name}</option>)}</Select></label>
          <label><FieldLabel>Brand / Offer name</FieldLabel><Input name="brandName" placeholder="Demo Offer" required /></label>
          <label><FieldLabel>Affiliate URL</FieldLabel><Input name="affiliateUrl" placeholder="https://example.com/campaign" required /></label>
          <Button type="submit" disabled={!ctx.tenantAffiliatePlatforms.length}><Plus size={16} /> Create brand</Button>
        </form>
      </CardContent>
    </Card>
  )
}

export function CreateAffiliatePlatformCard({ ctx, onCreated }: CreateResourceCardProps) {
  async function handleCreateAffiliatePlatform(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ctx.selectedTenant) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)

    try {
      await ctx.fetchJson<AffiliatePlatform>('/affiliate-platforms', {
        method: 'POST',
        body: JSON.stringify({
          tenantId: ctx.selectedTenant.id,
          name: String(form.get('name') ?? ''),
          platform: String(form.get('platform') ?? 'impact')
        })
      })
      ctx.setStatus({ type: 'success', message: 'Đã tạo affiliate platform/network' })
      formElement.reset()
      await ctx.loadData()
      await onCreated?.()
    } catch (error) {
      ctx.setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Không tạo được affiliate platform' })
    }
  }

  return (
    <Card className="form-card">
      <CardHeader>
        <CardTitle><Globe2 size={18} /> Create Affiliate Platform</CardTitle>
        <CardDescription>Chỉ chọn nền tảng hỗ trợ và đặt tên. Hệ thống tự cấu hình phần còn lại.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleCreateAffiliatePlatform}>
          <label><FieldLabel>Platform</FieldLabel><Select name="platform" defaultValue="impact" required>{affiliatePlatformOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></label>
          <label><FieldLabel>Name</FieldLabel><Input name="name" placeholder="Impact - Main account" required /></label>
          <p className="form-hint">Các thiết lập kỹ thuật còn lại được hệ thống tự tạo.</p>
          <Button type="submit" disabled={!ctx.selectedTenant}><Plus size={16} /> Create platform</Button>
        </form>
      </CardContent>
    </Card>
  )
}

export function CreateDatasetCard({ ctx, onCreated }: CreateResourceCardProps) {
  async function handleCreateDataset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ctx.selectedTenant) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)

    try {
      await ctx.fetchJson<Dataset>('/datasets', {
        method: 'POST',
        body: JSON.stringify({
          tenantId: ctx.selectedTenant.id,
          platform: String(form.get('platform') ?? 'meta'),
          name: String(form.get('name') ?? ''),
          pixelId: String(form.get('pixelId') ?? ''),
          accessToken: String(form.get('accessToken') ?? ''),
          isActive: true
        })
      })
      ctx.setStatus({ type: 'success', message: 'Đã tạo dataset' })
      formElement.reset()
      await ctx.loadData()
      await onCreated?.()
    } catch (error) {
      ctx.setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Không tạo được dataset' })
    }
  }

  return (
    <Card className="form-card">
      <CardHeader>
        <CardTitle><ShieldCheck size={18} /> Create Dataset</CardTitle>
        <CardDescription>Dataset dùng chung cho Meta/TikTok. Khi tạo chọn platform tương ứng.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleCreateDataset}>
          <label><FieldLabel>Platform</FieldLabel><Select name="platform" defaultValue="meta"><option value="meta">Meta</option><option value="tiktok">TikTok</option></Select></label>
          <label><FieldLabel>Name</FieldLabel><Input name="name" placeholder="Meta Ads Pixel VN / TikTok Pixel US" required disabled={!ctx.selectedTenant} /></label>
          <label><FieldLabel>Pixel ID</FieldLabel><Input name="pixelId" placeholder="123456789" required disabled={!ctx.selectedTenant} /></label>
          <label><FieldLabel>Access token</FieldLabel><Input name="accessToken" placeholder="Access token" required disabled={!ctx.selectedTenant} /></label>
          <Button type="submit" disabled={!ctx.selectedTenant}><Plus size={16} /> Create dataset</Button>
        </form>
      </CardContent>
    </Card>
  )
}

export function CreatePrelanderCard({ ctx, onCreated }: CreateResourceCardProps) {
  async function handleCreatePrelander(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ctx.selectedTenant) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)

    try {
      await ctx.fetchJson<Prelander>('/prelanders', {
        method: 'POST',
        body: JSON.stringify({
          tenantId: ctx.selectedTenant.id,
          name: getFormString(form, 'name'),
          headline: getFormString(form, 'headline'),
          body: getFormString(form, 'body'),
          ctaText: getFormString(form, 'ctaText') || 'Continue',
          ctaDelaySeconds: Number(form.get('ctaDelaySeconds') ?? 2),
          theme: getFormString(form, 'theme') || 'clean',
          isActive: true
        })
      })
      ctx.setStatus({ type: 'success', message: 'Đã tạo bridge page' })
      formElement.reset()
      await ctx.loadData()
      await onCreated?.()
    } catch (error) {
      ctx.setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Không tạo được bridge page' })
    }
  }

  return (
    <Card className="form-card">
      <CardHeader><CardTitle><Layers3 size={18} /> Create Bridge Page</CardTitle><CardDescription>Trang bridge/landing hiển thị trước khi redirect sang Affiliate URL của tracking link.</CardDescription></CardHeader>
      <CardContent><form onSubmit={handleCreatePrelander}>
        <label><FieldLabel>Bridge page name</FieldLabel><Input name="name" placeholder="Bridge page VN" required disabled={!ctx.selectedTenant} /></label>
        <label><FieldLabel>Headline</FieldLabel><Input name="headline" placeholder="Special offer is ready" required /></label>
        <label><FieldLabel>Body</FieldLabel><Input name="body" placeholder="Short trust-building message before redirect" required /></label>
        <label><FieldLabel>CTA text</FieldLabel><Input name="ctaText" defaultValue="Continue" /></label>
        <label><FieldLabel>Delay seconds</FieldLabel><Input name="ctaDelaySeconds" type="number" min="0" defaultValue="2" /></label>
        <label><FieldLabel>Theme</FieldLabel><Select name="theme" defaultValue="clean"><option value="clean">Clean</option><option value="dark">Dark</option><option value="warm">Warm</option></Select></label>
        <Button type="submit" disabled={!ctx.selectedTenant}><Plus size={16} /> Create bridge page</Button>
      </form></CardContent>
    </Card>
  )
}

export function CreateTrackingLinkCard({ ctx, onCreated }: CreateResourceCardProps) {
  async function handleCreateTrackingLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!ctx.selectedTenant) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    try {
      await ctx.fetchJson<TrackingLink>('/tracking-links', {
        method: 'POST',
        body: JSON.stringify({
          tenantId: ctx.selectedTenant.id,
          campaignId: String(form.get('campaignId') ?? ''),
          affiliatePlatformId: String(form.get('affiliatePlatformId') ?? ''),
          affiliateUrl: String(form.get('affiliateUrl') ?? ''),
          prelanderId: String(form.get('prelanderId') ?? ''),
          slug: String(form.get('slug') ?? ''),
          prelanderEnabled: form.get('prelanderEnabled') === 'on',
          isActive: true
        })
      })
      ctx.setStatus({ type: 'success', message: 'Đã tạo tracking link' })
      formElement.reset()
      await ctx.loadData()
      await onCreated?.()
    } catch (error) {
      ctx.setStatus({ type: 'error', message: error instanceof Error ? error.message : 'Không tạo được tracking link' })
    }
  }

  return (
    <Card id="links" className="form-card">
      <CardHeader>
        <CardTitle><Link2 size={18} /> Create Tracking Link</CardTitle>
        <CardDescription>Shortlink ghi click rồi redirect sang Affiliate URL; bridge page được quản lý ngay trong Tracking Links.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleCreateTrackingLink}>
          <label><FieldLabel>Campaign (optional)</FieldLabel><Select name="campaignId" defaultValue=""><option value="">Không chọn campaign</option>{ctx.tenantCampaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</Select></label>
          <label><FieldLabel>Affiliate platform</FieldLabel><Select name="affiliatePlatformId" required disabled={!ctx.tenantAffiliatePlatforms.length}>{ctx.tenantAffiliatePlatforms.map((platform) => <option key={platform.id} value={platform.id}>{platform.name}</option>)}</Select></label>
          <label><FieldLabel>Affiliate URL</FieldLabel><Input name="affiliateUrl" placeholder="https://example.com/campaign" required /></label>
          <label><FieldLabel>Bridge page (optional)</FieldLabel><Select name="prelanderId" defaultValue=""><option value="">Không chọn bridge page</option>{ctx.tenantPrelanders.map((prelander) => <option key={prelander.id} value={prelander.id}>{prelander.name}</option>)}</Select></label>
          <label><FieldLabel>Slug</FieldLabel><Input name="slug" placeholder="demo" required /></label>
          <label className="checkbox"><input name="prelanderEnabled" type="checkbox" defaultChecked /> Enable bridge page</label>
          <Button type="submit" disabled={!ctx.tenantAffiliatePlatforms.length}><Plus size={16} /> Create link</Button>
        </form>
      </CardContent>
    </Card>
  )
}
