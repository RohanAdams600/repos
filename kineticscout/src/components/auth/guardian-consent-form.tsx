'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { grantGuardianConsentAction } from '@/lib/athletes/actions'
import { initialFormState } from '@/lib/forms'

export function GuardianConsentForm({ token }: { token: string }) {
  const [state, action] = useActionState(grantGuardianConsentAction, initialFormState)
  if (state.status === 'success') {
    return (
      <Alert tone="success" title="Consent recorded" focusOnMount>
        {state.message} You can withdraw consent at any time by emailing support; the profile will return to private.
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
        label="I am this athlete's parent or legal guardian, I have read the Privacy Policy, and I consent to the uses described above."
      />
      <SubmitButton pendingLabel="Recording consent">Give consent</SubmitButton>
    </form>
  )
}
