import type { Metadata } from 'next'
import Link from 'next/link'
import { activeDeletionRequest } from '@/lib/account/deletion'
import { hasProAccess } from '@/lib/auth/permissions'
import { unreadCount } from '@/lib/notifications/service'
import { requireUser } from '@/lib/auth/session'
import { TrpcProviders } from '@/trpc/client'

export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser('/dashboard')
  const pro = hasProAccess(user)
  const links = [
    { href: '/dashboard', label: 'Overview' },
    ...(user.role === 'ATHLETE' && user.hasAthleteProfile
      ? [
          { href: '/dashboard/profile', label: 'Profile and sharing' },
          { href: '/dashboard/metrics', label: 'Measurements' },
          { href: '/dashboard/insights', label: 'Insights' },
        ]
      : []),
    ...(user.role !== 'COACH'
      ? [
          { href: '/dashboard/analysis', label: 'Video analysis', pro: true },
          { href: '/dashboard/matchmaker', label: 'College matchmaker', pro: true },
          { href: '/dashboard/recruiting', label: 'Recruiting assistant', pro: true },
        ]
      : []),
    { href: '/dashboard/billing', label: 'Plan and billing' },
    { href: '/dashboard/notifications', label: 'Notifications' },
    { href: '/dashboard/settings', label: 'Settings' },
  ]
  const unread = await unreadCount(user.id)
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
                  {'pro' in link && link.pro && !pro && <span className="text-xs font-normal text-fg-muted">Pro</span>}
                  {link.href === '/dashboard/notifications' && unread > 0 && (
                    <span className="tabular rounded-sm bg-[#E6FF00] px-1.5 text-sm text-[#121212]">
                      {unread > 99 ? '99+' : unread}
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
          <div>{children}</div>
        </div>
      </div>
    </TrpcProviders>
  )
}
