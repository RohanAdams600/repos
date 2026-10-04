'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { grantGuardianConsentAction } from '@/lib/athletes/actions'
import { useMessages } from '@/i18n/client'
import { authMessages } from '@/i18n/messages/auth'
import { useServerText } from '@/i18n/server-text-client'
import { initialFormState } from '@/lib/forms'

export function GuardianConsentForm({ token }: { token: string }) {
  const [state, action] = useActionState(grantGuardianConsentAction, initialFormState)
  const m = useMessages(authMessages).guardianConsent
  const tr = useServerText()
  if (state.status === 'success') {
    return (
      <Alert tone="success" title={m.recorded} focusOnMount>
        {tr(state.message)} {m.emailed}
      </Alert>
    )
  }
  return (
    <form action={action} className="flex flex-col gap-5">
      {state.status === 'error' && (
        <Alert tone="error" focusOnMount>
          {state.message}
        </Alert>
      )}
      <input type="hidden" name="token" value={token} />
      <Checkbox
        name="attest"
        required
        error={state.status === 'error' ? state.fieldErrors?.attest : undefined}
        label={m.attest}
      />
      <SubmitButton pendingLabel={m.pending}>{m.submit}</SubmitButton>
    </form>
  )
}
