import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { EmptyState } from '@/components/ui/empty-state'
import { requireGuardian } from '@/lib/auth/session'
import { pick } from '@/i18n/define'
import { accountMessages } from '@/i18n/messages/account'
import { domain } from '@/i18n/messages/domain'
import { familyMessages } from '@/i18n/messages/family'
import { getLocale, messages } from '@/i18n/server'
import { familyOverview } from '@/lib/family/service'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(familyMessages)).title }
}

export default async function FamilyPage() {
  const user = await requireGuardian()
  const children = await familyOverview(user)
  const locale = await getLocale()
  const m = pick(familyMessages, locale)
  const d = domain(locale)
  const dash = pick(accountMessages, locale).dashboard
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: dash, href: '/dashboard' }, { label: m.title }]} />
        <h1 className="text-3xl font-bold">{m.title}</h1>
        <p className="text-fg-muted">{m.intro(user.email)}</p>
      </div>
      {children.length === 0 ? (
        <EmptyState title={m.noneTitle}>
          <p>
            {m.none(user.email)} <Link href="/contact">{m.contactPage}</Link>.
          </p>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-4" aria-label={m.list}>
          {children.map((child) => {
            const waiting = child.pendingTeams + child.pendingContacts
            return (
              <li key={child.athleteId} className="flex flex-col gap-3 border-2 border-border-subtle p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-xl font-bold">
                    <Link href={`/dashboard/family/${child.athleteId}`}>
                      {child.firstName} {child.lastName}
                    </Link>
                  </h2>
                  <span className={child.consentStatus === 'GRANTED' ? 'font-bold' : 'font-bold text-danger'}>{m.consent[child.consentStatus]}</span>
                </div>
                <p className="text-fg-muted">{m.summary(d.sport[child.sport], child.gradYear, child.isPublic)}</p>
                {waiting > 0 && (
                  <p className="font-bold">{m.waiting(waiting)}</p>
                )}
                {child.deletionScheduledFor && <p className="font-bold text-danger">{m.deletionScheduled}</p>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
