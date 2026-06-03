import { SignInButton, SignedIn, SignedOut } from '@clerk/clerk-react'
import { NavLink } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { ThemeToggle } from '../../components/common/ThemeToggle'
import type { ThemeMode } from '../../types/domain'

const painCards = [
    {
        icon: '📉',
        title: 'Ads platform không thấy conversion thật',
        description: 'Bạn có click, có spend, có CTR, nhưng conversion lại nằm ở affiliate network.'
    },
    {
        icon: '🧩',
        title: 'Không biết ad nào tạo doanh thu',
        description: 'Nếu không map được click với postback conversion, bạn khó biết mẫu ads nào hiệu quả.'
    },
    {
        icon: '⚠️',
        title: 'Pixel/CAPI thiếu dữ liệu chất lượng',
        description: 'Khi không gửi conversion về ads platform, thuật toán khó học đúng tệp người mua.'
    },
    {
        icon: '🎲',
        title: 'Tối ưu dựa trên phỏng đoán',
        description: 'Bạn phải tăng ngân sách, tắt ads hoặc duplicate campaign bằng dữ liệu rời rạc.'
    }
]

const solutionSteps = [
    {
        title: 'Track click từ Facebook & TikTok Ads',
        description: 'Ghi nhận click, source, campaign, adset, ad và các tracking parameter quan trọng.'
    },
    {
        title: 'Gắn Sub ID vào affiliate flow',
        description: 'Mỗi lượt click được gắn Sub ID để affiliate network có thể gửi conversion về đúng phiên tracking.'
    },
    {
        title: 'Nhận conversion từ affiliate network',
        description: 'Nhận postback conversion từ network để biết Sub ID nào tạo ra lead, sale hoặc payout.'
    },
    {
        title: 'Gửi event về CAPI',
        description: 'Đồng bộ dữ liệu conversion chất lượng về Facebook/TikTok để giúp thuật toán tối ưu tốt hơn.'
    }
]

const trackingSteps = [
    {
        title: 'Người dùng click vào ads',
        description: 'Aff Track Pro ghi nhận nguồn traffic từ Facebook Ads hoặc TikTok Ads cùng campaign, adset, ad và các tracking parameter cần thiết.'
    },
    {
        title: 'Chuyển đến affiliate offer',
        description: 'Người dùng được redirect đến affiliate link hoặc landing page. Sub ID được gắn vào link để theo dõi hành trình conversion.'
    },
    {
        title: 'Network gửi postback',
        description: 'Khi có lead, sale hoặc payout, affiliate network gửi conversion về Aff Track Pro kèm Sub ID.'
    },
    {
        title: 'Đối chiếu Sub ID',
        description: 'Hệ thống đối chiếu Sub ID để xác định conversion đến từ nguồn nào, campaign nào và ads nào.'
    },
    {
        title: 'Gửi dữ liệu về CAPI',
        description: 'Conversion sau khi được match sẽ được gửi về Facebook/TikTok để nền tảng quảng cáo tối ưu bằng dữ liệu thật.'
    }
]

const benefits = [
    {
        title: 'Biết ads nào nên scale',
        description: 'Xem chính xác campaign, adset hoặc ad nào tạo ra conversion affiliate, revenue hoặc payout.'
    },
    {
        title: 'Cắt lỗ nhanh hơn',
        description: 'Phát hiện những ads chỉ tạo click nhưng không tạo conversion để tắt sớm và tiết kiệm ngân sách.'
    },
    {
        title: 'Tối ưu thuật toán tốt hơn',
        description: 'Gửi event chất lượng về Facebook/TikTok giúp nền tảng học từ conversion thật.'
    },
    {
        title: 'Đo theo từng nguồn traffic',
        description: 'So sánh hiệu quả giữa Facebook Ads, TikTok Ads và các nguồn traffic khác trong cùng một hệ thống tracking.'
    },
    {
        title: 'Phù hợp affiliate global',
        description: 'Hỗ trợ flow tracking khi chạy offer quốc tế, network quốc tế và nhiều thị trường khác nhau.'
    },
    {
        title: 'Ra quyết định rõ ràng',
        description: 'Dữ liệu attribution giúp bạn biết cần tăng ngân sách, đổi creative hay dừng chiến dịch nào.'
    }
]

