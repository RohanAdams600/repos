import * as THREE from 'three'
import type { Athlete, BodySegment, GearItem, Hotspot } from '../data/types'
import { IN_TO_M } from '../data/metrics'
import { positionGroupFor } from '../data/positions'
import { resolveMetric } from '../data/resolve'
import { heightM, massKg } from '../sim/normalize'
import { heatColor, type HeatPalette } from './palette'
import type { Pose } from './motions'
import { BONES, buildBody, morphFor, type BodyGeometry } from './figure/body'
import { brows, ears, facialHair, hairCap, lips, rimRoots, scalpRoots, sculptHead, type HeadShape } from './figure/head'
import { collarGeometry, footGeometry, handGeometry, mittGeometry, nailGeometry, shoeGeometry, type ShoeKind } from './figure/extremities'
import { StrandHair, STRAND_STYLES, type Collider } from './figure/hair'
import { ClothDriver, clothMaterial, setSwayWeights } from './figure/cloth'
import { smoothstep } from './figure/body'
import { battingHelmet, braceBars, capGeometry, chinStrap, elbowGuard, facemask, footballHelmet, headband, legGuard, visorShield, type FacemaskStyle, type FootballHelmet } from './figure/gear'
import { garment, numberAnchor, type GarmentSlot } from './figure/garments'
import { lipColor, material, type Finish } from './figure/materials'

/**
 * The athlete figure: a skinned body sculpted from height, weight, wingspan, body fat and
 * position, with a generic sculpted head (never a likeness), hands, feet, simulated hair and the
 * athlete's gear in generic team colours (no logos). PBR materials give skin, fabric, leather,
 * rubber, glossy shells and metal their own response to light.
 *
 * Axes: the athlete faces +Z, Y is up, the athlete's left is +X. Units are metres.
 */
export type JointName = (typeof BONES)[number]

export const JOINTS: JointName[] = [...BONES]

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
  // Hands from hand length when measured, else from hand span (length is about 0.84 of span);
  // the arm keeps the measured wingspan by giving the rest to the upper arm and forearm.
  const handLength = resolveMetric(a, 'handLengthIn')?.value
  const handSpan = resolveMetric(a, 'handSizeIn')?.value
  const handM = handLength ? handLength * IN_TO_M : handSpan ? handSpan * 0.84 * IN_TO_M : armTotal * 0.245
  const hand = Math.min(armTotal * 0.3, Math.max(armTotal * 0.2, handM))
  // Feet from US men's shoe size: last length (in) = (size + 22) / 3, foot about half an inch shorter.
  const shoe = resolveMetric(a, 'shoeSizeUs')?.value
  const foot = shoe ? Math.min(0.18 * H, Math.max(0.13 * H, ((shoe + 22) / 3 - 0.5) * IN_TO_M)) : 0.15 * H
  return {
    height: H,
    ankle: 0.045 * H,
    shin: 0.245 * H,
    thigh: 0.245 * H,
    hipY: 0.555 * H,
    foot,
    torso: 0.3 * H,
    upperArm: (armTotal - hand) * 0.56,
    forearm: (armTotal - hand) * 0.44,
    hand,
    shoulderHalf,
    // Hip joint centres sit about 10 cm either side of the midline on a 1.85 m athlete.
    hipHalf: 0.055 * H,
    girth,
    belly: 1 + Math.max(-0.1, Math.min(0.3, (fat - 12) / 40)),
  }
}

/** Where each body segment runs in the rest pose, for placing hotspots. */
export interface SegmentInfo {
  segment: BodySegment
  start: THREE.Vector3
  end: THREE.Vector3
  radius: number
  side: 1 | -1 | 0
}

const SIDES = [['L', 1], ['R', -1]] as const

export class Rig {
  readonly root = new THREE.Group()
  readonly joints = {} as Record<JointName, THREE.Bone>
  readonly dims: Dimensions
  readonly athlete: Athlete
  /** Body and gear meshes (heat-mappable); gear carries `userData.gearId`. */
  readonly meshes: THREE.Mesh[] = []
  /** Eyes, brows, lips, nails and hair: hidden for heat maps and ghosts. */
  readonly details: THREE.Object3D[] = []
  readonly skeleton: THREE.Skeleton
  /** Height the shoes add under the feet. */
  soleLift = 0
  private readonly body: BodyGeometry
  private readonly head: HeadShape
  private readonly segments = new Map<BodySegment, SegmentInfo>()
  private readonly materials = new Map<THREE.Mesh, THREE.Material>()
  private readonly owned: (THREE.Material | THREE.Texture)[] = []
  private readonly restWorld: THREE.Matrix4[]
  private readonly hands: Partial<Record<'L' | 'R', THREE.Mesh>> = {}
  private readonly nails: Partial<Record<'L' | 'R', THREE.Mesh>> = {}
  private hair?: StrandHair
  private readonly cloth: ClothDriver
  private clothMats: THREE.Material[] = []
  private helmet?: FootballHelmet
  /** Cap or batting helmet: a sphere the hair rests against. */
  private headgear?: { center: THREE.Vector3; radius: number }
  private heatOn = false
  private gearState = new Map<string, { worn: boolean; variant?: string }>()
  private ghost = false
  private ghostMaterial?: THREE.MeshStandardMaterial
  private scanned = false

