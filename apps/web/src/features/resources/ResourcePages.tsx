import { useState, type FormEvent, type ReactNode } from 'react'
import { NavLink, useNavigate, useParams } from 'react-router'
import { Building2, Copy, ExternalLink, Globe2, Layers3, Link2, Megaphone, Pencil, ShieldCheck, Trash2 } from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Select } from '../../components/ui/select'
import { ActionButtons, DetailGrid, DetailItem, EntityDetailCard, NotFoundEntity, PageToolbar } from '../../components/common/EntityScaffold'
import { FieldLabel } from '../../components/common/FieldLabel'
import { StatusBanner } from '../../components/common/StatusBanner'
import { CreateAffiliatePlatformCard, CreateBrandCard, CreateCampaignCard, CreateDatasetCard, CreatePrelanderCard, CreateTrackingLinkCard } from './ResourceForms'
import { apiBaseUrl, redirectBaseUrl } from '../../config/env'
import { formatDate, getDatasetLabel } from '../../lib/format'
import { getFormString } from '../../lib/forms'
import { runEntityAction } from '../../lib/entity-actions'
import type { AffiliatePlatform, Brand, Campaign, DashboardContext, Dataset, Prelander, Tenant, TrackingLink } from '../../types/domain'

function getCampaignDatasets(campaign: Campaign) {
  return campaign.datasets ?? []
}

function getCampaignDatasetSummary(campaign: Campaign) {
  const entries = getCampaignDatasets(campaign)
  return entries.length ? entries.map((entry) => getDatasetLabel(entry.dataset, entry.datasetId)).join(', ') : 'Chưa chọn dataset'
}

function getCampaignName(ctx: DashboardContext, campaignId?: string | null) {
  return ctx.tenantCampaigns.find((campaign) => campaign.id === campaignId)?.name ?? (campaignId ? campaignId : 'Chưa gắn campaign')
}

function getCampaignTrackingLinks(ctx: DashboardContext, campaign: Campaign) {
  return campaign.trackingLinks ?? ctx.tenantTrackingLinks.filter((link) => link.campaignId === campaign.id)
}

function getTrackingTenantKey(link: TrackingLink) {
  return link.tenant?.publicKey || link.tenantId
}

function getTrackingLinkUrl(link: TrackingLink) {
  return `${redirectBaseUrl}/${link.slug}/${getTrackingTenantKey(link)}`
}

function getTrackingLinkPath(link: TrackingLink) {
  return `/${link.slug}/${getTrackingTenantKey(link)}`
}

function getTrackingLinkWebhookUrl(link: TrackingLink) {
  return `${apiBaseUrl}/click-webhooks/${getTrackingTenantKey(link)}/${link.slug}`
}

function getTrackingLinkWebhookPath(link: TrackingLink) {
  return `/click-webhooks/${getTrackingTenantKey(link)}/${link.slug}`
}

async function copyToClipboard(ctx: DashboardContext, value: string, label = 'URL') {
  if (!value) return
  try {
    await navigator.clipboard.writeText(value)
    ctx.setStatus({ type: 'success', message: `Đã copy ${label}` })
  } catch {
    ctx.setStatus({ type: 'error', message: `Không copy được ${label}` })
  }
}

function CopyIconButton({ ctx, value, label = 'URL' }: { ctx: DashboardContext; value: string; label?: string }) {
  return (
    <Button className="copy-icon-button" type="button" variant="ghost" size="icon" title={`Copy ${label}`} aria-label={`Copy ${label}`} onClick={() => void copyToClipboard(ctx, value, label)}>
      <Copy size={14} />
    </Button>
  )
}

function CopyableValue({ ctx, value, label = 'URL', children }: { ctx: DashboardContext; value: string; label?: string; children: ReactNode }) {
  return (
    <span className="copyable-value">
      {children}
      <CopyIconButton ctx={ctx} value={value} label={label} />
    </span>
  )
}

const impactWebhookQueryTemplate = [
  'SubId1={SubId1}',
  'SubId2={SubId2}',
  'SubId3={SubId3}',
  'CampaignId={CampaignId}',
  'CampaignName={CampaignName}',
  'ActionTrackerId={ActionTrackerId}',
  'ActionTrackerName={ActionTrackerName}',
  'Amount={Amount}',
  'Payout={Payout}',
  'EventDate={EventDate}',
  'CreationDate={CreationDate}',
  'LockingDate={LockingDate}',
  'RefClickId={RefClickId}',
  'SharedId={SharedId}'
].join('&')

function getAffiliateTenantKey(platform: AffiliatePlatform, tenant?: Tenant) {
  return tenant?.id === platform.tenantId ? tenant.publicKey || platform.tenantId : platform.tenantId
}

function isImpactAffiliatePlatform(platform: AffiliatePlatform) {
  return platform.platformKey === 'impact' || platform.slug === 'impact'
}

function getAffiliateWebhookUrl(platform: AffiliatePlatform, tenant?: Tenant) {
  return `${apiBaseUrl}/affiliate-webhooks/${getAffiliateTenantKey(platform, tenant)}/${platform.slug}`
}

function getAffiliateWebhookDetailUrl(platform: AffiliatePlatform, tenant?: Tenant) {
  const webhookUrl = getAffiliateWebhookUrl(platform, tenant)
  return isImpactAffiliatePlatform(platform) ? `${webhookUrl}?${impactWebhookQueryTemplate}` : webhookUrl
}

function getAffiliateWebhookPath(platform: AffiliatePlatform, tenant?: Tenant) {
  return `/affiliate-webhooks/${getAffiliateTenantKey(platform, tenant)}/${platform.slug}`
}

