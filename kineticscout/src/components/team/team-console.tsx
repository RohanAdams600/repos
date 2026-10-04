'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { TeamForm } from '@/components/team/team-form'
import { Alert } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Field, Select } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { positionLabel } from '@/lib/athletes/positions'
import { formatJoinCode, TEAM_POLICY } from '@/lib/teams/rules'
import { errorMessage, useTRPC } from '@/trpc/client'

const STATUS_TEXT = {
  PENDING: 'Waiting for staff review. We check your staff page, usually within 2 business days.',
  VERIFIED: 'Approved. Share the team code with your players.',
  REJECTED: 'Not approved. Correct the details below and resubmit.',
  SUSPENDED: 'Suspended. Recording and new members are paused.',
} as const

function Roster({ teamId, verified }: { teamId: string; verified: boolean }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const roster = useQuery(trpc.team.roster.queryOptions({ teamId }))
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: trpc.team.roster.queryKey({ teamId }) })
    void queryClient.invalidateQueries({ queryKey: trpc.team.mine.queryKey() })
  }
  const decide = useMutation(trpc.team.decideJoin.mutationOptions({ onSuccess: refresh }))
  const remove = useMutation(trpc.team.removeMember.mutationOptions({ onSuccess: refresh }))

  if (roster.isPending) return <Spinner label="Loading roster" />
  if (roster.isError) return <Alert tone="error">{errorMessage(roster.error)}</Alert>
  const requested = roster.data.members.filter((m) => m.status === 'REQUESTED')
  const awaiting = roster.data.members.filter((m) => m.status === 'AWAITING_GUARDIAN')
  const active = roster.data.members.filter((m) => m.status === 'ACTIVE')
  const who = (m: (typeof active)[number]) => `${m.athlete.firstName} ${m.athlete.lastName}`

  return (
    <div className="flex flex-col gap-8">
      {(decide.isError || remove.isError) && <Alert tone="error">{errorMessage(decide.error ?? remove.error)}</Alert>}
      <section aria-labelledby={`requests-${teamId}`} className="flex flex-col gap-3">
        <h3 id={`requests-${teamId}`} className="text-xl font-bold">
          Join requests
        </h3>
        {requested.length === 0 ? (
          <p className="text-fg-muted">No one is waiting. Players ask to join with your team code.</p>
        ) : (
          <ul className="flex flex-col divide-y-2 divide-border-subtle border-2 border-border-subtle">
            {requested.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <span>
                  <span className="font-bold">{who(m)}</span>{' '}
                  <span className="text-fg-muted">
                    Class of <span className="tabular">{m.athlete.gradYear}</span>, {positionLabel(m.athlete.primaryPosition)}
                  </span>
                </span>
                <span className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ memberId: m.id, approve: true })}>
                    Approve {m.athlete.firstName}
                  </Button>
                  <Button size="sm" variant="secondary" disabled={decide.isPending} onClick={() => decide.mutate({ memberId: m.id, approve: false })}>
                    Decline
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {awaiting.length > 0 && (
          <p className="text-fg-muted">
            Waiting for a parent or guardian to approve: {awaiting.map(who).join(', ')}. We emailed them; the link lasts {TEAM_POLICY.guardianLinkDays} days.
          </p>
        )}
      </section>

      <section aria-labelledby={`roster-${teamId}`} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id={`roster-${teamId}`} className="text-xl font-bold">
            Roster <span className="tabular font-normal text-fg-muted">({active.length})</span>
          </h3>
          {verified && active.length > 0 && (
            <Link href={`/dashboard/team/${teamId}/record`} className={buttonVariants({ size: 'sm' })}>
              Record a testing day
            </Link>
          )}
        </div>
        {active.length === 0 ? (
          <EmptyState title="No players yet">Approved players appear here. You see their name, class and position, and the results you record.</EmptyState>
        ) : (
          <ul className="flex flex-col divide-y-2 divide-border-subtle border-2 border-border-subtle">
            {active.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <span>
                  <span className="font-bold">{who(m)}</span>{' '}
                  <span className="text-fg-muted">
                    <span className="tabular">{m.athlete.gradYear}</span>, {positionLabel(m.athlete.primaryPosition)}
                  </span>
                </span>
                <ConfirmDialog
                  trigger={
                    <Button size="sm" variant="ghost">
                      Remove {m.athlete.firstName}
                    </Button>
                  }
                  title={`Remove ${who(m)} from the team?`}
                  description="Results they have not answered are withdrawn. Values they already accepted stay on their profile."
                  confirmLabel="Remove"
                  tone="danger"
                  onConfirm={() => remove.mutate({ memberId: m.id })}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby={`sessions-${teamId}`} className="flex flex-col gap-3">
        <h3 id={`sessions-${teamId}`} className="text-xl font-bold">
          Testing days
        </h3>
        {roster.data.sessions.length === 0 ? (
          <p className="text-fg-muted">None yet.</p>
        ) : (
          <ul className="flex flex-col divide-y-2 divide-border-subtle border-2 border-border-subtle">
            {roster.data.sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <span>
                  <span className="font-bold">{s.label}</span> <span className="tabular text-fg-muted">{s.date}</span>
                  {s.location ? <span className="text-fg-muted">, {s.location}</span> : null}
                </span>
                <Link href={`/dashboard/team/session/${s.id}`} className="font-bold">
                  <span className="tabular">{s.entries}</span> results
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export function TeamConsole() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const teams = useQuery(trpc.team.mine.queryOptions())
  const [selected, setSelected] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.team.mine.queryKey() })
  const regenerate = useMutation(trpc.team.regenerateCode.mutationOptions({ onSuccess: refresh }))

  if (teams.isPending) return <Spinner label="Loading teams" />
  if (teams.isError) return <Alert tone="error">{errorMessage(teams.error)}</Alert>
  if (teams.data.length === 0 || adding) {
    return (
      <section aria-labelledby="new-team-title" className="flex flex-col gap-4">
        <h2 id="new-team-title" className="text-2xl font-bold">
          {teams.data.length === 0 ? 'Set up your team' : 'Add a team'}
        </h2>
        <p className="text-fg-muted">
          Our staff match you to the staff page you give before players can join. Players ask to join with a code you share; you approve each one,
          and a parent or guardian approves for players under 18.
        </p>
        <TeamForm
          onDone={() => {
            setAdding(false)
            void refresh()
          }}
        />
        {adding && (
          <Button variant="ghost" className="self-start" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        )}
      </section>
    )
  }

  const team = teams.data.find((t) => t.id === selected) ?? teams.data[0]!
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        {teams.data.length > 1 ? (
          <Field label="Team" name="team-select" required className="min-w-64">
            {(p) => (
              <Select {...p} value={team.id} onChange={(e) => setSelected(e.target.value)}>
                {teams.data.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : (
          <h2 className="text-2xl font-bold">{team.name}</h2>
        )}
        {teams.data.length < TEAM_POLICY.maxTeamsPerCoach && (
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
            Add a team
          </Button>
        )}
      </div>

      <section aria-labelledby="team-status-title" className="flex flex-col gap-3 border-2 border-border-subtle p-4">
        <h2 id="team-status-title" className="sr-only">
          Team status
        </h2>
        <p className="text-fg-muted">
          {team.organization}, {team.state}. {team.coachName}, {team.coachTitle}.
        </p>
        <Alert tone={team.status === 'VERIFIED' ? 'success' : team.status === 'PENDING' ? 'info' : 'error'}>
          {STATUS_TEXT[team.status]}
          {team.reviewNote && team.status !== 'VERIFIED' ? ` Note from our staff: ${team.reviewNote}` : ''}
        </Alert>
        {team.status === 'VERIFIED' && (
          <div className="flex flex-wrap items-center gap-3">
            <span>Team code</span>
            <span className="tabular text-2xl font-bold">{formatJoinCode(team.joinCode)}</span>
            <CopyButton value={team.joinCode} label="Copy code" />
            <ConfirmDialog
              trigger={
                <Button size="sm" variant="ghost">
                  New code
                </Button>
              }
              title="Replace the team code?"
              description="The old code stops working at once. Requests already sent stay in your list."
              confirmLabel="Replace code"
              onConfirm={() => regenerate.mutate({ teamId: team.id })}
            />
          </div>
        )}
        {regenerate.isError && <Alert tone="error">{errorMessage(regenerate.error)}</Alert>}
      </section>

      {team.status === 'REJECTED' && (
        <TeamForm
          teamId={team.id}
          initial={{ name: team.name, sport: team.sport, orgType: team.orgType, organization: team.organization, state: team.state, coachName: team.coachName, coachTitle: team.coachTitle, directoryUrl: team.directoryUrl }}
          onDone={() => void refresh()}
        />
      )}
      {team.status !== 'REJECTED' && <Roster key={team.id} teamId={team.id} verified={team.status === 'VERIFIED'} />}
    </div>
  )
}
