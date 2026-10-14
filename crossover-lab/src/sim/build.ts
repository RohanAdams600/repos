import type { Athlete, Measured, MetricKey, Metrics, MovementSignature } from '../data/types'
import { METRICS, YD_TO_M } from '../data/metrics'
import { latestSeason, resolveMetric } from '../data/resolve'
import { hashString } from './rng'
import { runSprint, sprintProfile } from './sprint'

/** How far each trait group leans toward athlete B: 0 = all A, 1 = all B. */
export interface BlendWeights {
  body: number
  speed: number
  power: number
  agility: number
  skill: number
}

export interface BlendOptions {
  name: string
  number: string
  /** Which parent supplies sport, position, kit and sport skills. */
  base: 'A' | 'B'
  today: string
}

const GROUP_OF: Record<string, keyof BlendWeights> = {
  Body: 'body',
  Speed: 'speed',
  Jump: 'power',
  Strength: 'power',
  Throwing: 'power',
  Agility: 'agility',
  Conditioning: 'agility',
  Football: 'skill',
  Baseball: 'skill',
  Basketball: 'skill',
}

const SKIP: MetricKey[] = ['fortyS', 'threeQuarterSprintS', 'sprintSpeedFtS', 'topSpeedMph', 'tenSplitS']

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function blendNumbers<T extends object>(a: T, b: T, w: number): T {
  const out = { ...a } as Record<string, unknown>
  for (const [k, va] of Object.entries(a)) {
    const vb = (b as Record<string, unknown>)[k]
    if (typeof va === 'number' && typeof vb === 'number') out[k] = lerp(va, vb, w)
    else out[k] = w > 0.5 ? vb : va
  }
  return out as T
}

/**
 * Build-an-athlete: blend two athletes trait group by trait group. Every figure on the result is
 * SIMULATED, with a note saying what it was blended from.
 */
export function blendAthletes(a: Athlete, b: Athlete, w: BlendWeights, opts: BlendOptions): Athlete {
  const base = opts.base === 'A' ? a : b
  const other = opts.base === 'A' ? b : a
  const metrics: Metrics = {}
  const keys = new Set<MetricKey>([...(Object.keys(METRICS) as MetricKey[])])
  for (const key of keys) {
    if (SKIP.includes(key)) continue
    const group = GROUP_OF[METRICS[key].group] ?? 'skill'
    const weight = w[group]
    const ma = resolveMetric(a, key)
    const mb = resolveMetric(b, key)
    // Sport skills only blend between athletes of the same sport.
    if (group === 'skill' && a.league !== b.league) {
      const own = resolveMetric(base, key)
      if (own) metrics[key] = sim(own.value, `From ${base.name}.`)
      continue
    }
    if (ma && mb) metrics[key] = sim(lerp(ma.value, mb.value, weight), `${Math.round((1 - weight) * 100)}% ${a.name}, ${Math.round(weight * 100)}% ${b.name}.`)
    else if (ma || mb) metrics[key] = sim((ma ?? mb)!.value, `Only ${ma ? a.name : b.name} has this figure.`)
  }
  // Speed: blend modelled 40-yard times so every sprint input speaks the same language.
  const fa = runSprint(sprintProfile(a), 40 * YD_TO_M).time
  const fb = runSprint(sprintProfile(b), 40 * YD_TO_M).time
  metrics.fortyS = sim(lerp(fa, fb, w.speed), `Modelled 40-yard times blended: ${fa.toFixed(2)} s and ${fb.toFixed(2)} s.`)
  const games = resolveMetric(base, 'gamesPlayedPct')
  if (games) metrics.gamesPlayedPct = sim(games.value, `Availability of ${base.name}.`)
  const season = latestSeason(base)
  if (season && a.league !== b.league) for (const [k, m] of Object.entries(season.metrics) as [MetricKey, Measured][]) metrics[k] = sim(m.value, `From ${base.name}, ${season.season}.`)

  const movement: MovementSignature = {
    quality: 'SIMULATED',
    basis: `Blend of ${a.name} and ${b.name}.`,
    run: blendNumbers(a.movement.run, b.movement.run, w.speed),
    throw: blendNumbers(a.movement.throw, b.movement.throw, w.skill),
    shoot: blendNumbers(a.movement.shoot, b.movement.shoot, w.skill),
    swing: blendNumbers(a.movement.swing, b.movement.swing, w.skill),
    jump: blendNumbers(a.movement.jump, b.movement.jump, w.power),
  }

  const slug = opts.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom'
  return {
    id: `custom-${slug}-${(hashString(`${a.id}${b.id}${JSON.stringify(w)}${opts.name}`) % 46656).toString(36)}`,
    name: opts.name || 'Custom athlete',
    league: base.league,
    position: base.position,
    positionGroup: base.positionGroup,
    team: 'Custom build',
    ...(base.bats ? { bats: base.bats } : {}),
    ...(base.throws ? { throws: base.throws } : {}),
    kit: { ...base.kit, number: opts.number || base.kit.number },
    metrics,
    seasons: [],
    gear: base.gear.map((g) => ({ ...g, quality: 'SIMULATED' as const, basis: `From ${base.name}'s gear profile.` })),
    gearHistory: [{ season: 'Current', quality: 'SIMULATED', changes: [`Kit borrowed from ${base.name}.`] }],
    movement,
    injuries: [],
    media: [],
    ...(base.pitches ? { pitches: base.pitches } : {}),
    sources: {},
    summary: `Custom build: ${Math.round((1 - w.body) * 100)}% ${a.name} body, ${Math.round((1 - w.speed) * 100)}% ${a.name} speed, ${Math.round((1 - w.power) * 100)}% ${a.name} power, playing ${base.league} as a ${base.position.toLowerCase()}. ${other.name} supplies the rest.`,
    custom: true,
    reviewed: opts.today,
  }
}

function sim(value: number, note: string): Measured {
  return { value, quality: 'SIMULATED', note }
}
