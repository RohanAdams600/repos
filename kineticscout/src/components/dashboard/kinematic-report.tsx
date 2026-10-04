import type { KinematicReport, SegmentName } from '@/lib/biomechanics/types'

const SEGMENT_LABEL: Record<SegmentName, string> = { pelvis: 'Pelvis', torso: 'Trunk', arm: 'Arm', hand: 'Hand' }
const IDEAL: SegmentName[] = ['pelvis', 'torso', 'arm', 'hand']
const WARNING_TEXT: Record<string, string> = {
  LOW_FRAME_RATE: 'Recorded below 100 frames per second, so timing differences shorter than one frame cannot be measured. Use slow motion for sharper results.',
  FOOT_STRIKE_NOT_DETECTED: 'Front foot landing was not detected, so separation at foot strike is not reported.',
  LOW_KEYPOINT_CONFIDENCE: 'Body tracking confidence was low. Better lighting and a clear view of the whole body will improve accuracy.',
  SHORT_CLIP: 'Very short clip. Include the full motion from load to follow-through.',
}

/**
 * The kinematic sequence as a single time axis with each segment's peak marked and labelled
 * directly. Identity is carried by text labels and position, not colour, so it reads the same in
 * both themes, in print and for colour-blind athletes. The table repeats every value.
 */
function SequenceTimeline({ report }: { report: KinematicReport }) {
  const reference = report.footStrikeTime ?? Math.min(...report.peaks.map((p) => p.time))
  const rel = report.peaks.map((p) => ({ ...p, ms: Math.round((p.time - reference) * 1000) }))
  const min = Math.min(0, ...rel.map((p) => p.ms)) - 20
  const max = Math.max(...rel.map((p) => p.ms)) + 20
  const x = (ms: number) => 40 + ((ms - min) / (max - min || 1)) * 520
  const sorted = [...rel].sort((a, b) => a.ms - b.ms)

  return (
    <figure className="flex flex-col gap-3">
      <svg viewBox="0 0 600 150" className="w-full" role="img" aria-labelledby="timeline-caption">
        <line x1="40" x2="560" y1="100" y2="100" stroke="var(--border-strong)" strokeWidth="1" />
        {report.footStrikeTime !== null && (
          <g>
            <line x1={x(0)} x2={x(0)} y1="20" y2="108" stroke="var(--fg-muted)" strokeWidth="1" />
            <text x={x(0)} y="126" textAnchor="middle" fontSize="12" fill="var(--fg-muted)">
              Foot strike
            </text>
          </g>
        )}
        {sorted.map((p, i) => {
          const labelY = 30 + (i % 2) * 28
          return (
            <g key={p.segment}>
              <line x1={x(p.ms)} x2={x(p.ms)} y1={labelY + 6} y2="96" stroke="var(--fg)" strokeWidth="1" />
              <circle cx={x(p.ms)} cy="100" r="5" fill="var(--accent-text)" stroke="var(--bg)" strokeWidth="2" />
              <text x={x(p.ms)} y={labelY} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--fg)">
                {SEGMENT_LABEL[p.segment]} {p.ms >= 0 ? '+' : ''}
                {p.ms} ms
              </text>
            </g>
          )
        })}
        <text x="560" y="146" textAnchor="end" fontSize="11" fill="var(--fg-muted)">
          time relative to {report.footStrikeTime !== null ? 'foot strike' : 'first peak'} (ms)
        </text>
      </svg>
      <figcaption id="timeline-caption" className="text-sm text-fg-muted">
        Peak order observed: {report.observedOrder.map((s) => SEGMENT_LABEL[s]).join(', then ')}. Efficient order: {IDEAL.map((s) => SEGMENT_LABEL[s]).join(', then ')}.
      </figcaption>
    </figure>
  )
}

export function KinematicReportView({ report }: { report: KinematicReport }) {
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="sequence-title" className="flex flex-col gap-4">
        <h2 id="sequence-title" className="text-xl font-bold">
          Kinematic sequence: {report.sequenceIsIdeal ? 'in order' : 'out of order'}
        </h2>
        <SequenceTimeline report={report} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left">
            <caption className="sr-only">Peak angular speed and timing by body segment</caption>
            <thead>
              <tr className="border-b-2 border-border-subtle">
                <th scope="col" className="py-2 pr-4">Segment</th>
                <th scope="col" className="py-2 pr-4 text-right">Peak time (s)</th>
                <th scope="col" className="py-2 text-right">Peak speed (deg/s, 2D estimate)</th>
              </tr>
            </thead>
            <tbody>
              {report.peaks.map((p) => (
                <tr key={p.segment} className="border-b border-border-subtle">
                  <th scope="row" className="py-2 pr-4">{SEGMENT_LABEL[p.segment]}</th>
                  <td className="tabular py-2 pr-4 text-right">{p.time.toFixed(3)}</td>
                  <td className="tabular py-2 text-right">{p.speedDegPerSec.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="grid grid-cols-2 gap-px border-2 border-border-subtle bg-border-subtle sm:grid-cols-4">
          {[
            ['Pelvis to trunk', `${report.gapsMs.pelvisToTorso} ms`],
            ['Trunk to arm', `${report.gapsMs.torsoToArm} ms`],
            ['Separation at foot strike', report.separationAtFootStrikeDeg !== null ? `${report.separationAtFootStrikeDeg} deg` : 'Not measured'],
            ['Max separation', `${report.maxSeparationDeg} deg`],
          ].map(([label, value]) => (
            <div key={label} className="bg-bg p-4">
              <dt className="text-sm text-fg-muted">{label}</dt>
              <dd className="tabular mt-1 text-lg">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="findings-title" className="flex flex-col gap-4">
        <h2 id="findings-title" className="text-xl font-bold">
          What to work on
        </h2>
        {report.findings.length === 0 ? (
          <p className="text-fg-muted">No sequencing problems were detected in this clip. Keep filming regularly to track consistency.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {report.findings.map((f) => (
              <li key={f.code} className="border-l-4 border-fg pl-4">
                <p className="text-xs font-bold tracking-wide uppercase text-fg-muted">
                  {f.severity === 'high' ? 'High priority' : f.severity === 'medium' ? 'Medium priority' : 'Worth checking'}
                </p>
                <h3 className="text-lg font-bold">{f.title}</h3>
                <p className="mt-1 text-fg-muted">{f.detail}</p>
                <p className="mt-2">
                  <span className="font-bold">Focus: </span>
                  {f.focus}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="quality-title" className="flex flex-col gap-3">
        <h2 id="quality-title" className="text-lg font-bold">
          About this measurement
        </h2>
        <p className="text-fg-muted">
          <span className="tabular">{report.frameRate}</span> frames per second, <span className="tabular">{report.durationSec}</span> s analyzed, tracking confidence{' '}
          <span className="tabular">{Math.round(report.confidence * 100)}%</span>.
        </p>
        {report.warnings.length > 0 && (
          <ul className="flex list-disc flex-col gap-1 pl-5 text-fg-muted">
            {report.warnings.map((w) => (
              <li key={w}>{WARNING_TEXT[w] ?? w}</li>
            ))}
          </ul>
        )}
        <p className="text-sm text-fg-muted">
          Speeds and angles are estimated from a single 2D camera view and are best used to compare your own clips over time. They are not
          a substitute for a motion capture lab or a qualified coach.
        </p>
      </section>
    </div>
  )
}
