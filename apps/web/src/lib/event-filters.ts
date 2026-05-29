import type { ActivityLogFilters, EventFilters } from '../types/domain'

export function getActiveEventFilterCount(filters: EventFilters) {
  return Object.values(filters).filter(Boolean).length
}

export function getActiveActivityLogFilterCount(filters: ActivityLogFilters) {
  return Object.values(filters).filter(Boolean).length
}

export function activityLogFilterParams(filters: ActivityLogFilters) {
  return {
    search: filters.search || undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
    level: filters.level || undefined,
    source: filters.source || undefined,
    eventType: filters.eventType || undefined,
    entityType: filters.entityType || undefined,
    entityId: filters.entityId || undefined
  }
}

export function eventFilterParams(filters: EventFilters) {
  return {
    search: filters.search || undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
    campaignId: filters.campaignId || undefined,
    trackingLinkId: filters.trackingLinkId || undefined,
    affiliatePlatformId: filters.affiliatePlatformId || undefined,
    status: filters.status || undefined
  }
}
