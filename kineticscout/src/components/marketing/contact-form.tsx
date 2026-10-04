'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Field, Select, TextInput, inputClass } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { initialFormState } from '@/lib/forms'
import { contactAction } from '@/lib/marketing/actions'
import { cn } from '@/lib/cn'
import { CONTACT_TOPICS } from '@/lib/validation/contact-topics'
import { useMessages } from '@/i18n/client'
import { contactMessages } from '@/i18n/messages/contact'

export function ContactForm() {
  const [state, action] = useActionState(contactAction, initialFormState)
  const all = useMessages(contactMessages)
  const m = all.form
  const emailLabel = all.email
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}
  const values = state.status === 'error' ? (state.values ?? {}) : {}
  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {state.status === 'error' && (
        <Alert tone="error" focusOnMount>
          {state.message}
        </Alert>
      )}
      {/* Honeypot for bots: hidden from people and assistive technology. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={m.name} name="name" required error={errors.name}>
          {(p) => <TextInput {...p} autoComplete="name" defaultValue={values.name} />}
        </Field>
        <Field label={emailLabel} name="email" required error={errors.email} hint={m.emailHint}>
          {(p) => <TextInput {...p} type="email" inputMode="email" autoComplete="email" defaultValue={values.email} />}
        </Field>
      </div>
      <Field label={m.topic} name="topic" required error={errors.topic}>
        {(p) => (
          <Select {...p} defaultValue={values.topic ?? ''}>
            <option value="" disabled>
              {m.chooseTopic}
            </option>
            {CONTACT_TOPICS.map((t) => (
              <option key={t.value} value={t.value}>
                {m.topics[t.value] ?? t.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={m.message} name="message" required error={errors.message}>
        {(p) => <textarea {...p} rows={6} maxLength={4000} defaultValue={values.message} className={cn(inputClass, 'py-2')} />}
      </Field>
      <p className="text-sm text-fg-muted">
        {m.privacyNote} <Link href="/legal/privacy">{m.privacyLink}</Link>.
      </p>
      <SubmitButton pendingLabel={m.sending}>{m.send}</SubmitButton>
    </form>
  )
}
