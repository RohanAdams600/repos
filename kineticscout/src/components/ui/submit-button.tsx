'use client'

import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

/** Submit button that disables itself and shows progress while its form's action is pending. */
export function SubmitButton({
  children,
  pendingLabel,
  className,
  variant,
  size,
}: {
  children: React.ReactNode
  pendingLabel: string
  className?: string
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'md' | 'sm'
}) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} aria-disabled={pending} variant={variant} size={size} className={className}>
      {pending ? <Spinner label={pendingLabel} /> : null}
      {pending ? pendingLabel : children}
    </Button>
  )
}
