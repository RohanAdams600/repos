import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export const inputClass =
  'block min-h-11 w-full rounded-sm border-2 border-border-strong bg-bg px-3 text-base text-fg aria-[invalid=true]:border-danger hover:border-fg'

type FieldProps = {
  label: string
  name: string
  error?: string
  hint?: ReactNode
  required?: boolean
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean; required?: boolean; name: string }) => ReactNode
  className?: string
}

/** Label, control, hint and error wired together with ids so assistive tech reads them in order. */
export function Field({ label, name, error, hint, required, children, className }: FieldProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={id} className="font-bold">
        {label}
        {required ? (
          <span className="text-fg-muted font-normal"> (required)</span>
        ) : (
          <span className="text-fg-muted font-normal"> (optional)</span>
        )}
      </label>
      {hint && (
        <p id={hintId} className="text-sm text-fg-muted">
          {hint}
        </p>
      )}
      {children({ id, name, required, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {error && (
        <p id={errorId} className="text-sm font-bold text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClass, className)} {...props} />
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(inputClass, 'appearance-auto', className)} {...props}>
      {children}
    </select>
  )
}

export function Checkbox({
  label,
  error,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; error?: string }) {
  const id = useId()
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          className="mt-0.5 size-6 shrink-0 accent-[var(--accent)]"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          {...props}
        />
        <label htmlFor={id} className="leading-6">
          {label}
        </label>
      </div>
      {error && (
        <p id={`${id}-error`} className="pl-9 text-sm font-bold text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
