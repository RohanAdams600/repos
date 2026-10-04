import type { Metadata } from 'next'
import { ConsentDisclosures } from '@/components/consent/consent-disclosures'
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
          <ConsentDisclosures />
          <GuardianConsentForm token={token} />
        </div>
      )}
    </AuthShell>
  )
}
