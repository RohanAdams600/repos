'use client'

import { useActionState, useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { attendanceAction } from '@/lib/events/actions'
import { initialFormState } from '@/lib/forms'

export function AttendanceForm({ eventId, going, shareWithCoaches, profilePublic }: { eventId: string; going: boolean; shareWithCoaches: boolean; profilePublic: boolean }) {
  const [state, action] = useActionState(attendanceAction, initialFormState)
  const [share, setShare] = useState(shareWithCoaches)
  return (
    <div className="flex flex-col gap-4">
      {state.status !== 'idle' && (
        <Alert tone={state.status === 'success' ? 'success' : 'error'} focusOnMount>
          {state.message}
        </Alert>
      )}
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="going" value="yes" />
        <Checkbox
          name="shareWithCoaches"
          checked={share}
          onChange={(e) => setShare(e.target.checked)}
          label="Show verified college coaches that I am going"
        />
        <p className="text-sm text-fg-muted">
          {profilePublic
            ? 'Coaches see your name, class, position and a link to your public profile. Turn this off at any time.'
            : 'Coaches only see this once your profile is public. Until then, nobody else sees that you are going.'}
        </p>
        <SubmitButton pendingLabel="Saving" className="self-start">
          {going ? 'Save' : 'I am going'}
        </SubmitButton>
      </form>
      {going && (
        <form action={action}>
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="going" value="no" />
          <SubmitButton pendingLabel="Removing" variant="secondary" className="self-start">
            I am not going
          </SubmitButton>
        </form>
      )}
    </div>
  )
}
