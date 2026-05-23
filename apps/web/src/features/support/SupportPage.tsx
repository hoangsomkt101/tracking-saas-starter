import { Building2, ExternalLink, HelpCircle, Mail, Phone } from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'

const businessRegistryUrl = 'https://thuvienphapluat.vn/ma-so-thue/cong-ty-tnhh-digital-business-group-mst-0901238907.html'

export function SupportPage() {
    return (
        <section className="single-page-grid support-page">
            <Card className="table-card">
                <CardHeader>
                    <CardTitle><HelpCircle size={18} /> Support</CardTitle>
                    <CardDescription>Liên hệ đội ngũ Aff Track Pro khi cần hỗ trợ vận hành tracking, webhook, CAPI hoặc cấu hình tài khoản.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="support-contact-grid">
                        <a className="support-contact-card" href="tel:0346108999">
                            <span><Phone size={17} /> Hotline 1</span>
                            <strong>0346 108 999</strong>
                            <small>Nhấn để gọi trực tiếp</small>
                        </a>
                        <a className="support-contact-card" href="tel:0389625845">
                            <span><Phone size={17} /> Hotline 2</span>
                            <strong>0389 625 845</strong>
                            <small>Hỗ trợ kỹ thuật và onboarding</small>
                        </a>
                        <a className="support-contact-card" href="mailto:support@afftrackpro.com">
                            <span><Mail size={17} /> Email</span>
                            <strong>support@afftrackpro.com</strong>
                            <small>Gửi yêu cầu hỗ trợ chi tiết</small>
                        </a>
                    </div>
                </CardContent>
            </Card>

            <Card className="table-card">
                <CardHeader>
                    <CardTitle><Building2 size={18} /> Thông tin doanh nghiệp</CardTitle>
                    <CardDescription>Thông tin pháp lý của đơn vị vận hành/dịch vụ.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="business-info-card">
                        <div>
                            <span>Tên doanh nghiệp</span>
                            <strong>CÔNG TY TNHH DIGITAL BUSINESS GROUP</strong>
                        </div>
                        <div>
                            <span>Mã số thuế</span>
                            <strong>0901238907</strong>
                        </div>
                        <div>
                            <span>Nguồn tham khảo</span>
                            <a href={businessRegistryUrl} target="_blank" rel="noreferrer">Thư Viện Pháp Luật <ExternalLink size={14} /></a>
                        </div>
                        <div>
                            <span>Trạng thái</span>
                            <Badge variant="secondary">Đã công bố</Badge>
                        </div>
                    </div>
                    <div className="button-row support-actions">
                        <Button type="button" asChild>
                            <a href={businessRegistryUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Xem thông tin doanh nghiệp</a>
                        </Button>
                        <Button type="button" variant="outline" asChild>
                            <a href="tel:0346108999"><Phone size={16} /> Gọi hỗ trợ</a>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </section>
    )
}
