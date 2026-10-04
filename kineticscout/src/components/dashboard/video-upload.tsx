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
import { errorMessage, useTRPC } from '@/trpc/client'

type Motion = 'SWING' | 'PITCH'
type Hand = 'RIGHT' | 'LEFT'
type VideoMeta = { durationMs: number; width: number; height: number }
type Phase = 'idle' | 'checking' | 'ready' | 'uploading' | 'finalizing' | 'error'

const MB = 1024 * 1024

/** Reads duration and dimensions locally from the file before anything is uploaded. */
function readVideoMetadata(file: File): Promise<VideoMeta> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    const cleanup = () => URL.revokeObjectURL(url)
    video.onloadedmetadata = () => {
      const meta = { durationMs: Math.round(video.duration * 1000), width: video.videoWidth, height: video.videoHeight }
      cleanup()
      if (!Number.isFinite(meta.durationMs) || !meta.width || !meta.height) reject(new Error('unreadable'))
      else resolve(meta)
    }
    video.onerror = () => {
      cleanup()
      reject(new Error('unreadable'))
    }
    video.src = url
  })
}

/** PUT to the signed URL with progress events (fetch has no upload progress). Abortable. */
function putWithProgress(url: string, headers: Record<string, string>, file: File, onProgress: (pct: number) => void, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value)
    xhr.timeout = 10 * 60_000
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress((event.loaded / event.total) * 100)
    }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(xhr.status === 400 || xhr.status === 403 ? 'rejected' : 'failed')))
    xhr.onerror = () => reject(new Error('network'))
    xhr.ontimeout = () => reject(new Error('timeout'))
    signal.addEventListener('abort', () => {
      xhr.abort()
      reject(new Error('aborted'))
    })
    xhr.send(file)
  })
}

const UPLOAD_ERRORS: Record<string, string> = {
  network: 'The upload was interrupted. Check your connection and try again.',
  timeout: 'The upload took too long. Try a shorter clip or a faster connection.',
  rejected: 'Storage rejected the file. It may be larger than declared, or the upload link expired. Start again.',
  failed: 'The upload failed. Try again in a moment.',
  aborted: 'Upload canceled.',
}

export function VideoUpload({ monthlyLimit }: { monthlyLimit: number }) {
  const trpc = useTRPC()
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [motion, setMotion] = useState<Motion>('SWING')
  const [hand, setHand] = useState<Hand>('RIGHT')
  const [file, setFile] = useState<File | null>(null)
  const [meta, setMeta] = useState<VideoMeta | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

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
      return setError('Choose an MP4 or MOV video. Most phones record in one of these formats.')
    }
    if (chosen.size > VIDEO_UPLOAD_POLICY.maxBytes) {
      setPhase('error')
      return setError(`That file is ${(chosen.size / MB).toFixed(0)} MB. The limit is ${VIDEO_UPLOAD_POLICY.maxBytes / MB} MB; trim the clip to just the swing or pitch.`)
    }
    setPhase('checking')
    try {
      const info = await readVideoMetadata(chosen)
      if (info.durationMs > VIDEO_UPLOAD_POLICY.maxDurationMs) {
        setPhase('error')
        return setError(`The clip is ${(info.durationMs / 1000).toFixed(1)} seconds. Trim it to ${VIDEO_UPLOAD_POLICY.maxDurationMs / 1000} seconds or less.`)
      }
      if (info.durationMs < VIDEO_UPLOAD_POLICY.minDurationMs) {
        setPhase('error')
        return setError('The clip must be at least 1 second long.')
      }
      setFile(chosen)
      setMeta(info)
      setPreviewUrl(URL.createObjectURL(chosen))
      setPhase('ready')
    } catch {
      setPhase('error')
      setError('We could not read that video in your browser. Try exporting it again as MP4.')
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
      setError(UPLOAD_ERRORS[key] ?? errorMessage(err))
    } finally {
      abortRef.current = null
    }
  }

  const busy = phase === 'uploading' || phase === 'finalizing' || phase === 'checking'
  const handLabel = motion === 'SWING' ? 'Bats' : 'Throws'

  return (
    <section aria-labelledby="upload-title" className="flex flex-col gap-6 border-2 border-border-subtle p-6">
      <div>
        <h2 id="upload-title" className="text-xl font-bold">
          Analyze a swing or pitch
        </h2>
        <p className="mt-1 text-fg-muted">The analysis estimates when your hips, trunk, arm and hand reach peak speed, and flags the sequence problems behind lost velocity.</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <fieldset className="flex flex-col gap-2" disabled={busy}>
          <legend className="mb-2 font-bold">Motion</legend>
          {(['SWING', 'PITCH'] as const).map((m) => (
            <label key={m} className="flex min-h-11 cursor-pointer items-center gap-3 border-2 border-border-strong px-3 has-[:checked]:border-fg">
              <input type="radio" name="motion" value={m} checked={motion === m} onChange={() => setMotion(m)} className="size-5 accent-[var(--accent)]" />
              {m === 'SWING' ? 'Swing' : 'Pitch'}
            </label>
          ))}
        </fieldset>
        <fieldset className="flex flex-col gap-2" disabled={busy}>
          <legend className="mb-2 font-bold">{handLabel}</legend>
          {(['RIGHT', 'LEFT'] as const).map((h) => (
            <label key={h} className="flex min-h-11 cursor-pointer items-center gap-3 border-2 border-border-strong px-3 has-[:checked]:border-fg">
              <input type="radio" name="hand" value={h} checked={hand === h} onChange={() => setHand(h)} className="size-5 accent-[var(--accent)]" />
              {h === 'RIGHT' ? 'Right' : 'Left'}
            </label>
          ))}
        </fieldset>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-bold">Filming checklist</h3>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-fg-muted">
          <li>Camera facing your chest, square to the line toward the pitcher or plate, at hip height.</li>
          <li>Whole body in frame from start to finish, with no one else in the shot.</li>
          <li>Use slow motion (120 or 240 frames per second) if your phone has it.</li>
          <li>MP4 or MOV, up to {VIDEO_UPLOAD_POLICY.maxDurationMs / 1000} seconds and {VIDEO_UPLOAD_POLICY.maxBytes / MB} MB.</li>
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <label htmlFor="video-file" className="font-bold">
          Video file
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
        {phase === 'checking' && <Spinner label="Checking video" />}
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
          <video src={previewUrl} controls muted playsInline className="max-h-80 w-full bg-black object-contain" aria-label="Preview of the selected video" />
          <p className="tabular text-sm text-fg-muted">
            {(meta.durationMs / 1000).toFixed(1)} s, {meta.width} x {meta.height}, {(file!.size / MB).toFixed(1)} MB
          </p>
        </div>
      )}

      {phase === 'uploading' && <ProgressBar value={progress} label="Uploading video" />}
      {phase === 'finalizing' && <Spinner label="Checking the uploaded file" />}

      <div className="flex flex-wrap gap-3">
        <ConfirmDialog
          trigger={
            <Button disabled={phase !== 'ready'}>
              <UploadIcon /> Upload and analyze
            </Button>
          }
          title="Start this analysis?"
          description={<p>This uses one of your {monthlyLimit} analyses for the month. Results usually take one to three minutes.</p>}
          confirmLabel="Start analysis"
          onConfirm={startUpload}
        />
        {phase === 'uploading' && (
          <Button variant="secondary" onClick={() => abortRef.current?.abort()}>
            Cancel upload
          </Button>
        )}
      </div>
    </section>
  )
}
