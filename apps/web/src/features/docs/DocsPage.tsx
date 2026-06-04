import { NavLink } from 'react-router'
import { BookOpen, CheckCircle2, Code2, ExternalLink, Globe2, Link2, Megaphone, MousePointerClick, Route, ShieldCheck } from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'

const quickLinks = [
    { label: 'Tạo campaign', path: '/campaigns/new', icon: Megaphone },
    { label: 'Tạo dataset', path: '/datasets/new', icon: ShieldCheck },
    { label: 'Thêm website', path: '/websites', icon: Globe2 },
    { label: 'Thêm affiliate platform', path: '/platforms/new', icon: Route },
    { label: 'Tạo tracking link', path: '/tracking-links/new', icon: Link2 }
]

const workflow = [
    'Tạo Dataset',
    'Tạo Campaign',
    'Gắn Dataset vào Campaign',
    'Thêm Data Source',
    'Tạo Tracking Link',
    'Nhận Click/Postback và gửi Purchase'
]

const campaignDatasetSteps = [
    'Vào Datasets → Thêm dataset để khai báo pixel/dataset cần gửi event. Chọn nền tảng Meta hoặc TikTok, nhập tên dễ nhớ, Pixel ID và Access Token.',
    'Vào Campaigns → Thêm campaign để tạo nhóm chạy. Campaign là nơi chứa/gom nhóm dataset, không phải nơi nhập Affiliate URL.',
    'Mở chi tiết campaign vừa tạo, tại khối Campaign datasets tích chọn các dataset cần chạy rồi bấm Lưu datasets.',
    'Khi tạo Tracking Link, chọn campaign này để hệ thống biết link đang dùng bộ/nhóm dataset nào để gửi CAPI/EAPI.'
]

const websiteSteps = [
    'Vào Websites và copy mã tracking trong khối Mã tracking.',
    'Dán đoạn script vào thẻ <head> của website/landing page cần tracking, nên đặt trước </head>.',
    'Thêm domain vào Website domains để whitelist. Script chỉ được kích hoạt trên domain đã thêm.',
    'Sau khi kích hoạt, script sẽ theo dõi click thật, gắn click id vào Affiliate URL/Shortlink và hỗ trợ thu thập cookie phục vụ attribution.'
]

const affiliatePlatformSteps = [
    'Vào Affiliate Platforms → Thêm platform, chọn nền tảng affiliate đang dùng như Impact, PartnerStack hoặc First Promo.',
    'Sau khi tạo, copy Webhook URL/Endpoint của platform trong danh sách hoặc trang chi tiết.',
    'Dán endpoint này vào phần postback/webhook của nền tảng affiliate.',
    'Mục tiêu là nhận postback conversion/purchase từ sàn affiliate về hệ thống, match với click UUID và gửi Purchase về các dataset của campaign.'
]

const trackingLinkSteps = [
    'Chọn Campaign: đây là nhóm dataset mà tracking link sẽ sử dụng khi gửi CAPI/EAPI.',
    'Chọn Affiliate platform: hệ thống dùng platform này để xác định rule param, tracking param key, UUID/click id và mapping postback.',
    'Điền Affiliate URL: đây là URL offer/đích từ sàn affiliate. Hệ thống sẽ gắn tham số tracking phù hợp khi redirect.',
    'Điền Slug: slug tạo shortlink công khai và rất quan trọng vì được dùng làm content_ids khi gửi CAPI/EAPI. Nên đặt ngắn, ổn định và đúng nội dung offer.',
    'Kích hoạt Bridge page nếu cần trang trung gian. Có thể tùy chỉnh title, mô tả/headline, body, CTA, delay và theme. Bridge page là nơi gắn pixel, thu thập thêm cookie/giá trị attribution rồi 301 tới trang đích.'
]

function StepList({ steps }: { steps: string[] }) {
    return (
        <ol className="docs-step-list">
            {steps.map((step, index) => (
                <li key={step}>
                    <span className="docs-step-index">{index + 1}</span>
                    <p>{step}</p>
                </li>
            ))}
        </ol>
    )
}

