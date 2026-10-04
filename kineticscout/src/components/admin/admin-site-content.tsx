'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Checkbox, Field, Select, TextInput, inputClass } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/cn'
import { errorMessage, useTRPC } from '@/trpc/client'

function TestimonialAdmin() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const list = useQuery(trpc.admin.testimonials.queryOptions())
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.admin.testimonials.queryKey() })
  const create = useMutation(trpc.admin.createTestimonial.mutationOptions({ onSuccess: refresh }))
  const review = useMutation(trpc.admin.reviewTestimonial.mutationOptions({ onSuccess: refresh }))
  const [form, setForm] = useState({ authorEmail: '', displayName: '', descriptor: '', quote: '', rating: '', consent: false })

  return (
    <section aria-labelledby="reviews-admin-title" className="flex flex-col gap-4">
      <h2 id="reviews-admin-title" className="text-2xl font-bold">
        Reviews
      </h2>
      <p className="text-fg-muted">Add a review only from an existing account holder who has given written permission to publish their exact words.</p>
      <form
        className="flex flex-col gap-4 border-2 border-border-subtle p-4"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate(
            {
              authorEmail: form.authorEmail,
              displayName: form.displayName,
              descriptor: form.descriptor,
              quote: form.quote,
              rating: form.rating ? Number(form.rating) : null,
              consentConfirmed: form.consent as true,
            },
            { onSuccess: () => setForm({ authorEmail: '', displayName: '', descriptor: '', quote: '', rating: '', consent: false }) },
          )
        }}
      >
        {create.isError && <Alert tone="error">{errorMessage(create.error)}</Alert>}
        {create.isSuccess && <Alert tone="success">Saved as a draft. Publish it below.</Alert>}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Author account email" name="authorEmail" required>
            {(p) => <TextInput {...p} type="email" value={form.authorEmail} onChange={(e) => setForm({ ...form, authorEmail: e.target.value })} />}
          </Field>
          <Field label="Display name" name="displayName" required hint="As the author wants it shown, e.g. Maria G.">
            {(p) => <TextInput {...p} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />}
          </Field>
          <Field label="Descriptor" name="descriptor" required hint="e.g. Parent of a 2027 shortstop">
            {(p) => <TextInput {...p} value={form.descriptor} onChange={(e) => setForm({ ...form, descriptor: e.target.value })} />}
          </Field>
        </div>
        <Field label="Quote (exact words)" name="quote" required>
          {(p) => <textarea {...p} rows={3} maxLength={600} value={form.quote} onChange={(e) => setForm({ ...form, quote: e.target.value })} className={cn(inputClass, 'py-2')} />}
        </Field>
        <Field label="Rating" name="rating">
          {(p) => (
            <Select {...p} value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })} className="max-w-40">
              <option value="">None given</option>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} of 5
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Checkbox
          checked={form.consent}
          onChange={(e) => setForm({ ...form, consent: e.target.checked })}
          label="I have the author's written permission (and a guardian's, if they are under 18) to publish these exact words."
        />
        <Button type="submit" disabled={!form.consent || create.isPending} className="self-start">
          Save draft review
        </Button>
      </form>
      {review.isError && <Alert tone="error">{errorMessage(review.error)}</Alert>}
      {list.isPending && <Spinner label="Loading reviews" />}
      {list.data?.length === 0 && <EmptyState title="No reviews yet">Saved reviews appear here.</EmptyState>}
      <ul className="flex flex-col gap-3">
        {list.data?.map((t) => (
          <li key={t.id} className="flex flex-col gap-2 border-2 border-border-subtle p-4">
            <p className="text-xs font-bold tracking-wide text-fg-muted uppercase">{t.status}</p>
            <blockquote>&ldquo;{t.quote}&rdquo;</blockquote>
            <p className="text-sm text-fg-muted">
              {t.displayName}, {t.descriptor}
            </p>
            <div className="flex gap-3">
              {t.status !== 'PUBLISHED' && (
                <ConfirmDialog trigger={<Button size="sm">Publish</Button>} title="Publish this review?" description="It appears on /reviews and the home page." confirmLabel="Publish" onConfirm={() => review.mutate({ id: t.id, decision: 'PUBLISHED' })} />
              )}
              {t.status !== 'REJECTED' && (
                <ConfirmDialog trigger={<Button size="sm" variant="danger">{t.status === 'PUBLISHED' ? 'Unpublish' : 'Reject'}</Button>} title="Remove this review from the site?" description="Use this if the author withdraws permission." confirmLabel="Remove" tone="danger" onConfirm={() => review.mutate({ id: t.id, decision: 'REJECTED' })} />
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function CaseStudyAdmin() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const create = useMutation(trpc.admin.createCaseStudy.mutationOptions({ onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.admin.blogDrafts.queryKey() }) }))
  const [form, setForm] = useState({ title: '', metaDescription: '', bodyMarkdown: '', consentRecordedOn: '' })
  return (
    <section aria-labelledby="case-admin-title" className="flex flex-col gap-4">
      <h2 id="case-admin-title" className="text-2xl font-bold">
        New case study
      </h2>
      <p className="text-fg-muted">Drafts appear under Drafts above for review. Only use numbers the athlete actually recorded, and only with written consent.</p>
      <form
        className="flex flex-col gap-4 border-2 border-border-subtle p-4"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate(form, { onSuccess: () => setForm({ title: '', metaDescription: '', bodyMarkdown: '', consentRecordedOn: '' }) })
        }}
      >
        {create.isError && <Alert tone="error">{errorMessage(create.error)}</Alert>}
        {create.isSuccess && <Alert tone="success">Draft saved.</Alert>}
        <Field label="Title" name="title" required>
          {(p) => <TextInput {...p} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />}
        </Field>
        <Field label="Summary for search results (50 to 160 characters)" name="metaDescription" required>
          {(p) => <TextInput {...p} value={form.metaDescription} onChange={(e) => setForm({ ...form, metaDescription: e.target.value })} />}
        </Field>
        <Field label="Body (Markdown)" name="bodyMarkdown" required>
          {(p) => <textarea {...p} rows={10} value={form.bodyMarkdown} onChange={(e) => setForm({ ...form, bodyMarkdown: e.target.value })} className={cn(inputClass, 'tabular py-2 text-sm')} />}
        </Field>
        <Field label="Date written consent was received" name="consentRecordedOn" required>
          {(p) => <TextInput {...p} type="date" value={form.consentRecordedOn} onChange={(e) => setForm({ ...form, consentRecordedOn: e.target.value })} className="max-w-56" />}
        </Field>
        <Button type="submit" disabled={create.isPending} className="self-start">
          Save draft
        </Button>
      </form>
    </section>
  )
}

