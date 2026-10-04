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
import { errorMessage, useTRPC } from '@/trpc/client'

type Division = MatchResult['division']
const DIVISIONS: Division[] = ['D1', 'D2', 'D3', 'NAIA', 'JUCO']
const BANDS: { value: FitBand; label: string; description: string }[] = [
  { value: 'STRONG', label: 'Strong fit', description: 'Your numbers are above the typical recruit.' },
  { value: 'REALISTIC', label: 'Realistic target', description: 'Your numbers are close to the typical recruit.' },
  { value: 'REACH', label: 'Reach', description: 'Your numbers are below the typical recruit today.' },
  { value: 'LONG_SHOT', label: 'Long shot', description: 'Your numbers are well below the typical recruit today.' },
]
const BAND_LABEL = Object.fromEntries(BANDS.map((b) => [b.value, b.label])) as Record<FitBand, string>

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
          <p className="font-bold">{BAND_LABEL[result.band]}</p>
          <p className="text-sm text-fg-muted">
            Fit score <span className="tabular">{result.fitScore}</span>/100
          </p>
        </div>
      </div>

      <ul className="flex flex-col gap-3" aria-label={`Metric comparison for ${result.schoolName}`}>
        {result.comparisons.map((c) => {
          const def = METRIC_DEFINITIONS[c.metric]
          return (
            <li key={c.metric} className="flex flex-col gap-1">
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <span className="font-bold">{def.label}</span>
                <span className="tabular">
                  You {c.athleteValue.toFixed(def.decimals)} {def.unit} vs typical recruit {c.programMean.toFixed(def.decimals)} {def.unit}
                </span>
              </div>
              <div className="h-2 w-full bg-surface" aria-hidden="true">
                <div className="h-full bg-accent-text" style={{ width: `${c.standing}%` }} />
              </div>
              <p className="text-xs text-fg-muted">Better than about {c.standing}% of this program&apos;s recent recruits on this metric.</p>
            </li>
          )
        })}
      </ul>

      {result.academic === 'BELOW' && <p className="text-sm font-bold">Your GPA is below this program&apos;s listed academic minimum.</p>}
      {result.coverage < 1 && <p className="text-sm text-fg-muted">Some metrics for your position are missing, so this fit uses partial data.</p>}

      <div className="flex flex-wrap items-center gap-3">
        {status ? (
          <p className="text-sm font-bold">In your pipeline: {status === 'INTERESTED' ? 'Interested' : status === 'CONTACTED' ? 'Contacted' : 'Offered'}</p>
        ) : (
          <Button variant="secondary" size="sm" disabled={add.isPending} onClick={() => add.mutate({ collegeId: result.programId })}>
            {add.isPending ? 'Adding' : 'Add to my pipeline'}
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

  const resetPage = <T,>(setter: (v: T) => void) => (value: T) => {
    setter(value)
    setPage(1)
  }

  return (
    <div className="flex flex-col gap-6">
      <form aria-label="Filter programs" className="flex flex-wrap items-end gap-6 border-b-2 border-border-subtle pb-6" onSubmit={(e) => e.preventDefault()}>
        <fieldset>
          <legend className="mb-2 text-sm font-bold">Division</legend>
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
          <legend className="mb-2 text-sm font-bold">Fit</legend>
          <div className="flex flex-wrap gap-2">
            {BANDS.map((b) => (
              <label key={b.value} title={b.description} className="flex min-h-11 cursor-pointer items-center gap-2 border-2 border-border-strong px-3 has-[:checked]:border-fg">
                <input type="checkbox" checked={bands.includes(b.value)} onChange={() => resetPage(setBands)(toggle(bands, b.value))} className="size-5 accent-[var(--accent)]" />
                {b.label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-2 text-sm font-bold">
          State
          <Select value={state} onChange={(e) => resetPage(setState)(e.target.value)} className="min-w-48">
            <option value="">All states</option>
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
            Clear filters
          </Button>
        )}
      </form>

      {query.isPending && <Spinner label="Finding programs" />}
      {query.isError && <Alert tone="error">{errorMessage(query.error)}</Alert>}

      {data && data.athlete.metricsUsed.length === 0 && (
        <EmptyState title="Log your numbers first" action={<Link href="/dashboard">Go to your dashboard</Link>}>
          Matching compares your best metrics from the last 18 months with each program. Log at least one metric that matters for your position.
        </EmptyState>
      )}

      {data && data.athlete.metricsUsed.length > 0 && (
        <>
          <p aria-live="polite" className="text-fg-muted">
            <span className="tabular font-bold text-fg">{data.total}</span> of <span className="tabular">{data.scoredPrograms}</span> programs match your filters.
            {query.isFetching && ' Updating.'}
          </p>
          {data.results.length === 0 ? (
            <EmptyState title="No programs match these filters">Try another division or fit band, or clear the state filter.</EmptyState>
          ) : (
            <ol className="flex flex-col gap-4">
              {data.results.map((r) => (
                <ResultRow key={r.programId} result={r} pipelineStatus={data.pipeline[r.programId]} />
              ))}
            </ol>
          )}
          {data.pageCount > 1 && (
            <nav aria-label="Results pages" className="flex items-center gap-4">
              <Button variant="secondary" size="sm" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}>
                Previous
              </Button>
              <span className="tabular text-sm">
                Page {data.page} of {data.pageCount}
              </span>
              <Button variant="secondary" size="sm" disabled={data.page >= data.pageCount} onClick={() => setPage(data.page + 1)}>
                Next
              </Button>
            </nav>
          )}
        </>
      )}

      <details className="border-t-2 border-border-subtle pt-4">
        <summary className="cursor-pointer font-bold">How fit is calculated</summary>
        <div className="mt-3 flex flex-col gap-2 text-fg-muted">
          <p>
            For each metric that matters for your position, we compare your best value from the last 18 months with the typical recent recruit
            at that program, measured in standard deviations. Metrics are weighted by position (for example, pitch velocity for pitchers; exit
            velocity, arm strength and speed for position players).
          </p>
          <p>
            The fit score is highest when your numbers are at or slightly above the typical recruit. If your GPA is below a program&apos;s listed
            minimum, the program is shown as a reach at best.
          </p>
          <p>This compares measurables only. It is not a prediction of interest or an offer; coaches weigh many things we cannot measure.</p>
        </div>
      </details>
    </div>
  )
}
