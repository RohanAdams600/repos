import * as THREE from 'three'
import type { Pose } from '../three/motions'
import { makeBarbell, makeBaseball, makeBasketball, makeBat, makeFootball } from '../three/props'
import type { Rig } from '../three/rig'
import type { PropKind } from './motion-library'

const UP = new THREE.Vector3(0, 1, 0)

/**
 * Keeps a prop in the athlete's hands (or on his back for the squat) and, after a release,
 * hands control to a flight function supplied by the scene.
 */
export class HeldProp {
  readonly object: THREE.Object3D
  private readonly a = new THREE.Vector3()
  private readonly b = new THREE.Vector3()
  private released = false
  readonly releasePoint = new THREE.Vector3()

  constructor(
    readonly kind: PropKind,
    parent: THREE.Object3D,
    private readonly rig: Rig,
    loadLb = 225,
    /** Barbell across the upper back (back squat) instead of in the hands. */
    private readonly onBack = false,
  ) {
    this.object =
      kind === 'football' ? makeFootball() : kind === 'baseball' ? makeBaseball() : kind === 'basketball' ? makeBasketball() : kind === 'bat' ? makeBat() : kind === 'barbell' ? makeBarbell(loadLb) : new THREE.Group()
    parent.add(this.object)
  }

  get isReleased(): boolean {
    return this.released
  }

  /**
   * Place the prop for this frame. `flight` positions it after release (t = seconds since release);
   * return false from it to hide the prop.
   */
  update(pose: Pose, left: boolean, flight?: (t: number, from: THREE.Vector3, out: THREE.Object3D) => boolean, sinceRelease = 0): void {
    const rig = this.rig
    rig.root.updateMatrixWorld(true)
    const handR = rig.joints.wristR.getWorldPosition(this.a)
    const handL = rig.joints.wristL.getWorldPosition(this.b)
    const handDrop = rig.dims.hand * 0.55
    this.object.visible = true
    switch (this.kind) {
      case 'football':
      case 'baseball':
      case 'basketball': {
        const releasedNow = pose.prop?.released === true
        if (!releasedNow) {
          this.released = false
          const hand = left ? handL : handR
          if (this.kind === 'basketball' && pose.prop?.ballInHand && !left) {
            this.object.position.copy(handR).add(handL).multiplyScalar(0.5)
            this.object.position.y -= handDrop * 0.5
          } else {
            this.object.position.copy(hand)
            this.object.position.y -= handDrop
          }
          if (this.kind === 'football') this.object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward(rig))
          this.releasePoint.copy(this.object.position)
        } else {
          if (!this.released) this.released = true
          if (flight) this.object.visible = flight(sinceRelease, this.releasePoint, this.object)
        }
        break
      }
      case 'bat': {
        const top = left ? handL : handR
        const bottom = left ? handR : handL
        const grip = top.clone().add(bottom).multiplyScalar(0.5)
        grip.y -= handDrop
        const angle = ((pose.prop?.batAngle ?? 0) * Math.PI) / 180
        const tilt = ((pose.prop?.batTilt ?? 60) * Math.PI) / 180
        // Heading in the body frame: toward the catcher at 0 deg, out over the plate at 90.
        const heading = new THREE.Vector3(-Math.cos(angle) * (left ? -1 : 1), 0, Math.sin(angle))
        heading.applyAxisAngle(UP, rig.root.rotation.y)
        const dir = heading.multiplyScalar(Math.cos(tilt)).add(new THREE.Vector3(0, Math.sin(tilt), 0)).normalize()
        this.object.position.copy(grip).addScaledVector(dir, -0.06)
        this.object.quaternion.setFromUnitVectors(UP, dir)
        break
      }
      case 'barbell': {
        const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(rig.root.quaternion)
        this.object.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), axis)
        if (this.onBack) {
          // Bar across the upper back, just below the neck.
          rig.joints.neck.getWorldPosition(this.object.position)
          const back = new THREE.Vector3(0, 0, -1).applyQuaternion(rig.joints.chest.getWorldQuaternion(new THREE.Quaternion()))
          this.object.position.addScaledVector(back, 0.1 * rig.dims.girth).y -= 0.03 * rig.dims.height
        } else {
          this.object.position.copy(handR).add(handL).multiplyScalar(0.5)
          this.object.position.addScaledVector(new THREE.Vector3(0, -1, 0).applyQuaternion(rig.joints.wristR.getWorldQuaternion(new THREE.Quaternion())), handDrop)
        }
        break
      }
      default:
        this.object.visible = false
    }
  }

  dispose(): void {
    this.object.parent?.remove(this.object)
    this.object.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose()
        ;(o.material as THREE.Material).dispose()
      }
    })
  }
}

export function forward(rig: Rig): THREE.Vector3 {
  return new THREE.Vector3(0, 0, 1).applyAxisAngle(UP, rig.root.rotation.y)
}