export function CampaignsPage({ ctx }: { ctx: DashboardContext }) {
  return (
    <>
      <StatusBanner status={ctx.status} />
      <section className="resource-page">
        <PageToolbar title={<><Megaphone size={18} /> Campaign list</>} description={`${ctx.tenantCampaigns.length} campaigns. Tạo campaign chỉ cần tên, sau đó chọn nhiều Dataset trong detail.`} createPath="/campaigns/new" createLabel="Thêm campaign" />
        <Card className="table-card"><CardContent><div className="table-wrap"><table>
          <thead><tr><th>Name</th><th>Tracking links</th><th>Datasets</th><th>ID</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody>{ctx.tenantCampaigns.map((campaign) => <tr key={campaign.id}><td><strong>{campaign.name}</strong></td><td>{getCampaignTrackingLinks(ctx, campaign).length}</td><td>{getCampaignDatasetSummary(campaign)}</td><td>{campaign.id}</td><td>{formatDate(campaign.createdAt)}</td><td><ActionButtons detailPath={`/campaigns/${campaign.id}`} editPath={`/campaigns/${campaign.id}/edit`} deletePath={`/campaigns/${campaign.id}/delete`} /></td></tr>)}{!ctx.tenantCampaigns.length && <tr><td colSpan={6}>Chưa có campaign.</td></tr>}</tbody>
        </table></div></CardContent></Card>
      </section>
    </>
  )
}

export function CampaignCreatePage({ ctx }: { ctx: DashboardContext }) {
  const navigate = useNavigate()
  return <section className="form-route"><CreateCampaignCard ctx={ctx} onCreated={() => navigate('/campaigns')} /><Button asChild variant="outline"><NavLink to="/campaigns">Quay lại danh sách</NavLink></Button></section>
}

export function CampaignDetailPage({ ctx }: { ctx: DashboardContext }) {
  const { id = '' } = useParams()
  const campaign = ctx.tenantCampaigns.find((item) => item.id === id)
  if (!campaign) return <NotFoundEntity name="Campaign" backPath="/campaigns" />

  const currentCampaign = campaign
  const assignedTrackingLinks = getCampaignTrackingLinks(ctx, currentCampaign)
  const selectedDatasetIds = new Set(getCampaignDatasets(currentCampaign).map((entry) => entry.datasetId))
  const datasetLimit = ctx.selectedTenant?.billingPlan?.campaignDatasetLimit ?? 2

  async function handleDatasetSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const datasetIds = form.getAll('datasetIds').map(String).filter(Boolean)
    await runEntityAction(ctx, async () => {
      await ctx.fetchJson<Campaign>(`/campaigns/${currentCampaign.id}/datasets`, { method: 'PUT', body: JSON.stringify({ datasetIds }) })
    }, 'Đã cập nhật dataset cho campaign')
  }

  return (
    <EntityDetailCard title={<><Megaphone size={18} /> {currentCampaign.name}</>} description="Quản lý campaign: chọn nhiều Dataset theo limit của gói tài khoản." backPath="/campaigns">
      <DetailGrid>
        <DetailItem label="Campaign ID" value={currentCampaign.id} />
        <DetailItem label="Workspace ID" value={currentCampaign.tenantId} />
        <DetailItem label="Datasets" value={getCampaignDatasetSummary(currentCampaign)} />
        <DetailItem label="Tracking links" value={`${assignedTrackingLinks.length} link`} />
        <DetailItem label="Created" value={formatDate(currentCampaign.createdAt)} />
      </DetailGrid>

      <Card className="form-card">
        <CardHeader>
          <CardTitle><ShieldCheck size={18} /> Campaign datasets</CardTitle>
          <CardDescription>Chọn dataset để worker gửi CAPI. Gói hiện tại cho phép tối đa {datasetLimit} dataset/campaign.</CardDescription>
        </CardHeader>
        <CardContent>
          <form key={[...selectedDatasetIds].sort().join(':')} className="campaign-dataset-form" onSubmit={(event) => void handleDatasetSubmit(event)}>
            <div className="campaign-dataset-summary">
              <strong>{selectedDatasetIds.size}/{datasetLimit} dataset đang gắn</strong>
              <span>Tích chọn các dataset cần dùng rồi bấm Lưu datasets. Nếu vượt limit, API sẽ báo lỗi theo gói tài khoản.</span>
            </div>
            <div className="feature-card-grid campaign-dataset-list">
              {ctx.tenantDatasets.map((dataset) => {
                const isSelected = selectedDatasetIds.has(dataset.id)
                return (
                  <label key={dataset.id} className={`feature-card-toggle dataset-card-toggle ${isSelected ? 'is-selected' : ''}`}>
                    <input name="datasetIds" type="checkbox" value={dataset.id} defaultChecked={isSelected} />
                    <span className="dataset-card-copy"><strong>{dataset.platform.toUpperCase()} · {dataset.name}</strong><small>Pixel ID: {dataset.pixelId} · {dataset.isActive ? 'Active' : 'Inactive'}</small></span>
                    <Badge variant={isSelected ? 'secondary' : 'outline'}>{isSelected ? 'Đã chọn' : 'Chọn'}</Badge>
                  </label>
                )
              })}
            </div>
            {!ctx.tenantDatasets.length && <p className="empty-state">Chưa có dataset. Hãy tạo Dataset trước.</p>}
            <Button type="submit" disabled={!ctx.tenantDatasets.length}>Lưu datasets</Button>
          </form>
        </CardContent>
      </Card>
    </EntityDetailCard>
  )
}

