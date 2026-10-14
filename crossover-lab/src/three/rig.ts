import * as THREE from 'three'
import type { Athlete, BodySegment, GearItem, Hotspot } from '../data/types'
import { IN_TO_M } from '../data/metrics'
import { resolveMetric } from '../data/resolve'
import { heightM, massKg } from '../sim/normalize'
import { heatColor, type HeatPalette } from './palette'
import type { Pose } from './motions'

/**
 * Procedural athlete model. A joint hierarchy sized from height, weight, wingspan and body fat
 * carries simple body segments in a neutral mannequin finish (deliberately not a likeness) and
 * garment layers built from the athlete's gear profile in generic team colors, never logos.
 *
 * Axes: the athlete faces +Z, Y is up, the athlete's left is +X. Units are metres.
 */
export type JointName =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'neck'
  | 'head'
  | 'shoulderL'
  | 'elbowL'
  | 'wristL'
  | 'shoulderR'
  | 'elbowR'
  | 'wristR'
  | 'hipL'
  | 'kneeL'
  | 'ankleL'
  | 'hipR'
  | 'kneeR'
  | 'ankleR'

export const JOINTS: JointName[] = ['hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR', 'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR']

export interface Dimensions {
  height: number
  hipY: number
  thigh: number
  shin: number
  ankle: number
  foot: number
  torso: number
  upperArm: number
  forearm: number
  hand: number
  shoulderHalf: number
  hipHalf: number
  girth: number
  belly: number
}

export function dimensionsFor(a: Athlete): Dimensions {
  const H = heightM(a)
  const mass = massKg(a)
  const bmi = mass / (H * H)
  const girth = Math.min(1.35, Math.max(0.85, Math.sqrt(bmi / 23)))
  const fat = resolveMetric(a, 'bodyFatPct')?.value ?? 12
  const span = (resolveMetric(a, 'wingspanIn')?.value ?? (resolveMetric(a, 'heightIn')?.value ?? 74) * 1.02) * IN_TO_M
  const shoulderHalf = H * (0.1 + 0.012 * (girth - 1))
  const armTotal = Math.max(0.3 * H, span / 2 - shoulderHalf)
  return {
    height: H,
    ankle: 0.045 * H,
    shin: 0.245 * H,
    thigh: 0.245 * H,
    hipY: 0.555 * H,
    foot: 0.15 * H,
    torso: 0.3 * H,
    upperArm: armTotal * 0.423,
    forearm: armTotal * 0.332,
    hand: armTotal * 0.245,
    shoulderHalf,
    hipHalf: 0.085 * H,
    girth,
    belly: 1 + Math.max(-0.1, Math.min(0.3, (fat - 12) / 40)),
  }
}

const MANNEQUIN = 0xb9b4ac
/** Head sphere radius and centre height above the head joint, as shares of height. */
const HEAD_R = 0.065
const HEAD_Y = 0.06

interface SegmentInfo {
  segment: BodySegment
  /** Axis endpoints and radius in the parent joint's space, for placing hotspots. */
  start: THREE.Vector3
  end: THREE.Vector3
  radius: number
  side: 1 | -1 | 0
}

export class Rig {
  readonly root = new THREE.Group()
  readonly joints = {} as Record<JointName, THREE.Group>
  readonly dims: Dimensions
  readonly athlete: Athlete
  /** Body meshes and garment meshes; garments carry `userData.gearId`. */
  readonly meshes: THREE.Mesh[] = []
  private readonly segments = new Map<BodySegment, SegmentInfo>()
  private readonly materials = new Map<THREE.Mesh, THREE.Material>()
  private heatOn = false
  private gearState = new Map<string, { worn: boolean; variant?: string }>()
  private ghost = false

  constructor(athlete: Athlete, options: { ghostColor?: number } = {}) {
    this.athlete = athlete
    this.dims = dimensionsFor(athlete)
    this.root.name = `rig:${athlete.id}`
    this.buildSkeleton()
    this.buildBody()
    for (const g of athlete.gear) this.gearState.set(g.id, { worn: g.worn, variant: g.defaultVariant })
    this.buildGear()
    if (options.ghostColor !== undefined) this.makeGhost(options.ghostColor)
  }

  private joint(name: JointName, parent: THREE.Object3D, x: number, y: number, z = 0): THREE.Group {
    const g = new THREE.Group()
    g.name = name
    g.position.set(x, y, z)
    parent.add(g)
    this.joints[name] = g
    return g
  }

