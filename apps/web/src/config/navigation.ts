import { BarChart3, Crown, Globe2, HelpCircle, Home, Link2, Megaphone, MousePointerClick, ScrollText, Settings, ShieldCheck } from 'lucide-react'
import type { NavGroup } from '../types/domain'

export const navGroups: NavGroup[] = [
  {
    label: 'Platform',
    items: [
      { path: '/dashboard', label: 'Overview', icon: Home, featureKey: 'dashboard' },
      { path: '/campaigns', label: 'Campaigns', icon: Megaphone, featureKey: 'campaigns' },
      { path: '/datasets', label: 'Datasets', icon: ShieldCheck, featureKey: 'datasets' }
    ]
  },
  {
    label: 'Data Sources',
    items: [
      { path: '/settings', label: 'Websites', icon: Settings, featureKey: 'settings' },
      { path: '/platforms', label: 'Affiliate Platforms', icon: Globe2, featureKey: 'platforms' }
    ]
  },
  {
    label: 'Tracking',
    items: [
      { path: '/tracking-links', label: 'Tracking Links', icon: Link2, featureKey: 'tracking-links' },
      { path: '/click-events', label: 'Click Events', icon: MousePointerClick, badge: 'Manual', featureKey: 'click-events' },
      { path: '/logs', label: 'Activity Logs', icon: ScrollText, featureKey: 'activity-logs' },
      { path: '/analytics', label: 'Analytics', icon: BarChart3, featureKey: 'analytics' }
    ]
  },
  {
    label: 'Admin',
    items: [
      { path: '/superadmin', label: 'Super Admin', icon: Crown, badge: 'Root', featureKey: 'superadmin' }
    ]
  },
  {
    label: 'Account',
    items: [
      { path: '/support', label: 'Support', icon: HelpCircle, featureKey: 'support' }
    ]
  }
]

export type PageMeta = {
  title: string
  description: string
  primaryAction?: {
    path: string
    label: string
  }
}

export const pageMeta: Record<string, PageMeta> = {
  '/dashboard': { title: 'Dashboard', description: 'Monitor affiliate performance and workspace activity.' },
  '/campaigns': { title: 'Campaigns', description: 'Create campaigns and select configured dataset.', primaryAction: { path: '/campaigns/new', label: 'Thêm campaign' } },
  '/platforms': { title: 'Affiliate Platforms', description: 'Manage supported affiliate networks and webhooks.', primaryAction: { path: '/platforms/new', label: 'Thêm platform' } },
  '/datasets': { title: 'Datasets', description: 'Manage Meta/TikTok datasets in one place.', primaryAction: { path: '/datasets/new', label: 'Thêm dataset' } },
  '/tracking-links': { title: 'Tracking Links', description: 'Create shortlinks with direct Affiliate URL, platform selection and bridge page settings.', primaryAction: { path: '/tracking-links/new', label: 'Thêm link' } },
  '/click-events': { title: 'Click Events', description: 'Review latest captured click events.' },
  '/logs': { title: 'Activity Logs', description: 'Theo dõi click, prelanding, webhook affiliate, CAPI và thay đổi cấu hình.' },
  '/analytics': { title: 'Analytics', description: 'Attribution and traffic insights.' },
  '/billing': { title: 'Billing', description: 'Plan, usage quota and invoices.' },
  '/settings': { title: 'Websites', description: 'Quét Affiliate URL và Shortlink trên website đã gắn mã tracking.' },
  '/support': { title: 'Support', description: 'Thông tin hỗ trợ, hotline và pháp lý doanh nghiệp.' },
  '/superadmin': { title: 'Super Admin', description: 'Quản lý các tài khoản đã đăng ký và workspace tương ứng.' }
}
