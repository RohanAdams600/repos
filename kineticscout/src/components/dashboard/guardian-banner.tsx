'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { SubmitButton } from '@/components/ui/submit-button'
import { resendGuardianConsentAction } from '@/lib/athletes/actions'
import { initialFormState } from '@/lib/forms'

export function GuardianBanner() {
  const [state, action] = useActionState(resendGuardianConsentAction, initialFormState)
  return (
    <section aria-labelledby="guardian-title" className="flex flex-col gap-3 border-2 border-fg p-5">
      <h2 id="guardian-title" className="text-lg font-bold">
        Waiting for parent or guardian consent
      </h2>
      <p className="text-fg-muted">
        Your profile stays private until your parent or guardian approves it. They also need to approve before a Pro purchase or coach
        outreach. Everything else works now.
      </p>
      {state.status === 'error' && <Alert tone="error">{state.message}</Alert>}
      {state.status === 'success' && <Alert tone="success">{state.message}</Alert>}
      <form action={action}>
        <SubmitButton pendingLabel="Sending">Send the consent email again</SubmitButton>
      </form>
    </section>
  )
}
