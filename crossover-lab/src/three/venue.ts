import * as THREE from 'three'
import { surfaceTexture } from './figure/textures'

/**
 * Venue shells around the playing surfaces: a football stadium bowl, a ballpark with an outfield
 * wall and grandstand, and a basketball arena. Generic architecture only: no club marks, no
 * sponsor boards, and the crowd is an abstract coloured speckle seen from a distance.
 */
export type VenueKind = 'stadium' | 'ballpark' | 'arena'

const mats: THREE.Material[] = []
function mat<T extends THREE.Material>(m: T): T {
  mats.push(m)
  return m
}

/** A seating bowl: a lathe profile of rising tiers, with a crowd texture on the seats. */
function bowl(inner: number, outer: number, height: number, sweep = Math.PI * 2, start = 0, ellipse = 1): THREE.Mesh {
  const steps = 10
  const pts: THREE.Vector2[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    // Each tier: a riser then a tread, so the bowl reads as rows of seats.
    const r = inner + (outer - inner) * t
    const y = height * t
    pts.push(new THREE.Vector2(r, y))
    if (i < steps) pts.push(new THREE.Vector2(r + (outer - inner) / steps * 0.15, y + (height / steps) * 0.85))
  }
  const geo = new THREE.LatheGeometry(pts, 96, start, sweep)
  geo.scale(1, 1, ellipse)
  // Each bowl gets its own repeat, so clone the shared crowd texture (the image is shared).
  const base = surfaceTexture('crowd', 1)
  const tex = base ? base.clone() : null
  if (tex) tex.repeat.set(sweep * 7, 3)
  const m = new THREE.Mesh(geo, mat(new THREE.MeshStandardMaterial({ color: tex ? 0xffffff : 0x55606c, map: tex ?? null, roughness: 0.95, side: THREE.DoubleSide })))
  m.receiveShadow = true
  return m
}

/** A light tower: a pole with a bank of lamps that glow at night. */
function lightTower(x: number, z: number, height: number, night: boolean): THREE.Group {
  const g = new THREE.Group()
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, height, 10), mat(new THREE.MeshStandardMaterial({ color: 0x8a9099, metalness: 0.6, roughness: 0.45 })))
  pole.position.y = height / 2
  g.add(pole)
  const bank = new THREE.Mesh(
    new THREE.BoxGeometry(9, 5, 0.8),
    mat(new THREE.MeshStandardMaterial({ color: 0xdfe6ee, emissive: new THREE.Color(night ? 0xfff6e0 : 0x000000), emissiveIntensity: night ? 2.2 : 0, roughness: 0.3 })),
  )
  bank.position.y = height + 2
  g.add(bank)
  g.position.set(x, 0, z)
  g.lookAt(0, height, 0)
  return g
}

function ring(radius: number, y: number, tube: number, color: number, ellipse = 1): THREE.Mesh {
  const geo = new THREE.TorusGeometry(radius, tube, 6, 96)
  geo.rotateX(Math.PI / 2)
  geo.scale(1, 1, ellipse)
  const m = new THREE.Mesh(geo, mat(new THREE.MeshStandardMaterial({ color, roughness: 0.7 })))
  m.position.y = y
  return m
}

export interface VenueOptions {
  night?: boolean
  /** Where the venue is centred (the middle of the field or court). */
  center?: THREE.Vector3
}

export function buildVenue(kind: VenueKind, opts: VenueOptions = {}): THREE.Group {
  const g = new THREE.Group()
  g.name = `venue:${kind}`
  const night = opts.night ?? false
  if (kind === 'stadium') {
    // An oval bowl around a 110 m x 49 m field, with an upper deck and four light towers.
    g.add(bowl(52, 78, 22, Math.PI * 2, 0, 0.62))
    const upper = bowl(80, 98, 18, Math.PI * 2, 0, 0.62)
    upper.position.y = 24
    g.add(upper)
    g.add(ring(98, 42.5, 1.2, 0x3a4048, 0.62))
    for (const [x, z] of [[70, 50], [-70, 50], [70, -50], [-70, -50]] as const) g.add(lightTower(x, z, 55, night))
  } else if (kind === 'ballpark') {
    // Grandstand wrapping home plate from first base to third, an outfield wall, bleachers.
    const stand = bowl(36, 64, 24, Math.PI * 1.15, Math.PI * 0.92)
    g.add(stand)
    const wallGeo = new THREE.CylinderGeometry(112, 112, 3.2, 96, 1, true, -Math.PI / 4, Math.PI / 2)
    const wall = new THREE.Mesh(wallGeo, mat(new THREE.MeshStandardMaterial({ color: 0x1f4d36, roughness: 0.9, side: THREE.DoubleSide })))
    wall.position.y = 1.6
    g.add(wall)
    const bleachers = bowl(116, 134, 12, Math.PI / 2, -Math.PI / 4)
    g.add(bleachers)
    for (const [x, z] of [[60, -20], [-60, -20], [95, 70], [-95, 70]] as const) g.add(lightTower(x, z, 48, night))
  } else {
    // Arena: a tight steep bowl, a ceiling ring and a generic centre-hung scoreboard.
    g.add(bowl(17, 34, 15, Math.PI * 2, 0, 0.72))
    const upper = bowl(36, 46, 10, Math.PI * 2, 0, 0.72)
    upper.position.y = 16
    g.add(upper)
    g.add(ring(46, 27, 0.8, 0x2a2f36, 0.72))
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(6, 4, 6),
      mat(new THREE.MeshStandardMaterial({ color: 0x15181d, emissive: new THREE.Color(0x2b3c55), emissiveIntensity: 0.9, roughness: 0.4 })),
    )
    board.position.y = 18
    g.add(board)
  }
  if (opts.center) g.position.copy(opts.center)
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.matrixAutoUpdate = true
  })
  return g
}

/** Grass and hardwood colour textures for the playing surfaces (null in tests). */
export function turf(repeat = 24): THREE.Texture | null {
  return surfaceTexture('turf', repeat)
}

export function hardwood(repeat = 3): THREE.Texture | null {
  return surfaceTexture('wood', repeat)
}

export function dirt(repeat = 6): THREE.Texture | null {
  return surfaceTexture('dirt', repeat)
}