export function DocsPage() {
    return (
        <section className="docs-page">
            <Card className="page-card docs-hero-card">
                <CardHeader>
                    <Badge variant="secondary" className="docs-eyebrow"><BookOpen size={14} /> User guide</Badge>
                    <CardTitle>Hướng dẫn sử dụng Aff Track Pro</CardTitle>
                    <CardDescription>
                        Tài liệu ngắn cho toàn bộ user: chuẩn bị dataset/campaign, thêm data source và tạo tracking link để nhận click, postback và gửi purchase.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="docs-flow" aria-label="Luồng cài đặt tracking">
                        {workflow.map((item, index) => (
                            <div className="docs-flow-item" key={item}>
                                <span>{index + 1}</span>
                                <strong>{item}</strong>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <div className="docs-quick-grid">
                {quickLinks.map((item) => {
                    const Icon = item.icon
                    return (
                        <Button key={item.path} asChild variant="outline" className="docs-quick-link">
                            <NavLink to={item.path}><Icon size={16} /> {item.label}</NavLink>
                        </Button>
                    )
                })}
            </div>

            <section className="docs-section-grid">
                <Card id="campaign-dataset" className="page-card docs-card">
                    <CardHeader>
                        <CardTitle><Megaphone size={18} /> 1. Campaign, Dataset và cách nối dataset vào campaign</CardTitle>
                        <CardDescription>
                            Campaign là nơi chứa/gom nhóm dataset. Khi tạo tracking link, bạn chọn campaign để xác định bộ dataset nào sẽ được dùng để chạy và gửi event.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <StepList steps={campaignDatasetSteps} />
                        <div className="docs-note">
                            <CheckCircle2 size={17} />
                            <p><strong>Gợi ý:</strong> đặt tên campaign theo offer hoặc nhóm traffic, ví dụ “Impact - Offer A - VN”, để khi tạo link dễ chọn đúng bộ dataset.</p>
                        </div>
                        <div className="button-row docs-actions">
                            <Button asChild size="sm"><NavLink to="/datasets/new">Tạo dataset</NavLink></Button>
                            <Button asChild size="sm" variant="outline"><NavLink to="/campaigns/new">Tạo campaign</NavLink></Button>
                        </div>
                    </CardContent>
                </Card>

                <Card id="data-sources" className="page-card docs-card">
                    <CardHeader>
                        <CardTitle><Globe2 size={18} /> 2. Thêm data source</CardTitle>
                        <CardDescription>
                            Data source gồm website/landing được gắn script tracking và affiliate platform nhận postback từ sàn affiliate.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="docs-subsection">
                            <h4><Code2 size={16} /> Website tracking</h4>
                            <StepList steps={websiteSteps} />
                        </div>
                        <div className="docs-subsection">
                            <h4><Route size={16} /> Affiliate platform webhook</h4>
                            <StepList steps={affiliatePlatformSteps} />
                        </div>
                        <div className="button-row docs-actions">
                            <Button asChild size="sm"><NavLink to="/websites">Lấy mã website</NavLink></Button>
                            <Button asChild size="sm" variant="outline"><NavLink to="/platforms/new">Tạo affiliate platform</NavLink></Button>
                        </div>
                    </CardContent>
                </Card>

                <Card id="tracking-link" className="page-card docs-card">
                    <CardHeader>
                        <CardTitle><Link2 size={18} /> 3. Tạo tracking link</CardTitle>
                        <CardDescription>
                            Tracking link là shortlink dùng để chạy traffic, gắn click UUID vào Affiliate URL, thu thập dữ liệu bridge page và phục vụ attribution.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <StepList steps={trackingLinkSteps} />
                        <div className="docs-note docs-warning-note">
                            <MousePointerClick size={17} />
                            <p><strong>Lưu ý slug:</strong> slug nên ổn định sau khi chạy quảng cáo vì nó được dùng như content_ids khi gửi CAPI/EAPI. Đổi slug giữa chiến dịch có thể làm dữ liệu khó đối soát.</p>
                        </div>
                        <div className="button-row docs-actions">
                            <Button asChild size="sm"><NavLink to="/tracking-links/new">Tạo tracking link</NavLink></Button>
                            <Button asChild size="sm" variant="outline"><NavLink to="/tracking-links">Xem danh sách link</NavLink></Button>
                        </div>
                    </CardContent>
                </Card>

                <Card className="page-card docs-card docs-checklist-card">
                    <CardHeader>
                        <CardTitle><CheckCircle2 size={18} /> Checklist trước khi chạy</CardTitle>
                        <CardDescription>Kiểm tra nhanh để giảm lỗi tracking và attribution.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ul className="docs-checklist">
                            <li><CheckCircle2 size={16} /> Dataset đã active và có đúng Pixel ID/Access Token.</li>
                            <li><CheckCircle2 size={16} /> Campaign đã gắn đúng nhóm dataset.</li>
                            <li><CheckCircle2 size={16} /> Website đã dán script vào head và domain đã whitelist.</li>
                            <li><CheckCircle2 size={16} /> Affiliate platform đã copy đúng webhook endpoint lên sàn affiliate.</li>
                            <li><CheckCircle2 size={16} /> Tracking link có campaign, platform, Affiliate URL và slug đúng nội dung offer.</li>
                        </ul>
                        <p className="empty-state docs-final-note">
                            Sau khi chạy thử, hãy kiểm tra Analytics và Activity Logs để xác nhận click/postback/purchase được ghi nhận đúng.
                        </p>
                        <div className="button-row docs-actions">
                            <Button asChild size="sm" variant="outline"><NavLink to="/analytics">Kiểm tra analytics <ExternalLink size={14} /></NavLink></Button>
                            <Button asChild size="sm" variant="outline"><NavLink to="/logs">Xem logs <ExternalLink size={14} /></NavLink></Button>
                        </div>
                    </CardContent>
                </Card>
            </section>
        </section>
    )
}
