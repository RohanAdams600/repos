'use client'

import { useActionState, useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { attendanceAction } from '@/lib/events/actions'
import { initialFormState } from '@/lib/forms'
import { useMessages } from '@/i18n/client'
import { eventsMessages } from '@/i18n/messages/events'

export function AttendanceForm({ eventId, going, shareWithCoaches, profilePublic }: { eventId: string; going: boolean; shareWithCoaches: boolean; profilePublic: boolean }) {
  const [state, action] = useActionState(attendanceAction, initialFormState)
  const [share, setShare] = useState(shareWithCoaches)
  const m = useMessages(eventsMessages).attendance
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
          label={m.share}
        />
        <p className="text-sm text-fg-muted">
          {profilePublic ? m.sharePublic : m.sharePrivate}
        </p>
        <SubmitButton pendingLabel={m.saving} className="self-start">
          {going ? m.save : m.going}
        </SubmitButton>
      </form>
      {going && (
        <form action={action}>
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="going" value="no" />
          <SubmitButton pendingLabel={m.removing} variant="secondary" className="self-start">
            {m.notGoing}
          </SubmitButton>
        </form>
      )}
    </div>
  )
}
