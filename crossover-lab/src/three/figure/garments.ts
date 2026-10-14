import * as THREE from 'three'
import type { League } from '../../data/types'
import { shellFrom, smoothstep, type BodyGeometry } from './body'

/**
 * Garments are shells cut from the body surface and pushed out along its normals, so they
 * share the body's skin weights and fold with it. Cuts follow each league's kit: football
 * jerseys stretch over shoulder pads, baseball jerseys hang loose with short sleeves, basketball
 * jerseys are sleeveless with deep arm holes; pants, shorts and socks end where each sport wears
 * them.
 */
export type GarmentSlot = 'jersey' | 'sleeveStripe' | 'undershirt' | 'pants' | 'pantsStripe' | 'shorts' | 'socks' | 'sleeveL' | 'sleeveR' | 'kneeSleeves' | 'kneeBrace' | 'ankleBrace'

export function garment(body: BodyGeometry, slot: GarmentSlot, league: League, style?: string): THREE.BufferGeometry | null {
  const { joints: J, info, frame: f } = body
  const H = f.height
  const yHip = J.hips.y
  const yChest = J.chest.y
  const ySh = J.shoulderL.y
  const kn = J.kneeL.y
  const an = J.ankleL.y
  const sh = f.shoulderHalf
  const part = (i: number) => info.part[i]!
  const along = (i: number) => info.along[i]!
  const torso = (i: number) => part(i) === 'torso'
  const arm = (i: number) => part(i) === 'armL' || part(i) === 'armR'
  const leg = (i: number) => part(i) === 'legL' || part(i) === 'legR'
  /** Signed distance below a neckline that dips `front` (and `back`) below `top` (shares of H). */
  const neckline = (p: THREE.Vector3, top: number, front: number, back: number) => {
    const ang = Math.atan2(p.z, Math.abs(p.x) + 1e-6)
    const f = Math.max(0, Math.sin(ang)) ** 2
    const b = Math.max(0, -Math.sin(ang)) ** 2
    return ySh + (top - front * f - back * b) * H - p.y
  }

  switch (slot) {
    case 'jersey': {
      if (league === 'NFL') {
        return shellFrom(
          body,
          (i, p) => {
            if (arm(i)) return along(i) < 0.3
            // Crew neck: the cut follows a ring of the body, so the collar is clean.
            return torso(i) && p.y > yHip + 0.005 * H && p.y < ySh + 0.006 * H
          },
          (i, p, n) => {
            if (arm(i)) return 0.006 * H + 0.018 * H * (1 - along(i) / 0.3)
            // Shoulder pads: arches over the shoulders (thickest on top), flat plates front and back.
            const over = smoothstep(sh * 0.3, sh * 0.8, Math.abs(p.x)) * smoothstep(yChest + 0.04 * H, ySh, p.y)
            const pad = 0.022 * H * over * (0.45 + 0.55 * Math.max(0, n.y))
            const plate = 0.01 * H * smoothstep(yChest - 0.02 * H, yChest + 0.05 * H, p.y)
            return 0.006 * H + pad + plate
          },
        )
      }
      if (league === 'MLB') {
        return shellFrom(
          body,
          (i, p) => {
            if (arm(i)) return along(i) < 0.42
            if (!torso(i) || p.y < yHip - 0.015 * H) return -1
            // Button-front collar: a shallow V that opens toward the front.
            return neckline(p, 0.012, 0.035, 0.006)
          },
          (i, p) => (arm(i) ? 0.009 * H + 0.004 * H * (along(i) / 0.42) : 0.009 * H + 0.004 * H * smoothstep(yChest, yHip, p.y)),
        )
      }
      return shellFrom(
        body,
        (i, p) => {
          if (!torso(i) || p.y < yHip - 0.02 * H) return -1
          // Scoop neck front and back, and arm holes that curve from the armpit up to the straps.
          const yArm = yChest + 0.01 * H
          const rise = Math.min(1, Math.max(0, (p.y - yArm) / (ySh - yArm)))
          const strap = sh * (1.05 - 0.47 * Math.sqrt(rise))
          return Math.min(neckline(p, 0.03, 0.075, 0.045), p.y < yArm ? 1 : strap - Math.abs(p.x))
        },
        (_i, p) => 0.006 * H + 0.004 * H * smoothstep(yChest, yHip, p.y),
      )
    }
    case 'sleeveStripe':
      // Football sleeve stripes ride just outside the jersey sleeve over the pads.
      if (league !== 'NFL') return null
      return shellFrom(body, (i) => arm(i) && along(i) > 0.17 && along(i) < 0.235, (i) => 0.0075 * H + 0.018 * H * (1 - along(i) / 0.3))
    case 'undershirt':
      return shellFrom(body, (i, p) => (torso(i) && p.y > yHip && p.y < ySh + 0.014 * H) || (arm(i) && along(i) < 0.97), () => 0.0028 * H)
    case 'pants': {
      if (league === 'MLB') {
        const long = style === 'long'
        return shellFrom(
          body,
          (i, p) => (torso(i) && p.y < yHip + 0.06 * H) || (leg(i) && p.y > (long ? an + 0.02 * H : kn - 0.12 * H)),
          (i, p) => (leg(i) ? 0.009 * H + 0.006 * H * smoothstep(kn, yHip, p.y) : 0.009 * H),
        )
      }
      return shellFrom(
        body,
        (i, p) => (torso(i) && p.y < yHip + 0.06 * H) || (leg(i) && p.y > kn - 0.035 * H),
        (i, p, n) => {
          // The jersey is tucked in: the waistband sits clearly outside its hem, so the two
          // surfaces never meet at the same depth.
          if (!leg(i)) return 0.006 * H + 0.003 * H * smoothstep(yHip - 0.02 * H, yHip + 0.005 * H, p.y)
          // Thigh and knee pads sit inside football pants.
          const front = Math.max(0, n.z)
          const thigh = 0.008 * H * front * Math.exp(-(((p.y - (yHip - 0.13 * H)) / (0.05 * H)) ** 2))
          const knee = 0.01 * H * front * Math.exp(-(((p.y - (kn + 0.005 * H)) / (0.025 * H)) ** 2))
          return 0.006 * H + thigh + knee
        },
      )
    }
    case 'pantsStripe': {
      // A side stripe down the outside of each leg. "Outside" is the leg's own side, not the sign
      // of x, so inner-thigh vertices that cross the midline never pick it up.
      const nor = body.geometry.getAttribute('normal')
      const side = (i: number) => (part(i) === 'legL' ? Math.sign(J.hipL.x) : Math.sign(J.hipR.x))
      return shellFrom(
        body,
        (i, p) => (leg(i) ? Math.min((nor.getX(i) * side(i) - 0.96) * 0.5, p.y - (kn - 0.03 * H), J.hipL.y + 0.03 * H - p.y) : -1),
        (_i, p) => (league === 'MLB' ? 0.0102 * H + 0.006 * H * smoothstep(kn, yHip, p.y) : 0.0072 * H),
      )
    }
    case 'shorts':
      return shellFrom(
        body,
        (i, p) => (torso(i) && p.y < yHip + 0.06 * H) || (leg(i) && p.y > kn + 0.012 * H),
        (i, p) => (leg(i) ? 0.014 * H + 0.016 * H * smoothstep(J.hipL.y, kn, p.y) : 0.014 * H),
      )
    case 'socks': {
      const top = league === 'NBA' ? an + 0.07 * H : league === 'MLB' ? kn - 0.02 * H : kn - 0.03 * H
      return shellFrom(body, (i, p) => leg(i) && p.y < top, () => 0.0018 * H)
    }
    case 'sleeveL':
    case 'sleeveR': {
      const want = slot === 'sleeveL' ? 'armL' : 'armR'
      return shellFrom(body, (i) => part(i) === want && along(i) > 0.16 && along(i) < 0.995, () => 0.0016 * H)
    }
    case 'kneeSleeves':
      return shellFrom(body, (i, p) => leg(i) && Math.abs(p.y - kn) < 0.07 * H, () => 0.004 * H)
    case 'kneeBrace':
      return shellFrom(body, (i, p) => leg(i) && Math.abs(p.y - kn) < 0.085 * H, () => 0.005 * H)
    case 'ankleBrace':
      return shellFrom(body, (i, p) => leg(i) && p.y < an + 0.065 * H, () => 0.0045 * H)
  }
}

/**
 * Where the jersey number sits: the front or back surface of the jersey shell at chest height,
 * in figure (rest) space.
 */
export function numberAnchor(jersey: THREE.BufferGeometry, y: number, front: boolean, H: number): THREE.Vector3 | null {
  const p = jersey.getAttribute('position')
  let best: THREE.Vector3 | null = null
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const yy = p.getY(i)
    const z = p.getZ(i)
    if (Math.abs(x) > 0.02 * H || Math.abs(yy - y) > 0.012 * H) continue
    if (!best || (front ? z > best.z : z < best.z)) best = new THREE.Vector3(0, y, z)
  }
  return best
}
