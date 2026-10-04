'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Field, TextInput } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { formatMetric, METRIC_DEFINITIONS } from '@/lib/metrics/definitions'
import { errorMessage, useTRPC } from '@/trpc/client'

const STATUS = {
  REQUESTED: 'Waiting for the coach',
  AWAITING_GUARDIAN: 'Waiting for your parent or guardian (we emailed them)',
  ACTIVE: 'On the team',
  DECLINED: 'Not added',
  LEFT: 'Left',
  REMOVED: 'Removed by the coach',
} as const

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

  if (data.isPending) return <Spinner label="Loading teams" />
  if (data.isError) return <Alert tone="error">{errorMessage(data.error)}</Alert>
  const { canJoin, memberships, pendingEntries } = data.data
  const open = memberships.filter((m) => m.status === 'REQUESTED' || m.status === 'AWAITING_GUARDIAN' || m.status === 'ACTIVE')
  const past = memberships.filter((m) => !open.includes(m))

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="results-title" className="flex flex-col gap-4">
        <h2 id="results-title" className="text-2xl font-bold">
          Results to review
        </h2>
        {respond.isError && <Alert tone="error">{errorMessage(respond.error)}</Alert>}
        {respond.isSuccess && respond.data.result === 'accepted' && <Alert tone="success">Added to your measurements as coach-recorded.</Alert>}
        {pendingEntries.length === 0 ? (
          <p className="text-fg-muted">Nothing waiting. When your coach records a testing day, your results appear here.</p>
        ) : (
          <ul className="flex flex-col divide-y-2 divide-border-subtle border-2 border-border-subtle">
            {pendingEntries.map((e) => {
              const label = METRIC_DEFINITIONS[e.metricType].label
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
                      Accept {label.toLowerCase()}
                    </Button>
                    <Button size="sm" variant="secondary" disabled={respond.isPending} onClick={() => respond.mutate({ entryId: e.id, accept: false })}>
                      Decline
                    </Button>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        <p className="text-sm text-fg-muted">Accept only results that are right. Accepted results do not count toward the free plan&apos;s monthly limit.</p>
      </section>

      <section aria-labelledby="join-title" className="flex flex-col gap-4">
        <h2 id="join-title" className="text-2xl font-bold">
          Join a team
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
            <Field label="Team code" name="team-code" required hint="Ask your high school or travel coach for it." error={join.isError ? errorMessage(join.error) : undefined}>
              {(p) => <TextInput {...p} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={20} className="tabular" value={code} onChange={(e) => setCode(e.target.value)} />}
            </Field>
            <Button type="submit" disabled={join.isPending} className="self-start sm:self-auto">
              {join.isPending ? <Spinner label="Sending" /> : null}
              Ask to join
            </Button>
          </form>
        ) : (
          <Alert tone="info">A parent or guardian must give consent before you can join a team.</Alert>
        )}
        {join.isSuccess && (
          <Alert tone="success" focusOnMount>
            Request sent to {join.data.teamName}. The coach approves each player{'; '}if you are under 18, your parent or guardian approves too.
          </Alert>
        )}
        <p className="text-sm text-fg-muted">
          A team coach sees your name, class and position, and the results they record. They do not see your email address or the measurements you log yourself.
        </p>
      </section>

      <section aria-labelledby="my-teams-title" className="flex flex-col gap-4">
        <h2 id="my-teams-title" className="text-2xl font-bold">
          Your teams
        </h2>
        {leave.isError && <Alert tone="error">{errorMessage(leave.error)}</Alert>}
        {open.length === 0 ? (
          <EmptyState title="No teams yet">Teams you join appear here.</EmptyState>
        ) : (
          <ul className="flex flex-col divide-y-2 divide-border-subtle border-2 border-border-subtle">
            {open.map((m) => (
              <li key={m.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col">
                  <span className="font-bold">{m.team.name}</span>
                  <span className="text-sm text-fg-muted">
                    {m.team.organization}. Coach {m.team.coachName}, {m.team.coachTitle}. {STATUS[m.status]}.
                  </span>
                </div>
                <ConfirmDialog
                  trigger={
                    <Button size="sm" variant="ghost">
                      Leave {m.team.name}
                    </Button>
                  }
                  title={`Leave ${m.team.name}?`}
                  description="The coach stops seeing you on the roster and results you have not answered are withdrawn. Values you accepted stay on your profile."
                  confirmLabel="Leave team"
                  tone="danger"
                  onConfirm={() => leave.mutate({ teamId: m.team.id })}
                />
              </li>
            ))}
          </ul>
        )}
        {past.length > 0 && (
          <p className="text-sm text-fg-muted">
            Earlier: {past.map((m) => `${m.team.name} (${STATUS[m.status].toLowerCase()})`).join(', ')}.
          </p>
        )}
      </section>
    </div>
  )
}
