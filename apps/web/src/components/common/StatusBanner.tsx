import type { CreateStatus } from '../../types/domain'

export function StatusBanner({ status }: { status: CreateStatus }) {
  if (!status.message) return null
  return <div className={`status ${status.type}`}>{status.message}</div>
}