const featureCards = [
    { icon: '🖱️', title: 'Click tracking', description: 'Theo dõi từng click từ Facebook Ads, TikTok Ads hoặc nguồn traffic khác.' },
    { icon: '🏷️', title: 'Sub ID tracking', description: 'Gắn Sub ID vào affiliate flow để network gửi conversion về đúng lượt click.' },
    { icon: '🔁', title: 'Affiliate postback', description: 'Nhận lead, sale hoặc payout từ network thông qua postback URL.' },
    { icon: '🎯', title: 'Campaign attribution', description: 'Map conversion về campaign, adset, ad, source và các tracking parameter ban đầu.' },
    { icon: '📡', title: 'Facebook CAPI', description: 'Gửi conversion event về Facebook để cải thiện dữ liệu tối ưu quảng cáo.' },
    { icon: '⚡', title: 'TikTok Events API', description: 'Đồng bộ conversion về TikTok Ads để hỗ trợ thuật toán tối ưu theo event thật.' },
    { icon: '👥', title: 'Team-based data', description: 'Tách dữ liệu theo team, tài khoản hoặc campaign để quản lý rõ ràng hơn.' },
    { icon: '🌍', title: 'Global affiliate ready', description: 'Phù hợp nhiều offer, nhiều network, nhiều quốc gia và nhiều nguồn traffic.' }
]

const useCases = [
    {
        icon: '🧑‍💻',
        title: 'Affiliate media buyer',
        description: 'Bạn chạy Facebook Ads hoặc TikTok Ads để kéo traffic đến affiliate offer và cần biết campaign nào tạo ra lead, sale hoặc payout thật.'
    },
    {
        icon: '🏢',
        title: 'Affiliate team',
        description: 'Bạn quản lý nhiều buyer, nhiều campaign, nhiều offer và cần một hệ thống tracking rõ ràng để theo dõi hiệu quả theo từng nguồn traffic.'
    },
    {
        icon: '📈',
        title: 'Performance marketer',
        description: 'Bạn muốn gửi conversion chất lượng về nền tảng quảng cáo để Facebook/TikTok có dữ liệu tốt hơn cho việc tối ưu và phân phối ads.'
    },
    {
        icon: '🌐',
        title: 'Global offer operator',
        description: 'Bạn chạy nhiều offer quốc tế, nhiều network, nhiều thị trường và cần kết nối dữ liệu giữa traffic source, affiliate network và ads platform.'
    }
]

const beforeItems = [
    'Chỉ thấy click và spend trên Facebook/TikTok',
    'Conversion nằm riêng trong affiliate network',
    'Khó biết campaign hoặc ad nào tạo sale/lead',
    'Không gửi được conversion chất lượng về ads platform',
    'Dễ scale nhầm ads chỉ có chỉ số đẹp nhưng không tạo doanh thu'
]

const afterItems = [
    'Track click từ từng campaign, adset và ad',
    'Nhận conversion từ network qua affiliate postback',
    'Đối chiếu Sub ID để map conversion về đúng nguồn',
    'Gửi event chất lượng về Facebook/TikTok CAPI',
    'Tối ưu ngân sách và scale bằng dữ liệu conversion thật'
]

const faqs = [
    {
        question: 'Aff Track Pro có thay thế affiliate network không?',
        answer: 'Không. Aff Track Pro không thay thế affiliate network. Hệ thống đóng vai trò tracking trung gian, giúp bạn kết nối dữ liệu click từ ads với conversion được gửi về từ affiliate network.'
    },
    {
        question: 'Sub ID dùng để làm gì?',
        answer: 'Sub ID là mã tracking được gắn vào affiliate link để khi network ghi nhận lead, sale hoặc payout, conversion có thể được gửi ngược về Aff Track Pro và map lại đúng nguồn traffic ban đầu.'
    },
    {
        question: 'Tôi có thể dùng cho Facebook Ads không?',
        answer: 'Có. Aff Track Pro hỗ trợ tracking click từ Facebook Ads, ghi nhận các tham số quan trọng và gửi dữ liệu conversion về Facebook CAPI khi conversion được xác nhận.'
    },
    {
        question: 'Tôi có thể dùng cho TikTok Ads không?',
        answer: 'Có. Aff Track Pro có thể tracking traffic từ TikTok Ads và gửi dữ liệu conversion về TikTok thông qua Events API/CAPI tùy cấu hình.'
    },
    {
        question: 'Tại sao cần affiliate postback?',
        answer: 'Vì conversion affiliate thường được xác nhận ở network. Postback giúp network gửi dữ liệu conversion về Aff Track Pro để hệ thống biết Sub ID nào đã tạo ra conversion.'
    },
    {
        question: 'Aff Track Pro có giúp tối ưu ads tốt hơn không?',
        answer: 'Có. Khi conversion thật được map đúng và gửi lại về nền tảng quảng cáo, Facebook/TikTok có dữ liệu chất lượng hơn để tối ưu phân phối ads.'
    }
]