export function CampaignEditPage({ ctx }: { ctx: DashboardContext }) {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const campaign = ctx.tenantCampaigns.find((item) => item.id === id)
  if (!campaign) return <NotFoundEntity name="Campaign" backPath="/campaigns" />
  const currentCampaign = campaign
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await runEntityAction(ctx, async () => {
      await ctx.fetchJson<Campaign>(`/campaigns/${currentCampaign.id}`, { method: 'PUT', body: JSON.stringify({ name: getFormString(form, 'name') }) })
      navigate('/campaigns')
    }, 'Đã cập nhật campaign')
  }
  return <EntityDetailCard title={<><Pencil size={18} /> Sửa campaign</>} description="Campaign chỉ quản lý tên ở form sửa; datasets nằm trong trang detail campaign." backPath="/campaigns"><form className="route-form" onSubmit={(event) => void handleSubmit(event)}><label><FieldLabel>Name</FieldLabel><Input name="name" defaultValue={currentCampaign.name} required /></label><Button type="submit">Lưu campaign</Button></form></EntityDetailCard>
}

export function CampaignDeletePage({ ctx }: { ctx: DashboardContext }) {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const campaign = ctx.tenantCampaigns.find((item) => item.id === id)
  if (!campaign) return <NotFoundEntity name="Campaign" backPath="/campaigns" />
  const currentCampaign = campaign
  async function handleDelete() { await runEntityAction(ctx, async () => { await ctx.fetchJson<{ ok: boolean }>(`/campaigns/${currentCampaign.id}`, { method: 'DELETE' }); navigate('/campaigns') }, 'Đã xóa campaign') }
  return <EntityDetailCard title={<><Trash2 size={18} /> Xóa campaign</>} description="Xác nhận xóa campaign ở URL riêng." backPath="/campaigns"><div className="danger-zone"><p>Bạn sắp xóa <strong>{currentCampaign.name}</strong>. Dataset assignments sẽ bị xóa và link/click liên quan sẽ được gỡ campaign.</p><Button variant="destructive" onClick={() => void handleDelete()}><Trash2 size={16} /> Xác nhận xóa</Button></div></EntityDetailCard>
}

export function PlatformsPage({ ctx }: { ctx: DashboardContext }) {
  return (<><StatusBanner status={ctx.status} /><section className="resource-page"><PageToolbar title={<><Globe2 size={18} /> Affiliate platforms</>} description={`${ctx.tenantAffiliatePlatforms.length} affiliate networks. Chỉ hỗ trợ Impact, PartnerStack và First Promo.`} createPath="/platforms/new" createLabel="Thêm platform" /><Card className="table-card"><CardContent><div className="table-wrap"><table><thead><tr><th>Name</th><th>Platform</th><th>Webhook</th><th>Actions</th></tr></thead><tbody>{ctx.tenantAffiliatePlatforms.map((platform) => <tr key={platform.id}><td><strong>{platform.name}</strong></td><td>{platform.platformLabel ?? platform.slug}</td><td><CopyableValue ctx={ctx} value={getAffiliateWebhookUrl(platform, ctx.selectedTenant)} label="webhook URL"><span>{platform.webhookMethod} {getAffiliateWebhookPath(platform, ctx.selectedTenant)}</span></CopyableValue></td><td><ActionButtons detailPath={`/platforms/${platform.id}`} editPath={`/platforms/${platform.id}/edit`} deletePath={`/platforms/${platform.id}/delete`} /></td></tr>)}{!ctx.tenantAffiliatePlatforms.length && <tr><td colSpan={4}>Chưa có affiliate platform.</td></tr>}</tbody></table></div></CardContent></Card></section></>)
}
export function PlatformCreatePage({ ctx }: { ctx: DashboardContext }) { const navigate = useNavigate(); return <section className="form-route"><CreateAffiliatePlatformCard ctx={ctx} onCreated={() => navigate('/platforms')} /><Button asChild variant="outline"><NavLink to="/platforms">Quay lại danh sách</NavLink></Button></section> }
export function PlatformDetailPage({ ctx }: { ctx: DashboardContext }) { const { id = '' } = useParams(); const platform = ctx.tenantAffiliatePlatforms.find((item) => item.id === id); if (!platform) return <NotFoundEntity name="Affiliate platform" backPath="/platforms" />; const webhookUrl = getAffiliateWebhookDetailUrl(platform, ctx.selectedTenant); return <EntityDetailCard title={<><Globe2 size={18} /> {platform.name}</>} description="Chi tiết affiliate platform." backPath="/platforms"><DetailGrid><DetailItem label="Platform ID" value={platform.id} /><DetailItem label="Platform" value={platform.platformLabel ?? platform.slug} /><DetailItem label="Webhook URL" value={<CopyableValue ctx={ctx} value={webhookUrl} label="webhook URL"><code>{webhookUrl}</code></CopyableValue>} /><DetailItem label="Webhook method" value={`${platform.webhookMethod} (GET/POST đều được nhận)`} /><DetailItem label="Auth" value="Không cần token; chèn URL này vào postback/webhook nội bộ của sàn affiliate." /><DetailItem label="Created" value={formatDate(platform.createdAt)} /></DetailGrid></EntityDetailCard> }
export function PlatformEditPage({ ctx }: { ctx: DashboardContext }) { const { id = '' } = useParams(); const navigate = useNavigate(); const platform = ctx.tenantAffiliatePlatforms.find((item) => item.id === id); if (!platform) return <NotFoundEntity name="Affiliate platform" backPath="/platforms" />; const current = platform; async function handleSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); await runEntityAction(ctx, async () => { await ctx.fetchJson<AffiliatePlatform>(`/affiliate-platforms/${current.id}`, { method: 'PUT', body: JSON.stringify({ name: getFormString(form, 'name'), platform: getFormString(form, 'platform') }) }); navigate('/platforms') }, 'Đã cập nhật affiliate platform') } return <EntityDetailCard title={<><Pencil size={18} /> Sửa platform</>} description="Chỉ đổi nền tảng hỗ trợ và tên hiển thị." backPath="/platforms"><form className="route-form" onSubmit={(event) => void handleSubmit(event)}><label><FieldLabel>Platform</FieldLabel><Select name="platform" defaultValue={current.platformKey ?? current.slug}><option value="impact">Impact</option><option value="partnerstack">PartnerStack</option><option value="first_promo">First Promo</option></Select></label><label><FieldLabel>Name</FieldLabel><Input name="name" defaultValue={current.name} required /></label><p className="form-hint">Các thiết lập kỹ thuật còn lại được hệ thống tự quản lý.</p><Button type="submit">Lưu platform</Button></form></EntityDetailCard> }
export function PlatformDeletePage({ ctx }: { ctx: DashboardContext }) { const { id = '' } = useParams(); const navigate = useNavigate(); const platform = ctx.tenantAffiliatePlatforms.find((item) => item.id === id); if (!platform) return <NotFoundEntity name="Affiliate platform" backPath="/platforms" />; const current = platform; async function handleDelete() { await runEntityAction(ctx, async () => { await ctx.fetchJson<{ ok: boolean }>(`/affiliate-platforms/${current.id}`, { method: 'DELETE' }); navigate('/platforms') }, 'Đã xóa affiliate platform') } return <EntityDetailCard title={<><Trash2 size={18} /> Xóa platform</>} description="Xác nhận xóa ở URL riêng." backPath="/platforms"><div className="danger-zone"><p>Bạn sắp xóa <strong>{current.name}</strong>. Brand/link liên quan có thể bị xóa theo.</p><Button variant="destructive" onClick={() => void handleDelete()}><Trash2 size={16} /> Xác nhận xóa</Button></div></EntityDetailCard> }

