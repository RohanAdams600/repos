'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { SKELETON_EDGES, decodePoseTrack } from '@/lib/biomechanics/codec'
import type { CompactPoseTrack, PoseFrame } from '@/lib/biomechanics/types'
import { Button } from '@/components/ui/button'

type Props = { videoUrl: string; pose: CompactPoseTrack; footStrikeTime: number | null }

function nearestFrame(frames: PoseFrame[], t: number): PoseFrame | null {
  if (!frames.length) return null
  let lo = 0
  let hi = frames.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (frames[mid]!.t < t) lo = mid + 1
    else hi = mid
  }
  const candidate = frames[lo]!
  const previous = frames[lo - 1]
  const best = previous && Math.abs(previous.t - t) < Math.abs(candidate.t - t) ? previous : candidate
  // Do not draw a stale skeleton across gaps in tracking.
  return Math.abs(best.t - t) <= 0.1 ? best : null
}

/**
 * Plays the athlete's video with the tracked skeleton drawn on top, synchronised per video frame
 * (requestVideoFrameCallback where supported, animation frames otherwise).
 */
export function PoseOverlayPlayer({ videoUrl, pose, footStrikeTime }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const track = useMemo(() => decodePoseTrack(pose), [pose])
  const [showSkeleton, setShowSkeleton] = useState(true)
  const [rate, setRate] = useState(0.5)

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    let handle = 0
    let cancelled = false

    const draw = () => {
      const { clientWidth: w, clientHeight: h } = canvas
      const dpr = window.devicePixelRatio || 1
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.clearRect(0, 0, w, h)
      if (!showSkeleton) return
      const frame = nearestFrame(track.frames, video.currentTime)
      if (!frame) return
      const point = (name: keyof PoseFrame['keypoints']) => {
        const kp = frame.keypoints[name]
        return kp && kp.score >= 0.3 ? { x: kp.x * w, y: kp.y * h } : null
      }
      // Dark underlay keeps the volt skeleton visible on bright and dark footage alike.
      for (const [width, color] of [
        [6, 'rgba(18,18,18,0.85)'],
        [3, '#E6FF00'],
      ] as const) {
        context.lineWidth = width
        context.strokeStyle = color
        context.lineCap = 'round'
        for (const [a, b] of SKELETON_EDGES) {
          const p = point(a)
          const q = point(b)
          if (!p || !q) continue
          context.beginPath()
          context.moveTo(p.x, p.y)
          context.lineTo(q.x, q.y)
          context.stroke()
        }
      }
      for (const name of Object.keys(frame.keypoints) as (keyof PoseFrame['keypoints'])[]) {
        const p = point(name)
        if (!p) continue
        context.beginPath()
        context.arc(p.x, p.y, 4, 0, Math.PI * 2)
        context.fillStyle = '#E6FF00'
        context.fill()
        context.lineWidth = 2
        context.strokeStyle = '#121212'
        context.stroke()
      }
    }

    const hasVfc = 'requestVideoFrameCallback' in HTMLVideoElement.prototype
    const loop = () => {
      if (cancelled) return
      draw()
      handle = hasVfc ? video.requestVideoFrameCallback(loop) : requestAnimationFrame(loop)
    }
    loop()
    const onSeek = () => draw()
    video.addEventListener('seeked', onSeek)
    return () => {
      cancelled = true
      video.removeEventListener('seeked', onSeek)
      if (hasVfc) video.cancelVideoFrameCallback(handle)
      else cancelAnimationFrame(handle)
    }
  }, [track, showSkeleton])

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = rate
  }, [rate])

  return (
    <div className="flex flex-col gap-3">
      <div className="relative w-full bg-black" style={{ aspectRatio: String(track.aspectRatio) }}>
        <video ref={videoRef} src={videoUrl} controls playsInline muted preload="metadata" className="absolute inset-0 h-full w-full object-fill" aria-label="Your uploaded video with skeletal tracking overlay" />
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" aria-pressed={showSkeleton} onClick={() => setShowSkeleton((v) => !v)}>
          {showSkeleton ? 'Hide skeleton' : 'Show skeleton'}
        </Button>
        {footStrikeTime !== null && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const video = videoRef.current
              if (!video) return
              video.pause()
              video.currentTime = footStrikeTime
            }}
          >
            Jump to foot strike
          </Button>
        )}
        <label className="flex items-center gap-2 text-sm font-bold">
          Speed
          <select value={rate} onChange={(e) => setRate(Number(e.target.value))} className="min-h-9 border-2 border-border-strong bg-bg px-2">
            <option value={0.25}>0.25x</option>
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
          </select>
        </label>
      </div>
    </div>
  )
}
