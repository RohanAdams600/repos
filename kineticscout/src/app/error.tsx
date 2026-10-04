'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { useMessages } from '@/i18n/client'
import { systemMessages } from '@/i18n/messages/system'

/** Route-level error boundary. Shows no internals; the digest lets support find the server log entry. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const m = useMessages(systemMessages)
  useEffect(() => {
    // Server errors are logged with full detail on the server; this only notes that the boundary fired.
    console.error('route error boundary', error.digest)
  }, [error.digest])
  return (
    <div role="alert" className="flex max-w-2xl flex-col gap-4 py-12">
      <h1 className="text-3xl font-bold">{m.errorH1}</h1>
      <p className="text-fg-muted">{m.errorLead}</p>
      {error.digest && <p className="tabular text-sm text-fg-muted">{m.reference}: {error.digest}</p>}
      <Button onClick={reset} className="self-start">{m.tryAgain}</Button>
    </div>
  )
}
