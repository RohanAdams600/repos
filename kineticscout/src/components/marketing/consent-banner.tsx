'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { recordConsentAction } from '@/lib/marketing/actions'

/**
 * Analytics consent. Accept and Reject are the same size and weight, nothing is pre-selected, and
 * the site works fully either way. Nothing is loaded until the visitor chooses Accept.
 */
export function ConsentBanner() {
  const router = useRouter()
  const [hidden, setHidden] = useState(false)
  const [pending, startTransition] = useTransition()
  if (hidden) return null

  const choose = (analytics: boolean) =>
    startTransition(async () => {
      await recordConsentAction(analytics, window.location.search)
      setHidden(true)
      router.refresh()
    })

  return (
    <section
      aria-labelledby="consent-title"
      data-print="hide"
      className="fixed inset-x-0 bottom-0 z-50 border-t-2 border-fg bg-bg px-4 py-4 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-md sm:border-2"
    >
      <h2 id="consent-title" className="font-bold">
        Analytics cookies
      </h2>
      <p className="mt-2 text-sm text-fg-muted">
        May we use Google Analytics on our public pages to see which pages are useful? It is never used on your dashboard and you can change
        your mind any time under Cookie settings. <Link href="/legal/cookies">Cookie Policy</Link>
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button variant="secondary" disabled={pending} onClick={() => choose(false)}>
          Reject
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => choose(true)}>
          Accept
        </Button>
      </div>
    </section>
  )
}
