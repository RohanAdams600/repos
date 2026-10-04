'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PauseIcon, PlayIcon } from '@/components/icons'
import { drawSkeleton, nearestFrame } from '@/components/dashboard/skeleton-draw'
import { Button } from '@/components/ui/button'
import { decodePoseTrack } from '@/lib/biomechanics/codec'
import { ANCHOR_LABELS, commonAnchor, syncWindow } from '@/lib/biomechanics/compare'
import type { CompactPoseTrack, KinematicReport } from '@/lib/biomechanics/types'

export type ComparisonSide = { label: string; videoUrl: string; pose: CompactPoseTrack; report: KinematicReport; handedness: 'RIGHT' | 'LEFT'; attribution: string | null }

/** Drift allowed between the two videos before the follower is re-seeked (about one frame at 30 fps). */
const MAX_DRIFT_SEC = 0.04

function Panel({ side, mirrored, videoRef, canvasRef }: { side: ComparisonSide; mirrored: boolean; videoRef: React.RefObject<HTMLVideoElement | null>; canvasRef: React.RefObject<HTMLCanvasElement | null> }) {
  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <div className="relative w-full bg-black" style={{ aspectRatio: String(side.pose.aspectRatio), transform: mirrored ? 'scaleX(-1)' : undefined }}>
        <video
          ref={videoRef}
          src={side.videoUrl}
          playsInline
          muted
          preload="auto"
          disablePictureInPicture
          controlsList="nodownload noplaybackrate"
          className="absolute inset-0 h-full w-full object-fill"
          aria-label={`${side.label}, synced with the other clip`}
        />
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />
      </div>
      <figcaption className="text-sm">
        <span className="font-bold">{side.label}</span>
        {mirrored && <span className="text-fg-muted"> · mirrored to match your side</span>}
        {side.attribution && <span className="block text-fg-muted">{side.attribution}</span>}
      </figcaption>
    </figure>
  )
}

/**
 * Two clips on one clock measured from a shared event (foot strike, or peak hand speed when either
 * clip has no detectable foot strike). Clip A drives playback; clip B is
 * re-seeked whenever it drifts by more than a frame, so the two stay aligned at any speed.
 */
