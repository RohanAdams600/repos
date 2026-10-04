import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'You are offline', robots: { index: false, follow: false } }

/** Shown by the service worker when a page cannot be reached. Contains nothing about any account. */
export default function OfflinePage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <h1 className="text-3xl font-bold">You are offline</h1>
      <p className="text-lg text-fg-muted">This page needs a connection. Check your signal or Wi-Fi, then try again.</p>
      <ul className="flex list-disc flex-col gap-2 pl-5 text-fg-muted">
        <li>Measurements you log on the dashboard while offline are kept on this device and sent automatically when you reconnect.</li>
        <li>Video uploads, messages and percentiles need a connection.</li>
      </ul>
      <Link href="/dashboard" className="self-start font-bold">
        Try the dashboard again
      </Link>
    </div>
  )
}
