'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Select } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import type { FitBand, MatchResult } from '@/lib/matchmaker/score'
import { METRIC_DEFINITIONS } from '@/lib/metrics/definitions'
import { US_STATES } from '@/lib/us-states'
import { useMessages } from '@/i18n/client'
import { recruitingMessages } from '@/i18n/messages/recruiting'
import { domainMessages } from '@/i18n/messages/domain'
import { errorMessage, useTRPC } from '@/trpc/client'

type Division = MatchResult['division']
const DIVISIONS: Division[] = ['D1', 'D2', 'D3', 'NAIA', 'JUCO']
const BANDS: FitBand[] = ['STRONG', 'REALISTIC', 'REACH', 'LONG_SHOT']

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

function ResultRow({ result, pipelineStatus }: { result: MatchResult; pipelineStatus?: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const add = useMutation(
    trpc.pipeline.add.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.matchmaker.search.queryKey() }),
    }),
  )
  const status = pipelineStatus ?? (add.isSuccess ? 'INTERESTED' : undefined)
  const m = useMessages(recruitingMessages).matchmaker
  const d = useMessages(domainMessages)

  return (
    <li className="flex flex-col gap-4 border-2 border-border-subtle p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">{result.schoolName}</h3>
          <p className="text-sm text-fg-muted">
            {result.division}
            {result.conference ? `, ${result.conference}` : ''}
            {result.state ? `, ${result.state}` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="font-bold">{m.bands[result.band]![0]}</p>
          <p className="tabular text-sm text-fg-muted">{m.fitScore(result.fitScore)}</p>
        </div>
      </div>

      <ul className="flex flex-col gap-3" aria-label={m.comparison(result.schoolName)}>
        {result.comparisons.map((c) => {
          const def = METRIC_DEFINITIONS[c.metric]
          return (
            <li key={c.metric} className="flex flex-col gap-1">
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <span className="font-bold">{d.metric[c.metric]}</span>
                <span className="tabular">{m.vs(`${c.athleteValue.toFixed(def.decimals)} ${def.unit}`, `${c.programMean.toFixed(def.decimals)} ${def.unit}`)}</span>
              </div>
              <div className="h-2 w-full bg-surface" aria-hidden="true">
                <div className="h-full bg-accent-text" style={{ width: `${c.standing}%` }} />
              </div>
              <p className="text-xs text-fg-muted">{m.better(c.standing)}</p>
            </li>
          )
        })}
      </ul>

      {result.academic === 'BELOW' && <p className="text-sm font-bold">{m.gpaBelow}</p>}
      {result.coverage < 1 && <p className="text-sm text-fg-muted">{m.partial}</p>}

      <div className="flex flex-wrap items-center gap-3">
        {status ? (
          <p className="text-sm font-bold">{m.inPipeline(m.pipeline[status] ?? status)}</p>
        ) : (
          <Button variant="secondary" size="sm" disabled={add.isPending} onClick={() => add.mutate({ collegeId: result.programId })}>
            {add.isPending ? m.adding : m.add}
          </Button>
        )}
        {add.isError && <span className="text-sm font-bold text-danger">{errorMessage(add.error)}</span>}
      </div>
    </li>
  )
}

export function Matchmaker() {
  const trpc = useTRPC()
  const [divisions, setDivisions] = useState<Division[]>([])
  const [bands, setBands] = useState<FitBand[]>([])
  const [state, setState] = useState('')
  const [page, setPage] = useState(1)
  const input = { divisions, bands, state: state || undefined, page, pageSize: 20 }
  const query = useQuery({ ...trpc.matchmaker.search.queryOptions(input), placeholderData: (previous) => previous })
  const data = query.data
  const m = useMessages(recruitingMessages).matchmaker

  const resetPage = <T,>(setter: (v: T) => void) => (value: T) => {
    setter(value)
    setPage(1)
  }

  return (
    <div className="flex flex-col gap-6">
      <form aria-label={m.filter} className="flex flex-wrap items-end gap-6 border-b-2 border-border-subtle pb-6" onSubmit={(e) => e.preventDefault()}>
        <fieldset>
          <legend className="mb-2 text-sm font-bold">{m.division}</legend>
          <div className="flex flex-wrap gap-2">
            {DIVISIONS.map((d) => (
              <label key={d} className="flex min-h-11 cursor-pointer items-center gap-2 border-2 border-border-strong px-3 has-[:checked]:border-fg">
                <input type="checkbox" checked={divisions.includes(d)} onChange={() => resetPage(setDivisions)(toggle(divisions, d))} className="size-5 accent-[var(--accent)]" />
                {d}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-bold">{m.fit}</legend>
          <div className="flex flex-wrap gap-2">
            {BANDS.map((b) => (
              <label key={b} title={m.bands[b]![1]} className="flex min-h-11 cursor-pointer items-center gap-2 border-2 border-border-strong px-3 has-[:checked]:border-fg">
                <input type="checkbox" checked={bands.includes(b)} onChange={() => resetPage(setBands)(toggle(bands, b))} className="size-5 accent-[var(--accent)]" />
                {m.bands[b]![0]}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-2 text-sm font-bold">
          {m.state}
          <Select value={state} onChange={(e) => resetPage(setState)(e.target.value)} className="min-w-48">
            <option value="">{m.allStates}</option>
            {US_STATES.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </Select>
        </label>
        {(divisions.length > 0 || bands.length > 0 || state) && (
          <Button
            variant="ghost"
            onClick={() => {
              setDivisions([])
              setBands([])
              setState('')
              setPage(1)
            }}
          >
            {m.clear}
          </Button>
        )}
      </form>

      {query.isPending && <Spinner label={m.finding} />}
      {query.isError && <Alert tone="error">{errorMessage(query.error)}</Alert>}

      {data && data.athlete.metricsUsed.length === 0 && (
        <EmptyState title={m.logFirstTitle} action={<Link href="/dashboard">{m.goDashboard}</Link>}>
          {m.logFirstBody}
        </EmptyState>
      )}

      {data && data.athlete.metricsUsed.length > 0 && (
        <>
          <p aria-live="polite" className="text-fg-muted">
            {m.count(data.total, data.scoredPrograms)}
            {query.isFetching && m.updating}
          </p>
          {data.results.length === 0 ? (
            <EmptyState title={m.noneTitle}>{m.noneBody}</EmptyState>
          ) : (
            <ol className="flex flex-col gap-4">
              {data.results.map((r) => (
                <ResultRow key={r.programId} result={r} pipelineStatus={data.pipeline[r.programId]} />
              ))}
            </ol>
          )}
          {data.pageCount > 1 && (
            <nav aria-label={m.pages} className="flex items-center gap-4">
              <Button variant="secondary" size="sm" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}>
                {m.previous}
              </Button>
              <span className="tabular text-sm">{m.page(data.page, data.pageCount)}</span>
              <Button variant="secondary" size="sm" disabled={data.page >= data.pageCount} onClick={() => setPage(data.page + 1)}>
                {m.next}
              </Button>
            </nav>
          )}
        </>
      )}

      <details className="border-t-2 border-border-subtle pt-4">
        <summary className="cursor-pointer font-bold">{m.howTitle}</summary>
        <div className="mt-3 flex flex-col gap-2 text-fg-muted">
          {m.how.map((para) => (
            <p key={para}>{para}</p>
          ))}
        </div>
      </details>
    </div>
  )
}
