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
import { errorMessage, useTRPC } from '@/trpc/client'

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

  async function upload(file: File | undefined) {
    if (!file) return
    setError(null)
    if (!isAllowedVideoType(file.type)) return setError('Choose an MP4 or MOV video.')
    if (file.size > EVIDENCE_POLICY.maxBytes) return setError('The clip must be 60 MB or smaller. Trim it to the moment of the measurement.')
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
        Video received. We run automatic checks first, then a reviewer confirms the value, usually within 2 business days.
      </Alert>
    )
  }

  return (
    <div className="flex flex-col gap-4 border-2 border-border-subtle p-4">
      <div className="flex flex-col gap-2 text-fg-muted">
        <p>
          Send one clip that shows this {metricLabel.toLowerCase()} being measured. A reviewer must be able to read the value on screen, for
          example:
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>the radar gun, Pocket Radar or launch monitor display, filmed together with the swing, throw or shot;</li>
          <li>for timed runs, the full run with the timing system or a visible stopwatch;</li>
          <li>an official showcase results screen or sheet with your name.</li>
        </ul>
        <p className="text-sm">MP4 or MOV, up to 60 seconds and 60 MB. The video is reviewed privately, never shown on your profile, and deleted 30 days after the decision.</p>
      </div>
      {error && (
        <Alert tone="error" focusOnMount>
          {error}
        </Alert>
      )}
      {phase === 'uploading' && <ProgressBar value={progress} label="Uploading video" />}
      {phase === 'finalizing' && <Spinner label="Checking the upload" />}
      {(phase === 'idle' || phase === 'error') && (
        <div>
          <label htmlFor={inputId} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border-2 border-border-strong px-5 font-bold hover:border-fg hover:bg-fg hover:text-bg">
            <UploadIcon />
            Choose video
          </label>
          <input id={inputId} type="file" accept="video/mp4,video/quicktime" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} />
        </div>
      )}
      {phase === 'uploading' && (
        <Button variant="secondary" size="sm" className="self-start" onClick={() => controller.current?.abort()}>
          Cancel upload
        </Button>
      )}
    </div>
  )
}
