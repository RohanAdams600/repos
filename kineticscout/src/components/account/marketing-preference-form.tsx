'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { updateMarketingPreferenceAction, updatePreferencesByLinkAction } from '@/lib/account/actions'
import { initialFormState } from '@/lib/forms'

type Props = { optedIn: boolean; disabled?: boolean } & ({ mode: 'settings' } | { mode: 'link'; userId: string; token: string })

/** One checkbox, unticked means no product email. Saving is explicit; nothing changes on page load. */
export function MarketingPreferenceForm(props: Props) {
  const [state, action] = useActionState(props.mode === 'settings' ? updateMarketingPreferenceAction : updatePreferencesByLinkAction, initialFormState)
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.status === 'error' && (
        <Alert tone="error" focusOnMount>
          {state.message}
        </Alert>
      )}
      {state.status === 'success' && (
        <Alert tone="success" focusOnMount>
          {state.message}
        </Alert>
      )}
      {props.mode === 'link' && (
        <>
          <input type="hidden" name="u" value={props.userId} />
          <input type="hidden" name="t" value={props.token} />
        </>
      )}
      <Checkbox
        name="marketing"
        defaultChecked={props.optedIn}
        disabled={props.disabled}
        label="Send me occasional product news and training tips (about twice a month at most)."
      />
      <SubmitButton pendingLabel="Saving" className="self-start">
        Save email preferences
      </SubmitButton>
    </form>
  )
}
