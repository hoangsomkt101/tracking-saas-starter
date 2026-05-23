import type { Dataset } from '../types/domain'

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value))
}

export function formatLastUpdated(value: number) {
  if (!value) return 'Chưa cập nhật'

  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(value))
}

export function formatCurrencyAmount(value?: number | string | null, currency = 'USD') {
  const amount = Number(value ?? 0)
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0)
}

export function formatPercent(value?: number | null) {
  return `${((value ?? 0) * 100).toFixed(2)}%`
}

export function getDatasetLabel(dataset?: Dataset | null, fallbackId?: string | null) {
  if (dataset) return `${dataset.platform.toUpperCase()} · ${dataset.name} · ${dataset.pixelId}`
  return fallbackId || '—'
}

export function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}
