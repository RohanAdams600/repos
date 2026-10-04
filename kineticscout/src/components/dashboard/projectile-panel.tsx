import type { ProjectileEstimate, ProjectileWarning } from '@/lib/biomechanics/projectile'

const WARNING_TEXT: Record<ProjectileWarning, string> = {
  NOT_FOUND: 'We could not find it in this clip. Tracking works best with a bright ball or puck, a plain background, good light and slow motion.',
  FEW_POINTS: 'It was only visible in a few frames after release, too few to measure.',
  NO_HEIGHT: 'Add your height on Profile and sharing to get a speed estimate; your height is the ruler we measure with.',
  IMPLAUSIBLE_SPEED: 'The speed we measured is outside the realistic range, so we are not showing it. This usually means the camera angle or distance made the scale unreliable.',
  LOW_FIT: 'Its path did not follow a clean line after release, so we did not estimate speed.',
}

/** Beta results for puck or ball tracking, always with the limits next to the numbers. */
export function ProjectilePanel({ estimate, noun }: { estimate: ProjectileEstimate; noun: string }) {
  return (
    <section aria-labelledby="projectile-title" className="flex flex-col gap-4 border-2 border-border-subtle p-6">
      <h2 id="projectile-title" className="text-xl font-bold">
        {noun.charAt(0).toUpperCase()}
        {noun.slice(1)} tracking <span className="text-base font-normal text-fg-muted">(beta)</span>
      </h2>
      {estimate.label && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
          <dt className="text-fg-muted">Estimated speed across the frame</dt>
          <dd className="tabular font-bold">{estimate.speedMph !== null ? `about ${estimate.speedMph.toFixed(0)} mph (lower bound)` : 'not available'}</dd>
          {estimate.launchAngleDeg !== null && (
            <>
              <dt className="text-fg-muted">Launch direction</dt>
              <dd className="tabular">
                {Math.abs(estimate.launchAngleDeg)}&deg; {estimate.launchAngleDeg >= 0 ? 'upward' : 'downward'}, toward the {estimate.direction} of the frame
              </dd>
            </>
          )}
        </dl>
      )}
      {estimate.warnings.length > 0 && (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-fg-muted">
          {estimate.warnings.map((w) => (
            <li key={w}>{WARNING_TEXT[w]}</li>
          ))}
        </ul>
      )}
      <p className="text-sm text-fg-muted">
        Measured from one camera, so any movement toward or away from the camera is missed and the true speed is likely higher. The scale assumes
        the {noun} travels at about your distance from the camera. Use a radar gun or launch monitor for numbers you share with coaches.
      </p>
    </section>
  )
}
