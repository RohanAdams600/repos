import type { Metadata } from 'next'
import Link from 'next/link'
import { activeDeletionRequest } from '@/lib/account/deletion'
import { hasProAccess } from '@/lib/auth/permissions'
import { verifiedCoach } from '@/lib/coach/verification'
import { unreadMessageCount } from '@/lib/messaging/service'
import { unreadCount } from '@/lib/notifications/service'
import { requireUser } from '@/lib/auth/session'
import { OutboxSync } from '@/components/pwa/outbox-sync'
import { TrpcProviders } from '@/trpc/client'

export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser('/dashboard')
  const pro = hasProAccess(user)
  const coach = user.role === 'COACH' ? await verifiedCoach(user.id) : null
  const athlete = user.role === 'ATHLETE' && user.hasAthleteProfile
  const links: { href: string; label: string; pro?: boolean }[] =
    user.role === 'GUARDIAN'
      ? [
          { href: '/dashboard/family', label: 'Family' },
          { href: '/dashboard/notifications', label: 'Notifications' },
          { href: '/dashboard/settings', label: 'Settings' },
        ]
      : user.role === 'TEAM_COACH'
      ? [
          { href: '/dashboard/team', label: 'Your teams' },
          { href: '/dashboard/notifications', label: 'Notifications' },
          { href: '/dashboard/settings', label: 'Settings' },
        ]
      : user.role === 'COACH'
      ? [
          { href: '/dashboard', label: 'Overview' },
          ...(coach
            ? [
                { href: '/dashboard/prospects', label: 'Prospect search' },
                { href: '/dashboard/saved', label: 'Saved prospects' },
                { href: '/dashboard/contact-requests', label: 'Contact requests' },
                { href: '/dashboard/messages', label: 'Messages' },
              ]
            : []),
          { href: '/dashboard/notifications', label: 'Notifications' },
          { href: '/dashboard/settings', label: 'Settings' },
        ]
      : [
          { href: '/dashboard', label: 'Overview' },
          ...(athlete
            ? [
                { href: '/dashboard/profile', label: 'Profile and sharing' },
                { href: '/dashboard/metrics', label: 'Measurements' },
                { href: '/dashboard/insights', label: 'Insights' },
              ]
            : []),
          { href: '/dashboard/analysis', label: 'Video analysis', pro: true },
          { href: '/dashboard/training', label: 'Training plans', pro: true },
          { href: '/dashboard/matchmaker', label: 'College matchmaker', pro: true },
          { href: '/dashboard/recruiting', label: 'Recruiting assistant', pro: true },
          ...(athlete
            ? [
                { href: '/dashboard/teams', label: 'Teams' },
                { href: '/dashboard/events', label: 'Events' },
                { href: '/dashboard/contact-requests', label: 'Contact requests' },
                { href: '/dashboard/messages', label: 'Messages' },
              ]
            : []),
          { href: '/dashboard/billing', label: 'Plan and billing' },
          { href: '/dashboard/notifications', label: 'Notifications' },
          { href: '/dashboard/settings', label: 'Settings' },
        ]
  const [unread, unreadMessages] = await Promise.all([unreadCount(user.id), coach || athlete ? unreadMessageCount(user.id) : Promise.resolve(0)])
  const badges: Record<string, number> = { '/dashboard/notifications': unread, '/dashboard/messages': unreadMessages }
  const deletion = user.deletionScheduledFor ? await activeDeletionRequest(user.id) : null
  return (
    <TrpcProviders>
      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Dashboard" className="lg:sticky lg:top-24 lg:self-start">
          <ul className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
            {links.map((link) => (
              <li key={link.href} className="shrink-0">
                <Link href={link.href} className="flex min-h-11 items-center gap-2 border-2 border-border-subtle px-3 font-bold no-underline hover:border-fg">
                  {link.label}
                  {link.pro && !pro && <span className="text-xs font-normal text-fg-muted">Pro</span>}
                  {(badges[link.href] ?? 0) > 0 && (
                    <span className="tabular rounded-sm bg-[#E6FF00] px-1.5 text-sm text-[#121212]">
                      {badges[link.href]! > 99 ? '99+' : badges[link.href]}
                      <span className="sr-only"> unread</span>
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
                <strong>Account scheduled for deletion</strong> on{' '}
                {deletion.scheduledFor.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}.
                {deletion.requestedBy === 'GUARDIAN' ? ' Requested by your parent or guardian.' : ''}
              </p>
              <Link href="/dashboard/settings" className="shrink-0 font-bold">
                {deletion.requestedBy === 'GUARDIAN' ? 'Details' : 'Review or cancel'}
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
