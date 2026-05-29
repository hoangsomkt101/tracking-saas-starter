import type { ActivityLog, ActivityLogFilters, AnalyticsBreakdown, AnalyticsSummary, AppData, CapiEvent, ClickEvent, ConversionEvent, EventFilters, LoadedAppData, PaginatedResponse, PaginationMeta } from '../types/domain'

export const eventPageSize = 25
export const defaultPagination: PaginationMeta = { page: 1, limit: eventPageSize, total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false }
export const defaultEventFilters: EventFilters = { search: '', startDate: '', endDate: '', campaignId: '', trackingLinkId: '', affiliatePlatformId: '', status: '' }
export const defaultActivityLogFilters: ActivityLogFilters = { search: '', startDate: '', endDate: '', level: '', source: '', eventType: '', entityType: '', entityId: '' }
export const defaultAnalyticsSummary: AnalyticsSummary = { clicks: 0, conversions: 0, attributedConversions: 0, unattributedConversions: 0, capiTotal: 0, capiDelivered: 0, capiFailed: 0, conversionRate: 0, attributedConversionRate: 0, revenue: 0, payout: 0, commission: 0, spend: 0 }
export const defaultAnalyticsBreakdown: AnalyticsBreakdown = { summary: defaultAnalyticsSummary, byCampaign: [], byBrand: [], byPlatform: [], byDay: [], funnel: [], comparison: null }

export function emptyPaginated<T>(page = 1): PaginatedResponse<T> {
  return { items: [], pagination: { ...defaultPagination, page } }
}

export const emptyData: LoadedAppData = {
  tenants: [],
  campaigns: [],
  brands: [],
  affiliatePlatforms: [],
  datasets: [],
  prelanders: [],
  trackingLinks: [],
  clickEvents: [],
  capiEvents: [],
  conversionEvents: [],
  activityLogs: [],
  analyticsSummary: defaultAnalyticsSummary,
  analyticsBreakdown: defaultAnalyticsBreakdown,
  superAdminUsers: [],
  billingPlans: [],
  menuFeatures: [],
  reportSchedules: [],
  clickEventsPageData: emptyPaginated<ClickEvent>(),
  capiEventsPageData: emptyPaginated<CapiEvent>(),
  conversionEventsPageData: emptyPaginated<ConversionEvent>(),
  activityLogsPageData: emptyPaginated<ActivityLog>()
}
