import * as THREE from 'three'

/**
 * Color-blind-safe palettes. Heat maps use perceptually uniform sequential scales (viridis and
 * cividis are readable with every common color vision deficiency; grayscale for print and
 * high contrast). Athletes are told apart by the Okabe-Ito categorical set, always alongside a
 * name label, never by color alone.
 */
export type HeatPalette = 'viridis' | 'cividis' | 'grayscale'

const STOPS: Record<HeatPalette, string[]> = {
  viridis: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'],
  cividis: ['#00224e', '#35456c', '#666970', '#958f78', '#cbba69', '#fee838'],
  grayscale: ['#1a1a1a', '#5a5a5a', '#9a9a9a', '#d0d0d0', '#ffffff'],
}

const cache = new Map<HeatPalette, THREE.Color[]>()

function stops(p: HeatPalette): THREE.Color[] {
  let list = cache.get(p)
  if (!list) {
    list = STOPS[p].map((hex) => new THREE.Color(hex))
    cache.set(p, list)
  }
  return list
}

export function heatColor(p: HeatPalette, t: number, out = new THREE.Color()): THREE.Color {
  const list = stops(p)
  const x = Math.max(0, Math.min(1, t)) * (list.length - 1)
  const i = Math.min(list.length - 2, Math.floor(x))
  return out.copy(list[i]!).lerp(list[i + 1]!, x - i)
}

export function heatGradientCss(p: HeatPalette): string[] {
  return STOPS[p]
}

