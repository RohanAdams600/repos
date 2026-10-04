import type { Metadata } from 'next'
import { ConsentDisclosures } from '@/components/consent/consent-disclosures'
import { AuthShell } from '@/components/auth/auth-shell'
import { GuardianConsentForm } from '@/components/auth/guardian-consent-form'
import { Alert } from '@/components/ui/alert'
import { lookupGuardianConsent } from '@/lib/auth/guardian'
import { consentMessages } from '@/i18n/messages/consent'
import { messages } from '@/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(consentMessages)).consent.title, robots: { index: false } }
}

export default async function GuardianConsentPage({ searchParams }: PageProps<'/consent/guardian'>) {
  const params = await searchParams
  const token = typeof params.token === 'string' ? params.token : ''
  const lookup = token ? await lookupGuardianConsent(token) : ({ state: 'invalid' } as const)
  const m = (await messages(consentMessages)).consent

  return (
    <AuthShell title={m.title}>
      {lookup.state === 'invalid' && <Alert tone="error">{m.invalid}</Alert>}
      {lookup.state === 'expired' && <Alert tone="error">{m.expired}</Alert>}
      {lookup.state === 'granted' && <Alert tone="success">{m.granted}</Alert>}
      {lookup.state === 'pending' && (
        <div className="flex flex-col gap-6">
          <p className="text-fg-muted">{m.listed(lookup.athleteFirstName ?? m.yourTeen)}</p>
          <ConsentDisclosures />
          <GuardianConsentForm token={token} />
        </div>
      )}
    </AuthShell>
  )
}
