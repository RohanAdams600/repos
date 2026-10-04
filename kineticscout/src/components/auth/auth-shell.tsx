import type { ReactNode } from 'react'

export function AuthShell({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">{title}</h1>
        {intro && <div className="text-fg-muted">{intro}</div>}
      </div>
      {children}
    </div>
  )
}
