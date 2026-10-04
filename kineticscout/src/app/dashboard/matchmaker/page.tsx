import type { Metadata } from 'next'
import { Matchmaker } from '@/components/dashboard/matchmaker'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { accountMessages } from '@/i18n/messages/account'
import { recruitingMessages } from '@/i18n/messages/recruiting'
import { messages } from '@/i18n/server'
import { requirePro } from '@/lib/auth/session'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(recruitingMessages)).matchmaker.title }
}

export default async function MatchmakerPage() {
  await requirePro('matchmaker', '/dashboard/matchmaker')
  const m = (await messages(recruitingMessages)).matchmaker
  const dash = (await messages(accountMessages)).dashboard
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: dash, href: '/dashboard' }, { label: m.title }]} />
        <h1 className="text-3xl font-bold">{m.title}</h1>
        <p className="max-w-3xl text-fg-muted">{m.intro}</p>
      </div>
      <Matchmaker />
    </div>
  )
}
