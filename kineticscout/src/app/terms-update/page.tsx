import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { DeleteAccountForm } from '@/components/account/delete-account-form'
import { TermsAcceptForm } from '@/components/account/terms-accept-form'
import { AuthShell } from '@/components/auth/auth-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { getAuthState } from '@/lib/auth/session'
import { LEGAL_LAST_UPDATED, LEGAL_UPDATED_ON, TERMS_HIGHLIGHTS, TERMS_HIGHLIGHTS_ES } from '@/lib/legal'
import { pick } from '@/i18n/define'
import { authMessages } from '@/i18n/messages/auth'
import { formatDay } from '@/i18n/messages/domain'
import { getLocale, messages } from '@/i18n/server'
import { safeRedirectPath } from '@/lib/security/origin'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(authMessages)).terms.title, robots: { index: false, follow: false } }
}

/**
 * Shown instead of the dashboard until the current terms are accepted. Declining is a real option:
 * the data download and account deletion work from here without accepting anything.
 */
export default async function TermsUpdatePage({ searchParams }: PageProps<'/terms-update'>) {
  const params = await searchParams
  const next = safeRedirectPath(typeof params.next === 'string' ? params.next : null)
  const state = await getAuthState()
  if (state.status === 'anonymous') redirect(`/sign-in?next=${encodeURIComponent(next)}`)
  if (state.status === 'needs-account') redirect('/onboarding')
  if (state.user.termsCurrent) redirect(next)
  const deletionDate = state.user.deletionScheduledFor
  const locale = await getLocale()
  const t = pick(authMessages, locale)
  const m = t.terms
  const highlights = locale === 'es' ? TERMS_HIGHLIGHTS_ES : TERMS_HIGHLIGHTS

  return (
    <AuthShell title={m.h1} intro={<p>{m.intro(locale === 'es' ? formatDay(LEGAL_UPDATED_ON, locale) : LEGAL_LAST_UPDATED)}</p>}>
      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">{m.keyPoints}</h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-fg-muted">
          {highlights.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <p className="text-fg-muted">
          {m.readFull} <Link href="/legal/terms">{t.signUp.terms}</Link> {m.and} <Link href="/legal/privacy">{t.signUp.privacy}</Link>.
        </p>
      </div>
      <TermsAcceptForm next={next} />

      <section aria-labelledby="decline-title" className="flex flex-col gap-4 border-t-2 border-border-subtle pt-6">
        <h2 id="decline-title" className="text-xl font-bold">
          {m.declineTitle}
        </h2>
        <p className="text-fg-muted">{m.declineBody}</p>
        <form method="post" action="/api/account/export">
          <Button type="submit" variant="secondary">
            {m.download}
          </Button>
        </form>
        {deletionDate ? (
          <Alert tone="info">{m.scheduled(formatDay(deletionDate, locale))}</Alert>
        ) : (
          <DeleteAccountForm />
        )}
      </section>
    </AuthShell>
  )
}
