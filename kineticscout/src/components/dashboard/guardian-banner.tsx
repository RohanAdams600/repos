'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { SubmitButton } from '@/components/ui/submit-button'
import { resendGuardianConsentAction } from '@/lib/athletes/actions'
import { useMessages } from '@/i18n/client'
import { dashboardMessages } from '@/i18n/messages/dashboard'
import { initialFormState } from '@/lib/forms'

export function GuardianBanner({ revoked = false }: { revoked?: boolean }) {
  const [state, action] = useActionState(resendGuardianConsentAction, initialFormState)
  const m = useMessages(dashboardMessages).guardianBanner
  return (
    <section aria-labelledby="guardian-title" className="flex flex-col gap-3 border-2 border-fg p-5">
      <h2 id="guardian-title" className="text-lg font-bold">
        {revoked ? m.revokedTitle : m.waitingTitle}
      </h2>
      <p className="text-fg-muted">
        {revoked ? m.revokedBody : m.waitingBody}
      </p>
      {state.status === 'error' && <Alert tone="error">{state.message}</Alert>}
      {state.status === 'success' && <Alert tone="success">{state.message}</Alert>}
      <form action={action}>
        <SubmitButton pendingLabel={m.pending}>{revoked ? m.resendRevoked : m.resend}</SubmitButton>
      </form>
    </section>
  )
}
