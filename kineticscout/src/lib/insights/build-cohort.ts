/**
 * Biometric percentile engine, pure parts.
 *
 * An athlete is compared with KineticScout athletes of a similar build: same metric (so same
 * sport), similar age, height and weight. The narrowest cohort with at least K_MIN athletes is
 * used; bands widen step by step and the result always says which bands were used. There is no
 * licensed national dataset behind this, so results are never described as national rankings.
 */

export const K_MIN = 25

export type BuildInput = { age: number; heightInches: number; weightLbs: number }

export type CohortBands = { level: number; ageMin: number; ageMax: number; heightMin: number; heightMax: number; weightMin: number; weightMax: number }

/** Age, height and weight half-widths per widening step. */
export const WIDENING_STEPS: readonly { age: number; height: number; weight: number }[] = [
  { age: 0, height: 1, weight: 10 },
  { age: 1, height: 2, weight: 15 },
  { age: 1, height: 3, weight: 25 },
  { age: 2, height: 4, weight: 35 },
]

export function cohortBands(input: BuildInput): CohortBands[] {
  return WIDENING_STEPS.map((step, level) => ({
    level,
    ageMin: input.age - step.age,
    ageMax: input.age + step.age,
    heightMin: input.heightInches - step.height,
    heightMax: input.heightInches + step.height,
    weightMin: input.weightLbs - step.weight,
    weightMax: input.weightLbs + step.weight,
  }))
}

/**
 * Date-of-birth window for ages [ageMin, ageMax] on `today`: born after `bornAfter` and on or
 * before `bornOnOrBefore`.
 */
export function birthDateWindow(ageMin: number, ageMax: number, today: Date): { bornAfter: Date; bornOnOrBefore: Date } {
  const y = today.getUTCFullYear()
  const m = today.getUTCMonth()
  const d = today.getUTCDate()
  return { bornAfter: new Date(Date.UTC(y - ageMax - 1, m, d)), bornOnOrBefore: new Date(Date.UTC(y - ageMin, m, d)) }
}

/**
 * Share of the cohort the value beats, counting ties as half, clamped to 1..99. `sorted` is the
 * cohort's values in ascending order; for timed events (lower is better) the ranking is mirrored.
 */
export function rankInCohort(value: number, sorted: readonly number[], higherIsBetter: boolean): number {
  let below = 0
  let equal = 0
  for (const v of sorted) {
    if (v < value) below++
    else if (v === value) equal++
  }
  const above = sorted.length - below - equal
  const beaten = higherIsBetter ? below : above
  const pct = ((beaten + equal / 2) / sorted.length) * 100
  return Math.round(Math.min(99, Math.max(1, pct)))
}

export function describeBands(b: CohortBands, locale: 'en' | 'es' = 'en'): string {
  if (locale === 'es') {
    const edad = b.ageMin === b.ageMax ? `${b.ageMin} años` : `de ${b.ageMin} a ${b.ageMax} años`
    return `${edad}, de ${b.heightMin} a ${b.heightMax} in, de ${b.weightMin} a ${b.weightMax} lb`
  }
  const age = b.ageMin === b.ageMax ? `age ${b.ageMin}` : `ages ${b.ageMin} to ${b.ageMax}`
  return `${age}, ${b.heightMin} to ${b.heightMax} in, ${b.weightMin} to ${b.weightMax} lb`
}
