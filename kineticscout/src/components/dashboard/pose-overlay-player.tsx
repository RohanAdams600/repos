'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { drawSkeleton, drawTrajectory, nearestFrame } from '@/components/dashboard/skeleton-draw'
import { decodePoseTrack } from '@/lib/biomechanics/codec'
import type { CompactPoseTrack } from '@/lib/biomechanics/types'
import { Button } from '@/components/ui/button'

type Props = { videoUrl: string; pose: CompactPoseTrack; footStrikeTime: number | null; trajectory?: readonly { t: number; x: number; y: number }[] }

/**
 * Plays the athlete's video with the tracked skeleton drawn on top, synchronised per video frame
 * (requestVideoFrameCallback where supported, animation frames otherwise).
 */
export function PoseOverlayPlayer({ videoUrl, pose, footStrikeTime, trajectory }: Props) {
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
      drawSkeleton(canvas, context, showSkeleton ? nearestFrame(track.frames, video.currentTime) : null)
      if (showSkeleton && trajectory) drawTrajectory(canvas, context, trajectory, video.currentTime)
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
  }, [track, showSkeleton, trajectory])

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
