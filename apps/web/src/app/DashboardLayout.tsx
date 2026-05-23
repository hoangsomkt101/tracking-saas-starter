import { UserButton, useAuth, useUser } from '@clerk/clerk-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import { Bell, ChevronDown, Command, Globe2, Loader2, Plus, RefreshCw, Search, Sparkles } from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { ThemeToggle } from '../components/common/ThemeToggle'
import { DashboardRoutes } from './DashboardRoutes'
import { apiBaseUrl } from '../config/env'
import { defaultActivityLogFilters, defaultEventFilters, defaultPagination, emptyData, eventPageSize } from '../config/app-data'
import { navGroups, pageMeta } from '../config/navigation'
import { buildQueryString, parseApiResponse } from '../lib/api'
import { activityLogFilterParams, eventFilterParams } from '../lib/event-filters'
import { formatLastUpdated } from '../lib/format'
import type { ActivityLog, ActivityLogFilters, AffiliatePlatform, AnalyticsBreakdown, BillingPlan, Brand, Campaign, CapiEvent, ClickEvent, ConversionEvent, CreateStatus, CurrentUser, DashboardContext, Dataset, EventFilters, LoadedAppData, MenuFeature, PaginatedResponse, Prelander, ReportSchedule, SuperAdminUser, Tenant, ThemeMode, TrackingLink } from '../types/domain'

