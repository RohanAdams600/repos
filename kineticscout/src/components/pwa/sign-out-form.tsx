'use client'

import { useRef, type ReactNode } from 'react'
import { releaseDevicePush } from '@/lib/pwa/device'
import { clearOutbox } from '@/lib/pwa/outbox'

/**
 * Sign-out that first cleans this device: offline entries are deleted and push stops, so a shared
 * phone or school laptop keeps nothing of the account. Then the normal sign-out action runs.
 */
export function SignOutForm({ action, children, className }: { action: (formData: FormData) => void | Promise<void>; children: ReactNode; className?: string }) {
  const ready = useRef(false)
  return (
    <form
      action={action}
      className={className}
      onSubmit={(event) => {
        if (ready.current) return
        event.preventDefault()
        const form = event.currentTarget
        clearOutbox()
        void releaseDevicePush().finally(() => {
          ready.current = true
          form.requestSubmit()
        })
      }}
    >
      {children}
    </form>
  )
}
