'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Field, Select, TextInput } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { submitEventAction } from '@/lib/events/actions'
import { initialFormState } from '@/lib/forms'
import { US_STATES } from '@/lib/us-states'
import { useMessages } from '@/i18n/client'
import { domainMessages } from '@/i18n/messages/domain'
import { eventsMessages } from '@/i18n/messages/events'

export type EventFormDefaults = Partial<Record<'name' | 'kind' | 'sport' | 'organizer' | 'officialUrl' | 'startDate' | 'endDate' | 'city' | 'state' | 'venue' | 'gradYearMin' | 'gradYearMax' | 'costText' | 'description', string>>

/** Submission form for a new listing, or staff edit of a listed one (`eventId`). */
export function EventForm({ eventId, defaults = {}, staff }: { eventId?: string; defaults?: EventFormDefaults; staff: boolean }) {
  const [state, action] = useActionState(submitEventAction, initialFormState)
  const m = useMessages(eventsMessages).form
  const d = useMessages(domainMessages)
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const values = { ...defaults, ...(state.status === 'error' ? state.values : {}) }
  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {state.status === 'error' && (
        <Alert tone="error" focusOnMount>
          {state.message}
        </Alert>
      )}
      {eventId && <input type="hidden" name="eventId" value={eventId} />}
      <Field label={m.name} name="name" required error={errors.name}>
        {(p) => <TextInput {...p} maxLength={120} defaultValue={values.name} />}
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={m.type} name="kind" required error={errors.kind}>
          {(p) => (
            <Select {...p} defaultValue={values.kind ?? ''}>
              <option value="" disabled>
                {m.choose}
              </option>
              <option value="SHOWCASE">{d.eventKind.SHOWCASE}</option>
              <option value="CAMP">{d.eventKind.CAMP}</option>
              <option value="COMBINE">{d.eventKind.COMBINE}</option>
              <option value="TOURNAMENT">{d.eventKind.TOURNAMENT}</option>
            </Select>
          )}
        </Field>
        <Field label={m.sport} name="sport" required error={errors.sport}>
          {(p) => (
            <Select {...p} defaultValue={values.sport ?? ''}>
              <option value="" disabled>
                {m.choose}
              </option>
              <option value="BASEBALL">{d.sport.BASEBALL}</option>
              <option value="HOCKEY">{d.sport.HOCKEY}</option>
              <option value="FOOTBALL">{d.sport.FOOTBALL}</option>
            </Select>
          )}
        </Field>
      </div>
      <Field label={m.organizer} name="organizer" required error={errors.organizer}>
        {(p) => <TextInput {...p} maxLength={120} defaultValue={values.organizer} />}
      </Field>
      <Field label={m.officialUrl} name="officialUrl" required error={errors.officialUrl} hint={m.officialHint}>
        {(p) => <TextInput {...p} type="url" inputMode="url" placeholder="https://" maxLength={500} defaultValue={values.officialUrl} />}
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={m.start} name="startDate" required error={errors.startDate}>
          {(p) => <TextInput {...p} type="date" defaultValue={values.startDate} />}
        </Field>
        <Field label={m.end} name="endDate" required error={errors.endDate} hint={m.endHint}>
          {(p) => <TextInput {...p} type="date" defaultValue={values.endDate} />}
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={m.city} name="city" required error={errors.city}>
          {(p) => <TextInput {...p} maxLength={80} autoComplete="off" defaultValue={values.city} />}
        </Field>
        <Field label={m.state} name="state" required error={errors.state}>
          {(p) => (
            <Select {...p} defaultValue={values.state ?? ''}>
              <option value="" disabled>
                {m.choose}
              </option>
              {US_STATES.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label={m.venue} name="venue" error={errors.venue}>
        {(p) => <TextInput {...p} maxLength={120} defaultValue={values.venue} />}
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={m.firstClass} name="gradYearMin" error={errors.gradYearMin} hint={m.firstClassHint}>
          {(p) => <TextInput {...p} inputMode="numeric" maxLength={4} defaultValue={values.gradYearMin} />}
        </Field>
        <Field label={m.lastClass} name="gradYearMax" error={errors.gradYearMax}>
          {(p) => <TextInput {...p} inputMode="numeric" maxLength={4} defaultValue={values.gradYearMax} />}
        </Field>
      </div>
      <Field label={m.cost} name="costText" error={errors.costText} hint={m.costHint}>
        {(p) => <TextInput {...p} maxLength={80} defaultValue={values.costText} />}
      </Field>
      <Field label={m.description} name="description" required error={errors.description} hint={m.descriptionHint}>
        {(p) => <textarea {...p} rows={5} maxLength={1000} defaultValue={values.description} className="block w-full rounded-sm border-2 border-border-strong bg-bg p-3 text-base text-fg" />}
      </Field>
      <SubmitButton pendingLabel={m.saving} className="self-start">
        {eventId ? m.saveChanges : staff ? m.publish : m.submitReview}
      </SubmitButton>
    </form>
  )
}