export function DashboardLayout({ theme, onToggleTheme }: { theme: ThemeMode; onToggleTheme: () => void }) {
  const { getToken } = useAuth()
  const { user } = useUser()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
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

  const appDataQuery = useQuery({
    queryKey: ['app-data', clickEventsPage, capiEventsPage, conversionEventsPage, activityLogsPage, eventFilters, activityLogFilters],
    queryFn: async (): Promise<LoadedAppData> => {
      const filters = eventFilterParams(eventFilters)
      const clickEventsQuery = buildQueryString({ ...filters, page: clickEventsPage, limit: eventPageSize })
      const capiEventsQuery = buildQueryString({ ...filters, page: capiEventsPage, limit: eventPageSize })
      const conversionEventsQuery = buildQueryString({ ...filters, page: conversionEventsPage, limit: eventPageSize })
      const analyticsQuery = buildQueryString(filters)
      const activityLogsQuery = buildQueryString({ ...activityLogFilterParams(activityLogFilters), page: activityLogsPage, limit: eventPageSize })
      const [currentUser, tenants, campaigns, brands, affiliatePlatforms, datasets, prelanders, trackingLinks, reportSchedules, clickEventsPageData, capiEventsPageData, conversionEventsPageData, activityLogsPageData, analyticsBreakdown] = await Promise.all([
        fetchJson<CurrentUser>('/me'),
        fetchJson<Tenant[]>('/tenants'),
        fetchJson<Campaign[]>('/campaigns'),
        fetchJson<Brand[]>('/brands'),
        fetchJson<AffiliatePlatform[]>('/affiliate-platforms'),
        fetchJson<Dataset[]>('/datasets'),
        fetchJson<Prelander[]>('/prelanders'),
        fetchJson<TrackingLink[]>('/tracking-links'),
        fetchJson<ReportSchedule[]>('/report-schedules'),
        fetchJson<PaginatedResponse<ClickEvent>>(`/click-events${clickEventsQuery}`),
        fetchJson<PaginatedResponse<CapiEvent>>(`/capi-events${capiEventsQuery}`),
        fetchJson<PaginatedResponse<ConversionEvent>>(`/conversion-events${conversionEventsQuery}`),
        fetchJson<PaginatedResponse<ActivityLog>>(`/activity-logs${activityLogsQuery}`),
        fetchJson<AnalyticsBreakdown>(`/analytics/breakdown${analyticsQuery}`)
      ])
      const [superAdminUsers, billingPlans, menuFeatures] = currentUser.isSuperAdmin
        ? await Promise.all([
          fetchJson<SuperAdminUser[]>('/superadmin/users'),
          fetchJson<BillingPlan[]>('/superadmin/billing-plans'),
          fetchJson<MenuFeature[]>('/superadmin/menu-features')
        ])
        : [[], [], []]

      return { currentUser, tenants, campaigns, brands, affiliatePlatforms, datasets, prelanders, trackingLinks, reportSchedules, clickEvents: clickEventsPageData.items, capiEvents: capiEventsPageData.items, conversionEvents: conversionEventsPageData.items, activityLogs: activityLogsPageData.items, analyticsSummary: analyticsBreakdown.summary, analyticsBreakdown, superAdminUsers, billingPlans, menuFeatures, clickEventsPageData, capiEventsPageData, conversionEventsPageData, activityLogsPageData }
    },
    staleTime: 30_000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData ?? emptyData
  })

  const data = appDataQuery.data ?? emptyData
  const clickEventsPagination = appDataQuery.data?.clickEventsPageData.pagination ?? { ...defaultPagination, page: clickEventsPage }
  const capiEventsPagination = appDataQuery.data?.capiEventsPageData.pagination ?? { ...defaultPagination, page: capiEventsPage }
  const conversionEventsPagination = appDataQuery.data?.conversionEventsPageData.pagination ?? { ...defaultPagination, page: conversionEventsPage }
  const activityLogsPagination = appDataQuery.data?.activityLogsPageData.pagination ?? { ...defaultPagination, page: activityLogsPage }
  const isLoading = appDataQuery.isLoading || appDataQuery.isFetching

  const selectedTenant = useMemo(
    () => data.tenants.find((tenant) => tenant.id === selectedTenantId) ?? data.tenants[0],
    [data.tenants, selectedTenantId]
  )

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

  const tenantPrelanders = useMemo(
    () => data.prelanders.filter((prelander) => prelander.tenantId === selectedTenant?.id),
    [data.prelanders, selectedTenant]
  )

  const tenantTrackingLinks = useMemo(
    () => data.trackingLinks.filter((link) => link.tenantId === selectedTenant?.id),
    [data.trackingLinks, selectedTenant]
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
    await queryClient.refetchQueries({ queryKey: ['app-data'], type: 'active' })
  }, [queryClient])

  const exportAnalyticsCsv = useCallback(async (type: string) => {
    const token = await getToken()
    if (!token) throw new Error('Không lấy được phiên đăng nhập')
    const query = buildQueryString({ ...eventFilterParams(eventFilters), type })
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
  }, [getToken, eventFilters])

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
    setSelectedTenantId((current) => current || data.tenants[0]?.id || '')
  }, [data.tenants])

  useEffect(() => {
    if (!status.message || status.type !== 'success') return

    const timeoutId = window.setTimeout(() => {
      setStatus({ type: 'idle', message: '' })
    }, 3500)

    return () => window.clearTimeout(timeoutId)
  }, [status.message, status.type])

  useEffect(() => {
    if (appDataQuery.error) {
      setStatus({ type: 'error', message: appDataQuery.error instanceof Error ? appDataQuery.error.message : 'Không tải được dữ liệu' })
    }
  }, [appDataQuery.error])

  const grantedMenuFeatureIds = useMemo(() => {
    const coreFeatures = ['dashboard', 'campaigns', 'brands', 'platforms', 'datasets', 'prelanders', 'tracking-links', 'click-events', 'activity-logs', 'billing', 'api-keys', 'settings', 'support']
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
    tenantPrelanders,
    tenantTrackingLinks,
    tenantCapiEvents,
    tenantConversionEvents,
    tenantReportSchedules,
    tenantActivityLogs,
    isSuperAdmin: Boolean(data.currentUser?.isSuperAdmin),
    superAdminUsers: data.superAdminUsers,
    billingPlans: data.billingPlans,
    menuFeatures: data.menuFeatures,
    grantedMenuFeatureIds,
    isLoading,
    lastUpdatedAt: appDataQuery.dataUpdatedAt,
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
    fetchJson,
    exportAnalyticsCsv
  }

  const meta = pageMeta[location.pathname] ?? pageMeta['/dashboard']

  return (
    <main className="app-shell shadcn-theme">
      <aside className="sidebar">
        <button type="button" className="workspace-switcher" onClick={() => navigate('/dashboard')}>
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
                  <NavLink key={item.path} to={item.path} className={({ isActive }) => `sidebar-link ${isActive ? 'is-active' : ''}`}>
                    <Icon size={17} />
                    <span>{item.label}</span>
                    {item.badge && <Badge variant="secondary" className="nav-badge">{item.badge}</Badge>}
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>

        <Card className="sidebar-upgrade-card">
          <CardHeader>
            <div className="upgrade-icon"><Sparkles size={16} /></div>
            <CardTitle>Upgrade plan</CardTitle>
            <CardDescription>Mở khóa advanced attribution, CAPI delivery và quota cao hơn.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="sm" className="w-full">Upgrade now</Button>
          </CardContent>
        </Card>
      </aside>

      <section className="main-panel">
        <header className="app-topbar">
          <div className="search-box">
            <Search size={16} />
            <input placeholder="Search campaigns, offers, links..." />
            <kbd>⌘K</kbd>
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
            <span className="last-updated">Cập nhật: {formatLastUpdated(appDataQuery.dataUpdatedAt)}</span>
            <Button variant="outline" type="button" onClick={() => void loadData()} disabled={isLoading}>
              {isLoading ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
              Refresh
            </Button>
            <Button type="button" onClick={() => navigate('/tracking-links')}><Plus size={16} /> New link</Button>
          </div>
        </section>

        <DashboardRoutes ctx={ctx} />
      </section>
    </main>
  )
}