export function DatasetsPage({ ctx }: { ctx: DashboardContext }) {
  return (<><StatusBanner status={ctx.status} /><section className="resource-page"><PageToolbar title={<><ShieldCheck size={18} /> Datasets</>} description={`${ctx.tenantDatasets.length} datasets. Quản lý ở các URL riêng.`} createPath="/datasets/new" createLabel="Thêm dataset" /><Card className="table-card"><CardContent><div className="table-wrap"><table><thead><tr><th>Name</th><th>Platform</th><th>Pixel ID</th><th>Status</th><th>Actions</th></tr></thead><tbody>{ctx.tenantDatasets.map((dataset) => <tr key={dataset.id}><td><strong>{dataset.name}</strong></td><td>{dataset.platform.toUpperCase()}</td><td>{dataset.pixelId}</td><td><Badge variant={dataset.isActive ? 'secondary' : 'outline'}>{dataset.isActive ? 'Active' : 'Inactive'}</Badge></td><td><ActionButtons detailPath={`/datasets/${dataset.id}`} editPath={`/datasets/${dataset.id}/edit`} deletePath={`/datasets/${dataset.id}/delete`} /></td></tr>)}{!ctx.tenantDatasets.length && <tr><td colSpan={5}>Chưa có dataset.</td></tr>}</tbody></table></div></CardContent></Card></section></>)
}
export function DatasetCreatePage({ ctx }: { ctx: DashboardContext }) { const navigate = useNavigate(); return <section className="form-route"><CreateDatasetCard ctx={ctx} onCreated={() => navigate('/datasets')} /><Button asChild variant="outline"><NavLink to="/datasets">Quay lại danh sách</NavLink></Button></section> }
export function DatasetDetailPage({ ctx }: { ctx: DashboardContext }) { const { id = '' } = useParams(); const dataset = ctx.tenantDatasets.find((item) => item.id === id); if (!dataset) return <NotFoundEntity name="Dataset" backPath="/datasets" />; return <EntityDetailCard title={<><ShieldCheck size={18} /> {dataset.name}</>} description="Chi tiết dataset." backPath="/datasets"><DetailGrid><DetailItem label="Dataset ID" value={dataset.id} /><DetailItem label="Workspace ID" value={dataset.tenantId} /><DetailItem label="Platform" value={dataset.platform.toUpperCase()} /><DetailItem label="Pixel ID" value={dataset.pixelId} /><DetailItem label="Access token" value={dataset.accessToken} /><DetailItem label="Created" value={formatDate(dataset.createdAt)} /></DetailGrid></EntityDetailCard> }
export function DatasetEditPage({ ctx }: { ctx: DashboardContext }) { const { id = '' } = useParams(); const navigate = useNavigate(); const dataset = ctx.tenantDatasets.find((item) => item.id === id); if (!dataset) return <NotFoundEntity name="Dataset" backPath="/datasets" />; const current = dataset; async function handleSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); await runEntityAction(ctx, async () => { await ctx.fetchJson<Dataset>(`/datasets/${current.id}`, { method: 'PUT', body: JSON.stringify({ platform: getFormString(form, 'platform'), name: getFormString(form, 'name'), pixelId: getFormString(form, 'pixelId'), accessToken: getFormString(form, 'accessToken'), isActive: form.get('isActive') === 'on' }) }); navigate('/datasets') }, 'Đã cập nhật dataset') } return <EntityDetailCard title={<><Pencil size={18} /> Sửa dataset</>} description="Cập nhật dataset ở trang riêng." backPath="/datasets"><form className="route-form" onSubmit={(event) => void handleSubmit(event)}><label><FieldLabel>Platform</FieldLabel><Select name="platform" defaultValue={current.platform}><option value="meta">Meta</option><option value="tiktok">TikTok</option></Select></label><label><FieldLabel>Name</FieldLabel><Input name="name" defaultValue={current.name} required /></label><label><FieldLabel>Pixel ID</FieldLabel><Input name="pixelId" defaultValue={current.pixelId} required /></label><label><FieldLabel>Access token</FieldLabel><Input name="accessToken" placeholder="Leave blank to keep current token" /></label><label className="checkbox"><input name="isActive" type="checkbox" defaultChecked={current.isActive} /> Active</label><Button type="submit">Lưu dataset</Button></form></EntityDetailCard> }
export function DatasetDeletePage({ ctx }: { ctx: DashboardContext }) { const { id = '' } = useParams(); const navigate = useNavigate(); const dataset = ctx.tenantDatasets.find((item) => item.id === id); if (!dataset) return <NotFoundEntity name="Dataset" backPath="/datasets" />; const current = dataset; async function handleDelete() { await runEntityAction(ctx, async () => { await ctx.fetchJson<{ ok: boolean }>(`/datasets/${current.id}`, { method: 'DELETE' }); navigate('/datasets') }, 'Đã xóa dataset') } return <EntityDetailCard title={<><Trash2 size={18} /> Xóa dataset</>} description="Xác nhận xóa ở URL riêng." backPath="/datasets"><div className="danger-zone"><p>Bạn sắp xóa <strong>{current.name}</strong>. Campaign đang dùng dataset này sẽ bị bỏ chọn dataset.</p><Button variant="destructive" onClick={() => void handleDelete()}><Trash2 size={16} /> Xác nhận xóa</Button></div></EntityDetailCard> }