  constructor(athlete: Athlete, options: { ghostColor?: number } = {}) {
    this.athlete = athlete
    this.dims = dimensionsFor(athlete)
    this.root.name = `rig:${athlete.id}`
    const d = this.dims
    const H = d.height
    const bones = this.buildSkeleton()
    this.root.updateMatrixWorld(true)
    this.skeleton = new THREE.Skeleton(bones)
    this.restWorld = this.skeleton.boneInverses.map((m) => m.clone().invert())
    const group = athlete.positionGroup || positionGroupFor(athlete.league, athlete.position)
    this.body = buildBody({ ...d }, morphFor(group))
    this.head = sculptHead(H, d.girth)
    this.cloth = new ClothDriver(H)
    this.buildSegments()
    this.buildBodyMeshes()
    for (const g of athlete.gear) this.gearState.set(g.id, { worn: g.worn, variant: g.defaultVariant })
    this.buildGear()
    if (options.ghostColor !== undefined) this.makeGhost(options.ghostColor)
  }

  private buildSkeleton(): THREE.Bone[] {
    const d = this.dims
    const bone = (name: JointName, parent: THREE.Object3D, x: number, y: number, z = 0) => {
      const b = new THREE.Bone()
      b.name = name
      b.position.set(x, y, z)
      parent.add(b)
      this.joints[name] = b
      return b
    }
    const hips = bone('hips', this.root, 0, d.hipY)
    const spine = bone('spine', hips, 0, 0.02 * d.height)
    const chest = bone('chest', spine, 0, 0.14 * d.height)
    const neck = bone('neck', chest, 0, 0.13 * d.height)
    bone('head', neck, 0, 0.03 * d.height)
    for (const [side, sx] of SIDES) {
      const shoulder = bone(`shoulder${side}`, chest, sx * d.shoulderHalf, 0.115 * d.height)
      // Axial rotation first, then flexion, then abduction (see motions.ts).
      shoulder.rotation.order = 'ZXY'
      const elbow = bone(`elbow${side}`, shoulder, 0, -d.upperArm)
      bone(`wrist${side}`, elbow, 0, -d.forearm)
      const hip = bone(`hip${side}`, hips, sx * d.hipHalf, -0.02 * d.height)
      const knee = bone(`knee${side}`, hip, 0, -d.thigh)
      bone(`ankle${side}`, knee, 0, -d.shin)
    }
    return BONES.map((n) => this.joints[n])
  }

