'use client'

import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { UploadIcon } from '@/components/icons'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { ProgressBar } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { isAllowedVideoType, VIDEO_UPLOAD_POLICY } from '@/lib/storage/video-files'
import { MOTIONS_BY_SPORT, type Motion, type SportName } from '@/lib/biomechanics/motions'
import { Checkbox } from '@/components/ui/field'
import { putWithProgress, UPLOAD_ERRORS } from '@/lib/upload/put'
import { readVideoMetadata, type VideoMeta } from '@/lib/upload/video-metadata'
import { useMessages } from '@/i18n/client'
import { analysisMessages } from '@/i18n/messages/analysis'
import { domainMessages } from '@/i18n/messages/domain'
import { useServerText } from '@/i18n/server-text-client'
import { errorMessage, useTRPC } from '@/trpc/client'

type Hand = 'RIGHT' | 'LEFT'
type Phase = 'idle' | 'checking' | 'ready' | 'uploading' | 'finalizing' | 'error'

const MB = 1024 * 1024



export function VideoUpload({ monthlyLimit, sport }: { monthlyLimit: number; sport: SportName }) {
  const motions = MOTIONS_BY_SPORT[sport]
  const trpc = useTRPC()
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [motion, setMotion] = useState<Motion>(motions[0]!)
  const [hand, setHand] = useState<Hand>('RIGHT')
  const [trackObject, setTrackObject] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [meta, setMeta] = useState<VideoMeta | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const t = useMessages(analysisMessages)
  const m = t.upload
  const d = useMessages(domainMessages)
  const serverText = useServerText()
  const noun = t.projectile.noun[motion]

  const createUpload = useMutation(trpc.analysis.createUpload.mutationOptions())
  const completeUpload = useMutation(trpc.analysis.completeUpload.mutationOptions())

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  async function onFileChosen(chosen: File | undefined) {
    setError(null)
    setMeta(null)
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setFile(null)
    if (!chosen) return setPhase('idle')
    if (!isAllowedVideoType(chosen.type)) {
      setPhase('error')
      return setError(m.type)
    }
    if (chosen.size > VIDEO_UPLOAD_POLICY.maxBytes) {
      setPhase('error')
      return setError(m.tooBig((chosen.size / MB).toFixed(0), VIDEO_UPLOAD_POLICY.maxBytes / MB, motionNames))
    }
    setPhase('checking')
    try {
      const info = await readVideoMetadata(chosen)
      if (info.durationMs > VIDEO_UPLOAD_POLICY.maxDurationMs) {
        setPhase('error')
        return setError(m.tooLong((info.durationMs / 1000).toFixed(1), VIDEO_UPLOAD_POLICY.maxDurationMs / 1000))
      }
      if (info.durationMs < VIDEO_UPLOAD_POLICY.minDurationMs) {
        setPhase('error')
        return setError(m.tooShort)
      }
      setFile(chosen)
      setMeta(info)
      setPreviewUrl(URL.createObjectURL(chosen))
      setPhase('ready')
    } catch {
      setPhase('error')
      setError(m.unreadable)
    }
  }

  async function startUpload() {
    if (!file || !meta) return
    setError(null)
    setProgress(0)
    setPhase('uploading')
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const { analysisId, upload } = await createUpload.mutateAsync({
        motionType: motion,
        handedness: hand,
        trackObject,
        contentType: file.type,
        sizeBytes: file.size,
        durationMs: meta.durationMs,
        width: meta.width,
        height: meta.height,
      })
      await putWithProgress(upload.url, upload.headers, file, setProgress, controller.signal)
      setPhase('finalizing')
      await completeUpload.mutateAsync({ analysisId })
      router.push(`/dashboard/analysis/${analysisId}`)
    } catch (err) {
      setPhase('error')
      const key = err instanceof Error ? err.message : ''
      setError(serverText(UPLOAD_ERRORS[key] ?? errorMessage(err)))
    } finally {
      abortRef.current = null
    }
  }

  const busy = phase === 'uploading' || phase === 'finalizing' || phase === 'checking'
  const handLabel = m.hand[motion]
  const motionNames = m.motionNames(motions.map((mo) => d.motion[mo]))

  return (
    <section aria-labelledby="upload-title" className="flex flex-col gap-6 border-2 border-border-subtle p-6">
      <div>
        <h2 id="upload-title" className="text-xl font-bold">
          {m.title(motionNames)}
        </h2>
        <p className="mt-1 text-fg-muted">{m.intro}</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <fieldset className="flex flex-col gap-2" disabled={busy}>
          <legend className="mb-2 font-bold">{m.motion}</legend>
          {motions.map((mo) => (
            <label key={mo} className="flex min-h-11 cursor-pointer items-center gap-3 border-2 border-border-strong px-3 has-[:checked]:border-fg">
              <input type="radio" name="motion" value={mo} checked={motion === mo} onChange={() => setMotion(mo)} className="size-5 accent-[var(--accent)]" />
              {d.motion[mo]}
            </label>
          ))}
        </fieldset>
        <fieldset className="flex flex-col gap-2" disabled={busy}>
          <legend className="mb-2 font-bold">{handLabel}</legend>
          {(['RIGHT', 'LEFT'] as const).map((h) => (
            <label key={h} className="flex min-h-11 cursor-pointer items-center gap-3 border-2 border-border-strong px-3 has-[:checked]:border-fg">
              <input type="radio" name="hand" value={h} checked={hand === h} onChange={() => setHand(h)} className="size-5 accent-[var(--accent)]" />
              {h === 'RIGHT' ? m.right : m.left}
            </label>
          ))}
        </fieldset>
      </div>

      <Checkbox
        name="trackObject"
        checked={trackObject}
        disabled={busy}
        onChange={(e) => setTrackObject(e.target.checked)}
        label={m.track(noun)}
      />

      <div className="flex flex-col gap-3">
        <h3 className="font-bold">{m.checklist}</h3>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-fg-muted">
          <li>{m.filming[motion]}</li>
          <li>{m.wholeBody}</li>
          <li>{m.slowMo}</li>
          <li>{m.format(VIDEO_UPLOAD_POLICY.maxDurationMs / 1000, VIDEO_UPLOAD_POLICY.maxBytes / MB)}</li>
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <label htmlFor="video-file" className="font-bold">
          {m.file}
        </label>
        <input
          ref={inputRef}
          id="video-file"
          type="file"
          accept="video/mp4,video/quicktime"
          disabled={busy}
          aria-describedby={error ? 'video-error' : undefined}
          onChange={(e) => onFileChosen(e.target.files?.[0])}
          className="block w-full text-base file:mr-4 file:min-h-11 file:cursor-pointer file:border-2 file:border-border-strong file:bg-transparent file:px-4 file:font-bold file:text-fg hover:file:border-fg"
        />
        <label htmlFor="video-camera" className="font-bold">
          {m.record} <span className="font-normal text-fg-muted">{m.recordHint}</span>
        </label>
        <input
          id="video-camera"
          type="file"
          accept="video/*"
          capture="environment"
          disabled={busy}
          onChange={(e) => onFileChosen(e.target.files?.[0])}
          className="block w-full text-base file:mr-4 file:min-h-11 file:cursor-pointer file:border-2 file:border-border-strong file:bg-transparent file:px-4 file:font-bold file:text-fg hover:file:border-fg"
        />
        {phase === 'checking' && <Spinner label={m.checking} />}
        {error && (
          <div id="video-error">
            <Alert tone="error" focusOnMount>
              {error}
            </Alert>
          </div>
        )}
      </div>

      {previewUrl && meta && (
        <div className="flex flex-col gap-2">
          <video src={previewUrl} controls muted playsInline className="max-h-80 w-full bg-black object-contain" aria-label={m.preview} />
          <p className="tabular text-sm text-fg-muted">
            {(meta.durationMs / 1000).toFixed(1)} s, {meta.width} x {meta.height}, {(file!.size / MB).toFixed(1)} MB
          </p>
        </div>
      )}

      {phase === 'uploading' && <ProgressBar value={progress} label={m.uploading} />}
      {phase === 'finalizing' && <Spinner label={m.finalizing} />}

      <div className="flex flex-wrap gap-3">
        <ConfirmDialog
          trigger={
            <Button disabled={phase !== 'ready'}>
              <UploadIcon /> {m.start}
            </Button>
          }
          title={m.confirmTitle}
          description={<p>{m.confirmBody(monthlyLimit)}</p>}
          confirmLabel={m.confirm}
          onConfirm={startUpload}
        />
        {phase === 'uploading' && (
          <Button variant="secondary" onClick={() => abortRef.current?.abort()}>
            {m.cancel}
          </Button>
        )}
      </div>
    </section>
  )
}
