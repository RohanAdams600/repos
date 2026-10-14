import type { Athlete } from './types'
import { jonathanTaylor } from './athletes/jonathan-taylor'
import { shoheiOhtani } from './athletes/shohei-ohtani'
import { donovanMitchell } from './athletes/donovan-mitchell'

/**
 * The roster. Built-in athletes come from the data files; custom athletes from Build-an-athlete
 * are kept in this browser only. To add an athlete, add a data file and list it here: every
 * screen, grade, leaderboard and simulation picks it up.
 */
export const BUILT_IN: readonly Athlete[] = [jonathanTaylor, shoheiOhtani, donovanMitchell]

const STORAGE_KEY = 'crossover-lab:custom-athletes:v1'
const listeners = new Set<() => void>()
let custom: Athlete[] = readCustom()

function readCustom(): Athlete[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Athlete[]).filter((a) => a && a.custom && typeof a.id === 'string') : []
  } catch {
    return []
  }
}

function writeCustom(): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(custom))
  } catch {
    // Private windows and blocked storage: custom athletes last for this visit only.
  }
}

export function allAthletes(): Athlete[] {
  return [...BUILT_IN, ...custom]
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
