import * as THREE from 'three'
import { buildVenue, dirt, hardwood, turf } from './venue'

export type EnvKind = 'studio' | 'track' | 'field' | 'diamond' | 'court' | 'gym' | 'stadium' | 'ballpark' | 'arena'

export interface EnvOptions {
  lanes?: number
  /** Race length in metres, for lane markings. */
  length?: number
  unit?: 'yd' | 'm'
  /** Surround fields, diamonds and courts with a venue (default true). */
  venue?: boolean
  night?: boolean
}

/** Which lighting suits an environment: the viewer picks it unless a page overrides it. */
export function lightingFor(kind: EnvKind, opts: EnvOptions = {}): 'studio' | 'day' | 'night' | 'arena' {
  if (kind === 'court' || kind === 'arena' || kind === 'gym') return opts.venue === false && kind !== 'arena' ? 'studio' : 'arena'
  if (kind === 'studio') return 'studio'
  return opts.night ? 'night' : 'day'
}

function textured(w: number, d: number, tex: THREE.Texture | null, fallback: number, y = 0, repeat?: [number, number]): THREE.Mesh {
  const map = tex ? tex.clone() : null
  if (map && repeat) map.repeat.set(repeat[0], repeat[1])
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: map ? 0xffffff : fallback, map, roughness: 0.92 }))
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = y
  mesh.receiveShadow = true
  return mesh
}

const LANE_WIDTH = 1.4

export function laneX(index: number, lanes: number): number {
  return (index - (lanes - 1) / 2) * LANE_WIDTH
}

function flat(w: number, d: number, color: number, y = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color, roughness: 0.95 }))
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = y
  mesh.receiveShadow = true
  return mesh
}

function line(x0: number, z0: number, x1: number, z1: number, width: number, color = 0xf4f4f4, y = 0.004): THREE.Mesh {
  const len = Math.hypot(x1 - x0, z1 - z0)
  const mesh = flat(width, len, color, y)
  mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2)
  mesh.rotation.z = -Math.atan2(x1 - x0, z1 - z0)
  return mesh
}

export function textPlane(text: string, size = 0.6, color = '#f4f4f4'): THREE.Mesh {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null
  const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })
  if (canvas) {
    canvas.width = 256
    canvas.height = 128
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = color
      ctx.font = 'bold 72px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, 128, 66)
      const tex = new THREE.CanvasTexture(canvas)
      tex.colorSpace = THREE.SRGBColorSpace
      mat.map = tex
    }
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size * 2, size), mat)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = 0.006
  return mesh
}

function arc(radius: number, from: number, to: number, cx: number, cz: number, width: number, color = 0xf4f4f4, y = 0.005): THREE.Mesh {
  const geo = new THREE.RingGeometry(radius - width / 2, radius + width / 2, 48, 1, from, to - from)
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.9 }))
  mesh.rotation.x = -Math.PI / 2
  mesh.position.set(cx, y, cz)
  mesh.receiveShadow = true
  return mesh
}

