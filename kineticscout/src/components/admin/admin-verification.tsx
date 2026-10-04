'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Field, Select, TextInput } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { REJECTION_LABELS } from '@/lib/verification/policy'
import { errorMessage, useTRPC } from '@/trpc/client'

type Reason = keyof typeof REJECTION_LABELS
const REVIEWER_REASONS: Reason[] = ['VALUE_NOT_VISIBLE', 'VALUE_MISMATCH', 'WRONG_EVENT', 'DUPLICATE_VIDEO', 'OTHER']

function checkSummary(checks: Record<string, unknown> | null): string[] {
  if (!checks) return []
  const notes: string[] = []
  if (checks.recordedDate === 'differs') notes.push(`Recorded ${String(checks.recordedDaysFromMeasurement)} days from the measurement date`)
  if (checks.recordedDate === 'unknown') notes.push('No recording date in the file')
  if (checks.reuse === 'other-metric') notes.push('Same video was submitted for another of this athlete’s measurements')
  if (checks.duration === 'unknown') notes.push('Duration not readable from the file')
  return notes
}

function ReviewItem({ item, onDecided }: { item: { metricId: string; athlete: string; metricLabel: string; value: number; unit: string; measuredOn: string; recordedAt: string | null; checks: Record<string, unknown> | null; videoUrl: string | null }; onDecided: () => void }) {
  const trpc = useTRPC()
  const decide = useMutation(trpc.admin.decideVerification.mutationOptions({ onSuccess: onDecided }))
  const [reason, setReason] = useState<Reason>('VALUE_NOT_VISIBLE')
  const [note, setNote] = useState('')
  const flags = checkSummary(item.checks)
  return (
    <li className="flex flex-col gap-4 border-2 border-border-subtle p-4">
      <div className="flex flex-col gap-1">
        <p className="font-bold">
          {item.metricLabel}: <span className="tabular">{item.value}</span> {item.unit}
        </p>
        <p className="text-sm text-fg-muted">
          {item.athlete}. Measured <span className="tabular">{item.measuredOn}</span>
          {item.recordedAt && (
            <>
              ; file recorded <span className="tabular">{item.recordedAt.slice(0, 10)}</span>
            </>
          )}
          .
        </p>
      </div>
      {flags.length > 0 && (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
          {flags.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      {item.videoUrl ? (
        <video src={item.videoUrl} controls playsInline preload="metadata" className="max-h-96 w-full bg-black" aria-label={`Evidence video for ${item.metricLabel}`} />
      ) : (
        <Alert tone="error">The video is no longer available.</Alert>
      )}
      {decide.isError && <Alert tone="error">{errorMessage(decide.error)}</Alert>}
      <p className="text-sm text-fg-muted">Approve only if the value on screen matches the logged value and the clip shows this athlete&apos;s measurement.</p>
      <div className="flex flex-wrap gap-3">
        <Button disabled={decide.isPending} onClick={() => decide.mutate({ metricId: item.metricId, approve: true })}>
          Approve as verified
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Reason" name={`reason-${item.metricId}`} required>
          {(props) => (
            <Select {...props} value={reason} onChange={(e) => setReason(e.target.value as Reason)}>
              {REVIEWER_REASONS.map((r) => (
                <option key={r} value={r}>
                  {REJECTION_LABELS[r]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Note to athlete" name={`note-${item.metricId}`}>
          {(props) => <TextInput {...props} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        <Button variant="danger" disabled={decide.isPending} onClick={() => decide.mutate({ metricId: item.metricId, approve: false, reason, note: note || undefined })}>
          Reject
        </Button>
      </div>
    </li>
  )
}

export function VerificationQueue() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const query = useQuery(trpc.admin.verificationQueue.queryOptions({ limit: 10 }))
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.admin.verificationQueue.queryKey() })
  return (
    <section aria-labelledby="verification-title" className="flex flex-col gap-4">
      <h2 id="verification-title" className="text-2xl font-bold">
        Measurement verification{query.data ? ` (${query.data.total} waiting)` : ''}
      </h2>
      {query.isPending && <Spinner label="Loading submissions" />}
      {query.isError && <Alert tone="error">{errorMessage(query.error)}</Alert>}
      {query.data?.items.length === 0 && <EmptyState title="Nothing to review">New submissions appear here after their automatic checks.</EmptyState>}
      <ul className="flex flex-col gap-4">
        {query.data?.items.map((item) => <ReviewItem key={item.metricId} item={item} onDecided={refresh} />)}
      </ul>
    </section>
  )
}
