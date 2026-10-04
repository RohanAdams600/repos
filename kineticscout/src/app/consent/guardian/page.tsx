import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'
import { GuardianConsentForm } from '@/components/auth/guardian-consent-form'
import { Alert } from '@/components/ui/alert'
import { lookupGuardianConsent } from '@/lib/auth/guardian'

export const metadata: Metadata = { title: 'Parent or guardian consent', robots: { index: false } }

export default async function GuardianConsentPage({ searchParams }: PageProps<'/consent/guardian'>) {
  const params = await searchParams
  const token = typeof params.token === 'string' ? params.token : ''
  const lookup = token ? await lookupGuardianConsent(token) : ({ state: 'invalid' } as const)

  return (
    <AuthShell title="Parent or guardian consent">
      {lookup.state === 'invalid' && <Alert tone="error">This consent link is not valid. Ask your teen to send a new one from their dashboard.</Alert>}
      {lookup.state === 'expired' && <Alert tone="error">This consent link has expired. Ask your teen to send a new one from their dashboard.</Alert>}
      {lookup.state === 'granted' && <Alert tone="success">Consent has already been given for this account. No further action is needed.</Alert>}
      {lookup.state === 'pending' && (
        <div className="flex flex-col gap-6">
          <p className="text-fg-muted">
            {lookup.athleteFirstName ?? 'Your teen'} listed you as their parent or guardian on KineticScout. Until you consent, their account stays private.
          </p>
          <div>
            <h2 className="text-xl font-bold">What we collect</h2>
            <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-fg-muted">
              <li>Name, graduation year, position, and optionally height, weight, GPA, high school and X handle.</li>
              <li>Performance numbers they log, swing or pitch videos they upload for analysis, and clips they send to have a measurement verified (reviewed privately by our staff).</li>
              <li>Email address and date of birth, used for the account and to apply age rules.</li>
            </ul>
          </div>
          <div>
            <h2 className="text-xl font-bold">What your consent allows</h2>
            <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-fg-muted">
              <li>Making their profile public, if they choose to, so college coaches can view it.</li>
              <li>Drafting outreach emails to college coaches for them to send (Pro). Drafts are written by OpenAI from their profile facts; their email, date of birth and videos are never sent.</li>
              <li>Purchasing a Pro subscription. Purchases must be completed by you, the adult.</li>
            </ul>
          </div>
          <p className="text-fg-muted">
            We never sell personal information or use it for third-party advertising. Read the full <Link href="/legal/privacy">Privacy Policy</Link>.
          </p>
          <GuardianConsentForm token={token} />
        </div>
      )}
    </AuthShell>
  )
}
