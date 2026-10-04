'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { SubmitButton } from '@/components/ui/submit-button'
import { resendGuardianConsentAction } from '@/lib/athletes/actions'
import { initialFormState } from '@/lib/forms'

export function GuardianBanner({ revoked = false }: { revoked?: boolean }) {
  const [state, action] = useActionState(resendGuardianConsentAction, initialFormState)
  return (
    <section aria-labelledby="guardian-title" className="flex flex-col gap-3 border-2 border-fg p-5">
      <h2 id="guardian-title" className="text-lg font-bold">
        {revoked ? 'Your parent or guardian withdrew consent' : 'Waiting for parent or guardian consent'}
      </h2>
      <p className="text-fg-muted">
        {revoked
          ? 'Your profile is private, and Pro purchases and coach outreach are paused. You can still log metrics and see your numbers. If you have talked it over with them, you can send a new consent request.'
          : 'Your profile stays private until your parent or guardian approves it. They also need to approve before a Pro purchase or coach outreach. Everything else works now.'}
      </p>
      {state.status === 'error' && <Alert tone="error">{state.message}</Alert>}
      {state.status === 'success' && <Alert tone="success">{state.message}</Alert>}
      <form action={action}>
        <SubmitButton pendingLabel="Sending">{revoked ? 'Send a new consent request' : 'Send the consent email again'}</SubmitButton>
      </form>
    </section>
  )
}