function PrimaryCta({ label, className = '' }: { label: string; className?: string }) {
    return (
        <>
            <SignedIn>
                <NavLink to="/dashboard" className={`lp-btn ${className}`}>
                    Go to dashboard <ArrowRight size={17} />
                </NavLink>
            </SignedIn>
            <SignedOut>
                <SignInButton mode="modal" forceRedirectUrl="/dashboard" signUpForceRedirectUrl="/dashboard">
                    <button type="button" className={`lp-btn ${className}`}>
                        {label} <ArrowRight size={17} />
                    </button>
                </SignInButton>
            </SignedOut>
        </>
    )
}

export function LandingPage({ theme, onToggleTheme }: { theme: ThemeMode; onToggleTheme: () => void }) {
    return (
        <main className="landing2-page shadcn-theme">
            <header className="landing2-header">
                <div className="landing2-container landing2-header-inner">
                    <NavLink to="/" className="landing2-logo" aria-label="Aff Track Pro">
                        <span className="landing2-logo-mark">A</span>
                        <span>Aff Track Pro</span>
                    </NavLink>

                    <nav className="landing2-nav" aria-label="Main navigation">
                        <a href="#solution">Giải pháp</a>
                        <a href="#how-it-works">Cách hoạt động</a>
                        <a href="#features">Tính năng</a>
                        <a href="#faq">FAQ</a>
                    </nav>

                    <div className="landing2-header-actions">
                        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
                        <SignedOut>
                            <SignInButton mode="modal" forceRedirectUrl="/dashboard" signUpForceRedirectUrl="/dashboard">
                                <button type="button" className="lp-btn lp-btn-secondary landing2-login-link">Đăng nhập</button>
                            </SignInButton>
                        </SignedOut>
                        <PrimaryCta label="Bắt đầu" className="lp-btn-primary" />
                    </div>
                </div>
            </header>

            <section className="landing2-hero-section">
                <div className="landing2-container landing2-hero-container">
                    <div className="landing2-hero-content">
                        <div className="landing2-hero-badge">✨ Affiliate conversion tracking for Facebook & TikTok Ads</div>
                        <h1 className="landing2-hero-title">Biết chính xác ads nào tạo ra conversion affiliate.</h1>
                        <p className="landing2-hero-subtitle">
                            Aff Track Pro giúp bạn đo lường chuyển đổi khi chạy affiliate global bằng Facebook Ads và TikTok Ads: tracking click,
                            nhận conversion từ network, map về đúng campaign/ad, rồi gửi dữ liệu chuyển đổi về lại nền tảng quảng cáo để tối ưu bằng dữ liệu thật.
                        </p>

                        <div className="landing2-hero-actions">
                            <PrimaryCta label="Đăng nhập để bắt đầu" className="lp-btn-primary" />
                            <a href="#how-it-works" className="lp-btn lp-btn-secondary">Xem cách hoạt động</a>
                        </div>

                        <div className="landing2-hero-bullets">
                            {['Facebook Ads tracking', 'TikTok Ads tracking', 'Affiliate postback', 'CAPI event matching'].map((item) => (
                                <div className="landing2-hero-bullet" key={item}><span>✓</span>{item}</div>
                            ))}
                        </div>
                    </div>

                    <div className="landing2-hero-visual" aria-label="Affiliate tracking dashboard preview">
                        <div className="landing2-dashboard-shell">
                            <div className="landing2-dashboard-glow" />
                            <div className="landing2-dashboard-card">
                                <div className="landing2-dashboard-header">
                                    <div>
                                        <p>Live tracking</p>
                                        <h3>Affiliate Campaign Performance</h3>
                                    </div>
                                    <span className="landing2-realtime-badge"><span /> Realtime</span>
                                </div>

                                <div className="landing2-campaign-name">Global Offer · Facebook / TikTok Ads</div>

                                <div className="landing2-stats-grid">
                                    <div className="landing2-stat-card landing2-primary-stat"><span>Clicks</span><strong>12,842</strong><small>Tracked from ads</small></div>
                                    <div className="landing2-stat-card"><span>Conversions</span><strong>1,246</strong><small>From affiliate network</small></div>
                                    <div className="landing2-stat-card"><span>CAPI Events</span><strong>1,198</strong><small>Sent back to platforms</small></div>
                                    <div className="landing2-stat-card"><span>Match Rate</span><strong>96.1%</strong><small>Campaign attribution</small></div>
                                </div>

                                <div className="landing2-channel-table">
                                    <div className="landing2-table-row landing2-table-head"><span>Channel</span><span>Conv.</span><span>Revenue</span></div>
                                    <div className="landing2-table-row"><span>Facebook Ads</span><strong>934</strong><strong>$6,180</strong></div>
                                    <div className="landing2-table-row"><span>TikTok Ads</span><strong>251</strong><strong>$1,790</strong></div>
                                    <div className="landing2-table-row"><span>Other</span><strong>61</strong><strong>$450</strong></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="landing2-section landing2-section-soft">
                <div className="landing2-container">
                    <div className="landing2-section-heading center">
                        <div className="landing2-eyebrow">Vấn đề khi chạy affiliate global</div>
                        <h2 className="landing2-section-title">Bạn đang tối ưu ads bằng dữ liệu không đầy đủ.</h2>
                        <p className="landing2-section-description">
                            Khi chạy affiliate global, conversion thường xảy ra bên ngoài website của bạn hoặc được ghi nhận bởi affiliate network.
                            Facebook Ads và TikTok Ads không tự biết chính xác click nào đã tạo ra sale, lead hoặc payout.
                        </p>
                    </div>

                    <div className="landing2-grid-4">
                        {painCards.map((card) => (
                            <article className="landing2-card" key={card.title}>
                                <div className="landing2-card-icon">{card.icon}</div>
                                <h3>{card.title}</h3>
                                <p>{card.description}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="landing2-section" id="solution">
                <div className="landing2-container landing2-solution-wrap">
                    <div className="landing2-sticky-copy">
                        <div className="landing2-eyebrow">Giải pháp</div>
                        <h2 className="landing2-section-title">Kết nối dữ liệu ads, click và affiliate conversion vào một luồng tracking thống nhất.</h2>
                        <p className="landing2-section-description">
                            Mỗi click từ Facebook Ads hoặc TikTok Ads được Aff Track Pro ghi nhận cùng các tham số như campaign, adset, ad, fbclid, ttclid và Sub ID.
                            Khi affiliate network gửi conversion qua postback, hệ thống sẽ map conversion đó về đúng nguồn traffic ban đầu.
                        </p>
                    </div>

                    <div className="landing2-feature-list">
                        {solutionSteps.map((step, index) => (
                            <article className="landing2-feature-item" key={step.title}>
                                <div className="landing2-feature-number">{index + 1}</div>
                                <div>
                                    <h3>{step.title}</h3>
                                    <p>{step.description}</p>
                                </div>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="landing2-section landing2-section-soft" id="how-it-works">
                <div className="landing2-container">
                    <div className="landing2-section-heading center">
                        <div className="landing2-eyebrow">Quy trình tracking</div>
                        <h2 className="landing2-section-title">Aff Track Pro đo conversion affiliate như thế nào?</h2>
                        <p className="landing2-section-description">
                            Từ lúc người dùng click vào quảng cáo đến khi affiliate network ghi nhận conversion, Aff Track Pro giúp kết nối toàn bộ dữ liệu bằng Sub ID.
                        </p>
                    </div>

                    <div className="landing2-steps">
                        {trackingSteps.map((step, index) => (
                            <article className="landing2-step" key={step.title}>
                                <div className="landing2-step-count">{index + 1}</div>
                                <h3>{step.title}</h3>
                                <p>{step.description}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="landing2-section landing2-section-dark">
                <div className="landing2-container">
                    <div className="landing2-section-heading center">
                        <div className="landing2-eyebrow">Lợi ích khi tracking đúng</div>
                        <h2 className="landing2-section-title">Tối ưu và scale affiliate campaign bằng conversion thật.</h2>
                        <p className="landing2-section-description">
                            Không cần đoán. Bạn có dữ liệu để biết nên tăng ngân sách, đổi creative, tắt adset hay nhân rộng campaign nào.
                        </p>
                    </div>

                    <div className="landing2-grid-3">
                        {benefits.map((benefit) => (
                            <article className="landing2-benefit-card" key={benefit.title}>
                                <h3>{benefit.title}</h3>
                                <p>{benefit.description}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="landing2-section landing2-section-soft" id="features">
                <div className="landing2-container">
                    <div className="landing2-section-heading center">
                        <div className="landing2-eyebrow">Tính năng nổi bật</div>
                        <h2 className="landing2-section-title">Những gì bạn cần để đo conversion affiliate từ paid ads.</h2>
                        <p className="landing2-section-description">
                            Aff Track Pro tập trung vào các tính năng quan trọng nhất cho affiliate marketer: tracking click, Sub ID, postback, attribution và gửi event về nền tảng quảng cáo.
                        </p>
                    </div>

                    <div className="landing2-grid-4">
                        {featureCards.map((card) => (
                            <article className="landing2-card landing2-feature-card-small" key={card.title}>
                                <div className="landing2-card-icon">{card.icon}</div>
                                <h3>{card.title}</h3>
                                <p>{card.description}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="landing2-section">
                <div className="landing2-container">
                    <div className="landing2-section-heading center">
                        <div className="landing2-eyebrow">Đối tượng phù hợp</div>
                        <h2 className="landing2-section-title">Phù hợp cho team đang chạy affiliate global bằng paid ads.</h2>
                        <p className="landing2-section-description">
                            Aff Track Pro được thiết kế cho những cá nhân và đội nhóm cần đo conversion affiliate từ Facebook Ads, TikTok Ads và các nguồn traffic trả phí khác.
                        </p>
                    </div>

                    <div className="landing2-grid-2">
                        {useCases.map((card) => (
                            <article className="landing2-card landing2-use-card" key={card.title}>
                                <div className="landing2-card-icon">{card.icon}</div>
                                <h3>{card.title}</h3>
                                <p>{card.description}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="landing2-section landing2-section-soft">
                <div className="landing2-container">
                    <div className="landing2-section-heading center">
                        <div className="landing2-eyebrow">Khác biệt khi có tracking đúng</div>
                        <h2 className="landing2-section-title">Từ dữ liệu rời rạc đến quyết định scale rõ ràng.</h2>
                        <p className="landing2-section-description">
                            Khi conversion affiliate được map đúng về campaign, adset và ad, bạn không còn phải tối ưu dựa trên cảm tính hay dữ liệu thiếu attribution.
                        </p>
                    </div>

                    <div className="landing2-compare-wrap">
                        <article className="landing2-compare-card">
                            <h3>Khi chưa có Aff Track Pro</h3>
                            <ul>
                                {beforeItems.map((item) => <li key={item}><span>✕</span>{item}</li>)}
                            </ul>
                        </article>
                        <article className="landing2-compare-card dark">
                            <h3>Khi dùng Aff Track Pro</h3>
                            <ul>
                                {afterItems.map((item) => <li key={item}><span>✓</span>{item}</li>)}
                            </ul>
                        </article>
                    </div>
                </div>
            </section>

            <section className="landing2-section" id="faq">
                <div className="landing2-container">
                    <div className="landing2-section-heading center">
                        <div className="landing2-eyebrow">Câu hỏi thường gặp</div>
                        <h2 className="landing2-section-title">Những điều cần biết trước khi dùng Aff Track Pro.</h2>
                    </div>

                    <div className="landing2-faq-list">
                        {faqs.map((faq) => (
                            <details key={faq.question}>
                                <summary>{faq.question}</summary>
                                <p>{faq.answer}</p>
                            </details>
                        ))}
                    </div>
                </div>
            </section>

            <section className="landing2-section landing2-section-dark">
                <div className="landing2-container">
                    <div className="landing2-final-cta">
                        <h2>Sẵn sàng đo conversion affiliate chính xác hơn?</h2>
                        <p>
                            Bắt đầu tracking click, nhận conversion từ affiliate network và gửi dữ liệu chất lượng về Facebook/TikTok để scale campaign bằng dữ liệu thật.
                        </p>
                        <div className="landing2-hero-actions">
                            <PrimaryCta label="Đăng nhập để bắt đầu" className="lp-btn-light" />
                            <a href="#how-it-works" className="lp-btn lp-btn-secondary">Xem cách hoạt động</a>
                        </div>
                    </div>
                </div>
            </section>

            <footer className="landing2-footer">
                <div className="landing2-container landing2-footer-inner">
                    <div>© 2026 Aff Track Pro. All rights reserved.</div>
                    <div>Affiliate conversion tracking for Facebook & TikTok Ads.</div>
                </div>
            </footer>
        </main>
    )
}