export function BrandsPage({ ctx }: { ctx: DashboardContext }) {
  return (<><StatusBanner status={ctx.status} /><section className="resource-page"><PageToolbar title={<><Building2 size={18} /> Brands / Offers</>} description={`${ctx.tenantBrands.length} brands/offers. Tạo offer độc lập; campaign được gắn ở từng tracking link.`} createPath="/brands/new" createLabel="Thêm brand" /><Card className="table-card"><CardContent><div className="table-wrap"><table><thead><tr><th>Brand</th><th>Affiliate platform</th><th>Affiliate URL</th><th>Actions</th></tr></thead><tbody>{ctx.tenantBrands.map((brand) => <tr key={brand.id}><td><strong>{brand.name}</strong></td><td>{brand.affiliatePlatform?.name ?? brand.affiliatePlatformId}</td><td><CopyableValue ctx={ctx} value={brand.affiliateUrl} label="affiliate URL"><a href={brand.affiliateUrl} target="_blank" rel="noreferrer">Open <ExternalLink size={13} /></a></CopyableValue></td><td><ActionButtons detailPath={`/brands/${brand.id}`} editPath={`/brands/${brand.id}/edit`} deletePath={`/brands/${brand.id}/delete`} /></td></tr>)}{!ctx.tenantBrands.length && <tr><td colSpan={4}>Chưa có brand/offer.</td></tr>}</tbody></table></div></CardContent></Card></section></>)
}
export function BrandCreatePage({ ctx }: { ctx: DashboardContext }) { const navigate = useNavigate(); return <section className="form-route"><CreateBrandCard ctx={ctx} onCreated={() => navigate('/brands')} /><Button asChild variant="outline"><NavLink to="/brands">Quay lại danh sách</NavLink></Button></section> }
export function BrandDetailPage({ ctx }: { ctx: DashboardContext }) { const { id = '' } = useParams(); const brand = ctx.tenantBrands.find((item) => item.id === id); if (!brand) return <NotFoundEntity name="Brand / Offer" backPath="/brands" />; return <EntityDetailCard title={<><Building2 size={18} /> {brand.name}</>} description="Chi tiết brand / offer." backPath="/brands"><DetailGrid><DetailItem label="Brand ID" value={brand.id} /><DetailItem label="Affiliate platform" value={brand.affiliatePlatform?.name ?? brand.affiliatePlatformId} /><DetailItem label="Affiliate URL" value={<CopyableValue ctx={ctx} value={brand.affiliateUrl} label="affiliate URL"><a href={brand.affiliateUrl} target="_blank" rel="noreferrer">{brand.affiliateUrl}</a></CopyableValue>} /><DetailItem label="Created" value={formatDate(brand.createdAt)} /></DetailGrid></EntityDetailCard> }
export function BrandEditPage({ ctx }: { ctx: DashboardContext }) { const { id = '' } = useParams(); const navigate = useNavigate(); const brand = ctx.tenantBrands.find((item) => item.id === id); if (!brand) return <NotFoundEntity name="Brand / Offer" backPath="/brands" />; const current = brand; async function handleSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); await runEntityAction(ctx, async () => { await ctx.fetchJson<Brand>(`/brands/${current.id}`, { method: 'PUT', body: JSON.stringify({ affiliatePlatformId: getFormString(form, 'affiliatePlatformId'), name: getFormString(form, 'name'), affiliateUrl: getFormString(form, 'affiliateUrl') }) }); navigate('/brands') }, 'Đã cập nhật brand/offer') } return <EntityDetailCard title={<><Pencil size={18} /> Sửa brand / offer</>} description="Brand/Offer chỉ quản lý thông tin offer; campaign được gắn ở từng tracking link." backPath="/brands"><form className="route-form" onSubmit={(event) => void handleSubmit(event)}><label><FieldLabel>Affiliate platform</FieldLabel><Select name="affiliatePlatformId" defaultValue={current.affiliatePlatformId}>{ctx.tenantAffiliatePlatforms.map((platform) => <option key={platform.id} value={platform.id}>{platform.name}</option>)}</Select></label><label><FieldLabel>Name</FieldLabel><Input name="name" defaultValue={current.name} required /></label><label><FieldLabel>Affiliate URL</FieldLabel><Input name="affiliateUrl" defaultValue={current.affiliateUrl} required /></label><Button type="submit">Lưu brand</Button></form></EntityDetailCard> }
export function BrandDeletePage({ ctx }: { ctx: DashboardContext }) { const { id = '' } = useParams(); const navigate = useNavigate(); const brand = ctx.tenantBrands.find((item) => item.id === id); if (!brand) return <NotFoundEntity name="Brand / Offer" backPath="/brands" />; const current = brand; async function handleDelete() { await runEntityAction(ctx, async () => { await ctx.fetchJson<{ ok: boolean }>(`/brands/${current.id}`, { method: 'DELETE' }); navigate('/brands') }, 'Đã xóa brand/offer') } return <EntityDetailCard title={<><Trash2 size={18} /> Xóa brand / offer</>} description="Xác nhận xóa ở URL riêng." backPath="/brands"><div className="danger-zone"><p>Bạn sắp xóa <strong>{current.name}</strong>. Tracking links liên quan có thể bị xóa theo.</p><Button variant="destructive" onClick={() => void handleDelete()}><Trash2 size={16} /> Xác nhận xóa</Button></div></EntityDetailCard> }

