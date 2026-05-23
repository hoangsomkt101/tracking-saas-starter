import { SignInButton, SignedIn, SignedOut } from '@clerk/clerk-react'
import { NavLink } from 'react-router'
import { ArrowRight, BarChart3, CheckCircle2, Command, Link2, MousePointerClick, ShieldCheck, Sparkles, Zap } from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { ThemeToggle } from '../../components/common/ThemeToggle'
import type { ThemeMode } from '../../types/domain'

const trackingFeatures = [
    {
        icon: Link2,
        title: 'Shortlink có tracking UUID',
        description: 'Tạo link ngắn theo khu vực làm việc, tự gắn click UUID vào affiliate URL để không mất attribution.'
    },
    {
        icon: MousePointerClick,
        title: 'Click log theo thời gian thực',
        description: 'Ghi nhận nguồn traffic, campaign, offer, referrer và các tham số quảng cáo quan trọng.'
    },
    {
        icon: ShieldCheck,
        title: 'Postback & CAPI delivery',
        description: 'Nhận conversion từ affiliate network và đẩy event sạch về Meta/TikTok dataset.'
    }
]

const desireMetrics = [
    { label: 'Click captured', value: '100%', note: 'Không rơi mất click khi redirect' },
    { label: 'Conversion mapping', value: '1:1', note: 'Map đúng campaign, offer, network' },
    { label: 'CAPI status', value: 'Live', note: 'Theo dõi delivered/failed rõ ràng' }
]

