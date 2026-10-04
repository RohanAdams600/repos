'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Field, TextInput } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { formatMetric } from '@/lib/metrics/definitions'
import { useMessages } from '@/i18n/client'
import { connectionsMessages } from '@/i18n/messages/connections'
import { domainMessages } from '@/i18n/messages/domain'
import { errorMessage, useTRPC } from '@/trpc/client'

export function AthleteTeams() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const data = useQuery(trpc.athleteTeams.list.queryOptions())
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: trpc.athleteTeams.list.queryKey() })
    void queryClient.invalidateQueries({ queryKey: trpc.metrics.entries.queryKey() })
  }
  const [code, setCode] = useState('')
  const join = useMutation(trpc.athleteTeams.join.mutationOptions({ onSuccess: () => { setCode(''); refresh() } }))
  const leave = useMutation(trpc.athleteTeams.leave.mutationOptions({ onSuccess: refresh }))
  const respond = useMutation(trpc.athleteTeams.respond.mutationOptions({ onSuccess: refresh }))
  const m = useMessages(connectionsMessages).teams
  const d = useMessages(domainMessages)
  const STATUS = m.status

  if (data.isPending) return <Spinner label={m.loading} />
  if (data.isError) return <Alert tone="error">{errorMessage(data.error)}</Alert>
  const { canJoin, memberships, pendingEntries } = data.data
  const open = memberships.filter((x) => x.status === 'REQUESTED' || x.status === 'AWAITING_GUARDIAN' || x.status === 'ACTIVE')
  const past = memberships.filter((x) => !open.includes(x))

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="results-title" className="flex flex-col gap-4">
        <h2 id="results-title" className="text-2xl font-bold">
          {m.review}
        </h2>
        {respond.isError && <Alert tone="error">{errorMessage(respond.error)}</Alert>}
        {respond.isSuccess && respond.data.result === 'accepted' && <Alert tone="success">{m.accepted}</Alert>}
        {pendingEntries.length === 0 ? (
          <p className="text-fg-muted">{m.nothing}</p>
        ) : (
          <ul className="flex flex-col divide-y-2 divide-border-subtle border-2 border-border-subtle">
            {pendingEntries.map((e) => {
              const label = d.metric[e.metricType]
              return (
                <li key={e.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col">
                    <span>
                      <span className="font-bold">{label}</span> <span className="tabular text-lg font-bold">{formatMetric(e.metricType, e.value)}</span>
                    </span>
                    <span className="text-sm text-fg-muted">
                      {e.team.coachName}, {e.team.name}. {e.session.label}, <span className="tabular">{e.session.date}</span>
                      {e.session.location ? `, ${e.session.location}` : ''}
                    </span>
                  </div>
                  <span className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={respond.isPending} onClick={() => respond.mutate({ entryId: e.id, accept: true })}>
                      {m.accept(label)}
                    </Button>
                    <Button size="sm" variant="secondary" disabled={respond.isPending} onClick={() => respond.mutate({ entryId: e.id, accept: false })}>
                      {m.decline}
                    </Button>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        <p className="text-sm text-fg-muted">{m.acceptNote}</p>
      </section>

      <section aria-labelledby="join-title" className="flex flex-col gap-4">
        <h2 id="join-title" className="text-2xl font-bold">
          {m.join}
        </h2>
        {canJoin ? (
          <form
            noValidate
            className="flex flex-col gap-4 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault()
              join.mutate({ code })
            }}
          >
            <Field label={m.code} name="team-code" required hint={m.codeHint} error={join.isError ? errorMessage(join.error) : undefined}>
              {(p) => <TextInput {...p} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={20} className="tabular" value={code} onChange={(e) => setCode(e.target.value)} />}
            </Field>
            <Button type="submit" disabled={join.isPending} className="self-start sm:self-auto">
              {join.isPending ? <Spinner label={m.sending} /> : null}
              {m.ask}
            </Button>
          </form>
        ) : (
          <Alert tone="info">{m.needConsent}</Alert>
        )}
        {join.isSuccess && (
          <Alert tone="success" focusOnMount>
            {m.sent(join.data.teamName)}
          </Alert>
        )}
        <p className="text-sm text-fg-muted">{m.privacy}</p>
      </section>

      <section aria-labelledby="my-teams-title" className="flex flex-col gap-4">
        <h2 id="my-teams-title" className="text-2xl font-bold">
          {m.yours}
        </h2>
        {leave.isError && <Alert tone="error">{errorMessage(leave.error)}</Alert>}
        {open.length === 0 ? (
          <EmptyState title={m.emptyTitle}>{m.emptyBody}</EmptyState>
        ) : (
          <ul className="flex flex-col divide-y-2 divide-border-subtle border-2 border-border-subtle">
            {open.map((x) => (
              <li key={x.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col">
                  <span className="font-bold">{x.team.name}</span>
                  <span className="text-sm text-fg-muted">
                    {m.line(x.team.organization, x.team.coachName, x.team.coachTitle, STATUS[x.status] ?? x.status)}
                  </span>
                </div>
                <ConfirmDialog
                  trigger={
                    <Button size="sm" variant="ghost">
                      {m.leave(x.team.name)}
                    </Button>
                  }
                  title={m.leaveTitle(x.team.name)}
                  description={m.leaveBody}
                  confirmLabel={m.leaveConfirm}
                  tone="danger"
                  onConfirm={() => leave.mutate({ teamId: x.team.id })}
                />
              </li>
            ))}
          </ul>
        )}
        {past.length > 0 && (
          <p className="text-sm text-fg-muted">
            {m.earlier(past.map((x) => `${x.team.name} (${(STATUS[x.status] ?? x.status).toLowerCase()})`).join(', '))}
          </p>
        )}
      </section>
    </div>
  )
}
