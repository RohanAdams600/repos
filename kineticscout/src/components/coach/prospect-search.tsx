'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ContactDialog } from '@/components/coach/contact-dialog'
import { ProspectCard } from '@/components/coach/prospect-card'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Checkbox, Field, Select, TextInput } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { POSITIONS_BY_SPORT, type Position, type Sport } from '@/lib/athletes/positions'
import { METRIC_DEFINITIONS, METRIC_TYPES, type MetricType } from '@/lib/metrics/definitions'
import { errorMessage, useTRPC } from '@/trpc/client'

type MetricFilter = { metricType: MetricType | ''; threshold: string }
type Filters = { sport: Sport; gradYearMin: string; gradYearMax: string; positions: Position[]; metrics: MetricFilter[]; verifiedOnly: boolean; sortBy: MetricType | '' }

const REQUEST_LABEL: Record<string, string> = { PENDING: 'Request pending', ATHLETE_ACCEPTED: 'Waiting for parent or guardian', ACCEPTED: 'Contact shared', DECLINED: 'Declined', WITHDRAWN: 'Withdrawn', EXPIRED: 'Expired' }

function toQuery(f: Filters, page: number) {
  const metrics = f.metrics.filter((m) => m.metricType && Number(m.threshold) > 0).map((m) => ({ metricType: m.metricType as MetricType, threshold: Number(m.threshold) }))
  return {
    sport: f.sport,
    ...(f.gradYearMin ? { gradYearMin: Number(f.gradYearMin) } : {}),
    ...(f.gradYearMax ? { gradYearMax: Number(f.gradYearMax) } : {}),
    ...(f.positions.length ? { positions: f.positions } : {}),
    ...(metrics.length ? { metrics } : {}),
    verifiedOnly: f.verifiedOnly,
    sortBy: f.sortBy || null,
    page,
  }
}

