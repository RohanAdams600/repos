import type { Metadata } from 'next'
import Link from 'next/link'
import { MarketingPreferenceForm } from '@/components/account/marketing-preference-form'
import { AuthShell } from '@/components/auth/auth-shell'
import { Alert } from '@/components/ui/alert'
import { db } from '@/lib/db'
import { linksMessages } from '@/i18n/messages/links'
import { messages } from '@/i18n/server'
import { maskEmail, verifyPreferencesToken } from '@/lib/email/preferences'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(linksMessages)).preferences.title, robots: { index: false, follow: false } }
}

/** Reached from the link in every product email; works without signing in. */
export default async function EmailPreferencesPage({ searchParams }: PageProps<'/email/preferences'>) {
  const params = await searchParams
  const m = (await messages(linksMessages)).preferences
  const userId = typeof params.u === 'string' ? params.u : ''
  const token = typeof params.t === 'string' ? params.t : ''
  const user = verifyPreferencesToken(userId, token)
    ? await db.user.findUnique({ where: { id: userId }, select: { email: true, marketingEmailOptIn: true, deletionScheduledFor: true } })
    : null

  if (!user) {
    return (
      <AuthShell title={m.title}>
        <Alert tone="error">
          {m.invalid} <Link href="/sign-in?next=/dashboard/settings">{m.signIn}</Link>
          {m.invalidTail}
        </Alert>
      </AuthShell>
    )
  }

  return (
    <AuthShell title={m.title} intro={<p>{m.choicesFor(maskEmail(user.email))}</p>}>
      <MarketingPreferenceForm mode="link" userId={userId} token={token} optedIn={user.marketingEmailOptIn} disabled={user.deletionScheduledFor !== null} />
      <p className="text-sm text-fg-muted">
        {m.account} <Link href="/sign-in?next=/dashboard/settings">{m.signIn}</Link>
        {m.accountTail}
      </p>
    </AuthShell>
  )
}