  private buildSegments(): void {
    const d = this.dims
    const H = d.height
    const g = d.girth
    const J = this.body.joints
    const V = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z)
    const add = (segment: BodySegment, start: THREE.Vector3, end: THREE.Vector3, radius: number, side: 1 | -1 | 0) => this.segments.set(segment, { segment, start, end, radius, side })
    add('head', J.head.clone().add(V(0, 0.126 * H)), J.head.clone().add(V(0, -0.002 * H)), 0.05 * H, 0)
    add('neck', J.neck.clone(), J.head.clone().add(V(0, 0.03 * H)), 0.035 * H, 0)
    add('chest', V(0, J.chest.y + 0.15 * H), V(0, J.chest.y - 0.01 * H), 0.1 * H * g, 0)
    add('abdomen', V(0, J.spine.y + 0.145 * H), V(0, J.spine.y - 0.005 * H), 0.085 * H * g, 0)
    add('pelvis', V(0, J.hips.y + 0.05 * H), V(0, J.hips.y - 0.075 * H), 0.09 * H * g, 0)
    for (const [side, s] of SIDES) {
      add(`upperArm${side}`, J[`shoulder${side}`].clone(), J[`elbow${side}`].clone(), 0.03 * H * Math.sqrt(g), s)
      add(`forearm${side}`, J[`elbow${side}`].clone(), J[`wrist${side}`].clone(), 0.025 * H * Math.sqrt(g), s)
      add(`hand${side}`, J[`wrist${side}`].clone(), J[`wrist${side}`].clone().add(V(0, -d.hand)), 0.02 * H, s)
      add(`thigh${side}`, J[`hip${side}`].clone(), J[`knee${side}`].clone(), 0.045 * H * g, s)
      add(`shin${side}`, J[`knee${side}`].clone(), J[`ankle${side}`].clone(), 0.03 * H * Math.sqrt(g), s)
      const an = J[`ankle${side}`]
      add(`foot${side}`, V(an.x, an.y - d.ankle * 0.6, -0.25 * d.foot), V(an.x, an.y - d.ankle * 0.6, 0.75 * d.foot), 0.025 * H, s)
    }
  }

  /** Skin finish: the reference-based tone when one exists, otherwise a neutral studio clay. */
  private skinMaterial(): THREE.Material {
    const ap = this.athlete.appearance
    return ap?.skinTone && ap.quality !== 'SIMULATED' ? material('skin', ap.skinTone) : material('clay')
  }

  private addSkinned(geometry: THREE.BufferGeometry, mat: THREE.Material, segment: BodySegment, gearId?: string): THREE.SkinnedMesh {
    const mesh = new THREE.SkinnedMesh(geometry, mat)
    // Vertices are authored in rest space with the rig at the origin: bind to identity so a
    // garment rebuilt while the athlete stands elsewhere still lines up with the skeleton.
    mesh.bind(this.skeleton, new THREE.Matrix4())
    mesh.frustumCulled = false
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.userData.segment = segment
    mesh.userData.skinned = true
    if (gearId) mesh.userData.gearId = gearId
    this.root.add(mesh)
    this.meshes.push(mesh)
    this.materials.set(mesh, mat)
    return mesh
  }

  private addRigid(bone: JointName, geometry: THREE.BufferGeometry, mat: THREE.Material, segment: BodySegment, gearId?: string): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, mat)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.userData.segment = segment
    mesh.userData.bone = bone
    if (gearId) mesh.userData.gearId = gearId
    this.joints[bone].add(mesh)
    this.meshes.push(mesh)
    this.materials.set(mesh, mat)
    return mesh
  }

  private addDetail(parent: THREE.Object3D, object: THREE.Object3D): void {
    object.castShadow = true
    parent.add(object)
    this.details.push(object)
  }

  private buildBodyMeshes(): void {
    const d = this.dims
    const H = d.height
    const skin = this.skinMaterial()
    const ap = this.athlete.appearance
    const look = Boolean(ap?.skinTone && ap.quality !== 'SIMULATED')
    this.addSkinned(this.body.geometry, skin, 'chest')
    const head = this.addRigid('head', this.head.geometry, skin, 'head')
    head.userData.headSculpt = true
    this.addRigid('head', ears(this.head), skin, 'head').userData.headSculpt = true
    // Eyes sit in the sockets, just behind the sculpted surface.
    const eyeMat = material('eye')
    const irisMat = material('iris', look ? '#2e1d14' : '#55504a')
    for (const c of this.head.eyes) {
      const surface = this.surfaceZ(c)
      const er = this.head.eyeRadius
      const center = new THREE.Vector3(c.x, c.y, surface - er * 0.78)
      const eye = new THREE.Mesh(new THREE.SphereGeometry(er, 20, 14), eyeMat)
      eye.position.copy(center)
      eye.userData.headSculpt = true
      this.addDetail(this.joints.head, eye)
      const iris = new THREE.Mesh(new THREE.SphereGeometry(er * 0.46, 16, 10), irisMat)
      iris.position.copy(center).add(new THREE.Vector3(0, -er * 0.05, er * 0.6))
      iris.userData.headSculpt = true
      this.addDetail(this.joints.head, iris)
      // Upper lid: a skin cap over the top of the eyeball, relaxed half-open.
      const lid = new THREE.Mesh(new THREE.SphereGeometry(er * 1.1, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.46), skin)
      lid.rotation.x = -0.3
      lid.position.copy(center)
      lid.userData.headSculpt = true
      this.addDetail(this.joints.head, lid)
    }
    const hairColor = ap?.hairColor ?? '#1b1410'
    if (look) {
      const lipGeo = lips(this.head)
      // Seat the lips on the sculpted surface rather than in front of it.
      const mouth = new THREE.Vector3(this.head.center.x, this.head.center.y - this.head.radii.y * 0.53, 0)
      lipGeo.translate(0, 0, this.surfaceZ(mouth) - (this.head.center.z + this.head.radii.z * 0.94) - 0.0015 * H)
      const lip = new THREE.Mesh(lipGeo, material('lip', lipColor(ap!.skinTone!)))
      lip.userData.headSculpt = true
      this.addDetail(this.joints.head, lip)
    }
    const brow = new THREE.Mesh(brows(this.head), look ? material('hair', hairColor) : material('clay', '#6f6a64'))
    brow.userData.headSculpt = true
    this.addDetail(this.joints.head, brow)
    if (look && ap) {
      const beard = facialHair(this.head, ap.facialHair)
      if (beard) {
        const m = new THREE.Mesh(beard, ap.facialHair === 'stubble' ? material('stubble', hairColor) : material('hair', hairColor))
        m.userData.headSculpt = true
        this.addDetail(this.joints.head, m)
      }
      const cap = STRAND_STYLES[ap.hair] ? hairCap(this.head, 'buzz') : hairCap(this.head, ap.hair)
      if (cap) {
        const m = new THREE.Mesh(cap, material('hair', hairColor))
        m.userData.headSculpt = true
        this.addDetail(this.joints.head, m)
      }
      const strands = STRAND_STYLES[ap.hair]
      if (strands) {
        this.hair = new StrandHair(this.head, this.joints.head, strands, H, hairColor, ap.hair === 'braids' ? 'braid' : 'hair')
        this.addDetail(this.root, this.hair.mesh)
      }
    }
    for (const [side, s] of SIDES) {
      const hand = this.addRigid(`wrist${side}`, handGeometry({ H, length: d.hand, s }), skin, `hand${side}`)
      this.hands[side] = hand
      const nails = new THREE.Mesh(nailGeometry({ H, length: d.hand, s }), material('nail', look ? new THREE.Color(ap!.skinTone!).lerp(new THREE.Color('#f3d9cf'), 0.55).getStyle() : '#a29d96'))
      this.nails[side] = nails
      this.addDetail(this.joints[`wrist${side}`], nails)
      this.addRigid(`ankle${side}`, footGeometry({ H, F: d.foot, A: d.ankle, s }), skin, `foot${side}`)
    }
  }

  /** Front surface of the sculpted head straight ahead of a point (head space). */
  private surfaceZ(p: THREE.Vector3): number {
    const pos = this.head.geometry.getAttribute('position')
    let best = -Infinity
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getX(i) - p.x) < this.head.radii.x * 0.06 && Math.abs(pos.getY(i) - p.y) < this.head.radii.y * 0.05) best = Math.max(best, pos.getZ(i))
    }
    return Number.isFinite(best) ? best : p.z
  }

  private gearColor(item: GearItem): string {
    const state = this.gearState.get(item.id)
    const variant = item.variants?.find((v) => v.id === state?.variant)
    return variant?.color ?? item.color
  }

  private variantStyle(item: GearItem): string | undefined {
    const state = this.gearState.get(item.id)
    return item.variants?.find((v) => v.id === state?.variant)?.style
  }

  private worn(slot: GearItem['slot']): GearItem | undefined {
    return this.athlete.gear.find((g) => g.slot === slot && this.gearState.get(g.id)?.worn)
  }

  private buildGear(): void {
    const d = this.dims
    const H = d.height
    const g = d.girth
    const league = this.athlete.league
    const leadSide: 'L' | 'R' = this.athlete.bats === 'L' ? 'R' : 'L'
    this.soleLift = 0
    this.helmet = undefined
    for (const m of this.clothMats) m.dispose()
    this.clothMats = []
    this.cloth.targets.length = 0
    let gloved = false
    let mittSide: 'L' | 'R' | undefined
    this.headgear = undefined
    const helmetItem = this.worn('helmet')
    if (helmetItem) this.helmet = footballHelmet(this.head, H)
    this.placeHair()
    for (const item of this.athlete.gear) {
      if (!this.gearState.get(item.id)?.worn) continue
      const color = this.gearColor(item)
      const accent = item.accent ?? item.color
      const shellG = (slot: GarmentSlot, finish: Finish, c = color, style?: string) => {
        const geo = garment(this.body, slot, league, style)
        if (geo) this.addSkinned(geo, material(finish, c), 'chest', item.id)
      }
      /** Loose fabric: a per-rig material whose free edge sways with the hips. */
      const looseG = (slot: GarmentSlot, finish: Finish, weight: (p: THREE.Vector3) => number, c = color, style?: string) => {
        const geo = garment(this.body, slot, league, style)
        if (!geo) return null
        setSwayWeights(geo, weight)
        const { material: mat, uniforms } = clothMaterial(material(finish, c))
        this.clothMats.push(mat)
        this.cloth.targets.push(uniforms)
        this.addSkinned(geo, mat, 'chest', item.id)
        return geo
      }
      const J = this.body.joints
      switch (item.slot) {
        case 'helmet': {
          const h = this.helmet!
          this.addRigid('head', h.shell, material('shell', color), 'head', item.id)
          this.addRigid('head', h.liner, material('rubber', '#1c1d20'), 'head', item.id)
          if (item.accent) this.addRigid('head', h.stripe, material('shell', accent), 'head', item.id)
          break
        }
        case 'facemask':
          if (this.helmet) this.addRigid('head', facemask(this.head, this.helmet, H, (this.variantStyle(item) ?? 'standard') as FacemaskStyle), material('shell', color), 'head', item.id)
          break
        case 'visor':
          if (this.helmet) this.addRigid('head', visorShield(this.head, this.helmet, H), material('visor', color), 'head', item.id)
          break
        case 'chinStrap':
          if (this.helmet) this.addRigid('head', chinStrap(this.head, this.helmet, H), material('shell', color), 'head', item.id)
          break
        case 'battingHelmet':
          this.addRigid('head', battingHelmet(this.head, H, this.athlete.bats === 'L' ? -1 : 1), material('shell', color), 'head', item.id)
          break
        case 'cap': {
          const cap = capGeometry(this.head, H)
          this.addRigid('head', cap.crown, material('pants', color), 'head', item.id)
          this.addRigid('head', cap.brim, material('pants', accent), 'head', item.id)
          break
        }
        case 'headband':
          this.addRigid('head', headband(this.head, H), material('knit', color), 'head', item.id)
          break
        case 'jersey': {
          // Football jerseys are tight over pads; basketball and baseball hems hang free.
          const geo =
            league === 'NFL'
              ? garment(this.body, 'jersey', league)
              : looseG('jersey', 'jersey', (p) => smoothstep(J.chest.y, J.hips.y - 0.02 * H, p.y) * (league === 'NBA' ? 0.7 : 0.45))
          if (!geo) break
          if (league === 'NFL') this.addSkinned(geo, material('jersey', color), 'chest', item.id)
          if (item.accent) shellG('sleeveStripe', 'jersey', accent)
          this.addNumbers(item, geo)
          break
        }
        case 'undershirt':
          shellG('undershirt', 'knit')
          break
        case 'pants':
          if (league === 'MLB') looseG('pants', 'pants', (p) => smoothstep(J.hipL.y, J.kneeL.y - 0.1 * H, p.y) * 0.5, color, this.variantStyle(item))
          else shellG('pants', 'pants', color, this.variantStyle(item))
          if (item.accent) shellG('pantsStripe', 'pants', accent)
          break
        case 'shorts':
          looseG('shorts', 'jersey', (p) => smoothstep(J.hipL.y - 0.02 * H, J.kneeL.y + 0.01 * H, p.y))
          break
        case 'socks':
          shellG('socks', 'knit')
          break
        case 'compressionSleeveL':
          shellG('sleeveL', 'knit')
          break
        case 'compressionSleeveR':
        case 'shootingSleeveR':
          shellG('sleeveR', 'knit')
          break
        case 'kneeSleeves':
          shellG('kneeSleeves', 'knit')
          break
        case 'kneeBrace': {
          shellG('kneeBrace', 'knit', '#22252a')
          for (const [side] of SIDES) {
            const offset = 0.036 * H * g
            const upper = braceBars(H, 0.085 * H, offset, true)
            upper.translate(0, -d.thigh + 0.085 * H, 0)
            this.addRigid(`hip${side}`, upper, material('metal', '#9aa0a6'), `thigh${side}`, item.id)
            this.addRigid(`knee${side}`, braceBars(H, 0.085 * H, offset * 0.92, false), material('metal', '#9aa0a6'), `shin${side}`, item.id)
          }
          break
        }
        case 'ankleBrace':
          shellG('ankleBrace', 'knit')
          break
        case 'gloves':
        case 'battingGloves':
          gloved = true
          for (const [side, s] of SIDES) this.addRigid(`wrist${side}`, handGeometry({ H, length: d.hand, s, inflate: 0.0013 * H, curl: 0.3 }), material('leather', color), `hand${side}`, item.id)
          break
        case 'fieldingGlove': {
          mittSide = this.athlete.throws === 'L' ? 'R' : 'L'
          const mitt = mittGeometry(H, d.hand, mittSide === 'L' ? 1 : -1)
          this.addRigid(`wrist${mittSide}`, mitt.leather, material('leather', color), `hand${mittSide}`, item.id)
          this.addRigid(`wrist${mittSide}`, mitt.laces, material('leather', accent), `hand${mittSide}`, item.id)
          break
        }
        case 'wristbands':
          for (const [side] of SIDES) {
            const r = 0.0125 * H * Math.sqrt(g) + 0.004 * H
            const band = new THREE.TorusGeometry(r, 0.006 * H, 8, 24)
            band.rotateX(Math.PI / 2)
            band.scale(0.8, 1.6, 1.05)
            band.translate(0, -d.forearm + 0.026 * H, 0.001 * H)
            this.addRigid(`elbow${side}`, band, material('knit', color), `forearm${side}`, item.id)
          }
          break
        case 'elbowGuard':
          this.addRigid(`elbow${leadSide}`, elbowGuard(H, 0.021 * H * Math.sqrt(g), leadSide === 'L' ? 1 : -1), material('shell', color), `upperArm${leadSide}`, item.id)
          break
        case 'legGuard':
          this.addRigid(`knee${leadSide}`, legGuard(H, d.shin, 0.026 * H * Math.sqrt(g)), material('shell', color), `shin${leadSide}`, item.id)
          break
        case 'shoes': {
          const style = this.variantStyle(item)
          const kind: ShoeKind = league === 'NBA' ? 'court' : style === 'turf' ? 'turf' : league === 'MLB' ? 'spike' : 'cleat'
          for (const [side, s] of SIDES) {
            const shoe = shoeGeometry({ H, F: d.foot, A: d.ankle, s }, kind)
            this.soleLift = shoe.lift
            this.addRigid(`ankle${side}`, shoe.upper, material('leather', color), `foot${side}`, item.id)
            this.addRigid(`ankle${side}`, shoe.sole, material('rubber', accent), `foot${side}`, item.id)
            this.addRigid(`ankle${side}`, shoe.laces, material('knit', accent), `foot${side}`, item.id)
            if (shoe.studs) this.addRigid(`ankle${side}`, shoe.studs, kind === 'spike' ? material('metal', '#b8bcc2') : material('rubber', '#202226'), `foot${side}`, item.id)
            if (style === 'mid' || style === 'high') this.addRigid(`knee${side}`, collarGeometry(H, d.shin, d.ankle, style, 0.019 * H * Math.sqrt(g)), material('leather', color), `shin${side}`, item.id)
          }
          break
        }
        case 'bat':
          // Bats are props: the stage puts one in the hands when a motion calls for it.
          break
      }
    }
    for (const [side] of SIDES) {
      const hidden = side === mittSide
      if (this.hands[side]) this.hands[side]!.visible = !hidden
      if (this.nails[side]) this.nails[side]!.visible = !gloved && !hidden && !this.heatOn && !this.ghost
    }
  }

  /** Strands come out from under headgear at its back rim; otherwise they grow from the scalp. */
  private placeHair(): void {
    const H = this.dims.height
    const c = this.head.center
    const r = this.head.radii
    let rim: { center: THREE.Vector3; half: THREE.Vector3; y: number } | undefined
    if (this.helmet) rim = { center: this.helmet.center, half: this.helmet.half, y: -0.4 }
    else if (this.worn('battingHelmet')) rim = { center: c.clone().add(new THREE.Vector3(0, 0.008 * H, -0.003 * H)), half: new THREE.Vector3(0.058 * H, 0.066 * H, 0.066 * H), y: -0.16 }
    else if (this.worn('cap')) rim = { center: c.clone().add(new THREE.Vector3(0, 0.004 * H, 0)), half: r.clone().addScalar(0.006 * H), y: 0.04 }
    if (rim && !this.helmet) this.headgear = { center: rim.center.clone(), radius: Math.max(rim.half.x, rim.half.z) }
    if (!this.hair) return
    this.hair.setRoots(rim ? rimRoots(rim.center, rim.half, rim.y, this.hair.count) : scalpRoots(this.head, this.hair.count))
  }

  /** Jersey numbers in the trim colour, printed on curved panels (front and back). */
  private addNumbers(item: GearItem, jersey: THREE.BufferGeometry): void {
    if (typeof document === 'undefined') return
    const H = this.dims.height
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const text = this.athlete.kit.number
    ctx.font = '800 200px "Oswald", "Arial Narrow", "Roboto Condensed", Impact, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // Squeeze wide numbers into the panel instead of cropping them.
    const width = ctx.measureText(text).width
    const squeeze = Math.min(1, 220 / Math.max(1, width))
    ctx.save()
    ctx.translate(128, 136)
    ctx.scale(squeeze, 1)
    ctx.lineJoin = 'round'
    ctx.lineWidth = 12
    ctx.strokeStyle = new THREE.Color(this.athlete.kit.secondary === this.athlete.kit.trim ? this.athlete.kit.primary : this.athlete.kit.secondary).getStyle()
    ctx.strokeText(text, 0, 0)
    ctx.fillStyle = new THREE.Color(this.athlete.kit.trim).getStyle()
    ctx.fillText(text, 0, 0)
    ctx.restore()
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    const mat = new THREE.MeshPhysicalMaterial({ map: texture, transparent: true, roughness: 0.55, sheen: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, side: THREE.DoubleSide })
    this.owned.push(texture, mat)
    const league = this.athlete.league
    const size = (league === 'NFL' ? 0.115 : league === 'MLB' ? 0.1 : 0.09) * H
    const y = this.body.joints.chest.y + (league === 'NFL' ? 0.07 : 0.055) * H
    const faces = league === 'MLB' ? [false] : [true, false]
    for (const front of faces) {
      const at = numberAnchor(jersey, y, front, H)
      if (!at) continue
      const geo = new THREE.PlaneGeometry(size, size, 10, 1)
      // Bend the panel around the torso.
      const R = 0.12 * H * this.dims.girth
      const p = geo.getAttribute('position')
      for (let i = 0; i < p.count; i++) {
        const a = p.getX(i) / R
        p.setXYZ(i, Math.sin(a) * R, p.getY(i), Math.cos(a) * R - R)
      }
      geo.computeVertexNormals()
      if (!front) geo.rotateY(Math.PI)
      const local = at.clone().sub(this.body.joints.chest).add(new THREE.Vector3(0, 0, front ? 0.0015 * H : -0.0015 * H))
      geo.translate(local.x, local.y, local.z)
      const plane = new THREE.Mesh(geo, mat)
      plane.userData.gearId = item.id
      plane.userData.segment = 'chest'
      plane.userData.decal = true
      plane.userData.bone = 'chest'
      this.joints.chest.add(plane)
      this.meshes.push(plane)
      this.materials.set(plane, mat)
    }
  }

  isWorn(gearId: string): boolean {
    return this.gearState.get(gearId)?.worn ?? false
  }

  variantOf(gearId: string): string | undefined {
    return this.gearState.get(gearId)?.variant
  }

  /** Swap or remove gear: rebuilds only the gear layer. */
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
      this.materials.delete(mesh)
      this.meshes.splice(this.meshes.indexOf(mesh), 1)
    }
    this.buildGear()
    if (this.ghost) this.applyGhost()
    if (this.heatOn && this.lastHeat) this.setHeatmap(this.lastHeat.hotspots, this.lastHeat.palette, this.lastHeat.only)
  }

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
    for (const o of this.details) o.visible = false
  }

  private lastHeat?: { hotspots: Hotspot[]; palette: HeatPalette; only?: Set<string> }

  /**
   * Paint wear and stress hotspots onto the body and garments as vertex colours, measured in
   * the rest pose so the pattern stays put as the athlete moves. `only` limits painting to the
   * garments of the selected gear items (and the body under them).
   */
  setHeatmap(hotspots: Hotspot[] | null, palette: HeatPalette = 'viridis', only?: Set<string>): void {
    if (!hotspots) {
      this.heatOn = false
      this.lastHeat = undefined
      for (const mesh of this.meshes) {
        const original = this.materials.get(mesh)
        if (original && !this.ghost) mesh.material = original
        if (mesh.userData.decal) mesh.visible = !this.ghost
      }
      if (!this.ghost) for (const o of this.details) o.visible = true
      this.buildGearVisibility()
      return
    }
    this.heatOn = true
    this.lastHeat = { hotspots, palette, ...(only ? { only } : {}) }
    for (const o of this.details) o.visible = false
    const bySegment = new Map<BodySegment, Hotspot[]>()
    for (const h of hotspots) bySegment.set(h.segment, [...(bySegment.get(h.segment) ?? []), h])
    const p = new THREE.Vector3()
    const target = new THREE.Vector3()
    const color = new THREE.Color()
    const local = new THREE.Matrix4()
    for (const mesh of this.meshes) {
      if (mesh.userData.decal) {
        mesh.visible = false
        continue
      }
      const geo = mesh.geometry
      const pos = geo.getAttribute('position')
      const colors = new Float32Array(pos.count * 3)
      const skinned = Boolean(mesh.userData.skinned)
      const source = geo.userData.source as Int32Array | undefined
      if (!skinned) {
        mesh.updateMatrix()
        local.multiplyMatrices(this.restWorld[BONES.indexOf(mesh.userData.bone as JointName)] ?? new THREE.Matrix4(), mesh.matrix)
      }
      const dimmed = only && mesh.userData.gearId && !only.has(mesh.userData.gearId as string)
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i)
        if (!skinned) p.applyMatrix4(local)
        const segment: BodySegment = skinned ? this.body.info.segment[source ? source[i]! : i] ?? 'chest' : (mesh.userData.segment as BodySegment)
        const info = this.segments.get(segment)
        let intensity = 0
        if (info && !dimmed) {
          for (const h of bySegment.get(segment) ?? []) {
            hotspotPoint(info, h, target)
            const sigma = h.face === 'around' ? info.radius * 2.2 : info.radius * 1.15
            intensity = Math.max(intensity, h.intensity * Math.exp(-p.distanceToSquared(target) / (2 * sigma * sigma)))
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

  private buildGearVisibility(): void {
    const gloved = this.athlete.gear.some((g) => (g.slot === 'gloves' || g.slot === 'battingGloves') && this.gearState.get(g.id)?.worn)
    const mitt = this.athlete.gear.some((g) => g.slot === 'fieldingGlove' && this.gearState.get(g.id)?.worn)
    const mittSide = mitt ? (this.athlete.throws === 'L' ? 'R' : 'L') : undefined
    for (const [side] of SIDES) if (this.nails[side]) this.nails[side]!.visible = !gloved && side !== mittSide && !this.ghost && !this.heatOn
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
    this.root.position.set(base.x + pose.root.x * cos + pose.root.z * sin, (base.y ?? 0) + pose.root.y + this.soleLift, base.z - pose.root.x * sin + pose.root.z * cos)
    this.root.rotation.set(pose.root.pitch, base.yaw + pose.root.yaw, pose.root.roll, 'YXZ')
    const hasHair = this.hair && this.hair.mesh.visible !== false
    if (!hasHair && this.cloth.targets.length === 0) return
    this.root.updateMatrixWorld(true)
    const now = performance.now() / 1000
    if (hasHair) this.hair!.step(now, this.colliders(), this.root)
    if (this.cloth.targets.length) this.cloth.step(this.joints.hips.getWorldPosition(this.clothHips), this.root.getWorldQuaternion(this.clothQuat), now)
  }

  private readonly clothHips = new THREE.Vector3()
  private readonly clothQuat = new THREE.Quaternion()

  /** Spheres the hair rests against: head (or helmet), neck, shoulders and upper back. */
  private colliders(): Collider[] {
    const H = this.dims.height
    const g = this.dims.girth
    const out: Collider[] = []
    const head = this.joints.head.matrixWorld
    if (this.helmet) out.push({ center: this.helmet.center.clone().applyMatrix4(head), radius: Math.max(this.helmet.half.x, this.helmet.half.z) * 1.02 })
    else if (this.headgear) out.push({ center: this.headgear.center.clone().applyMatrix4(head), radius: this.headgear.radius * 1.02 })
    else {
      // Two stacked spheres approximate the taller-than-wide skull.
      out.push({ center: this.head.center.clone().add(new THREE.Vector3(0, 0.015 * H, -0.004 * H)).applyMatrix4(head), radius: 0.05 * H })
      out.push({ center: this.head.center.clone().add(new THREE.Vector3(0, -0.012 * H, -0.008 * H)).applyMatrix4(head), radius: 0.046 * H })
    }
    out.push({ center: this.joints.neck.getWorldPosition(new THREE.Vector3()), radius: 0.042 * H * Math.sqrt(g) })
    const chest = this.joints.chest.matrixWorld
    out.push({ center: new THREE.Vector3(0, 0.09 * H, -0.035 * H).applyMatrix4(chest), radius: 0.075 * H * g })
    for (const [side] of SIDES) out.push({ center: this.joints[`shoulder${side}`].getWorldPosition(new THREE.Vector3()), radius: 0.05 * H * g })
    return out
  }

  /** World position of a joint (for labels, cameras and props). */
  jointWorld(name: JointName, out = new THREE.Vector3()): THREE.Vector3 {
    return this.joints[name].getWorldPosition(out)
  }

  /** World-space box around the posed athlete, from the skeleton (cheap; for camera framing). */
  bounds(out = new THREE.Box3()): THREE.Box3 {
    this.root.updateMatrixWorld(true)
    out.makeEmpty()
    const p = new THREE.Vector3()
    for (const name of JOINTS) out.expandByPoint(this.joints[name].getWorldPosition(p))
    out.expandByPoint(new THREE.Vector3(0, 0.13 * this.dims.height, 0).applyMatrix4(this.joints.head.matrixWorld))
    out.expandByScalar(0.06 * this.dims.height)
    out.min.y = Math.min(out.min.y, this.root.position.y - this.soleLift)
    return out
  }

  /** World position of a body region, for close-up cameras. */
  focusPoint(target: 'face' | 'hands' | 'feet' | 'torso', out = new THREE.Vector3()): THREE.Vector3 {
    this.root.updateMatrixWorld(true)
    const H = this.dims.height
    if (target === 'face') return out.set(0, 0.07 * H, 0.03 * H).applyMatrix4(this.joints.head.matrixWorld)
    if (target === 'torso') return this.joints.chest.getWorldPosition(out)
    if (target === 'hands') {
      // The throwing or shooting hand: the right unless the athlete throws left.
      const side = this.athlete.throws === 'L' ? 'L' : 'R'
      return out.set(0, -this.dims.hand * 0.45, 0).applyMatrix4(this.joints[`wrist${side}`].matrixWorld)
    }
    const a = this.joints.ankleL.getWorldPosition(new THREE.Vector3())
    const b = this.joints.ankleR.getWorldPosition(new THREE.Vector3())
    return out.copy(a).add(b).multiplyScalar(0.5)
  }

  /**
   * Show a rights-cleared scan in place of the generic sculpt. A face scan replaces the head
   * (it rides the head bone); a full-body scan replaces the whole figure and stands at the root.
   */
  attachScan(object: THREE.Object3D, kind: 'face' | 'full-body'): void {
    this.scanned = true
    object.userData.scan = true
    if (kind === 'face') {
      for (const m of this.meshes) if (m.userData.headSculpt) m.visible = false
      for (const o of this.details) if (o.userData.headSculpt || o === this.hair?.mesh) o.visible = false
      this.joints.head.add(object)
    } else {
      for (const m of this.meshes) m.visible = false
      for (const o of this.details) o.visible = false
      this.root.add(object)
    }
  }

  get hasScan(): boolean {
    return this.scanned
  }

  dispose(): void {
    this.root.parent?.remove(this.root)
    for (const mesh of this.meshes) mesh.geometry.dispose()
    for (const o of this.details) if (o instanceof THREE.Mesh) o.geometry.dispose()
    this.hair?.dispose()
    for (const x of this.owned) x.dispose()
    this.ghostMaterial?.dispose()
    this.skeleton.dispose()
  }
}

const HEAT_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })

/** Where a hotspot sits, in rest-pose figure space. */
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
      out.y += r * 0.6
      break
    case 'bottom':
      out.y -= isFoot ? r * 0.7 : r
      break
    case 'around':
      break
  }
  return out
}