function getTrackingLinkWebhookFetchSample(link: TrackingLink) {
  const webhookUrl = getTrackingLinkWebhookUrl(link)
  return [
    `const webhookUrl = '${webhookUrl}'`,
    "const webhookToken = 'YOUR_WORKSPACE_CLICK_WEBHOOK_TOKEN'",
    '',
    'function getCookie(name) {',
    '  const value = document.cookie',
    "    .split('; ')",
    "    .find((row) => row.startsWith(name + '='))",
    "    ?.split('=')[1]",
    '',
    '  return value ? decodeURIComponent(value) : undefined',
    '}',
    '',
    'async function sendClickWebhook() {',
    '  const params = new URLSearchParams(window.location.search)',
    '  const payload = {',
    '    // clickUuid: crypto.randomUUID(), // optional; bỏ dòng này để hệ thống tự sinh UUID',
    "    fbclid: params.get('fbclid') || undefined,",
    "    ttclid: params.get('ttclid') || undefined,",
    "    fbp: getCookie('_fbp'),",
    "    fbc: getCookie('_fbc'),",
    "    ttp: getCookie('_ttp'),",
    '    userAgent: navigator.userAgent,',
    '    referrer: document.referrer || undefined,',
    '    metadata: {',
    "      source: 'tracking-link-fetch',",
    '      pageUrl: window.location.href',
    '    }',
    '  }',
    '',
    '  const response = await fetch(webhookUrl, {',
    "    method: 'POST',",
    '    headers: {',
    "      'Content-Type': 'application/json',",
    "      'x-webhook-token': webhookToken",
    '    },',
    '    body: JSON.stringify(payload)',
    '  })',
    '',
    '  const data = await response.json().catch(() => ({}))',
    "  if (!response.ok) throw new Error(data.error || 'Click webhook failed')",
    '  return data',
    '}',
    '',
    'sendClickWebhook().then(console.log).catch(console.error)'
  ].join('\n')
}

export function TrackingLinksPage({ ctx }: { ctx: DashboardContext }) {
  return (<><StatusBanner status={ctx.status} /><section className="resource-page"><PageToolbar title={<><Link2 size={18} /> Tracking links</>} description={`${ctx.tenantTrackingLinks.length} shortlinks · ${ctx.tenantPrelanders.length} bridge pages. Quản lý link và bridge page tại đây.`} createPath="/tracking-links/new" createLabel="Thêm link" /><TrackingLinksTable ctx={ctx} /><TrackingLinkBridgePagesPanel ctx={ctx} /></section></>)
}
export function TrackingLinksTable({ ctx }: { ctx: DashboardContext }) { return <Card className="table-card"><CardContent><div className="table-wrap"><table><thead><tr><th>Slug</th><th>Campaign</th><th>Affiliate platform</th><th>Affiliate URL</th><th>Bridge page</th><th>Shortlink</th><th>Click webhook</th><th>Status</th><th>Actions</th></tr></thead><tbody>{ctx.tenantTrackingLinks.map((link) => <tr key={link.id}><td><strong>{link.slug}</strong></td><td>{link.campaign?.name ?? getCampaignName(ctx, link.campaignId)}</td><td>{link.affiliatePlatform?.name ?? link.affiliatePlatformId}</td><td><CopyableValue ctx={ctx} value={link.affiliateUrl} label="affiliate URL"><a href={link.affiliateUrl} target="_blank" rel="noreferrer">Open <ExternalLink size={13} /></a></CopyableValue></td><td>{link.prelander?.name ?? (link.prelanderEnabled ? 'Không chọn' : 'Disabled')}</td><td><CopyableValue ctx={ctx} value={getTrackingLinkUrl(link)} label="shortlink"><a href={getTrackingLinkUrl(link)} target="_blank" rel="noreferrer">{getTrackingLinkPath(link)} <ExternalLink size={13} /></a></CopyableValue></td><td><CopyableValue ctx={ctx} value={getTrackingLinkWebhookUrl(link)} label="click webhook URL"><code>{getTrackingLinkWebhookPath(link)}</code></CopyableValue></td><td><Badge variant={link.isActive ? 'secondary' : 'outline'}>{link.isActive ? 'Active' : 'Inactive'}</Badge></td><td><ActionButtons detailPath={`/tracking-links/${link.id}`} editPath={`/tracking-links/${link.id}/edit`} deletePath={`/tracking-links/${link.id}/delete`} /></td></tr>)}{!ctx.tenantTrackingLinks.length && <tr><td colSpan={9}>Chưa có tracking link.</td></tr>}</tbody></table></div></CardContent></Card> }