export function LandingPage({ theme, onToggleTheme }: { theme: ThemeMode; onToggleTheme: () => void }) {
    return (
        <main className="landing-page shadcn-theme">
            <div className="landing-page-glow" aria-hidden="true" />

            <header className="landing-header">
                <NavLink to="/" className="landing-brand">
                    <span className="landing-brand-mark"><Command size={18} /></span>
                    <span>Aff Track Pro</span>
                </NavLink>
                <div className="landing-header-actions">
                    <ThemeToggle theme={theme} onToggle={onToggleTheme} />
                    <SignedIn>
                        <Button asChild size="sm">
                            <NavLink to="/dashboard">Go to dashboard <ArrowRight size={15} /></NavLink>
                        </Button>
                    </SignedIn>
                    <SignedOut>
                        <SignInButton mode="modal" forceRedirectUrl="/dashboard" signUpForceRedirectUrl="/dashboard">
                            <Button type="button" size="sm">Sign in <ArrowRight size={15} /></Button>
                        </SignInButton>
                    </SignedOut>
                </div>
            </header>

            <section className="marketing-hero">
                <div className="marketing-hero-copy">
                    <Badge variant="secondary" className="hero-badge"><Sparkles size={14} /> AIDA tracking system for affiliates</Badge>
                    <p className="aida-eyebrow">Attention</p>
                    <h1>Đừng tối ưu ads bằng dữ liệu bị thiếu.</h1>
                    <p className="hero-copy">
                        Dịch vụ tracking giúp bạn đo click, gắn attribution, nhận conversion từ network và gửi event chất lượng về Meta/TikTok CAPI — tất cả trong một dashboard riêng cho từng tài khoản.
                    </p>
                    <div className="landing-hero-actions">
                        <SignedIn>
                            <Button asChild size="lg" className="hero-button">
                                <NavLink to="/dashboard">Go to dashboard <ArrowRight size={18} /></NavLink>
                            </Button>
                        </SignedIn>
                        <SignedOut>
                            <SignInButton mode="modal" forceRedirectUrl="/dashboard" signUpForceRedirectUrl="/dashboard">
                                <Button type="button" size="lg" className="hero-button">Đăng nhập để bắt đầu <ArrowRight size={18} /></Button>
                            </SignInButton>
                        </SignedOut>
                        <a href="#how-it-works" className="landing-text-link">Xem cách hoạt động</a>
                    </div>
                    <div className="landing-proof-list" aria-label="Tracking benefits">
                        <span><CheckCircle2 size={16} /> Tách dữ liệu theo team</span>
                        <span><CheckCircle2 size={16} /> Affiliate postback</span>
                        <span><CheckCircle2 size={16} /> Meta/TikTok CAPI</span>
                    </div>
                </div>

                <div className="tracking-preview-card" aria-label="Tracking dashboard preview">
                    <div className="preview-topbar">
                        <div>
                            <p>Live tracking</p>
                            <strong>Campaign performance</strong>
                        </div>
                        <Badge variant="outline">Realtime</Badge>
                    </div>
                    <div className="preview-funnel">
                        <div className="preview-funnel-row">
                            <span>Clicks</span>
                            <strong>12,842</strong>
                            <div><span style={{ width: '100%' }} /></div>
                        </div>
                        <div className="preview-funnel-row">
                            <span>Conversions</span>
                            <strong>1,246</strong>
                            <div><span style={{ width: '62%' }} /></div>
                        </div>
                        <div className="preview-funnel-row">
                            <span>CAPI delivered</span>
                            <strong>1,198</strong>
                            <div><span style={{ width: '58%' }} /></div>
                        </div>
                    </div>
                    <div className="preview-event-card">
                        <Zap size={17} />
                        <div>
                            <strong>Click UUID matched</strong>
                            <span>fbclid/ttclid + postback payload đã được map về đúng campaign.</span>
                        </div>
                    </div>
                </div>
            </section>

            <section id="how-it-works" className="aida-section">
                <div className="section-kicker">Interest</div>
                <div className="landing-section-heading">
                    <h2>Từ click đến conversion, bạn thấy toàn bộ đường đi.</h2>
                    <p>Không chỉ tạo shortlink. Hệ thống giúp bạn gom dữ liệu tracking, campaign, offer, affiliate platform và dataset CAPI vào một luồng rõ ràng.</p>
                </div>
                <div className="landing-feature-grid">
                    {trackingFeatures.map((feature) => {
                        const Icon = feature.icon
                        return (
                            <article className="landing-feature-card" key={feature.title}>
                                <div className="feature-icon"><Icon size={19} /></div>
                                <h3>{feature.title}</h3>
                                <p>{feature.description}</p>
                            </article>
                        )
                    })}
                </div>
            </section>

            <section className="aida-section landing-desire-grid">
                <div className="desire-copy">
                    <div className="section-kicker">Desire</div>
                    <h2>Biết chính xác campaign nào đang tạo tiền.</h2>
                    <p>
                        Khi click, conversion và CAPI status được nối với nhau, bạn có thể ra quyết định nhanh hơn: giữ campaign thắng, tắt traffic kém, xử lý event lỗi và tối ưu dataset quảng cáo.
                    </p>
                    <ul className="landing-check-list">
                        <li><CheckCircle2 size={17} /> Xem offer/network nào đang mang lại conversion.</li>
                        <li><CheckCircle2 size={17} /> Theo dõi CAPI delivered/failed để không mất tín hiệu tối ưu.</li>
                        <li><CheckCircle2 size={17} /> Tách dữ liệu theo khu vực làm việc, phù hợp vận hành nhiều team hoặc nhiều thương hiệu.</li>
                    </ul>
                </div>
                <div className="desire-metrics-card">
                    <div className="metrics-card-header"><BarChart3 size={18} /> Attribution snapshot</div>
                    {desireMetrics.map((metric) => (
                        <div className="desire-metric" key={metric.label}>
                            <div>
                                <span>{metric.label}</span>
                                <small>{metric.note}</small>
                            </div>
                            <strong>{metric.value}</strong>
                        </div>
                    ))}
                </div>
            </section>

            <section className="landing-cta-panel">
                <div>
                    <div className="section-kicker">Action</div>
                    <h2>Bắt đầu tracking nghiêm túc cho affiliate business của bạn.</h2>
                    <p>Tạo khu vực làm việc, cấu hình affiliate platform, dataset và shortlink đầu tiên trong vài phút.</p>
                </div>
                <div className="landing-cta-actions">
                    <SignedIn>
                        <Button asChild size="lg">
                            <NavLink to="/dashboard">Go to dashboard <ArrowRight size={18} /></NavLink>
                        </Button>
                    </SignedIn>
                    <SignedOut>
                        <SignInButton mode="modal" forceRedirectUrl="/dashboard" signUpForceRedirectUrl="/dashboard">
                            <Button type="button" size="lg">Sign in để bắt đầu <ArrowRight size={18} /></Button>
                        </SignInButton>
                    </SignedOut>
                </div>
            </section>
        </main>
    )
}
