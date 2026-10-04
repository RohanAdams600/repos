'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { useState } from 'react'
import { SequenceTimeline } from '@/components/compare/sequence-timeline'
import { SideBySidePlayer } from '@/components/compare/side-by-side-player'
import { Alert } from '@/components/ui/alert'
import { EmptyState } from '@/components/ui/empty-state'
import { Field, Select } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { errorMessage, useTRPC } from '@/trpc/client'

type Choice = { kind: 'own' | 'reference'; id: string }

export function ComparisonView({ analysisId }: { analysisId: string }) {
  const trpc = useTRPC()
  const options = useQuery(trpc.analysis.compareOptions.queryOptions({ analysisId }))
  const [choice, setChoice] = useState<Choice | null>(null)
  const effective: Choice | null = choice ?? (options.data?.references[0] ? { kind: 'reference', id: options.data.references[0].id } : options.data?.own[0] ? { kind: 'own', id: options.data.own[0].id } : null)
  const comparison = useQuery({ ...trpc.analysis.comparison.queryOptions({ analysisId, other: effective ?? { kind: 'own', id: analysisId } }), enabled: Boolean(options.data?.syncable && effective), staleTime: 10 * 60_000 })

  if (options.isPending) return <Spinner label="Loading comparison options" />
  if (options.isError) return <Alert tone="error">{errorMessage(options.error)}</Alert>
  if (!options.data.syncable) {
    return (
      <Alert tone="info">
        This clip cannot be synced: either the lead foot strike was not detected or the video was deleted under the retention policy.{' '}
        <Link href="/dashboard/analysis">Upload a new clip</Link> filmed from the side with the whole body in frame.
      </Alert>
    )
  }
  const { own, references } = options.data
  if (!effective) {
    return (
      <EmptyState title="Nothing to compare with yet">
        Upload another {own.length === 0 ? 'clip' : 'clip of the same motion'} to compare your mechanics over time. Professional reference clips
        appear here when KineticScout has licensed footage to show.
      </EmptyState>
    )
  }
  const value = `${effective.kind}:${effective.id}`

  return (
    <div className="flex flex-col gap-8">
      <Field label="Compare with" name="compareWith" required>
        {(p) => (
          <Select
            {...p}
            value={value}
            onChange={(e) => {
              const [kind, id] = e.target.value.split(':') as ['own' | 'reference', string]
              setChoice({ kind, id })
            }}
          >
            {references.length > 0 && (
              <optgroup label="Licensed reference clips">
                {references.map((r) => (
                  <option key={r.id} value={`reference:${r.id}`}>
                    {r.playerName} ({r.level}): {r.title}
                  </option>
                ))}
              </optgroup>
            )}
            {own.length > 0 && (
              <optgroup label="Your earlier clips">
                {own.map((o) => (
                  <option key={o.id} value={`own:${o.id}`}>
                    {o.createdAt.slice(0, 10)}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        )}
      </Field>
      {references.length === 0 && (
        <p className="text-sm text-fg-muted">Professional reference clips appear here when KineticScout has licensed footage to show. Until then you can compare your own clips.</p>
      )}
      {comparison.isPending && <Spinner label="Loading both clips" />}
      {comparison.isError && <Alert tone="error">{errorMessage(comparison.error)}</Alert>}
      {comparison.data && (
        <>
          <SideBySidePlayer key={value} a={comparison.data.a} b={comparison.data.b} />
          <section aria-labelledby="timeline-title" className="flex flex-col gap-4">
            <h2 id="timeline-title" className="text-xl font-bold">
              Kinematic sequence
            </h2>
            <SequenceTimeline a={comparison.data.a.report} b={comparison.data.b.report} labelA="You" labelB={effective.kind === 'reference' ? 'Reference' : 'Earlier clip'} />
          </section>
        </>
      )}
    </div>
  )
}
