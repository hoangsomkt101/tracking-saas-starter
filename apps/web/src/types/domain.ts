import type { LucideIcon } from 'lucide-react'

export type MenuFeature = {
  id: string
  key: string
  path: string
  label: string
  group: string
  icon: string
  badge?: string | null
  description?: string | null
  sortOrder: number
  isCore: boolean
  isActive: boolean
}

export type TenantMenuGrant = {
  id: string
  tenantId: string
  menuFeatureId: string
  isEnabled: boolean
  menuFeature: MenuFeature
}

export type BillingPlan = {
  id: string
  slug: string
  name: string
  description?: string | null
  monthlyPriceCents: number
  currency: string
  clickLimit: number
  capiEventLimit: number
  eapiEventLimit: number
  campaignDatasetLimit: number
  isDefault: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type Tenant = {
  id: string
  name: string
  slug: string
  publicKey: string
  clickWebhookToken: string
  billingPlanId?: string | null
  billingPlan?: BillingPlan | null
  menuGrants?: TenantMenuGrant[]
  createdAt: string
}

export type CampaignDataset = {
  id: string
  tenantId: string
  campaignId: string
  datasetId: string
  createdAt: string
  dataset?: Dataset
}

export type Campaign = {
  id: string
  tenantId: string
  name: string
  createdAt: string
  datasets?: CampaignDataset[]
  trackingLinks?: TrackingLink[]
}

export type Brand = {
  id: string
  tenantId: string
  affiliatePlatformId: string
  name: string
  affiliateUrl: string
  createdAt: string
  affiliatePlatform?: AffiliatePlatform
}

export type AffiliateEventRuleOperator = 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'starts_with' | 'ends_with' | 'exists' | 'not_exists' | 'in' | 'not_in' | 'regex' | 'gt' | 'gte' | 'lt' | 'lte'

export type AffiliateEventRuleMatch = 'all' | 'any'

export type AffiliateEventCondition = {
  field: string
  operator?: AffiliateEventRuleOperator
  value?: string | number | boolean | Array<string | number | boolean>
  caseSensitive?: boolean
}

export type AffiliateEventRule = {
  field?: string
  operator?: AffiliateEventRuleOperator
  value?: string | number | boolean | Array<string | number | boolean>
  eventName: string
  label?: string
  match?: AffiliateEventRuleMatch
  conditions?: AffiliateEventCondition[]
  priority?: number
  caseSensitive?: boolean
}

export type AffiliatePlatform = {
  id: string
  tenantId: string
  name: string
  slug: string
  trackingParamKey: string
  webhookMethod: 'GET' | 'POST'
  webhookToken: string
  defaultEventName?: string | null
  eventMapping?: AffiliateEventRule[]
  createdAt: string
}

export type Dataset = {
  id: string
  tenantId: string
  platform: 'meta' | 'tiktok' | string
  name: string
  pixelId: string
  accessToken: string
  isActive: boolean
  createdAt: string
}

export type Prelander = {
  id: string
  tenantId: string
  name: string
  headline: string
  body: string
  ctaText: string
  ctaDelaySeconds: number
  theme: string
  isActive: boolean
  createdAt: string
}

export type TrackingLink = {
  id: string
  tenantId: string
  campaignId?: string | null
  brandId: string
  prelanderId?: string | null
  slug: string
  prelanderEnabled: boolean
  isActive: boolean
  createdAt: string
  tenant?: Tenant
  campaign?: Campaign
  brand?: Brand
  prelander?: Prelander | null
}

export type ClickEvent = {
  id: string
  tenantId: string
  campaignId?: string | null
  trackingLinkId: string
  clickUuid: string
  ip?: string | null
  referrer?: string | null
  fbclid?: string | null
  ttclid?: string | null
  createdAt: string
  trackingLink?: TrackingLink
}

export type CapiEvent = {
  id: string
  tenantId: string
  clickEventId: string
  platform: string
  eventName: string
  source?: string
  sourceId?: string
  status: 'PENDING' | 'PROCESSING' | 'DELIVERED' | 'FAILED'
  attempts: number
  lastError?: string | null
  createdAt: string
  updatedAt: string
  clickEvent?: ClickEvent | null
}

export type ConversionAttribution = {
  matched: boolean
  clickEvent?: ClickEvent | null
  campaign?: Campaign | null
  trackingLink?: TrackingLink | null
  brand?: Brand | null
  affiliatePlatform?: AffiliatePlatform | null
}

export type ConversionEvent = {
  id: string
  tenantId: string
  affiliatePlatformId: string
  clickEventId?: string | null
  clickUuid?: string | null
  idempotencyKey?: string | null
  requestCount?: number
  customerId?: string | null
  customerEmail?: string | null
  spendAmount?: string | null
  payoutAmount?: string | null
  commissionAmount?: string | null
  currency?: string | null
  eventName?: string | null
  eventRule?: string | null
  receivedMethod: string
  createdAt: string
  affiliatePlatform?: AffiliatePlatform | null
  attribution?: ConversionAttribution
  capiEnrichment?: Record<string, unknown> | null
}

export type AnalyticsSummary = {
  clicks: number
  conversions: number
  attributedConversions?: number
  unattributedConversions?: number
  capiTotal: number
  capiDelivered: number
  capiFailed: number
  conversionRate: number
  attributedConversionRate?: number
  revenue?: number
  payout?: number
  commission?: number
  spend?: number
}

export type AnalyticsRow = {
  id: string
  name: string
  clicks: number
  conversions: number
  revenue: number
  payout: number
  commission: number
  spend: number
  conversionRate: number
}

export type FunnelStep = {
  key: string
  label: string
  value: number
  rateFromPrevious: number
  rateFromStart: number
}

export type PeriodMetricComparison = {
  current: number
  previous: number
  change: number
  changeRate: number
}

export type AnalyticsComparison = {
  currentPeriod: { startDate: string; endDate: string }
  previousPeriod: { startDate: string; endDate: string }
  metrics: Record<string, PeriodMetricComparison>
  previousSummary: AnalyticsSummary
}

export type AnalyticsBreakdown = {
  summary: AnalyticsSummary
  byCampaign: AnalyticsRow[]
  byBrand: AnalyticsRow[]
  byPlatform: AnalyticsRow[]
  byDay: AnalyticsRow[]
  funnel: FunnelStep[]
  comparison?: AnalyticsComparison | null
}

export type EventFilters = {
  search: string
  startDate: string
  endDate: string
  campaignId: string
  brandId: string
  trackingLinkId: string
  affiliatePlatformId: string
  status: string
}

export type ActivityLog = {
  id: string
  tenantId: string
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
  source: string
  eventType: string
  message: string
  entityType?: string | null
  entityId?: string | null
  metadata?: Record<string, unknown> | null
  createdAt: string
}

export type ActivityLogFilters = {
  search: string
  startDate: string
  endDate: string
  level: string
  source: string
  eventType: string
  entityType: string
  entityId: string
}

export type SuperAdminTenant = Tenant & {
  _count: {
    campaigns: number
    brands: number
    affiliatePlatforms: number
    datasets: number
    trackingLinks: number
    clickEvents: number
    conversionEvents: number
    capiEvents: number
  }
}

export type SuperAdminUser = {
  id: string
  clerkUserId: string
  email?: string | null
  firstName?: string | null
  lastName?: string | null
  imageUrl?: string | null
  createdAt: string
  updatedAt: string
  tenant?: SuperAdminTenant | null
}

export type CurrentUser = {
  id: string
  clerkUserId: string
  email?: string | null
  firstName?: string | null
  lastName?: string | null
  imageUrl?: string | null
  createdAt: string
  updatedAt: string
  isSuperAdmin: boolean
}

export type ReportSchedule = {
  id: string
  tenantId: string
  name: string
  reportType: string
  frequency: 'daily' | 'weekly' | 'monthly' | string
  recipientEmail?: string | null
  filters?: Record<string, unknown> | null
  isActive: boolean
  lastRunAt?: string | null
  nextRunAt?: string | null
  createdAt: string
  updatedAt: string
}

export type PaginationMeta = {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

export type PaginatedResponse<T> = {
  items: T[]
  pagination: PaginationMeta
}

export type AppData = {
  tenants: Tenant[]
  campaigns: Campaign[]
  brands: Brand[]
  affiliatePlatforms: AffiliatePlatform[]
  datasets: Dataset[]
  prelanders: Prelander[]
  trackingLinks: TrackingLink[]
  clickEvents: ClickEvent[]
  capiEvents: CapiEvent[]
  conversionEvents: ConversionEvent[]
  activityLogs: ActivityLog[]
  analyticsSummary: AnalyticsSummary
  analyticsBreakdown: AnalyticsBreakdown
  currentUser?: CurrentUser
  superAdminUsers: SuperAdminUser[]
  billingPlans: BillingPlan[]
  menuFeatures: MenuFeature[]
  reportSchedules: ReportSchedule[]
}

export type LoadedAppData = AppData & {
  clickEventsPageData: PaginatedResponse<ClickEvent>
  capiEventsPageData: PaginatedResponse<CapiEvent>
  conversionEventsPageData: PaginatedResponse<ConversionEvent>
  activityLogsPageData: PaginatedResponse<ActivityLog>
}

export type CreateStatus = {
  type: 'idle' | 'success' | 'error'
  message: string
}

export type ThemeMode = 'light' | 'dark'

export type NavItem = {
  path: string
  label: string
  icon: LucideIcon
  badge?: string
  featureKey?: string
}

export type NavGroup = {
  label: string
  items: NavItem[]
}

export type DashboardContext = {
  data: AppData
  selectedTenant?: Tenant
  tenantCampaigns: Campaign[]
  tenantBrands: Brand[]
  tenantAffiliatePlatforms: AffiliatePlatform[]
  tenantDatasets: Dataset[]
  tenantPrelanders: Prelander[]
  tenantTrackingLinks: TrackingLink[]
  tenantCapiEvents: CapiEvent[]
  tenantConversionEvents: ConversionEvent[]
  tenantReportSchedules: ReportSchedule[]
  tenantActivityLogs: ActivityLog[]
  isSuperAdmin: boolean
  superAdminUsers: SuperAdminUser[]
  billingPlans: BillingPlan[]
  menuFeatures: MenuFeature[]
  grantedMenuFeatureIds: Set<string>
  isLoading: boolean
  lastUpdatedAt: number
  clickEventsPagination: PaginationMeta
  capiEventsPagination: PaginationMeta
  conversionEventsPagination: PaginationMeta
  activityLogsPagination: PaginationMeta
  eventFilters: EventFilters
  activityLogFilters: ActivityLogFilters
  setEventFilters: (filters: EventFilters) => void
  applyEventFilters: (filters: EventFilters) => void
  resetEventFilters: () => void
  setClickEventsPage: (page: number) => void
  setCapiEventsPage: (page: number) => void
  setConversionEventsPage: (page: number) => void
  applyActivityLogFilters: (filters: ActivityLogFilters) => void
  resetActivityLogFilters: () => void
  setActivityLogsPage: (page: number) => void
  status: CreateStatus
  setStatus: (status: CreateStatus) => void
  loadData: () => Promise<void>
  fetchJson: <T>(path: string, init?: RequestInit) => Promise<T>
  exportAnalyticsCsv: (type: string) => Promise<void>
}
