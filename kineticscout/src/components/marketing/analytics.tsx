'use client'

import { usePathname } from 'next/navigation'
import Script from 'next/script'
import { useEffect } from 'react'
import { analyticsAllowedOn } from '@/lib/consent'

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

/**
 * Google Analytics 4. Rendered only after the visitor accepted analytics, and only on marketing
 * pages. Google signals and ad personalisation are off; no user ids or personal data are sent.
 */
export function Analytics({ measurementId, nonce }: { measurementId: string; nonce?: string }) {
  const pathname = usePathname()
  const allowed = analyticsAllowedOn(pathname)

  useEffect(() => {
    if (allowed && window.gtag) window.gtag('event', 'page_view', { page_path: pathname })
  }, [allowed, pathname])

  if (!allowed) return null
  return (
    <>
      <Script id="ga-loader" src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`} strategy="afterInteractive" nonce={nonce} />
      <Script id="ga-init" strategy="afterInteractive" nonce={nonce}>
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('js',new Date());gtag('config',${JSON.stringify(measurementId)},{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false});`}
      </Script>
    </>
  )
}
