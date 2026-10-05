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
import { positionLabel, type Position } from '@/lib/athletes/positions'
import { formatJoinCode, TEAM_POLICY } from '@/lib/teams/rules'
import { useMessages } from '@/i18n/client'
import { coachMessages } from '@/i18n/messages/coach'
import { domainMessages } from '@/i18n/messages/domain'
import { errorMessage, useTRPC } from '@/trpc/client'

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
  const m = useMessages(coachMessages).team
  const d = useMessages(domainMessages)
  const position = (p: Position) => d.position[p] ?? positionLabel(p)

  if (roster.isPending) return <Spinner label={m.loadingRoster} />
  if (roster.isError) return <Alert tone="error">{errorMessage(roster.error)}</Alert>
  const requested = roster.data.members.filter((x) => x.status === 'REQUESTED')
  const awaiting = roster.data.members.filter((x) => x.status === 'AWAITING_GUARDIAN')
  const active = roster.data.members.filter((x) => x.status === 'ACTIVE')
  const who = (x: (typeof active)[number]) => `${x.athlete.firstName} ${x.athlete.lastName}`

  return (
    <div className="flex flex-col gap-8">
      {(decide.isError || remove.isError) && <Alert tone="error">{errorMessage(decide.error ?? remove.error)}</Alert>}
      <section aria-labelledby={`requests-${teamId}`} className="flex flex-col gap-3">
        <h3 id={`requests-${teamId}`} className="text-xl font-bold">
          {m.requests}
        </h3>
        {requested.length === 0 ? (
          <p className="text-fg-muted">{m.noRequests}</p>
        ) : (
          <ul className="flex flex-col divide-y-2 divide-border-subtle border-2 border-border-subtle">
            {requested.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <span>
                  <span className="font-bold">{who(x)}</span> <span className="text-fg-muted">{m.classPosition(x.athlete.gradYear, position(x.athlete.primaryPosition))}</span>
                </span>
                <span className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ memberId: x.id, approve: true })}>
                    {m.approve(x.athlete.firstName)}
                  </Button>
                  <Button size="sm" variant="secondary" disabled={decide.isPending} onClick={() => decide.mutate({ memberId: x.id, approve: false })}>
                    {m.decline}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {awaiting.length > 0 && (
          <p className="text-fg-muted">
            {m.awaiting(awaiting.map(who).join(', '), TEAM_POLICY.guardianLinkDays)}
          </p>
        )}
      </section>

      <section aria-labelledby={`roster-${teamId}`} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id={`roster-${teamId}`} className="text-xl font-bold">
            {m.roster} <span className="tabular font-normal text-fg-muted">({active.length})</span>
          </h3>
          {verified && active.length > 0 && (
            <Link href={`/dashboard/team/${teamId}/record`} className={buttonVariants({ size: 'sm' })}>
              {m.record}
            </Link>
          )}
        </div>
        {active.length === 0 ? (
          <EmptyState title={m.noPlayersTitle}>{m.noPlayersBody}</EmptyState>
        ) : (
          <ul className="flex flex-col divide-y-2 divide-border-subtle border-2 border-border-subtle">
            {active.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <span>
                  <span className="font-bold">{who(x)}</span> <span className="tabular text-fg-muted">{m.yearPosition(x.athlete.gradYear, position(x.athlete.primaryPosition))}</span>
                </span>
                <ConfirmDialog
                  trigger={
                    <Button size="sm" variant="ghost">
                      {m.remove(x.athlete.firstName)}
                    </Button>
                  }
                  title={m.removeTitle(who(x))}
                  description={m.removeBody}
                  confirmLabel={m.removeConfirm}
                  tone="danger"
                  onConfirm={() => remove.mutate({ memberId: x.id })}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby={`sessions-${teamId}`} className="flex flex-col gap-3">
        <h3 id={`sessions-${teamId}`} className="text-xl font-bold">
          {m.sessions}
        </h3>
        {roster.data.sessions.length === 0 ? (
          <p className="text-fg-muted">{m.none}</p>
        ) : (
          <ul className="flex flex-col divide-y-2 divide-border-subtle border-2 border-border-subtle">
            {roster.data.sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <span>
                  <span className="font-bold">{s.label}</span> <span className="tabular text-fg-muted">{s.date}</span>
                  {s.location ? <span className="text-fg-muted">, {s.location}</span> : null}
                </span>
                <Link href={`/dashboard/team/session/${s.id}`} className="font-bold">
                  <span className="tabular">{m.results(s.entries)}</span>
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
  const m = useMessages(coachMessages).team

  if (teams.isPending) return <Spinner label={m.loadingTeams} />
  if (teams.isError) return <Alert tone="error">{errorMessage(teams.error)}</Alert>
  if (teams.data.length === 0 || adding) {
    return (
      <section aria-labelledby="new-team-title" className="flex flex-col gap-4">
        <h2 id="new-team-title" className="text-2xl font-bold">
          {teams.data.length === 0 ? m.setUp : m.add}
        </h2>
        <p className="text-fg-muted">{m.setUpIntro}</p>
        <TeamForm
          onDone={() => {
            setAdding(false)
            void refresh()
          }}
        />
        {adding && (
          <Button variant="ghost" className="self-start" onClick={() => setAdding(false)}>
            {m.cancel}
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
          <Field label={m.team} name="team-select" required className="min-w-64">
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
            {m.add}
          </Button>
        )}
      </div>

      <section aria-labelledby="team-status-title" className="flex flex-col gap-3 border-2 border-border-subtle p-4">
        <h2 id="team-status-title" className="sr-only">
          {m.teamStatus}
        </h2>
        <p className="text-fg-muted">
          {team.organization}, {team.state}. {team.coachName}, {team.coachTitle}.
        </p>
        <Alert tone={team.status === 'VERIFIED' ? 'success' : team.status === 'PENDING' ? 'info' : 'error'}>
          {m.status[team.status]}
          {team.reviewNote && team.status !== 'VERIFIED' ? m.staffNote(team.reviewNote) : ''}
        </Alert>
        {team.status === 'VERIFIED' && (
          <div className="flex flex-wrap items-center gap-3">
            <span>{m.code}</span>
            <span className="tabular text-2xl font-bold">{formatJoinCode(team.joinCode)}</span>
            <CopyButton value={team.joinCode} label={m.copyCode} />
            <ConfirmDialog
              trigger={
                <Button size="sm" variant="ghost">
                  {m.newCode}
                </Button>
              }
              title={m.replaceTitle}
              description={m.replaceBody}
              confirmLabel={m.replace}
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
