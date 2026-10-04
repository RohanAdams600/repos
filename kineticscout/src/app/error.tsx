'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

/** Route-level error boundary. Shows no internals; the digest lets support find the server log entry. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Server errors are logged with full detail on the server; this only notes that the boundary fired.
    console.error('route error boundary', error.digest)
  }, [error.digest])
  return (
    <div role="alert" className="flex max-w-2xl flex-col gap-4 py-12">
      <h1 className="text-3xl font-bold">Something went wrong</h1>
      <p className="text-fg-muted">This was a problem on our side and it has been logged. Try again, and if it keeps happening contact support.</p>
      {error.digest && <p className="tabular text-sm text-fg-muted">Reference: {error.digest}</p>}
      <Button onClick={reset} className="self-start">Try again</Button>
    </div>
  )
}
