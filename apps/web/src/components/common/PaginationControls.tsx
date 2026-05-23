import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import type { PaginationMeta } from '../../types/domain'

export function PaginationControls({ meta, isLoading, onPageChange }: { meta: PaginationMeta; isLoading: boolean; onPageChange: (page: number) => void }) {
  const start = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1
  const end = Math.min(meta.page * meta.limit, meta.total)

  return (
    <div className="pagination-controls">
      <span>{start}-{end} / {meta.total} records</span>
      <div>
        <Button variant="outline" size="sm" type="button" disabled={isLoading || !meta.hasPreviousPage} onClick={() => onPageChange(meta.page - 1)}>Previous</Button>
        <Badge variant="outline">Page {meta.page}/{meta.totalPages}</Badge>
        <Button variant="outline" size="sm" type="button" disabled={isLoading || !meta.hasNextPage} onClick={() => onPageChange(meta.page + 1)}>Next</Button>
      </div>
    </div>
  )
}
