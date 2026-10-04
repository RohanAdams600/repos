import type { Metadata } from 'next'
import Link from 'next/link'
import { MarketingPreferenceForm } from '@/components/account/marketing-preference-form'
import { AuthShell } from '@/components/auth/auth-shell'
import { Alert } from '@/components/ui/alert'
import { db } from '@/lib/db'
import { maskEmail, verifyPreferencesToken } from '@/lib/email/preferences'

export const metadata: Metadata = { title: 'Email preferences', robots: { index: false, follow: false } }

/** Reached from the link in every product email; works without signing in. */
export default async function EmailPreferencesPage({ searchParams }: PageProps<'/email/preferences'>) {
  const params = await searchParams
  const userId = typeof params.u === 'string' ? params.u : ''
  const token = typeof params.t === 'string' ? params.t : ''
  const user = verifyPreferencesToken(userId, token)
    ? await db.user.findUnique({ where: { id: userId }, select: { email: true, marketingEmailOptIn: true, deletionScheduledFor: true } })
    : null

  if (!user) {
    return (
      <AuthShell title="Email preferences">
        <Alert tone="error">
          This preferences link is not valid. Use the link in a recent KineticScout email, or <Link href="/sign-in?next=/dashboard/settings">sign in</Link>{' '}
          and open Settings.
        </Alert>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Email preferences" intro={<p>Choices for {maskEmail(user.email)}.</p>}>
      <MarketingPreferenceForm mode="link" userId={userId} token={token} optedIn={user.marketingEmailOptIn} disabled={user.deletionScheduledFor !== null} />
      <p className="text-sm text-fg-muted">
        Account emails (password resets, billing receipts, consent and deletion notices) are still sent while the account exists. To stop
        those, <Link href="/sign-in?next=/dashboard/settings">sign in</Link> and delete the account from Settings.
      </p>
    </AuthShell>
  )
}
