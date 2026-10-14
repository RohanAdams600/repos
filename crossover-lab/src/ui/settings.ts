import type { HeatPalette } from '../three/palette'

export type CategoricalPalette = 'okabe-ito' | 'tol-bright' | 'ibm'

export interface Settings {
  theme: 'system' | 'light' | 'dark'
  contrast: 'normal' | 'more'
  heatPalette: HeatPalette
  athletePalette: CategoricalPalette
  captions: boolean
  motion: 'system' | 'reduce' | 'full'
  showFps: boolean
}

const KEY = 'crossover-lab:settings:v1'
const DEFAULTS: Settings = { theme: 'system', contrast: 'normal', heatPalette: 'viridis', athletePalette: 'okabe-ito', captions: true, motion: 'system', showFps: false }

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

let current = load()
const listeners = new Set<(s: Settings) => void>()

export function settings(): Settings {
  return current
}

export function updateSettings(change: Partial<Settings>): void {
  current = { ...current, ...change }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // Storage blocked: settings last for this visit.
  }
  applySettings()
  listeners.forEach((fn) => fn(current))
}

export function onSettings(fn: (s: Settings) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function reducedMotion(): boolean {
  if (current.motion === 'reduce') return true
  if (current.motion === 'full') return false
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function applySettings(): void {
  const root = document.documentElement
  if (current.theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', current.theme)
  if (current.contrast === 'more') root.setAttribute('data-contrast', 'more')
  else root.removeAttribute('data-contrast')
}

/** Color-blind-safe categorical sets for telling athletes apart (always with a name label too). */
export const CATEGORICAL: Record<CategoricalPalette, { label: string; colors: string[] }> = {
  'okabe-ito': { label: 'Okabe-Ito', colors: ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#56B4E9', '#E69F00'] },
  'tol-bright': { label: 'Tol bright', colors: ['#4477AA', '#EE6677', '#228833', '#CCBB44', '#66CCEE', '#AA3377'] },
  ibm: { label: 'IBM design', colors: ['#648FFF', '#DC267F', '#FE6100', '#785EF0', '#FFB000', '#5a9e6f'] },
}

export function athleteColor(index: number): string {
  const list = CATEGORICAL[current.athletePalette].colors
  return list[index % list.length]!
}