export function SideBySidePlayer({ a, b }: { a: ComparisonSide; b: ComparisonSide }) {
  const videoA = useRef<HTMLVideoElement>(null)
  const videoB = useRef<HTMLVideoElement>(null)
  const canvasA = useRef<HTMLCanvasElement>(null)
  const canvasB = useRef<HTMLCanvasElement>(null)
  const trackA = useMemo(() => decodePoseTrack(a.pose), [a.pose])
  const trackB = useMemo(() => decodePoseTrack(b.pose), [b.pose])
  const anchor = useMemo(() => commonAnchor(a.report, b.report), [a.report, b.report])
  const fsA = anchor?.a ?? 0
  const fsB = anchor?.b ?? 0
  const anchorLabel = ANCHOR_LABELS[anchor?.event ?? 'HAND_PEAK']
  const span = useMemo(() => syncWindow({ anchorTime: fsA, durationSec: a.report.durationSec }, { anchorTime: fsB, durationSec: b.report.durationSec }), [fsA, fsB, a.report.durationSec, b.report.durationSec])
  const startAt = Math.max(span.start, -0.8)
  const mirrored = a.handedness !== b.handedness
  const [tau, setTau] = useState(startAt)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(0.25)
  const [showSkeleton, setShowSkeleton] = useState(true)

  const drawBoth = useCallback(() => {
    const va = videoA.current
    const vb = videoB.current
    const ca = canvasA.current
    const cb = canvasB.current
    const xa = ca?.getContext('2d')
    const xb = cb?.getContext('2d')
    if (!va || !vb || !ca || !cb || !xa || !xb) return
    drawSkeleton(ca, xa, showSkeleton ? nearestFrame(trackA.frames, va.currentTime) : null)
    drawSkeleton(cb, xb, showSkeleton ? nearestFrame(trackB.frames, vb.currentTime) : null)
  }, [showSkeleton, trackA, trackB])

  const seek = useCallback(
    (t: number) => {
      const clamped = Math.min(span.end, Math.max(span.start, t))
      if (videoA.current) videoA.current.currentTime = fsA + clamped
      if (videoB.current) videoB.current.currentTime = fsB + clamped
      setTau(clamped)
    },
    [fsA, fsB, span.end, span.start],
  )

  // Initial position, and redraw after any seek completes.
  useEffect(() => {
    const va = videoA.current
    const vb = videoB.current
    if (!va || !vb) return
    const onReady = () => seek(startAt)
    va.addEventListener('loadedmetadata', onReady, { once: true })
    const redraw = () => drawBoth()
    va.addEventListener('seeked', redraw)
    vb.addEventListener('seeked', redraw)
    return () => {
      va.removeEventListener('loadedmetadata', onReady)
      va.removeEventListener('seeked', redraw)
      vb.removeEventListener('seeked', redraw)
    }
  }, [drawBoth, seek, startAt])

  // Playback loop: A is the clock, B follows.
  useEffect(() => {
    const va = videoA.current
    const vb = videoB.current
    if (!va || !vb) return
    va.playbackRate = rate
    vb.playbackRate = rate
    if (!playing) {
      va.pause()
      vb.pause()
      drawBoth()
      return
    }
    let frame = 0
    let cancelled = false
    void Promise.all([va.play(), vb.play()]).catch(() => setPlaying(false))
    const tick = () => {
      if (cancelled) return
      const t = va.currentTime - fsA
      if (t >= span.end) {
        setPlaying(false)
        return
      }
      const target = fsB + t
      if (Math.abs(vb.currentTime - target) > MAX_DRIFT_SEC) vb.currentTime = target
      setTau(t)
      drawBoth()
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [playing, rate, drawBoth, fsA, fsB, span.end])

  const ms = Math.round(tau * 1000)
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Panel side={a} mirrored={false} videoRef={videoA} canvasRef={canvasA} />
        <Panel side={b} mirrored={mirrored} videoRef={videoB} canvasRef={canvasB} />
      </div>
      <div className="flex flex-col gap-3 border-2 border-border-subtle p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            size="sm"
            aria-label={playing ? 'Pause both clips' : 'Play both clips'}
            onClick={() => {
              if (!playing && tau >= span.end - 0.01) seek(startAt)
              setPlaying((p) => !p)
            }}
          >
            {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
            {playing ? 'Pause' : 'Play'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => (setPlaying(false), seek(0))}>
            Jump to {anchorLabel}
          </Button>
          <label className="flex items-center gap-2 text-sm font-bold">
            Speed
            <select value={rate} onChange={(e) => setRate(Number(e.target.value))} className="min-h-9 border-2 border-border-strong bg-bg px-2">
              <option value={0.1}>0.1x</option>
              <option value={0.25}>0.25x</option>
              <option value={0.5}>0.5x</option>
              <option value={1}>1x</option>
            </select>
          </label>
          <Button variant="secondary" size="sm" aria-pressed={showSkeleton} onClick={() => setShowSkeleton((v) => !v)}>
            {showSkeleton ? 'Hide skeletons' : 'Show skeletons'}
          </Button>
        </div>
        <label className="flex flex-col gap-2 text-sm font-bold">
          <span>
            Time from {anchorLabel}: <span className="tabular">{ms > 0 ? `+${ms}` : ms} ms</span>
          </span>
          <input
            type="range"
            min={span.start}
            max={span.end}
            step={0.005}
            value={tau}
            onChange={(e) => (setPlaying(false), seek(Number(e.target.value)))}
            className="w-full accent-[var(--accent)]"
            aria-valuetext={`${ms} milliseconds from ${anchorLabel}`}
          />
        </label>
      </div>
    </div>
  )
}