function TrackingLinkBridgePagesPanel({ ctx }: { ctx: DashboardContext }) {
  const [editingPrelanderId, setEditingPrelanderId] = useState<string | null>(null)
  const editingPrelander = ctx.tenantPrelanders.find((item) => item.id === editingPrelanderId) ?? null
  const getUsageCount = (prelanderId: string) => ctx.tenantTrackingLinks.filter((link) => link.prelanderId === prelanderId).length

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingPrelander) return
    const form = new FormData(event.currentTarget)

    await runEntityAction(ctx, async () => {
      await ctx.fetchJson<Prelander>(`/prelanders/${editingPrelander.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: getFormString(form, 'name'),
          headline: getFormString(form, 'headline'),
          body: getFormString(form, 'body'),
          ctaText: getFormString(form, 'ctaText'),
          ctaDelaySeconds: Number(form.get('ctaDelaySeconds') ?? 0),
          theme: getFormString(form, 'theme'),
          isActive: form.get('isActive') === 'on'
        })
      })
      setEditingPrelanderId(null)
    }, 'Đã cập nhật bridge page')
  }

  async function handleDelete(prelander: Prelander) {
    if (!window.confirm(`Xóa bridge page "${prelander.name}"? Tracking links đang dùng sẽ chuyển về redirect thẳng.`)) return
    await runEntityAction(ctx, async () => {
      await ctx.fetchJson<{ ok: boolean }>(`/prelanders/${prelander.id}`, { method: 'DELETE' })
      if (editingPrelanderId === prelander.id) setEditingPrelanderId(null)
    }, 'Đã xóa bridge page')
  }

  return (
    <div className="content-grid tracking-link-bridge-pages">
      <CreatePrelanderCard ctx={ctx} />
      <Card className="table-card">
        <CardHeader className="section-heading">
          <div>
            <CardTitle><Layers3 size={18} /> Bridge pages</CardTitle>
            <CardDescription>Tạo và quản lý bridge page/prelander để chọn trong từng tracking link.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="table-wrap"><table><thead><tr><th>Name</th><th>Headline</th><th>Theme</th><th>Delay</th><th>Used by</th><th>Status</th><th>Actions</th></tr></thead><tbody>{ctx.tenantPrelanders.map((prelander) => <tr key={prelander.id}><td><strong>{prelander.name}</strong></td><td>{prelander.headline}</td><td>{prelander.theme}</td><td>{prelander.ctaDelaySeconds}s</td><td>{getUsageCount(prelander.id)} links</td><td><Badge variant={prelander.isActive ? 'secondary' : 'outline'}>{prelander.isActive ? 'Active' : 'Inactive'}</Badge></td><td><div className="row-actions"><Button variant="secondary" size="sm" type="button" onClick={() => setEditingPrelanderId(editingPrelanderId === prelander.id ? null : prelander.id)}><Pencil size={14} /> {editingPrelanderId === prelander.id ? 'Hủy' : 'Sửa'}</Button><Button variant="destructive" size="sm" type="button" onClick={() => void handleDelete(prelander)}><Trash2 size={14} /> Xóa</Button></div></td></tr>)}{!ctx.tenantPrelanders.length && <tr><td colSpan={7}>Chưa có bridge page.</td></tr>}</tbody></table></div>
        </CardContent>
      </Card>
      {editingPrelander && (
        <Card className="form-card">
          <CardHeader><CardTitle><Pencil size={18} /> Sửa bridge page</CardTitle><CardDescription>Cập nhật bridge page đang được dùng trong Tracking Links.</CardDescription></CardHeader>
          <CardContent>
            <form key={editingPrelander.id} onSubmit={(event) => void handleEditSubmit(event)}>
              <label><FieldLabel>Name</FieldLabel><Input name="name" defaultValue={editingPrelander.name} required /></label>
              <label><FieldLabel>Headline</FieldLabel><Input name="headline" defaultValue={editingPrelander.headline} required /></label>
              <label><FieldLabel>Body</FieldLabel><Input name="body" defaultValue={editingPrelander.body} required /></label>
              <label><FieldLabel>CTA text</FieldLabel><Input name="ctaText" defaultValue={editingPrelander.ctaText} /></label>
              <label><FieldLabel>Delay seconds</FieldLabel><Input name="ctaDelaySeconds" type="number" min="0" defaultValue={editingPrelander.ctaDelaySeconds} /></label>
              <label><FieldLabel>Theme</FieldLabel><Select name="theme" defaultValue={editingPrelander.theme}><option value="clean">Clean</option><option value="dark">Dark</option><option value="warm">Warm</option></Select></label>
              <label className="checkbox"><input name="isActive" type="checkbox" defaultChecked={editingPrelander.isActive} /> Active</label>
              <Button type="submit">Lưu bridge page</Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
export function TrackingLinkCreatePage({ ctx }: { ctx: DashboardContext }) { const navigate = useNavigate(); return <section className="form-route"><CreateTrackingLinkCard ctx={ctx} onCreated={() => navigate('/tracking-links')} /><Button asChild variant="outline"><NavLink to="/tracking-links">Quay lại danh sách</NavLink></Button></section> }
export function TrackingLinkDetailPage({ ctx }: { ctx: DashboardContext }) {
  const { id = '' } = useParams()
  const link = ctx.tenantTrackingLinks.find((item) => item.id === id)
  if (!link) return <NotFoundEntity name="Tracking link" backPath="/tracking-links" />

  return (
    <EntityDetailCard title={<><Link2 size={18} /> {link.slug}</>} description="Chi tiết tracking link. Mỗi link tự lưu Affiliate URL và affiliate platform." backPath="/tracking-links">
      <DetailGrid>
        <DetailItem label="Tracking Link ID" value={link.id} />
        <DetailItem label="Campaign" value={link.campaign?.name ?? getCampaignName(ctx, link.campaignId)} />
        <DetailItem label="Affiliate platform" value={link.affiliatePlatform?.name ?? link.affiliatePlatformId} />
        <DetailItem label="Affiliate URL" value={<CopyableValue ctx={ctx} value={link.affiliateUrl} label="affiliate URL"><a href={link.affiliateUrl} target="_blank" rel="noreferrer">{link.affiliateUrl}</a></CopyableValue>} />
        <DetailItem label="Bridge page" value={link.prelander?.name ?? (link.prelanderEnabled ? 'Không chọn' : 'Disabled')} />
        <DetailItem label="Shortlink" value={<CopyableValue ctx={ctx} value={getTrackingLinkUrl(link)} label="shortlink"><a href={getTrackingLinkUrl(link)} target="_blank" rel="noreferrer">{getTrackingLinkUrl(link)}</a></CopyableValue>} />
        <DetailItem label="Click webhook" value={<CopyableValue ctx={ctx} value={getTrackingLinkWebhookUrl(link)} label="click webhook URL"><code>{getTrackingLinkWebhookUrl(link)}</code></CopyableValue>} />
        <DetailItem label="Webhook method" value="POST JSON" />
        <DetailItem label="Required body" value="clickUuid optional; nếu không gửi hệ thống tự sinh UUID" />
        <DetailItem label="Auth" value="Gửi token workspace qua query ?token=... hoặc header x-webhook-token" />
        <DetailItem label="Created" value={formatDate(link.createdAt)} />
      </DetailGrid>

      <p className="form-hint">Payload không cần truyền slug/trackingLinkId nữa vì URL đã nằm dưới tracking link này. Có thể gửi thêm fbclid, ttclid, fbp, fbc, ttp, ip, userAgent, referrer, metadata.</p>

      <Card className="form-card webhook-sample-card">
        <CardHeader>
          <CardTitle><Link2 size={18} /> Fetch sample (JS)</CardTitle>
          <CardDescription>Dán mẫu này vào landing page/custom script. Thay <code>YOUR_WORKSPACE_CLICK_WEBHOOK_TOKEN</code> bằng token workspace hoặc chuyển token sang query <code>?token=...</code>.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="copyable-code-block">
            <CopyIconButton ctx={ctx} value={getTrackingLinkWebhookFetchSample(link)} label="fetch sample" />
            <pre className="webhook-code-sample">{getTrackingLinkWebhookFetchSample(link)}</pre>
          </div>
        </CardContent>
      </Card>
    </EntityDetailCard>
  )
}
export function TrackingLinkEditPage({ ctx }: { ctx: DashboardContext }) {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const link = ctx.tenantTrackingLinks.find((item) => item.id === id)
  if (!link) return <NotFoundEntity name="Tracking link" backPath="/tracking-links" />

  const current = link

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)

    await runEntityAction(ctx, async () => {
      await ctx.fetchJson<TrackingLink>('/tracking-links/' + current.id, {
        method: 'PUT',
        body: JSON.stringify({
          campaignId: getFormString(form, 'campaignId'),
          affiliatePlatformId: getFormString(form, 'affiliatePlatformId'),
          affiliateUrl: getFormString(form, 'affiliateUrl'),
          prelanderId: getFormString(form, 'prelanderId'),
          slug: getFormString(form, 'slug'),
          prelanderEnabled: form.get('prelanderEnabled') === 'on',
          isActive: form.get('isActive') === 'on'
        })
      })
      navigate('/tracking-links')
    }, 'Đã cập nhật tracking link')
  }

  return (
    <EntityDetailCard
      title={<><Pencil size={18} /> Sửa tracking link</>}
      description="Cập nhật Affiliate URL/platform trực tiếp trên link."
      backPath="/tracking-links"
    >
      <form className="route-form" onSubmit={(event) => void handleSubmit(event)}>
        <label>
          <FieldLabel>Campaign (optional)</FieldLabel>
          <Select name="campaignId" defaultValue={current.campaignId ?? ''}>
            <option value="">Không chọn campaign</option>
            {ctx.tenantCampaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
            ))}
          </Select>
        </label>

        <label>
          <FieldLabel>Affiliate platform</FieldLabel>
          <Select name="affiliatePlatformId" defaultValue={current.affiliatePlatformId} required>
            {ctx.tenantAffiliatePlatforms.map((platform) => (
              <option key={platform.id} value={platform.id}>{platform.name}</option>
            ))}
          </Select>
        </label>

        <label>
          <FieldLabel>Affiliate URL</FieldLabel>
          <Input name="affiliateUrl" defaultValue={current.affiliateUrl} required />
        </label>

        <label>
          <FieldLabel>Bridge page (optional)</FieldLabel>
          <Select name="prelanderId" defaultValue={current.prelanderId ?? ''}>
            <option value="">Không chọn bridge page</option>
            {ctx.tenantPrelanders.map((prelander) => (
              <option key={prelander.id} value={prelander.id}>{prelander.name}</option>
            ))}
          </Select>
        </label>

        <label>
          <FieldLabel>Slug</FieldLabel>
          <Input name="slug" defaultValue={current.slug} required />
        </label>

        <label className="checkbox">
          <input name="prelanderEnabled" type="checkbox" defaultChecked={current.prelanderEnabled} /> Enable bridge page
        </label>
        <label className="checkbox">
          <input name="isActive" type="checkbox" defaultChecked={current.isActive} /> Active
        </label>

        <Button type="submit" disabled={!ctx.tenantAffiliatePlatforms.length}>Lưu tracking link</Button>
      </form>
    </EntityDetailCard>
  )
}

export function TrackingLinkDeletePage({ ctx }: { ctx: DashboardContext }) { const { id = '' } = useParams(); const navigate = useNavigate(); const link = ctx.tenantTrackingLinks.find((item) => item.id === id); if (!link) return <NotFoundEntity name="Tracking link" backPath="/tracking-links" />; const current = link; async function handleDelete() { await runEntityAction(ctx, async () => { await ctx.fetchJson<{ ok: boolean }>(`/tracking-links/${current.id}`, { method: 'DELETE' }); navigate('/tracking-links') }, 'Đã xóa tracking link') } return <EntityDetailCard title={<><Trash2 size={18} /> Xóa tracking link</>} description="Xác nhận xóa ở URL riêng." backPath="/tracking-links"><div className="danger-zone"><p>Bạn sắp xóa shortlink <strong>{current.slug}</strong>. Click events liên quan có thể bị xóa theo.</p><Button variant="destructive" onClick={() => void handleDelete()}><Trash2 size={16} /> Xác nhận xóa</Button></div></EntityDetailCard> }
