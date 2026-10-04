import { cn } from '@/lib/cn'
import { UiText } from '@/components/ui/ui-text'

/** Indeterminate loading indicator. Announced to screen readers through the label. */
export function Spinner({ label, className }: { label?: string; className?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2', className)}>
      <svg className="size-5 animate-spin motion-reduce:animate-none" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="var(--accent-text)" strokeWidth="3" strokeLinecap="square" />
      </svg>
      <span className="sr-only">{label ?? <UiText k="loading" />}</span>
    </span>
  )
}
