import { UserButton, useAuth, useUser } from '@clerk/clerk-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import { Bell, ChevronDown, Command, Globe2, Loader2, PanelLeft, Plus, RefreshCw, Search } from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { ThemeToggle } from '../components/common/ThemeToggle'
import { DashboardRoutes } from './DashboardRoutes'
import { apiBaseUrl } from '../config/env'
import { defaultActivityLogFilters, defaultAnalyticsBreakdown, defaultEventFilters, defaultPagination, emptyData, emptyPaginated, eventPageSize } from '../config/app-data'
import { navGroups, pageMeta } from '../config/navigation'
import { buildQueryString, parseApiResponse } from '../lib/api'
import { activityLogFilterParams, eventFilterParams } from '../lib/event-filters'
import { formatLastUpdated } from '../lib/format'
import type { ActivityLog, ActivityLogFilters, AffiliatePlatform, AnalyticsBreakdown, BillingPlan, Brand, Campaign, CapiEvent, ClickEvent, ConversionEvent, CreateStatus, CurrentUser, DashboardContext, DataRefreshKey, Dataset, EventFilters, LoadedAppData, MenuFeature, PaginatedResponse, ReportSchedule, SuperAdminUser, Tenant, ThemeMode, TrackingLink, WebsiteDomain } from '../types/domain'

const refreshQueryKeys: Record<DataRefreshKey, readonly unknown[]> = {
  tenants: ['tenants'],
  campaigns: ['campaigns'],
  brands: ['brands'],
  'affiliate-platforms': ['affiliate-platforms'],
  datasets: ['datasets'],
  'tracking-links': ['tracking-links'],
  'website-domains': ['website-domains'],
  'report-schedules': ['report-schedules'],
  'click-events': ['click-events'],
  'capi-events': ['capi-events'],
  'conversion-events': ['conversion-events'],
  'activity-logs': ['activity-logs'],
  analytics: ['analytics'],
  'superadmin-users': ['superadmin-users'],
  'billing-plans': ['billing-plans'],
  'menu-features': ['menu-features']
}

