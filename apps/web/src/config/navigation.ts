import { BarChart3, Building2, Crown, Globe2, HelpCircle, Home, KeyRound, Layers3, Link2, Megaphone, MousePointerClick, ScrollText, Settings, ShieldCheck, WalletCards } from 'lucide-react'
import type { NavGroup } from '../types/domain'

export const navGroups: NavGroup[] = [
  {
    label: 'Platform',
    items: [
      { path: '/dashboard', label: 'Overview', icon: Home, featureKey: 'dashboard' },
      { path: '/campaigns', label: 'Campaigns', icon: Megaphone, featureKey: 'campaigns' },
      { path: '/platforms', label: 'Affiliate Platforms', icon: Globe2, featureKey: 'platforms' },
      { path: '/brands', label: 'Brands / Offers', icon: Building2, featureKey: 'brands' },
      { path: '/datasets', label: 'Datasets', icon: ShieldCheck, featureKey: 'datasets' }
    ]
  },
  {
    label: 'Tracking',
    items: [
      { path: '/prelanders', label: 'Prelanders', icon: Layers3, featureKey: 'prelanders' },
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
      { path: '/billing', label: 'Billing', icon: WalletCards, featureKey: 'billing' },
      { path: '/api-keys', label: 'API Keys', icon: KeyRound, featureKey: 'api-keys' },
      { path: '/settings', label: 'Settings', icon: Settings, featureKey: 'settings' },
      { path: '/support', label: 'Support', icon: HelpCircle, featureKey: 'support' }
    ]
  }
]

export const pageMeta: Record<string, { title: string; description: string }> = {
  '/dashboard': { title: 'Dashboard', description: 'Monitor affiliate performance and workspace activity.' },
  '/campaigns': { title: 'Campaigns', description: 'Create campaigns and select configured dataset.' },
  '/brands': { title: 'Brands / Offers', description: 'Manage campaign offers and their affiliate URLs.' },
  '/platforms': { title: 'Affiliate Platforms', description: 'Manage affiliate networks, tracking param keys and webhooks.' },
  '/datasets': { title: 'Datasets', description: 'Manage Meta/TikTok datasets in one place.' },
  '/prelanders': { title: 'Prelanders', description: 'Create branded bridge pages before redirecting visitors to offers.' },
  '/tracking-links': { title: 'Tracking Links', description: 'Create shortlinks that append click UUID into each platform parameter.' },
  '/click-events': { title: 'Click Events', description: 'Review latest captured click events.' },
  '/logs': { title: 'Activity Logs', description: 'Theo dõi click, prelanding, webhook affiliate, CAPI và thay đổi cấu hình.' },
  '/analytics': { title: 'Analytics', description: 'Attribution and traffic insights.' },
  '/billing': { title: 'Billing', description: 'Plan, usage quota and invoices.' },
  '/api-keys': { title: 'API Keys', description: 'Reveal, copy and rotate workspace webhook tokens.' },
  '/settings': { title: 'Settings', description: 'Workspace and integration settings.' },
  '/support': { title: 'Support', description: 'Thông tin hỗ trợ, hotline và pháp lý doanh nghiệp.' },
  '/superadmin': { title: 'Super Admin', description: 'Quản lý các tài khoản đã đăng ký và workspace tương ứng.' }
}
