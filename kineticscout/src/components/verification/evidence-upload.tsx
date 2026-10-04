'use client'

import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { UploadIcon } from '@/components/icons'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { putWithProgress, UPLOAD_ERRORS } from '@/lib/upload/put'
import { isAllowedVideoType } from '@/lib/storage/video-files'
import { EVIDENCE_POLICY } from '@/lib/verification/policy'
import { useMessages } from '@/i18n/client'
import { metricsMessages } from '@/i18n/messages/metrics'
import { errorMessage, useTRPC } from '@/trpc/client'

/** Label styled as a button for a visually hidden file input; shows focus when the input has it. */
const PICKER =
  'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border-2 border-border-strong px-5 font-bold hover:border-fg hover:bg-fg hover:text-bg [&:has(+input:focus-visible)]:outline-2 [&:has(+input:focus-visible)]:outline-offset-2 [&:has(+input:focus-visible)]:outline-fg'

type Phase = 'idle' | 'uploading' | 'finalizing' | 'done' | 'error'

export function EvidenceUpload({ metricId, metricLabel, onDone }: { metricId: string; metricLabel: string; onDone: () => void }) {
  const trpc = useTRPC()
  const createUpload = useMutation(trpc.verification.createUpload.mutationOptions())
  const completeUpload = useMutation(trpc.verification.completeUpload.mutationOptions())
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  const inputId = `evidence-${metricId}`
  const m = useMessages(metricsMessages).evidence

  async function upload(file: File | undefined) {
    if (!file) return
    setError(null)
    if (!isAllowedVideoType(file.type)) return setError(m.type)
    if (file.size > EVIDENCE_POLICY.maxBytes) return setError(m.size)
    try {
      setPhase('uploading')
      const { upload } = await createUpload.mutateAsync({ metricId, contentType: file.type, sizeBytes: file.size })
      controller.current = new AbortController()
      await putWithProgress(upload.url, upload.headers, file, setProgress, controller.current.signal)
      setPhase('finalizing')
      await completeUpload.mutateAsync({ metricId })
      setPhase('done')
      onDone()
    } catch (e) {
      const message = e instanceof Error && e.message in UPLOAD_ERRORS ? UPLOAD_ERRORS[e.message]! : errorMessage(e)
      setError(message)
      setPhase('error')
    }
  }

  if (phase === 'done') {
    return (
      <Alert tone="success" focusOnMount>
        {m.received}
      </Alert>
    )
  }

  return (
    <div className="flex flex-col gap-4 border-2 border-border-subtle p-4">
      <div className="flex flex-col gap-2 text-fg-muted">
        <p>{m.intro(metricLabel)}</p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          {m.examples.map((example) => (
            <li key={example}>{example}</li>
          ))}
        </ul>
        <p className="text-sm">{m.rules}</p>
      </div>
      {error && (
        <Alert tone="error" focusOnMount>
          {error}
        </Alert>
      )}
      {phase === 'uploading' && <ProgressBar value={progress} label={m.uploading} />}
      {phase === 'finalizing' && <Spinner label={m.finalizing} />}
      {(phase === 'idle' || phase === 'error') && (
        <div className="flex flex-wrap gap-3">
          <label htmlFor={inputId} className={PICKER}>
            <UploadIcon />
            {m.choose}
          </label>
          <input id={inputId} type="file" accept="video/mp4,video/quicktime" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} />
          {/* On phones and tablets this opens the camera directly; elsewhere it behaves like Choose video. */}
          <label htmlFor={`${inputId}-camera`} className={PICKER}>
            {m.record}
          </label>
          <input id={`${inputId}-camera`} type="file" accept="video/*" capture="environment" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} />
        </div>
      )}
      {phase === 'uploading' && (
        <Button variant="secondary" size="sm" className="self-start" onClick={() => controller.current?.abort()}>
          {m.cancel}
        </Button>
      )}
    </div>
  )
}
