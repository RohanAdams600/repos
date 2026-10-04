import type { Metadata } from 'next'
import Link from 'next/link'
import { activeDeletionRequest } from '@/lib/account/deletion'
import { hasProAccess } from '@/lib/auth/permissions'
import { verifiedCoach } from '@/lib/coach/verification'
import { unreadMessageCount } from '@/lib/messaging/service'
import { unreadCount } from '@/lib/notifications/service'
import { requireUser } from '@/lib/auth/session'
import { OutboxSync } from '@/components/pwa/outbox-sync'
import { pick } from '@/i18n/define'
import { dashboardMessages } from '@/i18n/messages/dashboard'
import { formatDay } from '@/i18n/messages/domain'
import { getLocale } from '@/i18n/server'
import { TrpcProviders } from '@/trpc/client'

export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser('/dashboard')
  const locale = await getLocale()
  const t = pick(dashboardMessages, locale)
  const n = t.nav
  const pro = hasProAccess(user)
  const coach = user.role === 'COACH' ? await verifiedCoach(user.id) : null
  const athlete = user.role === 'ATHLETE' && user.hasAthleteProfile
  const links: { href: string; label: string; pro?: boolean }[] =
    user.role === 'GUARDIAN'
      ? [
          { href: '/dashboard/family', label: n.family },
          { href: '/dashboard/notifications', label: n.notifications },
          { href: '/dashboard/settings', label: n.settings },
        ]
      : user.role === 'TEAM_COACH'
      ? [
          { href: '/dashboard/team', label: n.yourTeams },
          { href: '/dashboard/notifications', label: n.notifications },
          { href: '/dashboard/settings', label: n.settings },
        ]
      : user.role === 'COACH'
      ? [
          { href: '/dashboard', label: n.overview },
          ...(coach
            ? [
                { href: '/dashboard/prospects', label: n.prospects },
                { href: '/dashboard/saved', label: n.saved },
                { href: '/dashboard/contact-requests', label: n.contactRequests },
                { href: '/dashboard/messages', label: n.messages },
              ]
            : []),
          { href: '/dashboard/notifications', label: n.notifications },
          { href: '/dashboard/settings', label: n.settings },
        ]
      : [
          { href: '/dashboard', label: n.overview },
          ...(athlete
            ? [
                { href: '/dashboard/profile', label: n.profile },
                { href: '/dashboard/metrics', label: n.metrics },
                { href: '/dashboard/insights', label: n.insights },
              ]
            : []),
          { href: '/dashboard/analysis', label: n.analysis, pro: true },
          { href: '/dashboard/training', label: n.training, pro: true },
          { href: '/dashboard/matchmaker', label: n.matchmaker, pro: true },
          { href: '/dashboard/recruiting', label: n.recruiting, pro: true },
          ...(athlete
            ? [
                { href: '/dashboard/teams', label: n.teams },
                { href: '/dashboard/events', label: n.events },
                { href: '/dashboard/contact-requests', label: n.contactRequests },
                { href: '/dashboard/messages', label: n.messages },
              ]
            : []),
          { href: '/dashboard/billing', label: n.billing },
          { href: '/dashboard/notifications', label: n.notifications },
          { href: '/dashboard/settings', label: n.settings },
        ]
  const [unread, unreadMessages] = await Promise.all([unreadCount(user.id), coach || athlete ? unreadMessageCount(user.id) : Promise.resolve(0)])
  const badges: Record<string, number> = { '/dashboard/notifications': unread, '/dashboard/messages': unreadMessages }
  const deletion = user.deletionScheduledFor ? await activeDeletionRequest(user.id) : null
  return (
    <TrpcProviders>
      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <nav aria-label={n.label} className="lg:sticky lg:top-24 lg:self-start">
          <ul className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
            {links.map((link) => (
              <li key={link.href} className="shrink-0">
                <Link href={link.href} className="flex min-h-11 items-center gap-2 border-2 border-border-subtle px-3 font-bold no-underline hover:border-fg">
                  {link.label}
                  {link.pro && !pro && <span className="text-xs font-normal text-fg-muted">Pro</span>}
                  {(badges[link.href] ?? 0) > 0 && (
                    <span className="tabular rounded-sm bg-[#E6FF00] px-1.5 text-sm text-[#121212]">
                      {badges[link.href]! > 99 ? '99+' : badges[link.href]}
                      <span className="sr-only">{n.unread}</span>
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex min-w-0 flex-col gap-8">
          {deletion && (
            <div role="status" className="flex flex-col gap-2 border-2 border-danger p-4 sm:flex-row sm:items-center sm:justify-between">
              <p>
                <strong>{t.deletion.scheduled}</strong>
                {t.deletion.on(formatDay(deletion.scheduledFor, locale))}
                {deletion.requestedBy === 'GUARDIAN' ? t.deletion.byGuardian : ''}
              </p>
              <Link href="/dashboard/settings" className="shrink-0 font-bold">
                {deletion.requestedBy === 'GUARDIAN' ? t.deletion.details : t.deletion.review}
              </Link>
            </div>
          )}
          {athlete && <OutboxSync userId={user.id} />}
          <div>{children}</div>
        </div>
      </div>
    </TrpcProviders>
  )
}
