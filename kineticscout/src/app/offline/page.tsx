import type { Metadata } from 'next'
import Link from 'next/link'
import { systemMessages } from '@/i18n/messages/system'
import { messages } from '@/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(systemMessages)).offlineTitle, robots: { index: false, follow: false } }
}

/** Shown by the service worker when a page cannot be reached. Contains nothing about any account. */
export default async function OfflinePage() {
  const m = await messages(systemMessages)
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <h1 className="text-3xl font-bold">{m.offlineTitle}</h1>
      <p className="text-lg text-fg-muted">{m.offlineLead}</p>
      <ul className="flex list-disc flex-col gap-2 pl-5 text-fg-muted">
        <li>{m.offlineQueued}</li>
        <li>{m.offlineNeeds}</li>
      </ul>
      <Link href="/dashboard" className="self-start font-bold">
        {m.offlineRetry}
      </Link>
    </div>
  )
}
