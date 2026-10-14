import type { Athlete } from './types'
import { jonathanTaylor } from './athletes/jonathan-taylor'
import { shoheiOhtani } from './athletes/shohei-ohtani'
import { donovanMitchell } from './athletes/donovan-mitchell'
import { enrich, standoutProfiles } from './standouts/profiles'

/**
 * The roster, in four layers:
 * - full profiles from the data files (the three starter athletes), topped up with any researched
 *   figure they lack;
 * - standout profiles generated from the research log (sourced figures only);
 * - rows imported from a roster file or licensed feed (kept in this browser);
 * - custom athletes from Build-an-athlete (kept in this browser).
 * Every screen, grade, leaderboard and simulation reads from allAthletes().
 */
export const BUILT_IN: readonly Athlete[] = [jonathanTaylor, shoheiOhtani, donovanMitchell].map((a) => enrich(a))

export const STANDOUTS: readonly Athlete[] = standoutProfiles(new Set(BUILT_IN.map((a) => a.id)))

const STORAGE_KEY = 'crossover-lab:custom-athletes:v1'
const IMPORT_KEY = 'crossover-lab:imported-roster:v1'
const listeners = new Set<() => void>()
let custom: Athlete[] = readStored(STORAGE_KEY).filter((a) => a.custom).map(normalize)
let imported: Athlete[] = readStored(IMPORT_KEY).map(normalize)

function readStored(key: string): Athlete[] {
  try {
    const raw = globalThis.localStorage?.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Athlete[]).filter((a) => a && typeof a.id === 'string' && typeof a.name === 'string') : []
  } catch {
    return []
  }
}

/** Athletes saved before roster status, profile type and appearance existed get defaults. */
export function normalize(a: Athlete): Athlete {
  return {
    ...a,
    status: a.status ?? 'active',
    profile: a.profile ?? (a.custom ? 'full' : 'roster'),
    appearance: a.appearance ?? { quality: 'SIMULATED', basis: 'No reference photos on file: neutral studio finish.', hair: 'unset', facialHair: 'none' },
  }
}

function write(key: string, list: Athlete[]): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(list))
  } catch {
    // Private windows and blocked storage: these athletes last for this visit only.
  }
}

function writeCustom(): void {
  write(STORAGE_KEY, custom)
}

export function allAthletes(): Athlete[] {
  return [...BUILT_IN, ...STANDOUTS, ...imported, ...custom]
}

export function importedAthletes(): Athlete[] {
  return [...imported]
}

/** Add or replace imported roster rows (matched by id) and keep them in this browser. */
export function saveImported(list: Athlete[]): void {
  const ids = new Set(list.map((a) => a.id))
  imported = [...imported.filter((a) => !ids.has(a.id)), ...list]
  write(IMPORT_KEY, imported)
  listeners.forEach((fn) => fn())
}

export function clearImported(): void {
  imported = []
  write(IMPORT_KEY, imported)
  listeners.forEach((fn) => fn())
}

export function getAthlete(id: string): Athlete | undefined {
  return allAthletes().find((a) => a.id === id)
}

export function saveCustomAthlete(athlete: Athlete): void {
  custom = [...custom.filter((a) => a.id !== athlete.id), { ...athlete, custom: true }]
  writeCustom()
  listeners.forEach((fn) => fn())
}

export function removeCustomAthlete(id: string): void {
  custom = custom.filter((a) => a.id !== id)
  writeCustom()
  listeners.forEach((fn) => fn())
}

export function onRosterChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
