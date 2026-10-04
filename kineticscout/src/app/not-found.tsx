import type { Metadata } from 'next'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { systemMessages } from '@/i18n/messages/system'
import { messages } from '@/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(systemMessages)).notFoundTitle, robots: { index: false } }
}

export default async function NotFound() {
  const m = await messages(systemMessages)
  return (
    <div className="flex max-w-2xl flex-col gap-6 py-12">
      <p className="tabular text-6xl font-bold text-accent-text" aria-hidden="true">404</p>
      <h1 className="text-3xl font-bold">{m.notFoundH1}</h1>
      <p className="text-fg-muted">{m.notFoundLead}</p>
      <ul className="flex list-disc flex-col gap-2 pl-5">
        <li><Link href="/">{m.home}</Link></li>
        <li><Link href="/pricing">{m.pricing}</Link></li>
        <li><Link href="/blog">{m.reports}</Link></li>
        <li><Link href="/dashboard">{m.dashboard}</Link></li>
      </ul>
      <Link href="/" className={buttonVariants({ variant: 'primary' }) + ' self-start'}>{m.goHome}</Link>
    </div>
  )
}
