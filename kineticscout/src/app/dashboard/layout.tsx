import type { Metadata } from 'next'
import Link from 'next/link'
import { hasProAccess } from '@/lib/auth/permissions'
import { requireUser } from '@/lib/auth/session'
import { TrpcProviders } from '@/trpc/client'

export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser('/dashboard')
  const pro = hasProAccess(user)
  const links = [
    { href: '/dashboard', label: 'Overview' },
    ...(user.role !== 'COACH'
      ? [
          { href: '/dashboard/analysis', label: 'Video analysis', pro: true },
          { href: '/dashboard/matchmaker', label: 'College matchmaker', pro: true },
        ]
      : []),
    { href: '/dashboard/billing', label: 'Plan and billing' },
  ]
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
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </TrpcProviders>
  )
}
