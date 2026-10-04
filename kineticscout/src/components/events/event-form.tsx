'use client'

import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Field, Select, TextInput } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { submitEventAction } from '@/lib/events/actions'
import { initialFormState } from '@/lib/forms'
import { US_STATES } from '@/lib/us-states'

export type EventFormDefaults = Partial<Record<'name' | 'kind' | 'sport' | 'organizer' | 'officialUrl' | 'startDate' | 'endDate' | 'city' | 'state' | 'venue' | 'gradYearMin' | 'gradYearMax' | 'costText' | 'description', string>>

/** Submission form for a new listing, or staff edit of a listed one (`eventId`). */
export function EventForm({ eventId, defaults = {}, staff }: { eventId?: string; defaults?: EventFormDefaults; staff: boolean }) {
  const [state, action] = useActionState(submitEventAction, initialFormState)
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
      <Field label="Event name" name="name" required error={errors.name}>
        {(p) => <TextInput {...p} maxLength={120} defaultValue={values.name} />}
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Type" name="kind" required error={errors.kind}>
          {(p) => (
            <Select {...p} defaultValue={values.kind ?? ''}>
              <option value="" disabled>
                Choose
              </option>
              <option value="SHOWCASE">Showcase</option>
              <option value="CAMP">Camp</option>
              <option value="COMBINE">Combine</option>
              <option value="TOURNAMENT">Tournament</option>
            </Select>
          )}
        </Field>
        <Field label="Sport" name="sport" required error={errors.sport}>
          {(p) => (
            <Select {...p} defaultValue={values.sport ?? ''}>
              <option value="" disabled>
                Choose
              </option>
              <option value="BASEBALL">Baseball</option>
              <option value="HOCKEY">Hockey</option>
              <option value="FOOTBALL">Football</option>
            </Select>
          )}
        </Field>
      </div>
      <Field label="Organizer" name="organizer" required error={errors.organizer}>
        {(p) => <TextInput {...p} maxLength={120} defaultValue={values.organizer} />}
      </Field>
      <Field label="Organizer's page for this event" name="officialUrl" required error={errors.officialUrl} hint="Our staff check every listing against this page before it appears.">
        {(p) => <TextInput {...p} type="url" inputMode="url" placeholder="https://" maxLength={500} defaultValue={values.officialUrl} />}
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Start date" name="startDate" required error={errors.startDate}>
          {(p) => <TextInput {...p} type="date" defaultValue={values.startDate} />}
        </Field>
        <Field label="End date" name="endDate" required error={errors.endDate} hint="Same as the start date for a one-day event.">
          {(p) => <TextInput {...p} type="date" defaultValue={values.endDate} />}
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="City" name="city" required error={errors.city}>
          {(p) => <TextInput {...p} maxLength={80} autoComplete="off" defaultValue={values.city} />}
        </Field>
        <Field label="State" name="state" required error={errors.state}>
          {(p) => (
            <Select {...p} defaultValue={values.state ?? ''}>
              <option value="" disabled>
                Choose
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
      <Field label="Venue" name="venue" error={errors.venue}>
        {(p) => <TextInput {...p} maxLength={120} defaultValue={values.venue} />}
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="First class year" name="gradYearMin" error={errors.gradYearMin} hint="For example 2027.">
          {(p) => <TextInput {...p} inputMode="numeric" maxLength={4} defaultValue={values.gradYearMin} />}
        </Field>
        <Field label="Last class year" name="gradYearMax" error={errors.gradYearMax}>
          {(p) => <TextInput {...p} inputMode="numeric" maxLength={4} defaultValue={values.gradYearMax} />}
        </Field>
      </div>
      <Field label="Cost, as the organizer lists it" name="costText" error={errors.costText} hint="For example: $195 per player. Leave empty if the page does not say.">
        {(p) => <TextInput {...p} maxLength={80} defaultValue={values.costText} />}
      </Field>
      <Field label="Description" name="description" required error={errors.description} hint="What happens at the event, in plain words. No promises about scholarships or exposure.">
        {(p) => <textarea {...p} rows={5} maxLength={1000} defaultValue={values.description} className="block w-full rounded-sm border-2 border-border-strong bg-bg p-3 text-base text-fg" />}
      </Field>
      <SubmitButton pendingLabel="Saving" className="self-start">
        {eventId ? 'Save changes' : staff ? 'Publish event' : 'Submit for review'}
      </SubmitButton>
    </form>
  )
}