function isPath(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`)
}

function withTenant(path: string, tenantId?: string) {
  return `${path}${buildQueryString({ tenantId })}`
}

export function DashboardLayout({ theme, onToggleTheme }: { theme: ThemeMode; onToggleTheme: () => void }) {
  const { getToken } = useAuth()
  const { user } = useUser()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [selectedTenantId, setSelectedTenantId] = useState('')
  const [eventFilters, setEventFilters] = useState<EventFilters>(defaultEventFilters)
  const [clickEventsPage, setClickEventsPage] = useState(1)
  const [capiEventsPage, setCapiEventsPage] = useState(1)
  const [conversionEventsPage, setConversionEventsPage] = useState(1)
  const [activityLogsPage, setActivityLogsPage] = useState(1)
  const [activityLogFilters, setActivityLogFilters] = useState<ActivityLogFilters>(defaultActivityLogFilters)
  const [status, setStatus] = useState<CreateStatus>({ type: 'idle', message: '' })

  const fetchJson = useCallback(async <T,>(path: string, init?: RequestInit) => {
    const token = await getToken()

    if (!token) {
      throw new Error('Không lấy được phiên đăng nhập')
    }

    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${token}`)
    if (typeof init?.body === 'string' && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers
    })

    return parseApiResponse<T>(response)
  }, [getToken])

  const currentUserQuery = useQuery({
    queryKey: ['current-user'],
    queryFn: () => fetchJson<CurrentUser>('/me'),
    staleTime: 60_000,
    refetchOnWindowFocus: false
  })

  const tenantsQuery = useQuery({
    queryKey: ['tenants'],
    queryFn: () => fetchJson<Tenant[]>('/tenants'),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData ?? []
  })

  const tenants = tenantsQuery.data ?? []
  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === selectedTenantId) ?? tenants[0],
    [tenants, selectedTenantId]
  )
  const tenantId = selectedTenant?.id
  const isSuperAdmin = Boolean(currentUserQuery.data?.isSuperAdmin)

  const routePath = location.pathname
  const isDashboardRoute = routePath === '/dashboard' || routePath === '/'
  const isCampaignRoute = isPath(routePath, '/campaigns')
  const isPlatformRoute = isPath(routePath, '/platforms')
  const isDatasetRoute = isPath(routePath, '/datasets')
  const isTrackingLinkRoute = isPath(routePath, '/tracking-links')
  const isClickEventsRoute = isPath(routePath, '/click-events')
  const isActivityLogsRoute = isPath(routePath, '/logs')
  const isAnalyticsRoute = isPath(routePath, '/analytics')
  const isSettingsRoute = isPath(routePath, '/websites') || isPath(routePath, '/settings')
  const isSuperAdminRoute = isPath(routePath, '/superadmin')

  const shouldLoadCampaigns = Boolean(tenantId && (isDashboardRoute || isCampaignRoute || isTrackingLinkRoute || isClickEventsRoute || isAnalyticsRoute))
  const shouldLoadBrands = Boolean(tenantId && isPath(routePath, '/brands'))
  const shouldLoadAffiliatePlatforms = Boolean(tenantId && (isDashboardRoute || isPlatformRoute || isTrackingLinkRoute || isClickEventsRoute || isAnalyticsRoute))
  const shouldLoadDatasets = Boolean(tenantId && (isDashboardRoute || isDatasetRoute || isCampaignRoute))
  const shouldLoadTrackingLinks = Boolean(tenantId && (isDashboardRoute || isTrackingLinkRoute || isClickEventsRoute || isAnalyticsRoute))
  const shouldLoadWebsiteDomains = Boolean(tenantId && isSettingsRoute)
  const shouldLoadReportSchedules = Boolean(tenantId && isAnalyticsRoute)
  const shouldLoadClickEvents = Boolean(tenantId && isClickEventsRoute)
  const shouldLoadCapiEvents = Boolean(tenantId && isAnalyticsRoute)
  const shouldLoadConversionEvents = Boolean(tenantId && isAnalyticsRoute)
  const shouldLoadActivityLogs = Boolean(tenantId && isActivityLogsRoute)
  const shouldLoadAnalytics = Boolean(tenantId && (isDashboardRoute || isAnalyticsRoute))
  const shouldLoadSuperAdmin = Boolean(isSuperAdmin && isSuperAdminRoute)

  const campaignsQuery = useQuery({
    queryKey: ['campaigns', tenantId],
    queryFn: () => fetchJson<Campaign[]>(withTenant('/campaigns', tenantId)),
    enabled: shouldLoadCampaigns,
    staleTime: 30_000,
    placeholderData: (previousData) => previousData ?? []
  })

  const brandsQuery = useQuery({
    queryKey: ['brands', tenantId],
    queryFn: () => fetchJson<Brand[]>(withTenant('/brands', tenantId)),
    enabled: shouldLoadBrands,
    staleTime: 30_000,
    placeholderData: (previousData) => previousData ?? []
  })

  const affiliatePlatformsQuery = useQuery({
    queryKey: ['affiliate-platforms', tenantId],
    queryFn: () => fetchJson<AffiliatePlatform[]>(withTenant('/affiliate-platforms', tenantId)),
    enabled: shouldLoadAffiliatePlatforms,
    staleTime: 30_000,
    placeholderData: (previousData) => previousData ?? []
  })

  const datasetsQuery = useQuery({
    queryKey: ['datasets', tenantId],
    queryFn: () => fetchJson<Dataset[]>(withTenant('/datasets', tenantId)),
    enabled: shouldLoadDatasets,
    staleTime: 30_000,
    placeholderData: (previousData) => previousData ?? []
  })

  const trackingLinksQuery = useQuery({
    queryKey: ['tracking-links', tenantId],
    queryFn: () => fetchJson<TrackingLink[]>(withTenant('/tracking-links', tenantId)),
    enabled: shouldLoadTrackingLinks,
    staleTime: 30_000,
    placeholderData: (previousData) => previousData ?? []
  })

  const websiteDomainsQuery = useQuery({
    queryKey: ['website-domains', tenantId],
    queryFn: () => fetchJson<WebsiteDomain[]>(withTenant('/website-domains', tenantId)),
    enabled: shouldLoadWebsiteDomains,
    staleTime: 30_000,
    placeholderData: (previousData) => previousData ?? []
  })

  const reportSchedulesQuery = useQuery({
    queryKey: ['report-schedules', tenantId],
    queryFn: () => fetchJson<ReportSchedule[]>(withTenant('/report-schedules', tenantId)),
    enabled: shouldLoadReportSchedules,
    staleTime: 30_000,
    placeholderData: (previousData) => previousData ?? []
  })

  const eventParams = eventFilterParams(eventFilters)
  const activityLogParams = activityLogFilterParams(activityLogFilters)

  const clickEventsQuery = useQuery({
    queryKey: ['click-events', tenantId, clickEventsPage, eventFilters],
    queryFn: () => fetchJson<PaginatedResponse<ClickEvent>>(`/click-events${buildQueryString({ tenantId, ...eventParams, page: clickEventsPage, limit: eventPageSize })}`),
    enabled: shouldLoadClickEvents,
    placeholderData: (previousData) => previousData ?? emptyPaginated<ClickEvent>(clickEventsPage)
  })

  const capiEventsQuery = useQuery({
    queryKey: ['capi-events', tenantId, capiEventsPage, eventFilters],
    queryFn: () => fetchJson<PaginatedResponse<CapiEvent>>(`/capi-events${buildQueryString({ tenantId, ...eventParams, page: capiEventsPage, limit: eventPageSize })}`),
    enabled: shouldLoadCapiEvents,
    placeholderData: (previousData) => previousData ?? emptyPaginated<CapiEvent>(capiEventsPage)
  })

  const conversionEventsQuery = useQuery({
    queryKey: ['conversion-events', tenantId, conversionEventsPage, eventFilters],
    queryFn: () => fetchJson<PaginatedResponse<ConversionEvent>>(`/conversion-events${buildQueryString({ tenantId, ...eventParams, page: conversionEventsPage, limit: eventPageSize })}`),
    enabled: shouldLoadConversionEvents,
    placeholderData: (previousData) => previousData ?? emptyPaginated<ConversionEvent>(conversionEventsPage)
  })

  const activityLogsQuery = useQuery({
    queryKey: ['activity-logs', tenantId, activityLogsPage, activityLogFilters],
    queryFn: () => fetchJson<PaginatedResponse<ActivityLog>>(`/activity-logs${buildQueryString({ tenantId, ...activityLogParams, page: activityLogsPage, limit: eventPageSize })}`),
    enabled: shouldLoadActivityLogs,
    placeholderData: (previousData) => previousData ?? emptyPaginated<ActivityLog>(activityLogsPage)
  })

  const analyticsQuery = useQuery({
    queryKey: ['analytics', tenantId, eventFilters],
    queryFn: () => fetchJson<AnalyticsBreakdown>(`/analytics/breakdown${buildQueryString({ tenantId, ...eventParams })}`),
    enabled: shouldLoadAnalytics,
    staleTime: 30_000,
    placeholderData: (previousData) => previousData ?? defaultAnalyticsBreakdown
  })

  const superAdminUsersQuery = useQuery({
    queryKey: ['superadmin-users'],
    queryFn: () => fetchJson<SuperAdminUser[]>('/superadmin/users'),
    enabled: shouldLoadSuperAdmin,
    staleTime: 30_000,
    placeholderData: (previousData) => previousData ?? []
  })

  const billingPlansQuery = useQuery({
    queryKey: ['billing-plans'],
    queryFn: () => fetchJson<BillingPlan[]>('/superadmin/billing-plans'),
    enabled: shouldLoadSuperAdmin,
    staleTime: 30_000,
    placeholderData: (previousData) => previousData ?? []
  })

  const menuFeaturesQuery = useQuery({
    queryKey: ['menu-features'],
    queryFn: () => fetchJson<MenuFeature[]>('/superadmin/menu-features'),
    enabled: shouldLoadSuperAdmin,
    staleTime: 30_000,
    placeholderData: (previousData) => previousData ?? []
  })

  const data: LoadedAppData = {
    ...emptyData,
    currentUser: currentUserQuery.data,
    tenants,
    campaigns: campaignsQuery.data ?? [],
    brands: brandsQuery.data ?? [],
    affiliatePlatforms: affiliatePlatformsQuery.data ?? [],
    datasets: datasetsQuery.data ?? [],
    trackingLinks: trackingLinksQuery.data ?? [],
    websiteDomains: websiteDomainsQuery.data ?? [],
    reportSchedules: reportSchedulesQuery.data ?? [],
    clickEvents: clickEventsQuery.data?.items ?? [],
    capiEvents: capiEventsQuery.data?.items ?? [],
    conversionEvents: conversionEventsQuery.data?.items ?? [],
    activityLogs: activityLogsQuery.data?.items ?? [],
    analyticsSummary: analyticsQuery.data?.summary ?? defaultAnalyticsBreakdown.summary,
    analyticsBreakdown: analyticsQuery.data ?? defaultAnalyticsBreakdown,
    superAdminUsers: superAdminUsersQuery.data ?? [],
    billingPlans: billingPlansQuery.data ?? [],
    menuFeatures: menuFeaturesQuery.data ?? [],
    clickEventsPageData: clickEventsQuery.data ?? emptyPaginated<ClickEvent>(clickEventsPage),
    capiEventsPageData: capiEventsQuery.data ?? emptyPaginated<CapiEvent>(capiEventsPage),
    conversionEventsPageData: conversionEventsQuery.data ?? emptyPaginated<ConversionEvent>(conversionEventsPage),
    activityLogsPageData: activityLogsQuery.data ?? emptyPaginated<ActivityLog>(activityLogsPage)
  }

  const clickEventsPagination = data.clickEventsPageData.pagination ?? { ...defaultPagination, page: clickEventsPage }
  const capiEventsPagination = data.capiEventsPageData.pagination ?? { ...defaultPagination, page: capiEventsPage }
  const conversionEventsPagination = data.conversionEventsPageData.pagination ?? { ...defaultPagination, page: conversionEventsPage }
  const activityLogsPagination = data.activityLogsPageData.pagination ?? { ...defaultPagination, page: activityLogsPage }

  const queryStates = [
    currentUserQuery,
    tenantsQuery,
    campaignsQuery,
    brandsQuery,
    affiliatePlatformsQuery,
    datasetsQuery,
    trackingLinksQuery,
    websiteDomainsQuery,
    reportSchedulesQuery,
    clickEventsQuery,
    capiEventsQuery,
    conversionEventsQuery,
    activityLogsQuery,
    analyticsQuery,
    superAdminUsersQuery,
    billingPlansQuery,
    menuFeaturesQuery
  ]
  const isLoading = queryStates.some((query) => query.isLoading || query.isFetching)
  const lastUpdatedAt = Math.max(0, ...queryStates.map((query) => query.dataUpdatedAt))
  const firstQueryError = queryStates.find((query) => query.error)?.error

  const tenantCampaigns = useMemo(
    () => data.campaigns.filter((campaign) => campaign.tenantId === selectedTenant?.id),
    [data.campaigns, selectedTenant]
  )

  const tenantBrands = useMemo(
    () => data.brands.filter((brand) => brand.tenantId === selectedTenant?.id),
    [data.brands, selectedTenant]
  )

  const tenantAffiliatePlatforms = useMemo(
    () => data.affiliatePlatforms.filter((platform) => platform.tenantId === selectedTenant?.id),
    [data.affiliatePlatforms, selectedTenant]
  )

  const tenantDatasets = useMemo(
    () => data.datasets.filter((dataset) => dataset.tenantId === selectedTenant?.id),
    [data.datasets, selectedTenant]
  )

  const tenantTrackingLinks = useMemo(
    () => data.trackingLinks.filter((link) => link.tenantId === selectedTenant?.id),
    [data.trackingLinks, selectedTenant]
  )

  const tenantWebsiteDomains = useMemo(
    () => data.websiteDomains.filter((domain) => domain.tenantId === selectedTenant?.id),
    [data.websiteDomains, selectedTenant]
  )

  const tenantCapiEvents = useMemo(
    () => data.capiEvents.filter((event) => event.tenantId === selectedTenant?.id),
    [data.capiEvents, selectedTenant]
  )

  const tenantConversionEvents = useMemo(
    () => data.conversionEvents.filter((event) => event.tenantId === selectedTenant?.id),
    [data.conversionEvents, selectedTenant]
  )

  const tenantReportSchedules = useMemo(
    () => data.reportSchedules.filter((schedule) => schedule.tenantId === selectedTenant?.id),
    [data.reportSchedules, selectedTenant]
  )

  const tenantActivityLogs = useMemo(
    () => data.activityLogs.filter((log) => log.tenantId === selectedTenant?.id),
    [data.activityLogs, selectedTenant]
  )

  const loadData = useCallback(async () => {
    await queryClient.refetchQueries({ type: 'active' })
  }, [queryClient])

  const refreshEntity = useCallback(async (key: DataRefreshKey) => {
    await queryClient.invalidateQueries({ queryKey: refreshQueryKeys[key] })
  }, [queryClient])

  const exportAnalyticsCsv = useCallback(async (type: string) => {
    const token = await getToken()
    if (!token) throw new Error('Không lấy được phiên đăng nhập')
    const query = buildQueryString({ tenantId, ...eventFilterParams(eventFilters), type })
    const response = await fetch(`${apiBaseUrl}/analytics/export.csv${query}`, { headers: { Authorization: `Bearer ${token}` } })
    if (!response.ok) throw new Error(await response.text())
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${type}-export.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }, [getToken, eventFilters, tenantId])

  const applyEventFilters = useCallback((filters: EventFilters) => {
    setEventFilters(filters)
    setClickEventsPage(1)
    setCapiEventsPage(1)
    setConversionEventsPage(1)
  }, [])

  const applyActivityLogFilters = useCallback((filters: ActivityLogFilters) => {
    setActivityLogFilters(filters)
    setActivityLogsPage(1)
  }, [])

  const resetActivityLogFilters = useCallback(() => {
    applyActivityLogFilters(defaultActivityLogFilters)
  }, [applyActivityLogFilters])

  const resetEventFilters = useCallback(() => {
    applyEventFilters(defaultEventFilters)
  }, [applyEventFilters])

  const updateClickEventsPage = useCallback((page: number) => {
    setClickEventsPage(Math.max(1, Math.min(page, clickEventsPagination.totalPages || 1)))
  }, [clickEventsPagination.totalPages])

  const updateCapiEventsPage = useCallback((page: number) => {
    setCapiEventsPage(Math.max(1, Math.min(page, capiEventsPagination.totalPages || 1)))
  }, [capiEventsPagination.totalPages])

  const updateConversionEventsPage = useCallback((page: number) => {
    setConversionEventsPage(Math.max(1, Math.min(page, conversionEventsPagination.totalPages || 1)))
  }, [conversionEventsPagination.totalPages])

  const updateActivityLogsPage = useCallback((page: number) => {
    setActivityLogsPage(Math.max(1, Math.min(page, activityLogsPagination.totalPages || 1)))
  }, [activityLogsPagination.totalPages])

  useEffect(() => {
    setSelectedTenantId((current) => current || tenants[0]?.id || '')
  }, [tenants])

  useEffect(() => {
    if (!status.message || status.type !== 'success') return

    const timeoutId = window.setTimeout(() => {
      setStatus({ type: 'idle', message: '' })
    }, 3500)

    return () => window.clearTimeout(timeoutId)
  }, [status.message, status.type])

  useEffect(() => {
    if (firstQueryError) {
      setStatus({ type: 'error', message: firstQueryError instanceof Error ? firstQueryError.message : 'Không tải được dữ liệu' })
    }
  }, [firstQueryError])

  const grantedMenuFeatureIds = useMemo(() => {
    const coreFeatures = ['dashboard', 'campaigns', 'platforms', 'datasets', 'tracking-links', 'click-events', 'activity-logs', 'billing', 'settings', 'support']
    if (data.currentUser?.isSuperAdmin) {
      return new Set(navGroups.flatMap((group) => group.items.map((item) => item.featureKey).filter(Boolean) as string[]))
    }

    return new Set([...coreFeatures, ...(selectedTenant?.menuGrants?.filter((grant) => grant.isEnabled).map((grant) => grant.menuFeature.key) ?? [])])
  }, [data.currentUser?.isSuperAdmin, selectedTenant])

  const visibleNavGroups = useMemo(() => navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.featureKey || grantedMenuFeatureIds.has(item.featureKey))
    }))
    .filter((group) => group.items.length > 0), [grantedMenuFeatureIds])

  const ctx: DashboardContext = {
    data,
    selectedTenant,
    tenantCampaigns,
    tenantBrands,
    tenantAffiliatePlatforms,
    tenantDatasets,
    tenantTrackingLinks,
    tenantWebsiteDomains,
    tenantCapiEvents,
    tenantConversionEvents,
    tenantReportSchedules,
    tenantActivityLogs,
    isSuperAdmin,
    superAdminUsers: data.superAdminUsers,
    billingPlans: data.billingPlans,
    menuFeatures: data.menuFeatures,
    grantedMenuFeatureIds,
    isLoading,
    lastUpdatedAt,
    clickEventsPagination,
    capiEventsPagination,
    conversionEventsPagination,
    activityLogsPagination,
    eventFilters,
    activityLogFilters,
    setEventFilters,
    applyEventFilters,
    resetEventFilters,
    setClickEventsPage: updateClickEventsPage,
    setCapiEventsPage: updateCapiEventsPage,
    setConversionEventsPage: updateConversionEventsPage,
    applyActivityLogFilters,
    resetActivityLogFilters,
    setActivityLogsPage: updateActivityLogsPage,
    status,
    setStatus,
    loadData,
    refreshEntity,
    fetchJson,
    exportAnalyticsCsv
  }

  const meta = pageMeta[location.pathname] ?? pageMeta['/dashboard']
  const primaryAction = meta.primaryAction

  return (
    <main className={`app-shell shadcn-theme ${isSidebarCollapsed ? 'is-sidebar-collapsed' : ''}`}>
      <aside id="dashboard-sidebar" className="sidebar" aria-label="Dashboard sidebar">
        <button type="button" className="workspace-switcher" title={selectedTenant?.name ?? 'Workspace'} onClick={() => navigate('/dashboard')}>
          <div className="workspace-logo"><Command size={17} /></div>
          <div>
            <strong>Aff Track Pro</strong>
            <span>{selectedTenant?.name ?? 'Workspace'}</span>
          </div>
          <ChevronDown size={16} />
        </button>

        <nav className="sidebar-nav" aria-label="Dashboard navigation">
          {visibleNavGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink key={item.path} to={item.path} title={item.label} className={({ isActive }) => `sidebar-link ${isActive ? 'is-active' : ''}`}>
                    <Icon size={17} />
                    <span>{item.label}</span>
                    {item.badge && <Badge variant="secondary" className="nav-badge">{item.badge}</Badge>}
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>

      </aside>

      <section className="main-panel">
        <header className="app-topbar">
          <div className="topbar-left">
            <Button className="sidebar-toggle" variant="ghost" size="icon" type="button" aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-pressed={isSidebarCollapsed} aria-controls="dashboard-sidebar" onClick={() => setIsSidebarCollapsed((current) => !current)}><PanelLeft size={16} /></Button>
            <div className="search-box">
              <Search size={16} />
              <input placeholder="Search campaigns, links, platforms..." />
              <kbd>⌘K</kbd>
            </div>
          </div>
          <div className="topbar-actions">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            <Button variant="outline" size="icon" type="button"><Bell size={16} /></Button>
            <Button variant="outline" size="sm" type="button"><Globe2 size={16} /> Production</Button>
            <div className="user-area">
              <div className="user-meta">
                <span>{user?.primaryEmailAddress?.emailAddress}</span>
                <small>{selectedTenant?.slug ?? 'workspace'}</small>
              </div>
              <UserButton />
            </div>
          </div>
        </header>

        <section className="page-heading">
          <div>
            <h1>{meta.title}</h1>
            <p>{meta.description}</p>
          </div>
          <div className="heading-actions">
            <span className="last-updated">Cập nhật: {formatLastUpdated(lastUpdatedAt)}</span>
            <Button variant="outline" type="button" onClick={() => void loadData()} disabled={isLoading}>
              {isLoading ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
              Refresh
            </Button>
            {primaryAction && <Button asChild><NavLink to={primaryAction.path}><Plus size={16} /> {primaryAction.label}</NavLink></Button>}
          </div>
        </section>

        <DashboardRoutes ctx={ctx} />
      </section>
    </main>
  )
}
