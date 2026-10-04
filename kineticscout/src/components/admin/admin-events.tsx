'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Field, Select, TextInput } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { errorMessage, useTRPC } from '@/trpc/client'

function EventDecision({ eventId, onDone }: { eventId: string; onDone: () => void }) {
  const trpc = useTRPC()
  const review = useMutation(trpc.admin.reviewEvent.mutationOptions({ onSuccess: onDone }))
  const [note, setNote] = useState('')
  return (
    <div className="flex flex-col gap-3">
      {review.isError && <Alert tone="error">{errorMessage(review.error)}</Alert>}
      <Field label="Note to the submitter" name={`event-note-${eventId}`} hint="Required to reject.">
        {(p) => <TextInput {...p} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      <div className="flex flex-wrap gap-3">
        <Button size="sm" disabled={review.isPending} onClick={() => review.mutate({ eventId, decision: 'PUBLISHED', note: note || null })}>
          Publish
        </Button>
        <Button size="sm" variant="secondary" disabled={review.isPending} onClick={() => review.mutate({ eventId, decision: 'REJECTED', note: note || null })}>
          Reject
        </Button>
      </div>
    </div>
  )
}

function CancelEvent({ eventId, onDone }: { eventId: string; onDone: () => void }) {
  const trpc = useTRPC()
  const cancel = useMutation(trpc.admin.cancelEvent.mutationOptions({ onSuccess: onDone }))
  const [note, setNote] = useState('')
  return (
    <details>
      <summary className="cursor-pointer text-sm font-bold">Cancel this event</summary>
      <div className="mt-3 flex flex-col gap-3">
        {cancel.isError && <Alert tone="error">{errorMessage(cancel.error)}</Alert>}
        <Field label="Reason shown to athletes going" name={`cancel-note-${eventId}`} required>
          {(p) => <TextInput {...p} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        <Button size="sm" variant="danger" className="self-start" disabled={cancel.isPending} onClick={() => cancel.mutate({ eventId, note })}>
          Cancel event
        </Button>
      </div>
    </details>
  )
}

export function EventsAdmin() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const queue = useQuery(trpc.admin.eventQueue.queryOptions())
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.admin.eventQueue.queryKey() })
  return (
    <section aria-labelledby="events-admin-title" className="flex flex-col gap-4">
      <h2 id="events-admin-title" className="text-2xl font-bold">
        Event listings
      </h2>
      <p className="text-fg-muted">
        Publish only when the organizer&apos;s page shows the same name, dates and location. Reject listings that promise scholarships, exposure or results. To add one yourself,
        use <Link href="/events/submit">Submit an event</Link>; staff listings publish immediately.
      </p>
      {queue.isPending && <Spinner label="Loading events" />}
      {queue.isError && <Alert tone="error">{errorMessage(queue.error)}</Alert>}
      {queue.data?.waiting.length === 0 && <EmptyState title="No events waiting">Submissions from coaches and parents appear here.</EmptyState>}
      <ul className="flex flex-col gap-4">
        {queue.data?.waiting.map((e) => (
          <li key={e.id} className="flex flex-col gap-3 border-2 border-border-subtle p-4">
            <p className="font-bold">{e.name}</p>
            <p className="text-sm text-fg-muted">
              {e.kind.toLowerCase()}, {e.sport.toLowerCase()}. {e.startDate} to {e.endDate}. {e.venue ? `${e.venue}, ` : ''}
              {e.city}, {e.state}. Organizer {e.organizer}. {e.costText ? `Cost: ${e.costText}. ` : ''}Submitted by {e.submittedBy?.email ?? 'a deleted account'} ({e.submittedBy?.role.toLowerCase() ?? 'unknown'}).
            </p>
            <p className="text-sm break-words whitespace-pre-wrap">{e.description}</p>
            <a href={e.officialUrl} target="_blank" rel="noopener noreferrer nofollow" className="self-start font-bold">
              Open organizer page
            </a>
            <EventDecision eventId={e.id} onDone={() => void refresh()} />
          </li>
        ))}
      </ul>
      {queue.data && queue.data.listed.length > 0 && (
        <>
          <h3 className="text-xl font-bold">Upcoming listed events</h3>
          <ul className="flex flex-col gap-3">
            {queue.data.listed.map((e) => (
              <li key={e.id} className="flex flex-col gap-2 border-2 border-border-subtle p-3">
                <span>
                  <Link href={`/events/${e.id}`} className="font-bold">
                    {e.name}
                  </Link>{' '}
                  <span className="text-sm text-fg-muted">
                    {e.startDate}, {e.city}, {e.state}. <span className="tabular">{e.going}</span> going.
                  </span>
                </span>
                <CancelEvent eventId={e.id} onDone={() => void refresh()} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

const EMPTY = { sport: 'BASEBALL', division: 'D1', kind: 'CONTACT', startDate: '', endDate: '', sourceUrl: '', sourceTitle: '', note: '' }

export function CalendarAdmin() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const periods = useQuery(trpc.admin.recruitingPeriods.queryOptions())
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.admin.recruitingPeriods.queryKey() })
  const [form, setForm] = useState(EMPTY)
  const add = useMutation(trpc.admin.addRecruitingPeriod.mutationOptions({ onSuccess: () => { setForm(EMPTY); void refresh() } }))
  const remove = useMutation(trpc.admin.removeRecruitingPeriod.mutationOptions({ onSuccess: () => void refresh() }))
  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }))
  return (
    <section aria-labelledby="calendar-admin-title" className="flex flex-col gap-4">
      <h2 id="calendar-admin-title" className="text-2xl font-bold">
        Recruiting calendar
      </h2>
      <p className="text-fg-muted">Copy each period exactly from the governing body&apos;s published calendar and link that document. Periods for one sport and division cannot overlap.</p>
      <form
        className="grid gap-4 border-2 border-border-subtle p-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault()
          add.mutate(form)
        }}
      >
        {add.isError && <Alert tone="error" className="sm:col-span-2">{errorMessage(add.error)}</Alert>}
        <Field label="Sport" name="period-sport" required>
          {(p) => (
            <Select {...p} value={form.sport} onChange={set('sport')}>
              <option value="BASEBALL">Baseball</option>
              <option value="HOCKEY">Hockey</option>
              <option value="FOOTBALL">Football</option>
            </Select>
          )}
        </Field>
        <Field label="Division" name="period-division" required>
          {(p) => (
            <Select {...p} value={form.division} onChange={set('division')}>
              {['D1', 'D2', 'D3', 'NAIA', 'JUCO'].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Period" name="period-kind" required>
          {(p) => (
            <Select {...p} value={form.kind} onChange={set('kind')}>
              <option value="CONTACT">Contact</option>
              <option value="EVALUATION">Evaluation</option>
              <option value="QUIET">Quiet</option>
              <option value="DEAD">Dead</option>
            </Select>
          )}
        </Field>
        <div />
        <Field label="Start date" name="period-start" required>
          {(p) => <TextInput {...p} type="date" value={form.startDate} onChange={set('startDate')} />}
        </Field>
        <Field label="End date" name="period-end" required>
          {(p) => <TextInput {...p} type="date" value={form.endDate} onChange={set('endDate')} />}
        </Field>
        <Field label="Source link" name="period-source" required>
          {(p) => <TextInput {...p} type="url" placeholder="https://" value={form.sourceUrl} onChange={set('sourceUrl')} />}
        </Field>
        <Field label="Source title" name="period-source-title" required hint="For example: 2026-27 Division I Baseball Recruiting Calendar.">
          {(p) => <TextInput {...p} maxLength={160} value={form.sourceTitle} onChange={set('sourceTitle')} />}
        </Field>
        <Field label="Note" name="period-note" className="sm:col-span-2">
          {(p) => <TextInput {...p} maxLength={300} value={form.note} onChange={set('note')} />}
        </Field>
        <Button type="submit" disabled={add.isPending} className="self-start">
          Add period
        </Button>
      </form>
      {remove.isError && <Alert tone="error">{errorMessage(remove.error)}</Alert>}
      {periods.isPending && <Spinner label="Loading periods" />}
      {periods.data?.length === 0 && <EmptyState title="No periods entered">Add periods from the published calendars.</EmptyState>}
      <ul className="flex flex-col gap-2">
        {periods.data?.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-2 border-border-subtle p-3">
            <span>
              <strong>
                {p.sport.toLowerCase()} {p.division}: {p.kind.toLowerCase()}
              </strong>{' '}
              <span className="tabular">
                {p.startDate} to {p.endDate}
              </span>
              . <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer">{p.sourceTitle}</a>
            </span>
            <Button size="sm" variant="secondary" disabled={remove.isPending} onClick={() => remove.mutate({ periodId: p.id })}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
