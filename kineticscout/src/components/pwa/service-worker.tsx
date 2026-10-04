'use client'

import { useEffect } from 'react'

/**
 * Registers the service worker (offline page and push notifications) in production builds only,
 * so development never serves a stale cached page.
 */
export function ServiceWorkerRegistration({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Unsupported or blocked (private browsing): the site works the same without it.
    })
  }, [enabled])
  return null
}
