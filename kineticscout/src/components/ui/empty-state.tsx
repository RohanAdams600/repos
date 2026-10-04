import type { ReactNode } from 'react'

export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 border-2 border-dashed border-border-strong p-6">
      <h3 className="text-lg font-bold">{title}</h3>
      <div className="text-fg-muted">{children}</div>
      {action}
    </div>
  )
}