export function ProspectSearch({ defaultSport }: { defaultSport: Sport }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const blank: Filters = { sport: defaultSport, gradYearMin: '', gradYearMax: '', positions: [], metrics: [{ metricType: '', threshold: '' }], verifiedOnly: false, sortBy: '' }
  const [draft, setDraft] = useState<Filters>(blank)
  const [applied, setApplied] = useState<{ filters: Filters; page: number }>({ filters: blank, page: 1 })
  const search = useQuery(trpc.coach.search.queryOptions(toQuery(applied.filters, applied.page)))
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.coach.search.queryKey() })
  const save = useMutation(trpc.coach.save.mutationOptions({ onSuccess: refresh }))
  const unsave = useMutation(trpc.coach.unsave.mutationOptions({ onSuccess: refresh }))
  const sportMetrics = METRIC_TYPES.filter((t) => METRIC_DEFINITIONS[t].sport === draft.sport)

  return (
    <div className="flex flex-col gap-8">
      <form
        className="flex flex-col gap-5 border-2 border-border-subtle p-5"
        onSubmit={(e) => {
          e.preventDefault()
          setApplied({ filters: draft, page: 1 })
        }}
      >
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Sport" name="searchSport" required>
            {(p) => (
              <Select {...p} value={draft.sport} onChange={(e) => setDraft({ ...blank, sport: e.target.value as Sport })}>
                <option value="BASEBALL">Baseball</option>
                <option value="HOCKEY">Hockey</option>
                <option value="FOOTBALL">Football</option>
              </Select>
            )}
          </Field>
          <Field label="Class from" name="searchYearMin">
            {(p) => <TextInput {...p} inputMode="numeric" className="tabular" value={draft.gradYearMin} onChange={(e) => setDraft({ ...draft, gradYearMin: e.target.value })} />}
          </Field>
          <Field label="Class to" name="searchYearMax">
            {(p) => <TextInput {...p} inputMode="numeric" className="tabular" value={draft.gradYearMax} onChange={(e) => setDraft({ ...draft, gradYearMax: e.target.value })} />}
          </Field>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-bold">Positions <span className="font-normal text-fg-muted">(optional)</span></legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {POSITIONS_BY_SPORT[draft.sport].map((pos) => (
              <Checkbox
                key={pos.value}
                name={`pos-${pos.value}`}
                label={pos.label}
                checked={draft.positions.includes(pos.value)}
                onChange={(e) => setDraft({ ...draft, positions: e.target.checked ? [...draft.positions, pos.value] : draft.positions.filter((p) => p !== pos.value) })}
              />
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 font-bold">Measurements <span className="font-normal text-fg-muted">(optional, best value in the last 18 months)</span></legend>
          {draft.metrics.map((m, i) => {
            const def = m.metricType ? METRIC_DEFINITIONS[m.metricType] : null
            return (
              <div key={i} className="grid gap-3 sm:grid-cols-2">
                <Field label={`Measurement ${i + 1}`} name={`metric-${i}`}>
                  {(p) => (
                    <Select {...p} value={m.metricType} onChange={(e) => setDraft({ ...draft, metrics: draft.metrics.map((x, j) => (j === i ? { ...x, metricType: e.target.value as MetricType } : x)) })}>
                      <option value="">Any</option>
                      {sportMetrics.map((t) => (
                        <option key={t} value={t}>
                          {METRIC_DEFINITIONS[t].label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label={def ? `${def.higherIsBetter ? 'At least' : 'At most'} (${def.unit})` : 'Threshold'} name={`threshold-${i}`}>
                  {(p) => <TextInput {...p} inputMode="decimal" className="tabular" disabled={!def} value={m.threshold} onChange={(e) => setDraft({ ...draft, metrics: draft.metrics.map((x, j) => (j === i ? { ...x, threshold: e.target.value } : x)) })} />}
                </Field>
              </div>
            )
          })}
          {draft.metrics.length < 3 && (
            <Button size="sm" variant="ghost" className="self-start" onClick={() => setDraft({ ...draft, metrics: [...draft.metrics, { metricType: '', threshold: '' }] })}>
              Add another measurement
            </Button>
          )}
        </fieldset>
        <div className="grid gap-5 sm:grid-cols-2 sm:items-end">
          <Field label="Sort by" name="searchSort">
            {(p) => (
              <Select {...p} value={draft.sortBy} onChange={(e) => setDraft({ ...draft, sortBy: e.target.value as MetricType | '' })}>
                <option value="">Recently updated</option>
                {sportMetrics.map((t) => (
                  <option key={t} value={t}>
                    Best {METRIC_DEFINITIONS[t].label.toLowerCase()}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Checkbox name="verifiedOnly" checked={draft.verifiedOnly} onChange={(e) => setDraft({ ...draft, verifiedOnly: e.target.checked })} label="Count only measurements verified from video" />
        </div>
        <Button type="submit" className="self-start">
          Search
        </Button>
      </form>

      <section aria-labelledby="results-title" aria-busy={search.isFetching} className="flex flex-col gap-4">
        <h2 id="results-title" className="text-xl font-bold">
          {search.data ? `${search.data.total} athlete${search.data.total === 1 ? '' : 's'}` : 'Results'}
        </h2>
        {search.isPending && <Spinner label="Searching" />}
        {search.isError && <Alert tone="error">{errorMessage(search.error)}</Alert>}
        {(save.isError || unsave.isError) && <Alert tone="error">{errorMessage(save.error ?? unsave.error)}</Alert>}
        {search.data?.results.length === 0 && <EmptyState title="No athletes match">Try fewer filters. Only athletes who made their profile public appear here.</EmptyState>}
        <ul className="flex flex-col divide-y-2 divide-border-subtle border-2 border-border-subtle">
          {search.data?.results.map((r) => (
            <li key={r.card.athleteId} className="p-4">
              <ProspectCard
                card={r.card}
                actions={
                  <>
                    <Button size="sm" variant={r.saved ? 'primary' : 'secondary'} aria-pressed={r.saved} onClick={() => (r.saved ? unsave : save).mutate({ athleteId: r.card.athleteId })}>
                      {r.saved ? 'Saved' : 'Save'}
                    </Button>
                    {r.requestStatus ? (
                      <span className="text-sm">{REQUEST_LABEL[r.requestStatus]}</span>
                    ) : (
                      <ContactDialog athleteId={r.card.athleteId} athleteName={r.card.firstName} gradYear={r.card.gradYear} />
                    )}
                  </>
                }
              />
            </li>
          ))}
        </ul>
        {search.data && search.data.pageCount > 1 && (
          <nav aria-label="Result pages" className="flex items-center gap-4">
            <Button size="sm" variant="secondary" disabled={applied.page <= 1} onClick={() => setApplied({ ...applied, page: applied.page - 1 })}>
              Previous
            </Button>
            <span className="tabular text-sm">
              Page {search.data.page} of {search.data.pageCount}
            </span>
            <Button size="sm" variant="secondary" disabled={applied.page >= search.data.pageCount} onClick={() => setApplied({ ...applied, page: applied.page + 1 })}>
              Next
            </Button>
          </nav>
        )}
      </section>
    </div>
  )
}
