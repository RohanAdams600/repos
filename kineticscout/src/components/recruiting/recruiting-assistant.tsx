'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { EmptyState } from '@/components/ui/empty-state'
import { Checkbox } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { useMessages } from '@/i18n/client'
import { recruitingMessages } from '@/i18n/messages/recruiting'
import { errorMessage, useTRPC } from '@/trpc/client'

type Trigger = 'MANUAL' | 'COACH_CHANGE' | 'ROSTER_NEED'

function AlertSettings({ alerts, emailAlerts }: { alerts: boolean; emailAlerts: boolean }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [state, setState] = useState({ alerts, emailAlerts })
  const m = useMessages(recruitingMessages).assistant
  const save = useMutation(trpc.recruiting.setAlerts.mutationOptions({ onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.recruiting.overview.queryKey() }) }))
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate(state)
      }}
    >
      {save.isError && <Alert tone="error">{errorMessage(save.error)}</Alert>}
      {save.isSuccess && <Alert tone="success">{m.saved}</Alert>}
      <Checkbox
        name="alerts"
        checked={state.alerts}
        onChange={(e) => setState({ ...state, alerts: e.target.checked })}
        label={m.watch}
      />
      <Checkbox name="emailAlerts" checked={state.emailAlerts} disabled={!state.alerts} onChange={(e) => setState({ ...state, emailAlerts: e.target.checked })} label={m.email} />
      <Button type="submit" disabled={save.isPending} className="self-start">
        {save.isPending ? <Spinner label={m.saving} /> : null}
        {m.save}
      </Button>
    </form>
  )
}

function DraftCard({ draft }: { draft: { id: string; trigger: Trigger; channel: 'EMAIL' | 'DM'; schoolName: string; subject: string | null; body: string; createdAt: string; copiedAt: string | null; mailto: string | null } }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [subject, setSubject] = useState(draft.subject ?? '')
  const [body, setBody] = useState(draft.body)
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.recruiting.overview.queryKey() })
  const copied = useMutation(trpc.recruiting.markCopied.mutationOptions({ onSuccess: refresh }))
  const remove = useMutation(trpc.recruiting.deleteDraft.mutationOptions({ onSuccess: refresh }))
  const bodyId = `draft-body-${draft.id}`
  const m = useMessages(recruitingMessages).assistant
  const subjectId = `draft-subject-${draft.id}`
  const edited = subject !== (draft.subject ?? '') || body !== draft.body
  const mailto = !edited ? draft.mailto : null
  return (
    <li className="flex flex-col gap-3 border-2 border-border-subtle p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-bold">
          {m.to(draft.channel === 'EMAIL', draft.schoolName)}
        </p>
        <p className="text-sm text-fg-muted">
          {m.trigger[draft.trigger]} · <span className="tabular">{draft.createdAt.slice(0, 10)}</span>
          {draft.copiedAt ? m.copied : ''}
        </p>
      </div>
      {draft.channel === 'EMAIL' && (
        <div className="flex flex-col gap-1">
          <label htmlFor={subjectId} className="font-bold">
            {m.subject}
          </label>
          <input id={subjectId} value={subject} onChange={(e) => setSubject(e.target.value)} className="min-h-11 rounded-sm border-2 border-border-strong bg-bg px-3" />
        </div>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor={bodyId} className="font-bold">
          {m.message}
        </label>
        <textarea id={bodyId} value={body} onChange={(e) => setBody(e.target.value)} rows={10} className="rounded-sm border-2 border-border-strong bg-bg p-3" />
      </div>
      <p className="text-sm text-fg-muted">{m.check}</p>
      <div className="flex flex-wrap items-center gap-3">
        <CopyButton value={draft.channel === 'EMAIL' ? `${subject}\n\n${body}` : body} label={m.copy} onCopied={() => !draft.copiedAt && copied.mutate({ id: draft.id })} />
        {mailto && (
          <a href={mailto} className="inline-flex min-h-9 items-center font-bold">
            {m.openMail}
          </a>
        )}
        <Button size="sm" variant="ghost" onClick={() => remove.mutate({ id: draft.id })}>
          {m.remove}
        </Button>
      </div>
    </li>
  )
}

export function RecruitingAssistant() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const overview = useQuery(trpc.recruiting.overview.queryOptions())
  const draft = useMutation(trpc.recruiting.draft.mutationOptions({ onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.recruiting.overview.queryKey() }) }))

  const m = useMessages(recruitingMessages).assistant
  if (overview.isPending) return <Spinner label={m.loading} />
  if (overview.isError) return <Alert tone="error">{errorMessage(overview.error)}</Alert>
  const data = overview.data

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="alerts-title" className="flex flex-col gap-4 border-2 border-border-subtle p-6">
        <h2 id="alerts-title" className="text-xl font-bold">
          {m.alerts}
        </h2>
        <AlertSettings alerts={data.alerts} emailAlerts={data.emailAlerts} />
      </section>

      <section aria-labelledby="programs-title" className="flex flex-col gap-4">
        <h2 id="programs-title" className="text-2xl font-bold">
          {m.programs}
        </h2>
        {draft.isError && <Alert tone="error">{errorMessage(draft.error)}</Alert>}
        {draft.isPending && <Spinner label={m.writing} />}
        {data.programs.length === 0 ? (
          <EmptyState title={m.noProgramsTitle}>{m.noProgramsBody}</EmptyState>
        ) : (
          <ul className="flex flex-col divide-y-2 divide-border-subtle border-2 border-border-subtle">
            {data.programs.map((p) => (
              <li key={p.id} className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-bold">
                    {p.schoolName} <span className="font-normal text-fg-muted">({p.division})</span>
                  </p>
                  <p className="text-sm text-fg-muted">{m.headCoach(p.headCoachName)}</p>
                </div>
                {p.changes.length > 0 && (
                  <ul className="flex flex-col gap-1 text-sm">
                    {p.changes.map((c) => (
                      <li key={c.id}>
                        <span className="tabular">{c.detectedAt.slice(0, 10)}</span>:{' '}
                        {c.kind === 'HEAD_COACH_CHANGED' ? m.newCoach(String(c.detail.name ?? '')) : m.rosterNeed(String(c.detail.note ?? ''))}
                        {c.sourceUrl && (
                          <>
                            {' '}
                            (
                            <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">
                              {m.source}
                            </a>
                            )
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap gap-3">
                  <Button size="sm" variant="secondary" disabled={draft.isPending} onClick={() => draft.mutate({ collegeId: p.id, channel: 'EMAIL' })}>
                    {m.draftEmail}
                  </Button>
                  <Button size="sm" variant="secondary" disabled={draft.isPending} onClick={() => draft.mutate({ collegeId: p.id, channel: 'DM' })}>
                    {m.draftDm}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="drafts-title" className="flex flex-col gap-4">
        <h2 id="drafts-title" className="text-2xl font-bold">
          {m.drafts}
        </h2>
        {data.drafts.length === 0 ? (
          <EmptyState title={m.noDraftsTitle}>{m.noDraftsBody}</EmptyState>
        ) : (
          <ul className="flex flex-col gap-4">
            {data.drafts.map((d) => (
              <DraftCard key={d.id} draft={d} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