  private buildSkeleton(): void {
    const d = this.dims
    const hips = this.joint('hips', this.root, 0, d.hipY)
    const spine = this.joint('spine', hips, 0, 0.02 * d.height)
    const chest = this.joint('chest', spine, 0, 0.14 * d.height)
    const neck = this.joint('neck', chest, 0, 0.13 * d.height)
    this.joint('head', neck, 0, 0.03 * d.height)
    for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
      const shoulder = this.joint(`shoulder${side}`, chest, sx * d.shoulderHalf, 0.115 * d.height)
      // Axial rotation first, then flexion, then abduction (see motions.ts).
      shoulder.rotation.order = 'ZXY'
      const elbow = this.joint(`elbow${side}`, shoulder, 0, -d.upperArm)
      this.joint(`wrist${side}`, elbow, 0, -d.forearm)
      const hip = this.joint(`hip${side}`, hips, sx * d.hipHalf, -0.02 * d.height)
      const knee = this.joint(`knee${side}`, hip, 0, -d.thigh)
      this.joint(`ankle${side}`, knee, 0, -d.shin)
    }
  }

  private addMesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, color: number, info: Omit<SegmentInfo, 'start' | 'end'> & { start?: THREE.Vector3; end?: THREE.Vector3 }, gearId?: string): THREE.Mesh {
    const material = new THREE.MeshStandardMaterial({ color, roughness: gearId ? 0.55 : 0.75, metalness: 0 })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = true
    mesh.receiveShadow = false
    mesh.userData.segment = info.segment
    if (gearId) mesh.userData.gearId = gearId
    parent.add(mesh)
    this.meshes.push(mesh)
    this.materials.set(mesh, material)
    if (!gearId && info.start && info.end) this.segments.set(info.segment, { segment: info.segment, start: info.start, end: info.end, radius: info.radius, side: info.side })
    return mesh
  }

  /** A capsule hanging from a joint along -Y. */
  private limb(parent: THREE.Object3D, length: number, radius: number, color: number, segment: BodySegment, side: 1 | -1 | 0, gearId?: string, from = 0, to = 1, inflate = 1): THREE.Mesh {
    const r = radius * inflate
    const len = Math.max(0.001, length * (to - from) - 2 * r * 0.3)
    const geo = new THREE.CapsuleGeometry(r, len, 5, 14, 3)
    const mesh = this.addMesh(parent, geo, color, { segment, radius, side, start: new THREE.Vector3(0, 0, 0), end: new THREE.Vector3(0, -length, 0) }, gearId)
    mesh.position.y = -length * (from + to) / 2
    return mesh
  }

  /** Tapered, oval-section block for the torso (rTop at the upper end). */
  private torsoPiece(parent: THREE.Object3D, rTop: number, rBottom: number, height: number, depth: number, y: number, color: number, segment: BodySegment, gearId?: string, inflate = 1): THREE.Mesh {
    const geo = new THREE.CylinderGeometry(rTop * inflate, rBottom * inflate, height * (gearId ? 1.02 : 1), 26, 6)
    const mesh = this.addMesh(parent, geo, color, { segment, radius: Math.max(rTop, rBottom), side: 0, start: new THREE.Vector3(0, y + height / 2, 0), end: new THREE.Vector3(0, y - height / 2, 0) }, gearId)
    mesh.scale.set(1, 1, depth)
    mesh.position.y = y
    return mesh
  }

  /** Pelvis, core and chest. Garments call this again, inflated, in their own color. */
  private torsoShapes(color: number, gearId?: string, inflate = 1, parts: ('pelvis' | 'abdomen' | 'chest')[] = ['pelvis', 'abdomen', 'chest']): void {
    const d = this.dims
    const s = d.height / 1.85
    const g = d.girth
    const j = this.joints
    if (parts.includes('pelvis')) this.torsoPiece(j.hips, 0.158 * s * g, 0.165 * s * g, 0.12 * d.height, 0.7, -0.012 * d.height, color, 'pelvis', gearId, inflate)
    if (parts.includes('abdomen')) this.torsoPiece(j.spine, 0.158 * s * g, 0.152 * s * g * d.belly, 0.15 * d.height, 0.7 * d.belly, 0.07 * d.height, color, 'abdomen', gearId, inflate)
    if (parts.includes('chest')) this.torsoPiece(j.chest, 0.205 * s * g, 0.16 * s * g, 0.16 * d.height, 0.6, 0.07 * d.height, color, 'chest', gearId, inflate)
  }

  private buildBody(): void {
    const d = this.dims
    const s = d.height / 1.85
    const g = d.girth
    const j = this.joints
    this.torsoShapes(MANNEQUIN)
    for (const side of ['L', 'R'] as const) {
      // Deltoid caps round off the shoulders.
      const cap = this.addMesh(j[`shoulder${side}`], new THREE.SphereGeometry(0.062 * s * g, 16, 12), MANNEQUIN, { segment: 'chest', radius: 0.06 * s, side: 0 })
      cap.position.y = -0.01 * s
    }
    this.limb(j.neck, -0.06 * d.height, 0.052 * s * g, MANNEQUIN, 'neck', 0)
    // Head: one sphere above the head joint.
    const head = this.addMesh(j.head, new THREE.SphereGeometry(HEAD_R * d.height, 24, 18), MANNEQUIN, { segment: 'head', radius: HEAD_R * d.height, side: 0, start: new THREE.Vector3(0, (HEAD_Y + HEAD_R) * d.height, 0), end: new THREE.Vector3(0, (HEAD_Y - HEAD_R) * d.height, 0) })
    head.position.set(0, HEAD_Y * d.height, 0.005 * d.height)
    head.scale.set(0.92, 1, 1)
    for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
      this.limb(j[`shoulder${side}`], d.upperArm, 0.05 * s * g, MANNEQUIN, `upperArm${side}`, sx)
      this.limb(j[`elbow${side}`], d.forearm, 0.041 * s * g, MANNEQUIN, `forearm${side}`, sx)
      const hand = this.addMesh(j[`wrist${side}`], new THREE.BoxGeometry(0.035 * s, d.hand * 0.82, 0.085 * s, 2, 4, 2), MANNEQUIN, { segment: `hand${side}`, radius: 0.04 * s, side: sx, start: new THREE.Vector3(0, 0, 0), end: new THREE.Vector3(0, -d.hand, 0) })
      hand.position.y = -d.hand * 0.42
      this.limb(j[`hip${side}`], d.thigh, 0.08 * s * g, MANNEQUIN, `thigh${side}`, sx)
      this.limb(j[`knee${side}`], d.shin, 0.054 * s * g, MANNEQUIN, `shin${side}`, sx)
      const foot = this.addMesh(j[`ankle${side}`], new THREE.BoxGeometry(0.095 * s, d.ankle * 1.1, d.foot, 2, 2, 5), MANNEQUIN, { segment: `foot${side}`, radius: 0.05 * s, side: sx, start: new THREE.Vector3(0, -d.ankle * 0.6, -0.25 * d.foot), end: new THREE.Vector3(0, -d.ankle * 0.6, 0.75 * d.foot) })
      foot.position.set(0, -d.ankle * 0.45, d.foot * 0.25)
    }
  }

  private gearColor(item: GearItem): number {
    const state = this.gearState.get(item.id)
    const variant = item.variants?.find((v) => v.id === state?.variant)
    return new THREE.Color(variant?.color ?? item.color).getHex()
  }

  private variantStyle(item: GearItem): string | undefined {
    const state = this.gearState.get(item.id)
    return item.variants?.find((v) => v.id === state?.variant)?.style
  }

  private buildGear(): void {
    const d = this.dims
    const s = d.height / 1.85
    const g = d.girth
    const j = this.joints
    const league = this.athlete.league
    for (const item of this.athlete.gear) {
      if (!this.gearState.get(item.id)?.worn) continue
      const color = this.gearColor(item)
      const accent = new THREE.Color(item.accent ?? item.color).getHex()
      switch (item.slot) {
        case 'jersey': {
          this.torsoShapes(color, item.id, 1.05, ['abdomen', 'chest'])
          for (const side of ['L', 'R'] as const) {
            const cap = this.addMesh(j[`shoulder${side}`], new THREE.SphereGeometry(0.068 * s * g, 16, 12), color, { segment: 'chest', radius: 0.06 * s, side: 0 }, item.id)
            cap.position.y = -0.01 * s
          }
          if (league !== 'NBA') {
            for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
              this.limb(j[`shoulder${side}`], d.upperArm, 0.05 * s * g, color, `upperArm${side}`, sx, item.id, -0.05, league === 'NFL' ? 0.32 : 0.45, 1.25)
              if (league === 'NFL') this.limb(j[`shoulder${side}`], d.upperArm, 0.05 * s * g, accent, `upperArm${side}`, sx, item.id, 0.18, 0.26, 1.3)
            }
          }
          this.addNumber(item, s, g)
          break
        }
        case 'undershirt':
          this.torsoShapes(color, item.id, 1.02, ['chest'])
          break
        case 'pants':
        case 'shorts': {
          this.torsoShapes(color, item.id, 1.05, ['pelvis'])
          const to = item.slot === 'shorts' ? 0.85 : 1.02
          for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
            this.limb(j[`hip${side}`], d.thigh, 0.08 * s * g, color, `thigh${side}`, sx, item.id, -0.05, to, item.slot === 'shorts' ? 1.22 : 1.07)
            if (item.slot === 'pants') {
              if (league === 'MLB') this.limb(j[`knee${side}`], d.shin, 0.054 * s * g, color, `shin${side}`, sx, item.id, 0, 0.32, 1.25)
              if (item.accent) {
                // Side stripe: a thin sliver of the thigh capsule pushed to the outside.
                const stripe = this.limb(j[`hip${side}`], d.thigh, 0.08 * s * g, accent, `thigh${side}`, sx, item.id, 0.05, 0.95, 1.075)
                stripe.scale.set(0.22, 1, 1)
                stripe.position.x = sx * 0.072 * s * g
              }
            }
          }
          break
        }
        case 'socks':
          for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
            const from = league === 'NBA' ? 0.72 : league === 'MLB' ? 0.3 : 0.12
            this.limb(j[`knee${side}`], d.shin, 0.054 * s * g, color, `shin${side}`, sx, item.id, from, 1.02, 1.08)
          }
          break
        case 'shoes': {
          const style = this.variantStyle(item)
          for (const side of ['L', 'R'] as const) {
            const shoe = this.addMesh(j[`ankle${side}`], new THREE.BoxGeometry(0.105 * s, d.ankle * 1.2, d.foot * 1.06, 2, 2, 5), color, { segment: `foot${side}`, radius: 0.05 * s, side: side === 'L' ? 1 : -1 }, item.id)
            shoe.position.set(0, -d.ankle * 0.35, d.foot * 0.25)
            const sole = this.addMesh(j[`ankle${side}`], new THREE.BoxGeometry(0.108 * s, d.ankle * 0.3, d.foot * 1.08), accent, { segment: `foot${side}`, radius: 0.05 * s, side: side === 'L' ? 1 : -1 }, item.id)
            sole.position.set(0, -d.ankle * 0.9, d.foot * 0.25)
            if (style === 'mid' || style === 'high') {
              const collar = this.limb(j[`knee${side}`], d.shin, 0.054 * s * g, color, `shin${side}`, side === 'L' ? 1 : -1, item.id, style === 'high' ? 0.8 : 0.88, 1.03, 1.18)
              collar.castShadow = true
            }
          }
          break
        }
        case 'gloves':
        case 'battingGloves':
          for (const side of ['L', 'R'] as const) {
            const glove = this.addMesh(j[`wrist${side}`], new THREE.BoxGeometry(0.041 * s, d.hand * 0.86, 0.092 * s), color, { segment: `hand${side}`, radius: 0.04 * s, side: side === 'L' ? 1 : -1 }, item.id)
            glove.position.y = -d.hand * 0.42
          }
          break
        case 'fieldingGlove': {
          const glove = this.addMesh(j.wristL, new THREE.SphereGeometry(0.1 * s, 16, 12), color, { segment: 'handL', radius: 0.05 * s, side: 1 }, item.id)
          glove.scale.set(0.55, 1.15, 1)
          glove.position.set(0, -d.hand * 0.5, 0.01)
          break
        }
        case 'helmet':
        case 'battingHelmet':
        case 'cap': {
          const r = HEAD_R * d.height
          const shell = item.slot === 'cap' ? 1.04 : 1.2
          const geo = new THREE.SphereGeometry(r * shell, 26, 18, 0, Math.PI * 2, 0, item.slot === 'cap' ? Math.PI * 0.42 : Math.PI * 0.62)
          const helmet = this.addMesh(j.head, geo, color, { segment: 'head', radius: r, side: 0 }, item.id)
          helmet.position.set(0, HEAD_Y * d.height + (item.slot === 'cap' ? 0.01 : 0.004) * d.height, 0)
          helmet.rotation.x = item.slot === 'helmet' ? -0.18 : -0.08
          if (item.slot === 'helmet' && item.accent) {
            // Center stripe: an arc over the crown, front to back, riding on the shell.
            const arcLen = Math.PI * 0.75
            const stripe = this.addMesh(helmet, new THREE.TorusGeometry(r * shell, r * 0.07, 6, 24, arcLen), accent, { segment: 'head', radius: r, side: 0 }, item.id)
            stripe.rotation.set(0, Math.PI / 2, Math.PI / 2 - arcLen / 2)
          }
          if (item.slot === 'battingHelmet') {
            const brim = this.addMesh(j.head, new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.01, 20, 1, false, -Math.PI / 2.4, Math.PI / 1.2), color, { segment: 'head', radius: r, side: 0 }, item.id)
            brim.position.set(0, HEAD_Y * d.height + r * 0.25, r * 0.55)
            const flapSide = this.athlete.bats === 'L' ? -1 : 1
            const flap = this.addMesh(j.head, new THREE.BoxGeometry(0.02, r * 1.1, r * 1.0), color, { segment: 'head', radius: r, side: 0 }, item.id)
            flap.position.set(flapSide * r * 0.95, HEAD_Y * d.height - r * 0.25, r * 0.3)
          }
          break
        }
        case 'facemask': {
          const r = HEAD_R * d.height
          const style = this.variantStyle(item) ?? 'open'
          const bars = style === 'closed' ? 4 : style === 'standard' ? 3 : 2
          for (let i = 0; i < bars; i++) {
            const bar = this.addMesh(j.head, new THREE.TorusGeometry(r * 1.02, 0.006 * s, 6, 24, Math.PI * 0.95), color, { segment: 'head', radius: r, side: 0 }, item.id)
            bar.rotation.set(Math.PI / 2, 0, Math.PI * 0.025)
            bar.position.set(0, HEAD_Y * d.height - r * (0.15 + i * 0.22), r * 0.3)
          }
          const post = this.addMesh(j.head, new THREE.CylinderGeometry(0.006 * s, 0.006 * s, r * 0.75, 6), color, { segment: 'head', radius: r, side: 0 }, item.id)
          post.position.set(0, HEAD_Y * d.height - r * 0.42, r * 1.3)
          break
        }
        case 'visor': {
          const r = HEAD_R * d.height
          const visor = this.addMesh(j.head, new THREE.CylinderGeometry(r * 1.1, r * 1.1, r * 0.4, 20, 1, true, -Math.PI / 3.2, Math.PI / 1.6), color, { segment: 'head', radius: r, side: 0 }, item.id)
          visor.position.set(0, HEAD_Y * d.height + r * 0.05, 0)
          ;(visor.material as THREE.MeshStandardMaterial).transparent = true
          ;(visor.material as THREE.MeshStandardMaterial).opacity = 0.75
          ;(visor.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide
          break
        }
        case 'headband': {
          const r = HEAD_R * d.height
          const band = this.addMesh(j.head, new THREE.TorusGeometry(r * 0.95, 0.012 * s, 6, 28), color, { segment: 'head', radius: r, side: 0 }, item.id)
          band.rotation.x = Math.PI / 2
          band.position.y = HEAD_Y * d.height + r * 0.35
          break
        }
        case 'compressionSleeveL':
        case 'compressionSleeveR':
        case 'shootingSleeveR': {
          const side = item.slot === 'compressionSleeveL' ? 'L' : 'R'
          const sx = side === 'L' ? 1 : -1
          this.limb(j[`shoulder${side}`], d.upperArm, 0.05 * s * g, color, `upperArm${side}`, sx, item.id, 0.25, 1.02, 1.08)
          this.limb(j[`elbow${side}`], d.forearm, 0.041 * s * g, color, `forearm${side}`, sx, item.id, -0.02, 0.98, 1.1)
          break
        }
        case 'wristbands':
          for (const side of ['L', 'R'] as const) {
            const band = this.addMesh(j[`wrist${side}`], new THREE.TorusGeometry(0.045 * s * g, 0.016 * s, 6, 16), color, { segment: `forearm${side}`, radius: 0.04 * s, side: side === 'L' ? 1 : -1 }, item.id)
            band.rotation.x = Math.PI / 2
            band.position.y = 0.02 * s
          }
          break
        case 'elbowGuard': {
          const side = this.athlete.bats === 'L' ? 'R' : 'L'
          const guard = this.addMesh(j[`elbow${side}`], new THREE.CapsuleGeometry(0.055 * s * g, 0.08 * s, 4, 10), color, { segment: `upperArm${side}`, radius: 0.05 * s, side: side === 'L' ? 1 : -1 }, item.id)
          guard.position.set(0, 0.0, -0.01)
          break
        }
        case 'legGuard': {
          const side = this.athlete.bats === 'L' ? 'R' : 'L'
          const guard = this.addMesh(j[`knee${side}`], new THREE.BoxGeometry(0.075 * s, d.shin * 0.38, 0.03 * s), color, { segment: `shin${side}`, radius: 0.05 * s, side: side === 'L' ? 1 : -1 }, item.id)
          guard.position.set(0, -d.shin * 0.75, 0.055 * s * g)
          break
        }
        case 'kneeSleeves':
          for (const [side, sx] of [['L', 1], ['R', -1]] as const) {
            this.limb(j[`knee${side}`], d.shin, 0.054 * s * g, color, `shin${side}`, sx, item.id, -0.12, 0.2, 1.3)
          }
          break
      }
    }
  }

  private addNumber(item: GearItem, s: number, g: number): void {
    if (typeof document === 'undefined') return
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, 128, 128)
    ctx.fillStyle = new THREE.Color(this.athlete.kit.trim).getStyle()
    ctx.font = 'bold 86px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(this.athlete.kit.number, 64, 70)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const material = new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.6, depthWrite: false })
    for (const dir of [1, -1]) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.17 * s, 0.17 * s), material)
      plane.position.set(0, 0.075 * this.dims.height, dir * 0.19 * s * g * 0.6 * 1.08)
      if (dir < 0) plane.rotation.y = Math.PI
      plane.userData.gearId = item.id
      plane.userData.segment = 'chest'
      plane.userData.decal = true
      this.joints.chest.add(plane)
      this.meshes.push(plane)
      this.materials.set(plane, material)
    }
  }

  isWorn(gearId: string): boolean {
    return this.gearState.get(gearId)?.worn ?? false
  }

  variantOf(gearId: string): string | undefined {
    return this.gearState.get(gearId)?.variant
  }

  /** Swap or remove gear: rebuilds only the garment layer. */
  setGear(gearId: string, change: { worn?: boolean; variant?: string }): void {
    const state = this.gearState.get(gearId)
    if (!state) return
    if (change.worn !== undefined) state.worn = change.worn
    if (change.variant !== undefined) state.variant = change.variant
    this.rebuildGear()
  }

  gearSnapshot(): Record<string, { worn: boolean; variant?: string }> {
    return Object.fromEntries([...this.gearState.entries()].map(([k, v]) => [k, { ...v }]))
  }

  private rebuildGear(): void {
    for (const mesh of [...this.meshes]) {
      if (!mesh.userData.gearId) continue
      mesh.parent?.remove(mesh)
      mesh.geometry.dispose()
      const mat = this.materials.get(mesh)
      if (mat && !mesh.userData.decal) mat.dispose()
      this.materials.delete(mesh)
      this.meshes.splice(this.meshes.indexOf(mesh), 1)
    }
    this.buildGear()
    if (this.ghost) this.applyGhost()
    if (this.heatOn && this.lastHeat) this.setHeatmap(this.lastHeat.hotspots, this.lastHeat.palette, this.lastHeat.only)
  }

  private ghostMaterial?: THREE.MeshStandardMaterial

  private makeGhost(color: number): void {
    this.ghost = true
    this.ghostMaterial = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.32, depthWrite: false, roughness: 0.4 })
    this.applyGhost()
  }

  private applyGhost(): void {
    for (const mesh of this.meshes) {
      mesh.material = this.ghostMaterial!
      mesh.castShadow = false
      if (mesh.userData.decal) mesh.visible = false
    }
  }

  private lastHeat?: { hotspots: Hotspot[]; palette: HeatPalette; only?: Set<string> }

  /**
   * Paint wear and stress hotspots onto the body and garments as vertex colors. `only` limits
   * painting to the garments of the selected gear items (and the body under them).
   */
  setHeatmap(hotspots: Hotspot[] | null, palette: HeatPalette = 'viridis', only?: Set<string>): void {
    if (!hotspots) {
      this.heatOn = false
      this.lastHeat = undefined
      for (const mesh of this.meshes) {
        const original = this.materials.get(mesh)
        if (original && !this.ghost) mesh.material = original
        if (mesh.userData.decal) mesh.visible = true
      }
      return
    }
    this.heatOn = true
    this.lastHeat = { hotspots, palette, ...(only ? { only } : {}) }
    const p = new THREE.Vector3()
    const target = new THREE.Vector3()
    const color = new THREE.Color()
    for (const mesh of this.meshes) {
      if (mesh.userData.decal) {
        mesh.visible = false
        continue
      }
      const segment = mesh.userData.segment as BodySegment
      const info = this.segments.get(segment)
      const spots = hotspots.filter((h) => h.segment === segment)
      const geo = mesh.geometry
      const pos = geo.getAttribute('position')
      const colors = new Float32Array(pos.count * 3)
      mesh.updateMatrix()
      const dimmed = only && mesh.userData.gearId && !only.has(mesh.userData.gearId as string)
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrix)
        let intensity = 0
        if (info && !dimmed) {
          for (const h of spots) {
            hotspotPoint(info, h, target)
            const sigma = h.face === 'around' ? info.radius * 2.2 : info.radius * 1.15
            const dist2 = p.distanceToSquared(target)
            intensity = Math.max(intensity, h.intensity * Math.exp(-dist2 / (2 * sigma * sigma)))
          }
        }
        heatColor(palette, intensity, color)
        if (dimmed) color.multiplyScalar(0.45)
        colors[i * 3] = color.r
        colors[i * 3 + 1] = color.g
        colors[i * 3 + 2] = color.b
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      mesh.material = HEAT_MATERIAL
    }
  }

  /** Pose the skeleton and place the model. `base` is where the athlete stands and faces. */
  applyPose(pose: Pose, base: { x: number; y?: number; z: number; yaw: number }): void {
    for (const name of JOINTS) {
      const r = pose.joints[name]
      const j = this.joints[name]
      if (r) j.rotation.set(r[0], r[1], r[2])
      else j.rotation.set(0, 0, 0)
    }
    const cos = Math.cos(base.yaw)
    const sin = Math.sin(base.yaw)
    this.root.position.set(base.x + pose.root.x * cos + pose.root.z * sin, (base.y ?? 0) + pose.root.y, base.z - pose.root.x * sin + pose.root.z * cos)
    this.root.rotation.set(pose.root.pitch, base.yaw + pose.root.yaw, pose.root.roll, 'YXZ')
  }

  /** World position of a joint (for labels, cameras and props). */
  jointWorld(name: JointName, out = new THREE.Vector3()): THREE.Vector3 {
    return this.joints[name].getWorldPosition(out)
  }

  dispose(): void {
    this.root.parent?.remove(this.root)
    for (const mesh of this.meshes) {
      mesh.geometry.dispose()
      const mat = this.materials.get(mesh)
      mat?.dispose()
      if (mat && 'map' in mat && mat.map) (mat.map as THREE.Texture).dispose()
    }
    this.ghostMaterial?.dispose()
  }
}

const HEAT_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })

/** Where a hotspot sits in the joint's space. */
export function hotspotPoint(info: SegmentInfo, h: Hotspot, out: THREE.Vector3): THREE.Vector3 {
  out.copy(info.start).lerp(info.end, h.along)
  const r = info.radius
  const isHand = info.segment === 'handL' || info.segment === 'handR'
  const isFoot = info.segment === 'footL' || info.segment === 'footR'
  const inward = -info.side || 0
  switch (h.face) {
    case 'front':
      if (isHand) out.x += inward * r
      else out.z += r
      break
    case 'back':
      if (isHand) out.x -= inward * r
      else out.z -= r
      break
    case 'outer':
      out.x += (info.side || 1) * r
      break
    case 'inner':
      out.x += inward * r
      break
    case 'top':
      out.y += isFoot ? r * 0.6 : r * 0.6
      break
    case 'bottom':
      out.y -= isFoot ? r * 0.7 : r
      break
    case 'around':
      break
  }
  return out
}
