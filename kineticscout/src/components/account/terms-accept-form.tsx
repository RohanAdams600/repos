'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { acceptTermsAction } from '@/lib/account/actions'
import { initialFormState } from '@/lib/forms'

export function TermsAcceptForm({ next }: { next: string }) {
  const [state, action] = useActionState(acceptTermsAction, initialFormState)
  return (
    <form action={action} className="flex flex-col gap-5">
      {state.status === 'error' && (
        <Alert tone="error" focusOnMount>
          {state.message}
        </Alert>
      )}
      <input type="hidden" name="next" value={next} />
      <Checkbox
        name="accept"
        required
        error={state.status === 'error' ? state.fieldErrors?.accept : undefined}
        label={
          <>
            I have read and accept the updated <Link href="/legal/terms">Terms of Service</Link> and{' '}
            <Link href="/legal/privacy">Privacy Policy</Link>.
          </>
        }
      />
      <SubmitButton pendingLabel="Saving" className="self-start">
        Accept and continue
      </SubmitButton>
    </form>
  )
}
