'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { acceptTermsAction } from '@/lib/account/actions'
import { useMessages } from '@/i18n/client'
import { authMessages } from '@/i18n/messages/auth'
import { initialFormState } from '@/lib/forms'

export function TermsAcceptForm({ next }: { next: string }) {
  const [state, action] = useActionState(acceptTermsAction, initialFormState)
  const t = useMessages(authMessages)
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
            {t.terms.accept} <Link href="/legal/terms">{t.signUp.terms}</Link> {t.terms.and} <Link href="/legal/privacy">{t.signUp.privacy}</Link>.
          </>
        }
      />
      <SubmitButton pendingLabel={t.terms.saving} className="self-start">
        {t.terms.acceptContinue}
      </SubmitButton>
    </form>
  )
}
