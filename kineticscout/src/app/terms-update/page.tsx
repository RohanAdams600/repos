import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { DeleteAccountForm } from '@/components/account/delete-account-form'
import { TermsAcceptForm } from '@/components/account/terms-accept-form'
import { AuthShell } from '@/components/auth/auth-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { getAuthState } from '@/lib/auth/session'
import { LEGAL_LAST_UPDATED, TERMS_HIGHLIGHTS } from '@/lib/legal'
import { safeRedirectPath } from '@/lib/security/origin'

export const metadata: Metadata = { title: 'Updated terms', robots: { index: false, follow: false } }

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

  return (
    <AuthShell title="We updated our terms" intro={<p>Our Terms of Service and Privacy Policy changed on {LEGAL_LAST_UPDATED}. Please review them to keep using KineticScout.</p>}>
      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Key points</h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-fg-muted">
          {TERMS_HIGHLIGHTS.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <p className="text-fg-muted">
          Read the full <Link href="/legal/terms">Terms of Service</Link> and <Link href="/legal/privacy">Privacy Policy</Link>.
        </p>
      </div>
      <TermsAcceptForm next={next} />

      <section aria-labelledby="decline-title" className="flex flex-col gap-4 border-t-2 border-border-subtle pt-6">
        <h2 id="decline-title" className="text-xl font-bold">
          Do not agree?
        </h2>
        <p className="text-fg-muted">You can take a copy of your data and close your account without accepting the new terms.</p>
        <form method="post" action="/api/account/export">
          <Button type="submit" variant="secondary">
            Download my data
          </Button>
        </form>
        {deletionDate ? (
          <Alert tone="info">
            Your account is scheduled for deletion on{' '}
            {deletionDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}. To cancel, accept the
            terms above and open Settings.
          </Alert>
        ) : (
          <DeleteAccountForm />
        )}
      </section>
    </AuthShell>
  )
}