function ContactInbox() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const query = useQuery(trpc.admin.contactMessages.queryOptions({ page, unrepliedOnly: true }))
  const mark = useMutation(trpc.admin.markContactReplied.mutationOptions({ onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.admin.contactMessages.queryKey() }) }))
  return (
    <section aria-labelledby="inbox-title" className="flex flex-col gap-4">
      <h2 id="inbox-title" className="text-2xl font-bold">
        Contact messages awaiting a reply
      </h2>
      {query.isPending && <Spinner label="Loading messages" />}
      {query.isError && <Alert tone="error">{errorMessage(query.error)}</Alert>}
      {query.data?.items.length === 0 && <EmptyState title="Inbox zero">Every message has been answered.</EmptyState>}
      <ul className="flex flex-col gap-3">
        {query.data?.items.map((m) => {
          return (
            <li key={m.id} className="flex flex-col gap-2 border-2 border-border-subtle p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <p className="font-bold">
                  {m.name} &lt;<a href={`mailto:${m.email}`}>{m.email}</a>&gt;
                </p>
                <p className="tabular text-sm text-fg-muted">
                  {m.topic} · {new Date(m.createdAt).toLocaleString()}
                  {m.replyDue && <span className="font-bold text-danger"> · reply due</span>}
                </p>
              </div>
              <p className="whitespace-pre-wrap text-fg-muted">{m.message}</p>
              <Button size="sm" variant="secondary" className="self-start" onClick={() => mark.mutate({ id: m.id })}>
                Mark replied
              </Button>
            </li>
          )
        })}
      </ul>
      {query.data && query.data.pageCount > 1 && (
        <nav aria-label="Message pages" className="flex items-center gap-4">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="tabular text-sm">Page {query.data.page} of {query.data.pageCount}</span>
          <Button size="sm" variant="secondary" disabled={page >= query.data.pageCount} onClick={() => setPage(page + 1)}>Next</Button>
        </nav>
      )}
    </section>
  )
}

function DeletionRequestAdmin() {
  const trpc = useTRPC()
  const [email, setEmail] = useState('')
  const [verified, setVerified] = useState(false)
  const schedule = useMutation(trpc.admin.scheduleAccountDeletion.mutationOptions())
  return (
    <section aria-labelledby="deletion-admin-title" className="flex flex-col gap-4">
      <h2 id="deletion-admin-title" className="text-2xl font-bold">
        Deletion requests received by email
      </h2>
      <p className="text-fg-muted">
        Account holders can delete their account from Settings. Use this only for a request sent from the account&apos;s own email address
        or otherwise verified. The account holder is emailed and can cancel within 7 days.
      </p>
      <form
        className="flex flex-col gap-4 border-2 border-border-subtle p-4"
        onSubmit={(e) => {
          e.preventDefault()
          schedule.mutate({ email, verified: verified as true }, { onSuccess: () => { setEmail(''); setVerified(false) } })
        }}
      >
        {schedule.isError && <Alert tone="error">{errorMessage(schedule.error)}</Alert>}
        {schedule.data && (
          <Alert tone="success">
            {schedule.data.alreadyScheduled ? 'Deletion was already scheduled' : 'Deletion scheduled'} for{' '}
            {new Date(schedule.data.scheduledFor).toISOString().slice(0, 10)}.
          </Alert>
        )}
        <Field label="Account email" name="deletionEmail" required>
          {(props) => <TextInput {...props} type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Checkbox
          name="deletionVerified"
          required
          checked={verified}
          onChange={(e) => setVerified(e.target.checked)}
          label="I confirmed this request came from the account holder. (Parents and guardians use their own management link, which they can request on the Your data page.)"
        />
        <Button type="submit" variant="danger" className="self-start" disabled={schedule.isPending}>
          {schedule.isPending ? <Spinner label="Scheduling" /> : null}
          Schedule deletion
        </Button>
      </form>
    </section>
  )
}

export function AdminSiteContent() {
  return (
    <div className="flex flex-col gap-12">
      <ContactInbox />
      <DeletionRequestAdmin />
      <TestimonialAdmin />
      <CaseStudyAdmin />
    </div>
  )
}
