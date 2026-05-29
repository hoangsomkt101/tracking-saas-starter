import { Navigate, Route, Routes } from 'react-router'
import { Settings, WalletCards } from 'lucide-react'
import { FeatureGate, PlaceholderPage } from '../components/common/FeatureGate'
import { OverviewPage } from '../features/dashboard/OverviewPage'
import { AnalyticsPage } from '../features/analytics/AnalyticsPage'
import { SuperAdminPage, SuperAdminUserManagePage } from '../features/admin/SuperAdminPages'
import { ClickEventsPage } from '../features/events/EventPages'
import { ActivityLogsPage } from '../features/logs/ActivityLogsPage'
import { SupportPage } from '../features/support/SupportPage'
import { CampaignCreatePage, CampaignDeletePage, CampaignDetailPage, CampaignEditPage, CampaignsPage, DatasetCreatePage, DatasetDeletePage, DatasetDetailPage, DatasetEditPage, DatasetsPage, PlatformCreatePage, PlatformDeletePage, PlatformDetailPage, PlatformEditPage, PlatformsPage, TrackingLinkCreatePage, TrackingLinkDeletePage, TrackingLinkDetailPage, TrackingLinkEditPage, TrackingLinksPage } from '../features/resources/ResourcePages'
import type { DashboardContext } from '../types/domain'

export function DashboardRoutes({ ctx }: { ctx: DashboardContext }) {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<FeatureGate ctx={ctx} featureKey="dashboard"><OverviewPage ctx={ctx} /></FeatureGate>} />
      <Route path="/campaigns" element={<FeatureGate ctx={ctx} featureKey="campaigns"><CampaignsPage ctx={ctx} /></FeatureGate>} />
      <Route path="/campaigns/new" element={<FeatureGate ctx={ctx} featureKey="campaigns"><CampaignCreatePage ctx={ctx} /></FeatureGate>} />
      <Route path="/campaigns/:id" element={<FeatureGate ctx={ctx} featureKey="campaigns"><CampaignDetailPage ctx={ctx} /></FeatureGate>} />
      <Route path="/campaigns/:id/edit" element={<FeatureGate ctx={ctx} featureKey="campaigns"><CampaignEditPage ctx={ctx} /></FeatureGate>} />
      <Route path="/campaigns/:id/delete" element={<FeatureGate ctx={ctx} featureKey="campaigns"><CampaignDeletePage ctx={ctx} /></FeatureGate>} />
      <Route path="/platforms" element={<FeatureGate ctx={ctx} featureKey="platforms"><PlatformsPage ctx={ctx} /></FeatureGate>} />
      <Route path="/platforms/new" element={<FeatureGate ctx={ctx} featureKey="platforms"><PlatformCreatePage ctx={ctx} /></FeatureGate>} />
      <Route path="/platforms/:id" element={<FeatureGate ctx={ctx} featureKey="platforms"><PlatformDetailPage ctx={ctx} /></FeatureGate>} />
      <Route path="/platforms/:id/edit" element={<FeatureGate ctx={ctx} featureKey="platforms"><PlatformEditPage ctx={ctx} /></FeatureGate>} />
      <Route path="/platforms/:id/delete" element={<FeatureGate ctx={ctx} featureKey="platforms"><PlatformDeletePage ctx={ctx} /></FeatureGate>} />
      <Route path="/datasets" element={<FeatureGate ctx={ctx} featureKey="datasets"><DatasetsPage ctx={ctx} /></FeatureGate>} />
      <Route path="/datasets/new" element={<FeatureGate ctx={ctx} featureKey="datasets"><DatasetCreatePage ctx={ctx} /></FeatureGate>} />
      <Route path="/datasets/:id" element={<FeatureGate ctx={ctx} featureKey="datasets"><DatasetDetailPage ctx={ctx} /></FeatureGate>} />
      <Route path="/datasets/:id/edit" element={<FeatureGate ctx={ctx} featureKey="datasets"><DatasetEditPage ctx={ctx} /></FeatureGate>} />
      <Route path="/datasets/:id/delete" element={<FeatureGate ctx={ctx} featureKey="datasets"><DatasetDeletePage ctx={ctx} /></FeatureGate>} />
      <Route path="/tracking-links" element={<FeatureGate ctx={ctx} featureKey="tracking-links"><TrackingLinksPage ctx={ctx} /></FeatureGate>} />
      <Route path="/tracking-links/new" element={<FeatureGate ctx={ctx} featureKey="tracking-links"><TrackingLinkCreatePage ctx={ctx} /></FeatureGate>} />
      <Route path="/tracking-links/:id" element={<FeatureGate ctx={ctx} featureKey="tracking-links"><TrackingLinkDetailPage ctx={ctx} /></FeatureGate>} />
      <Route path="/tracking-links/:id/edit" element={<FeatureGate ctx={ctx} featureKey="tracking-links"><TrackingLinkEditPage ctx={ctx} /></FeatureGate>} />
      <Route path="/tracking-links/:id/delete" element={<FeatureGate ctx={ctx} featureKey="tracking-links"><TrackingLinkDeletePage ctx={ctx} /></FeatureGate>} />
      <Route path="/click-events" element={<FeatureGate ctx={ctx} featureKey="click-events"><ClickEventsPage ctx={ctx} /></FeatureGate>} />
      <Route path="/logs" element={<FeatureGate ctx={ctx} featureKey="activity-logs"><ActivityLogsPage ctx={ctx} /></FeatureGate>} />
      <Route path="/analytics" element={<FeatureGate ctx={ctx} featureKey="analytics"><AnalyticsPage ctx={ctx} /></FeatureGate>} />
      <Route path="/billing" element={<FeatureGate ctx={ctx} featureKey="billing"><PlaceholderPage icon={WalletCards} title="Billing" description="Plan, usage quota và invoices." /></FeatureGate>} />
      <Route path="/settings" element={<FeatureGate ctx={ctx} featureKey="settings"><PlaceholderPage icon={Settings} title="Settings" description="Workspace settings và tracking integrations." /></FeatureGate>} />
      <Route path="/support" element={<FeatureGate ctx={ctx} featureKey="support"><SupportPage /></FeatureGate>} />
      <Route path="/superadmin" element={<SuperAdminPage ctx={ctx} />} />
      <Route path="/superadmin/users/:id/manage" element={<SuperAdminUserManagePage ctx={ctx} />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
