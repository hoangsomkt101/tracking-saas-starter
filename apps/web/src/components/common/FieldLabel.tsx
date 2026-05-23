import type { ReactNode } from 'react'

export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="field-label">{children}</span>
}
