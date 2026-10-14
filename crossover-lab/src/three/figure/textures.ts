import * as THREE from 'three'

/**
 * Procedural surface detail drawn on canvases at startup: skin pores, knit jersey mesh, leather
 * grain, braid twist and hair strands. Each is a tangent-space normal map (or a roughness map)
 * so materials read as skin, fabric or leather under the studio lights. Nothing is downloaded.
 * In environments without a canvas (unit tests) every factory returns null and materials fall
 * back to flat shading.
 */
const cache = new Map<string, THREE.Texture | null>()

function canvas(size: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')
  return ctx ? { c, ctx } : null
}

/** Seeded value noise so textures are identical on every load. */
function noise2(seed: number): (x: number, y: number) => number {
  const hash = (x: number, y: number) => {
    let h = (x * 374761393 + y * 668265263 + seed * 144269504) | 0
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
  }
  return (x, y) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = x - xi
    const yf = y - yi
    const s = (t: number) => t * t * (3 - 2 * t)
    const a = hash(xi, yi)
    const b = hash(xi + 1, yi)
    const c = hash(xi, yi + 1)
    const d = hash(xi + 1, yi + 1)
    return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf)
  }
}

/** Turn a height function into a tangent-space normal map. */
function normalFromHeight(size: number, height: (x: number, y: number) => number, strength: number, key: string, repeat = 1): THREE.Texture | null {
  if (cache.has(key)) return cache.get(key)!
  const cv = canvas(size)
  if (!cv) {
    cache.set(key, null)
    return null
  }
  const h = new Float32Array(size * size)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = height(x / size, y / size)
  const img = cv.ctx.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)]!
      const r = h[y * size + ((x + 1) % size)]!
      const u = h[((y - 1 + size) % size) * size + x]!
      const d = h[((y + 1) % size) * size + x]!
      const nx = (l - r) * strength
      const ny = (u - d) * strength
      const len = Math.hypot(nx, ny, 1)
      const i = (y * size + x) * 4
      img.data[i] = Math.round(((nx / len) * 0.5 + 0.5) * 255)
      img.data[i + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255)
      img.data[i + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255)
      img.data[i + 3] = 255
    }
  }
  cv.ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(cv.c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeat, repeat)
  tex.colorSpace = THREE.NoColorSpace
  tex.anisotropy = 4
  cache.set(key, tex)
  return tex
}

export function skinNormal(): THREE.Texture | null {
  const n = noise2(11)
  const m = noise2(29)
  // Fine pores plus a soft large-scale undulation.
  return normalFromHeight(256, (x, y) => 0.6 * n(x * 90, y * 90) + 0.4 * m(x * 14, y * 14), 2.2, 'skin', 3)
}

export function knitNormal(): THREE.Texture | null {
  // Jersey mesh: a staggered grid of small holes in a knit.
  return normalFromHeight(
    256,
    (x, y) => {
      const cx = (x * 32) % 1
      const row = Math.floor(y * 32)
      const cy = (y * 32 + (row % 2) * 0.5) % 1
      const hole = Math.hypot(cx - 0.5, cy - 0.5) < 0.22 ? 0 : 1
      const rib = 0.5 + 0.5 * Math.sin(x * Math.PI * 128)
      return 0.75 * hole + 0.25 * rib
    },
    3,
    'knit',
    6,
  )
}

export function twillNormal(): THREE.Texture | null {
  // Pants and shorts: diagonal twill.
  return normalFromHeight(256, (x, y) => 0.5 + 0.5 * Math.sin((x + y) * Math.PI * 96), 1.6, 'twill', 6)
}

export function leatherNormal(): THREE.Texture | null {
  const n = noise2(5)
  return normalFromHeight(256, (x, y) => Math.abs(n(x * 64, y * 64) - 0.5) * 2, 1.6, 'leather', 4)
}

export function braidNormal(): THREE.Texture | null {
  // Interlocking strands of a three-strand braid, wrapped along the cylinder's V.
  return normalFromHeight(
    128,
    (x, y) => {
      const t = y * 6
      const a = Math.abs(((x * 3 + t) % 1) - 0.5)
      const b = Math.abs(((x * 3 - t) % 1 + 1) % 1 - 0.5)
      return Math.max(1 - a * 3, 1 - b * 3, 0)
    },
    4,
    'braid',
    1,
  )
}

export function hairNormal(): THREE.Texture | null {
  const n = noise2(77)
  return normalFromHeight(256, (x, y) => n(x * 200, y * 12), 3, 'hair', 2)
}

/** Dark roughness speckle for stubble and beards. */
export function stubbleMap(): THREE.Texture | null {
  const key = 'stubble'
  if (cache.has(key)) return cache.get(key)!
  const cv = canvas(256)
  if (!cv) {
    cache.set(key, null)
    return null
  }
  const n = noise2(3)
  const img = cv.ctx.createImageData(256, 256)
  for (let i = 0; i < 256 * 256; i++) {
    const x = i % 256
    const y = Math.floor(i / 256)
    const v = n(x * 0.9, y * 0.9) > 0.55 ? 255 : 0
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255
    img.data[i * 4 + 3] = v
  }
  cv.ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(cv.c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(3, 3)
  cache.set(key, tex)
  return tex
}

/** Turf, hardwood and dirt colour textures for the environments. */
export function surfaceTexture(kind: 'turf' | 'wood' | 'dirt' | 'track' | 'crowd', repeat = 8): THREE.Texture | null {
  const key = `surface:${kind}:${repeat}`
  if (cache.has(key)) return cache.get(key)!
  const cv = canvas(512)
  if (!cv) {
    cache.set(key, null)
    return null
  }
  const n = noise2(kind.length * 13)
  const img = cv.ctx.createImageData(512, 512)
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      const i = (y * 512 + x) * 4
      let r = 0
      let g = 0
      let b = 0
      if (kind === 'turf') {
        const blade = n(x * 1.7, y * 0.35)
        const v = 0.75 + 0.35 * blade
        r = 46 * v
        g = 112 * v
        b = 52 * v
      } else if (kind === 'wood') {
        const plank = Math.floor(x / 32)
        const grain = n(plank * 50 + x * 0.05, y * 0.012) * 0.6 + n(x * 0.3, y * 0.02) * 0.4
        const v = 0.82 + 0.25 * grain + (plank % 3) * 0.03
        r = 196 * v
        g = 150 * v
        b = 98 * v
      } else if (kind === 'dirt') {
        const v = 0.8 + 0.35 * n(x * 0.25, y * 0.25)
        r = 150 * v
        g = 103 * v
        b = 68 * v
      } else if (kind === 'track') {
        const v = 0.85 + 0.25 * n(x * 2.2, y * 2.2)
        r = 170 * v
        g = 78 * v
        b = 56 * v
      } else {
        // Crowd: coloured speckle at a distance, deliberately abstract.
        const cell = n(Math.floor(x / 6) * 3.1, Math.floor(y / 8) * 7.3)
        const shade = 0.35 + 0.65 * n(x * 0.9, y * 0.9)
        const palette = [
          [70, 74, 86],
          [120, 124, 132],
          [160, 52, 46],
          [44, 82, 150],
          [210, 206, 196],
          [40, 40, 44],
        ]
        const c = palette[Math.floor(cell * palette.length) % palette.length]!
        r = c[0]! * shade
        g = c[1]! * shade
        b = c[2]! * shade
      }
      img.data[i] = r
      img.data[i + 1] = g
      img.data[i + 2] = b
      img.data[i + 3] = 255
    }
  }
  cv.ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(cv.c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeat, repeat)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  cache.set(key, tex)
  return tex
}
