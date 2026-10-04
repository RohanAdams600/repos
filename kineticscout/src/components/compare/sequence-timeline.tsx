'use client'

import { useMessages } from '@/i18n/client'
import { analysisMessages } from '@/i18n/messages/analysis'
import { comparisonRows, SEGMENTS } from '@/lib/biomechanics/compare'
import type { KinematicReport, SegmentName } from '@/lib/biomechanics/types'


/**
 * When each segment reached peak speed, relative to the shared sync event, for both clips. A good sequence
 * peaks pelvis, then torso, then arm, then hand. Letters mark segments so color is never the only cue.
 */
export function SequenceTimeline({ a, b, labelA, labelB }: { a: KinematicReport; b: KinematicReport; labelA: string; labelB: string }) {
  const { anchor, rows } = comparisonRows(a, b)
  const m = useMessages(analysisMessages).compare
  const SEGMENT_LABEL: Record<SegmentName, string> = m.segment
  const SEGMENT_MARK: Record<SegmentName, string> = m.mark
  const anchorLabel = m.anchor[anchor?.event ?? 'HAND_PEAK']!
  const values = rows.flatMap((r) => [r.a, r.b]).filter((v): v is number => v !== null)
  const min = Math.min(0, ...values) - 40
  const max = Math.max(0, ...values) + 40
  const width = 640
  const x = (ms: number) => 16 + ((ms - min) / (max - min)) * (width - 32)
  const lanes = [
    { label: labelA, key: 'a' as const, y: 44 },
    { label: labelB, key: 'b' as const, y: 104 },
  ]
  return (
    <div className="flex flex-col gap-4">
      <svg viewBox={`0 0 ${width} 150`} className="w-full" role="img" aria-label={m.svg(anchorLabel)}>
        <line x1={x(0)} x2={x(0)} y1={12} y2={136} stroke="currentColor" strokeWidth={2} strokeDasharray="4 4" />
        <text x={x(0)} y={148} textAnchor="middle" fontSize={11} fill="currentColor">
          {anchorLabel}
        </text>
        {lanes.map((lane) => (
          <g key={lane.key}>
            <line x1={16} x2={width - 16} y1={lane.y} y2={lane.y} stroke="currentColor" strokeOpacity={0.3} strokeWidth={2} />
            <text x={16} y={lane.y - 16} fontSize={12} fontWeight={700} fill="currentColor">
              {lane.label}
            </text>
            {rows.map((r) => {
              const v = r[lane.key]
              if (v === null) return null
              return (
                <g key={r.segment}>
                  <rect x={x(v) - 11} y={lane.y - 11} width={22} height={22} fill={lane.key === 'a' ? '#E6FF00' : '#2D2D2D'} stroke="#121212" strokeWidth={2} />
                  <text x={x(v)} y={lane.y + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill={lane.key === 'a' ? '#121212' : '#FFFFFF'}>
                    {SEGMENT_MARK[r.segment]}
                  </text>
                </g>
              )
            })}
          </g>
        ))}
      </svg>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left">
          <caption className="sr-only">{m.tableCaption(anchorLabel)}</caption>
          <thead>
            <tr className="border-b-2 border-border-subtle">
              <th scope="col" className="py-2 pr-4">{m.colSegment}</th>
              <th scope="col" className="py-2 pr-4 text-right">{labelA}</th>
              <th scope="col" className="py-2 pr-4 text-right">{labelB}</th>
              <th scope="col" className="py-2 text-right">{m.colDiff}</th>
            </tr>
          </thead>
          <tbody>
            {SEGMENTS.map((segment) => {
              const r = rows.find((row) => row.segment === segment)!
              const fmt = (v: number | null) => (v === null ? m.na : `${v > 0 ? '+' : ''}${v} ms`)
              return (
                <tr key={segment} className="border-b border-border-subtle">
                  <th scope="row" className="py-2 pr-4">
                    {SEGMENT_LABEL[segment]} ({SEGMENT_MARK[segment]})
                  </th>
                  <td className="tabular py-2 pr-4 text-right">{fmt(r.a)}</td>
                  <td className="tabular py-2 pr-4 text-right">{fmt(r.b)}</td>
                  <td className="tabular py-2 text-right">{r.differenceMs === null ? m.na : `${r.differenceMs > 0 ? '+' : ''}${r.differenceMs} ms`}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-fg-muted">{m.error}</p>
    </div>
  )
}