export function buildEnvironment(kind: EnvKind, opts: EnvOptions = {}): THREE.Group {
  const g = new THREE.Group()
  g.name = `env:${kind}`
  switch (kind) {
    case 'studio': {
      // Large enough that a side-by-side partner (40 m away) stands on the same floor.
      g.add(flat(240, 240, 0x4a5058, -0.002))
      for (const x of [0, 40]) {
        const disc = new THREE.Mesh(new THREE.CircleGeometry(3, 64), new THREE.MeshStandardMaterial({ color: 0x5d646d, roughness: 0.9 }))
        disc.rotation.x = -Math.PI / 2
        disc.position.x = x
        disc.receiveShadow = true
        g.add(disc)
        g.add(arc(3, 0, Math.PI * 2, x, 0, 0.03, 0x8a929c))
      }
      break
    }
    case 'track':
    case 'field': {
      const lanes = opts.lanes ?? 2
      const length = opts.length ?? 40
      const width = Math.max(14, lanes * LANE_WIDTH + 8)
      g.add(flat(width + 40, length + 80, kind === 'track' ? 0x3d6b3f : 0x2f6b39, -0.003))
      const surface = flat(lanes * LANE_WIDTH + 0.6, length + 30, kind === 'track' ? 0xa94f38 : 0x3a7d44, 0)
      surface.position.z = length / 2 + 5
      g.add(surface)
      for (let i = 0; i <= lanes; i++) {
        const x = (i - lanes / 2) * LANE_WIDTH
        g.add(line(x, -10, x, length + 20, 0.05))
      }
      g.add(line(-(lanes / 2) * LANE_WIDTH, 0, (lanes / 2) * LANE_WIDTH, 0, 0.08))
      const finish = line(-(lanes / 2) * LANE_WIDTH, length, (lanes / 2) * LANE_WIDTH, length, 0.12, 0xf4f4f4)
      g.add(finish)
      const unit = opts.unit ?? 'm'
      const step = unit === 'yd' ? 0.9144 : 1
      const every = length / step > 60 ? 20 : length / step > 25 ? 10 : 5
      for (let mark = every; mark * step < length + 0.01; mark += every) {
        const z = mark * step
        if (kind === 'field') g.add(line(-(lanes / 2) * LANE_WIDTH - 2, z, (lanes / 2) * LANE_WIDTH + 2, z, 0.06, 0xe9eee9))
        const label = textPlane(`${mark}`, 0.45)
        label.position.set((lanes / 2) * LANE_WIDTH + 1.1, 0.006, z)
        label.rotation.z = Math.PI / 2
        g.add(label)
      }
      if (kind === 'field' && opts.venue !== false) g.add(buildVenue('stadium', { night: opts.night ?? false, center: new THREE.Vector3(0, 0, length / 2) }))
      break
    }
    case 'diamond': {
      g.add(flat(140, 140, 0x2f6b39, -0.003))
      const dirt = new THREE.Mesh(new THREE.CircleGeometry(4, 48), new THREE.MeshStandardMaterial({ color: 0x9a6b45, roughness: 1 }))
      dirt.rotation.x = -Math.PI / 2
      dirt.position.y = 0.001
      dirt.receiveShadow = true
      g.add(dirt)
      const mound = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.9, 0.25, 40), new THREE.MeshStandardMaterial({ color: 0x9a6b45, roughness: 1 }))
      mound.position.set(0, 0.12, 18.44)
      mound.receiveShadow = true
      g.add(mound)
      const rubber = new THREE.Mesh(new THREE.BoxGeometry(0.61, 0.02, 0.15), new THREE.MeshStandardMaterial({ color: 0xf4f4f4 }))
      rubber.position.set(0, 0.255, 18.44)
      g.add(rubber)
      const plateShape = new THREE.Shape()
      plateShape.moveTo(-0.216, 0)
      plateShape.lineTo(0.216, 0)
      plateShape.lineTo(0.216, 0.216)
      plateShape.lineTo(0, 0.432)
      plateShape.lineTo(-0.216, 0.216)
      plateShape.closePath()
      const plate = new THREE.Mesh(new THREE.ShapeGeometry(plateShape), new THREE.MeshStandardMaterial({ color: 0xf4f4f4 }))
      plate.rotation.x = -Math.PI / 2
      plate.rotation.z = Math.PI
      plate.position.set(0, 0.006, 0.43)
      g.add(plate)
      for (const x of [-0.95, 0.95]) {
        g.add(line(x - 0.6, -0.9, x - 0.6, 0.9, 0.05))
        g.add(line(x + 0.6, -0.9, x + 0.6, 0.9, 0.05))
        g.add(line(x - 0.6, -0.9, x + 0.6, -0.9, 0.05))
        g.add(line(x - 0.6, 0.9, x + 0.6, 0.9, 0.05))
      }
      g.add(line(0, 0, 70, 70, 0.08))
      g.add(line(0, 0, -70, 70, 0.08))
      if (opts.venue !== false) g.add(buildVenue('ballpark', { night: opts.night ?? false }))
      break
    }
    case 'court': {
      g.add(flat(40, 30, 0x30343a, -0.003))
      const floor = flat(15.2, 14.3, 0xc49a63, 0)
      floor.position.z = 14.3 / 2 - 1.2
      g.add(floor)
      // Paint and lines, hoop at the origin, court extending toward +Z.
      const paint = flat(4.9, 5.8, 0x8f5a3a, 0.002)
      paint.position.set(0, 0.002, 5.8 / 2 - 1.2)
      g.add(paint)
      // Ring angles run in the XY plane, which maps to -Z after the floor rotation, so arcs
      // toward the court use the range pi..2pi.
      g.add(arc(1.8, Math.PI, Math.PI * 2, 0, 4.6, 0.05))
      const corner = Math.acos(6.6 / 6.75)
      g.add(arc(6.75, Math.PI + corner, Math.PI * 2 - corner, 0, 0, 0.05))
      g.add(line(-6.6, -1.2, -6.6, 6.75 * Math.sin(corner), 0.05))
      g.add(line(6.6, -1.2, 6.6, 6.75 * Math.sin(corner), 0.05))
      g.add(line(-7.6, -1.2, 7.6, -1.2, 0.05))
      g.add(line(-2.45, 4.6, 2.45, 4.6, 0.05))
      const steel = new THREE.MeshStandardMaterial({ color: 0x8b9096, metalness: 0.5, roughness: 0.4 })
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.4, 12), steel)
      pole.position.set(0, 1.7, -1.6)
      pole.castShadow = true
      g.add(pole)
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.83, 1.07, 0.04), new THREE.MeshStandardMaterial({ color: 0xf4f6f8, transparent: true, opacity: 0.85 }))
      board.position.set(0, 3.35, -0.38)
      g.add(board)
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2286, 0.01, 8, 32), new THREE.MeshStandardMaterial({ color: 0xd2511e }))
      rim.rotation.x = Math.PI / 2
      rim.position.set(0, 3.05, 0)
      g.add(rim)
      if (opts.venue !== false) g.add(buildVenue('arena', { night: true, center: new THREE.Vector3(0, 0, 13) }))
      break
    }
    case 'stadium': {
      // A full football field centred on the athlete: long axis along Z, yard lines every 5.
      const YD = 0.9144
      g.add(textured(160, 200, turf(), 0x2f6b39, -0.004, [40, 50]))
      g.add(textured(53.33 * YD, 100 * YD, turf(), 0x3a7d44, 0, [12, 24]))
      for (const end of [1, -1]) {
        const ez = flat(53.33 * YD, 10 * YD, 0x24452f, 0.001)
        ez.position.z = end * 55 * YD
        g.add(ez)
      }
      for (let yd = -50; yd <= 50; yd += 5) g.add(line(-26.67 * YD, yd * YD, 26.67 * YD, yd * YD, yd % 10 === 0 ? 0.12 : 0.08, 0xeef2ee))
      for (const x of [-26.67, 26.67]) g.add(line(x * YD, -60 * YD, x * YD, 60 * YD, 0.15, 0xeef2ee))
      for (let yd = -49; yd <= 49; yd++) {
        for (const x of [-3.08, 3.08]) g.add(line(x * YD - 0.3, yd * YD, x * YD + 0.3, yd * YD, 0.05, 0xeef2ee))
      }
      for (let yd = 10; yd <= 50; yd += 10) {
        for (const side of [1, -1]) {
          if (yd === 50 && side < 0) continue
          const label = textPlane(`${yd}`, 1.4, '#eef2ee')
          label.position.set(-20 * YD, 0.006, side * (50 - yd) * YD)
          label.rotation.z = Math.PI / 2
          g.add(label)
        }
      }
      if (opts.venue !== false) g.add(buildVenue('stadium', { night: opts.night ?? false }))
      break
    }
    case 'ballpark': {
      // Home plate at the origin, the field opening toward +Z.
      g.add(textured(260, 260, turf(), 0x2f6b39, -0.004, [60, 60]))
      const infield = new THREE.Mesh(new THREE.CircleGeometry(29, 64, Math.PI / 4, Math.PI / 2), new THREE.MeshStandardMaterial({ color: dirt() ? 0xffffff : 0x9a6b45, map: dirt(), roughness: 1 }))
      infield.rotation.x = -Math.PI / 2
      infield.rotation.z = 0
      infield.position.y = 0.001
      infield.receiveShadow = true
      g.add(infield)
      const grass = new THREE.Mesh(new THREE.PlaneGeometry(19.4, 19.4), new THREE.MeshStandardMaterial({ color: turf() ? 0xffffff : 0x3a7d44, map: turf()?.clone() ?? null, roughness: 0.92 }))
      grass.rotation.x = -Math.PI / 2
      grass.rotation.z = Math.PI / 4
      grass.position.set(0, 0.002, 19.4 * Math.SQRT1_2)
      grass.receiveShadow = true
      g.add(grass)
      const circle = new THREE.Mesh(new THREE.CircleGeometry(4, 40), new THREE.MeshStandardMaterial({ color: 0x9a6b45, map: dirt(), roughness: 1 }))
      circle.rotation.x = -Math.PI / 2
      circle.position.y = 0.003
      g.add(circle)
      const mound = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.9, 0.25, 40), new THREE.MeshStandardMaterial({ color: 0x9a6b45, map: dirt(), roughness: 1 }))
      mound.position.set(0, 0.12, 18.44)
      mound.receiveShadow = true
      g.add(mound)
      for (const [x, z] of [[19.4, 19.4], [0, 38.8], [-19.4, 19.4]] as const) {
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.38), new THREE.MeshStandardMaterial({ color: 0xf4f4f4 }))
        base.position.set(x * Math.SQRT1_2 * Math.SQRT2 / 1.414, 0.04, z)
        base.rotation.y = Math.PI / 4
        g.add(base)
      }
      g.add(line(0, 0, 76, 76, 0.08))
      g.add(line(0, 0, -76, 76, 0.08))
      if (opts.venue !== false) g.add(buildVenue('ballpark', { night: opts.night ?? false }))
      break
    }
    case 'arena': {
      // A full court centred on the athlete, long axis along Z.
      g.add(flat(60, 50, 0x23262c, -0.004))
      g.add(textured(15.24, 28.65, hardwood(), 0xc49a63, 0, [3, 6]))
      g.add(line(-7.62, 0, 7.62, 0, 0.05))
      g.add(arc(1.8, 0, Math.PI * 2, 0, 0, 0.05))
      for (const end of [1, -1]) {
        const paint = flat(4.9, 5.8, 0x8f5a3a, 0.002)
        paint.position.set(0, 0.002, end * (14.325 - 2.9))
        g.add(paint)
        g.add(line(-7.62, end * 14.325, 7.62, end * 14.325, 0.05))
      }
      for (const z of [-14.325, 14.325]) g.add(line(z > 0 ? 7.62 : -7.62, -14.325, z > 0 ? 7.62 : -7.62, 14.325, 0.05))
      if (opts.venue !== false) g.add(buildVenue('arena', { night: true }))
      break
    }
    case 'gym': {
      g.add(flat(40, 40, 0x2b2f34, -0.003))
      const platform = new THREE.Mesh(new THREE.BoxGeometry(3, 0.04, 3), new THREE.MeshStandardMaterial({ color: 0x6b4f35, roughness: 0.8 }))
      platform.position.y = 0.02
      platform.receiveShadow = true
      g.add(platform)
      break
    }
  }
  return g
}

/** A flat bench for the bench press, head end toward -Z. */
export function makeBench(): THREE.Group {
  const g = new THREE.Group()
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 1.2), new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.7 }))
  pad.position.y = 0.43
  pad.castShadow = true
  pad.receiveShadow = true
  g.add(pad)
  const leg = new THREE.MeshStandardMaterial({ color: 0x777c82, metalness: 0.5 })
  for (const z of [-0.5, 0.5]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06), leg)
    post.position.set(0, 0.2, z)
    g.add(post)
  }
  return g
}
