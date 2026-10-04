import type { KinematicReport, PoseTrack, SegmentName } from '@/lib/biomechanics/types'

/**
 * Side-by-side comparison helpers. Two clips are aligned on lead foot strike: time zero is the
 * frame the front foot lands in each clip, so the delivery or swing that follows lines up even if
 * the clips start at different moments.
 */

export const SEGMENTS: readonly SegmentName[] = ['pelvis', 'torso', 'arm', 'hand']

/** Segment peak times in milliseconds relative to foot strike (negative: before foot strike). */
export function peaksRelativeToFootStrike(report: Pick<KinematicReport, 'footStrikeTime' | 'peaks'>): Partial<Record<SegmentName, number>> {
  if (report.footStrikeTime === null) return {}
  const out: Partial<Record<SegmentName, number>> = {}
  for (const peak of report.peaks) out[peak.segment] = Math.round((peak.time - report.footStrikeTime) * 1000)
  return out
}

export type SyncClip = { footStrikeTime: number; durationSec: number }

/**
 * Shared timeline in seconds relative to foot strike that both clips can show:
 * from the later "start" to the earlier "end".
 */
export function syncWindow(a: SyncClip, b: SyncClip): { start: number; end: number } {
  const start = Math.max(-a.footStrikeTime, -b.footStrikeTime)
  const end = Math.min(a.durationSec - a.footStrikeTime, b.durationSec - b.footStrikeTime)
  return { start, end: Math.max(start, end) }
}

/** Mirror a track left to right, so a left-handed clip can be compared with a right-handed one. */
export function mirrorTrack(track: PoseTrack): PoseTrack {
  const swap = (name: string) => (name.startsWith('left_') ? `right_${name.slice(5)}` : name.startsWith('right_') ? `left_${name.slice(6)}` : name)
  return {
    aspectRatio: track.aspectRatio,
    frames: track.frames.map((frame) => ({
      t: frame.t,
      keypoints: Object.fromEntries(Object.entries(frame.keypoints).map(([name, kp]) => [swap(name), kp && { ...kp, x: 1 - kp.x }])) as typeof frame.keypoints,
    })),
  }
}

export type ComparisonRow = { segment: SegmentName; a: number | null; b: number | null; differenceMs: number | null }

export function comparisonRows(a: Pick<KinematicReport, 'footStrikeTime' | 'peaks'>, b: Pick<KinematicReport, 'footStrikeTime' | 'peaks'>): ComparisonRow[] {
  const pa = peaksRelativeToFootStrike(a)
  const pb = peaksRelativeToFootStrike(b)
  return SEGMENTS.map((segment) => {
    const va = pa[segment] ?? null
    const vb = pb[segment] ?? null
    return { segment, a: va, b: vb, differenceMs: va !== null && vb !== null ? va - vb : null }
  })
}
