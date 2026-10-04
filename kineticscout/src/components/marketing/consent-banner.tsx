'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { recordConsentAction } from '@/lib/marketing/actions'
import { useMessages } from '@/i18n/client'
import { chromeMessages } from '@/i18n/messages/chrome'

/**
 * Analytics consent. Accept and Reject are the same size and weight, nothing is pre-selected, and
 * the site works fully either way. Nothing is loaded until the visitor chooses Accept.
 */
export function ConsentBanner() {
  const router = useRouter()
  const [hidden, setHidden] = useState(false)
  const [pending, startTransition] = useTransition()
  const m = useMessages(chromeMessages)
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
        {m.consentTitle}
      </h2>
      <p className="mt-2 text-sm text-fg-muted">
        {m.consentBody} <Link href="/legal/cookies">{m.cookies}</Link>
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button variant="secondary" disabled={pending} onClick={() => choose(false)}>
          {m.reject}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => choose(true)}>
          {m.accept}
        </Button>
      </div>
    </section>
  )
}
