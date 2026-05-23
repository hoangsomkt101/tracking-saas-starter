import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import { Eye, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'

export type ActionButtonsProps = {
  detailPath?: string
  editPath?: string
  deletePath?: string
  isOpen?: boolean
  isEditing?: boolean
  onDetail?: () => void
  onEdit?: () => void
  onDelete?: () => void
}

export function ActionButtons({ detailPath, editPath, deletePath, isOpen, isEditing, onDetail, onEdit, onDelete }: ActionButtonsProps) {
  if (detailPath && editPath && deletePath) {
    return (
      <div className="row-actions">
        <Button asChild variant="outline" size="sm" type="button"><NavLink to={detailPath}><Eye size={14} /> Detail</NavLink></Button>
        <Button asChild variant="secondary" size="sm" type="button"><NavLink to={editPath}><Pencil size={14} /> Sửa</NavLink></Button>
        <Button asChild variant="destructive" size="sm" type="button"><NavLink to={deletePath}><Trash2 size={14} /> Xóa</NavLink></Button>
      </div>
    )
  }

  return (
    <div className="row-actions">
      <Button variant="outline" size="sm" type="button" onClick={onDetail}>{isOpen ? 'Ẩn' : 'Detail'}</Button>
      <Button variant="secondary" size="sm" type="button" onClick={onEdit}>{isEditing ? 'Hủy sửa' : 'Sửa'}</Button>
      <Button variant="destructive" size="sm" type="button" onClick={onDelete}>Xóa</Button>
    </div>
  )
}

export function PageToolbar({ title, description, createPath, createLabel }: { title: ReactNode; description: string; createPath?: string; createLabel?: string }) {
  return (
    <Card className="table-card list-shell-card">
      <CardHeader className="section-heading">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {createPath && <Button asChild><NavLink to={createPath}><Plus size={16} /> {createLabel ?? 'Thêm mới'}</NavLink></Button>}
      </CardHeader>
    </Card>
  )
}

export function EntityDetailCard({ title, description, children, backPath }: { title: ReactNode; description: string; children: ReactNode; backPath: string }) {
  return (
    <Card className="page-card detail-card">
      <CardHeader className="section-heading">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Button asChild variant="outline"><NavLink to={backPath}>Quay lại danh sách</NavLink></Button>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export function NotFoundEntity({ name, backPath }: { name: string; backPath: string }) {
  return <EntityDetailCard title={name} description="Không tìm thấy dữ liệu hoặc bạn không có quyền truy cập." backPath={backPath}><p className="empty-state">Dữ liệu không tồn tại trong workspace hiện tại.</p></EntityDetailCard>
}

export function DetailGrid({ children }: { children: ReactNode }) {
  return <div className="detail-grid">{children}</div>
}

export function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return <><span>{label}</span><strong>{value}</strong></>
}
