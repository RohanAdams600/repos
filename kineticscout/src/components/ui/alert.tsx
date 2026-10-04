'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { AlertIcon, CheckIcon } from '@/components/icons'
import { cn } from '@/lib/cn'

type AlertProps = {
  tone: 'error' | 'success' | 'info'
  title?: string
  children: ReactNode
  /** Move keyboard and screen reader focus to the alert when it appears (form results). */
  focusOnMount?: boolean
  className?: string
}

export function Alert({ tone, title, children, focusOnMount = false, className }: AlertProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (focusOnMount) ref.current?.focus()
  }, [focusOnMount, children])

  return (
    <div
      ref={ref}
      tabIndex={focusOnMount ? -1 : undefined}
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex gap-3 rounded-sm border-2 p-4',
        tone === 'error' && 'border-danger text-danger',
        tone === 'success' && 'border-accent-text text-fg',
        tone === 'info' && 'border-border-strong text-fg',
        className,
      )}
    >
      <span className="mt-0.5 shrink-0">{tone === 'error' ? <AlertIcon /> : <CheckIcon />}</span>
      <div className="min-w-0">
        {title && <p className="font-bold">{title}</p>}
        <div className={cn(tone !== 'error' && 'text-fg-muted', title && 'mt-1')}>{children}</div>
      </div>
    </div>
  )
}
