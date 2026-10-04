import type { KinematicReport, PoseTrack, SegmentName } from '@/lib/biomechanics/types'

/**
 * Side-by-side comparison helpers. Two clips are aligned on a shared event: lead foot strike when
 * both clips have one, otherwise the moment of peak hand speed (contact or release), which every
 * analysis has. Skaters often show no clear foot strike, so hockey shots usually sync on the hands.
 */

export const SEGMENTS: readonly SegmentName[] = ['pelvis', 'torso', 'arm', 'hand']

type AnchorSource = Pick<KinematicReport, 'footStrikeTime' | 'peaks'>

export type AnchorEvent = 'FOOT_STRIKE' | 'HAND_PEAK'
export type Anchor = { event: AnchorEvent; a: number; b: number }

function handPeak(report: AnchorSource): number | null {
  return report.peaks.find((p) => p.segment === 'hand')?.time ?? null
}

export function commonAnchor(a: AnchorSource, b: AnchorSource): Anchor | null {
  if (a.footStrikeTime !== null && b.footStrikeTime !== null) return { event: 'FOOT_STRIKE', a: a.footStrikeTime, b: b.footStrikeTime }
  const ha = handPeak(a)
  const hb = handPeak(b)
  return ha !== null && hb !== null ? { event: 'HAND_PEAK', a: ha, b: hb } : null
}

export const ANCHOR_LABELS: Record<AnchorEvent, string> = { FOOT_STRIKE: 'foot strike', HAND_PEAK: 'peak hand speed' }

/** Segment peak times in milliseconds relative to an anchor time (negative: before it). */
export function peaksRelativeTo(report: Pick<KinematicReport, 'peaks'>, anchorTime: number): Partial<Record<SegmentName, number>> {
  const out: Partial<Record<SegmentName, number>> = {}
  for (const peak of report.peaks) out[peak.segment] = Math.round((peak.time - anchorTime) * 1000)
  return out
}

/** Segment peak times relative to foot strike (empty when foot strike was not detected). */
export function peaksRelativeToFootStrike(report: AnchorSource): Partial<Record<SegmentName, number>> {
  return report.footStrikeTime === null ? {} : peaksRelativeTo(report, report.footStrikeTime)
}

export type SyncClip = { anchorTime: number; durationSec: number }

/** Shared timeline in seconds relative to the anchor that both clips can show. */
export function syncWindow(a: SyncClip, b: SyncClip): { start: number; end: number } {
  const start = Math.max(-a.anchorTime, -b.anchorTime)
  const end = Math.min(a.durationSec - a.anchorTime, b.durationSec - b.anchorTime)
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

export function comparisonRows(a: AnchorSource, b: AnchorSource): { anchor: Anchor | null; rows: ComparisonRow[] } {
  const anchor = commonAnchor(a, b)
  const pa = anchor ? peaksRelativeTo(a, anchor.a) : {}
  const pb = anchor ? peaksRelativeTo(b, anchor.b) : {}
  return {
    anchor,
    rows: SEGMENTS.map((segment) => {
      const va = pa[segment] ?? null
      const vb = pb[segment] ?? null
      return { segment, a: va, b: vb, differenceMs: va !== null && vb !== null ? va - vb : null }
    }),
  }
}
