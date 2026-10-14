import * as THREE from 'three'
import { braidNormal, hairNormal, knitNormal, leatherNormal, skinNormal, stubbleMap, twillNormal } from './textures'

/**
 * Physically based materials for the figure. Skin uses a sheen lobe plus a view-dependent
 * scatter term as a real-time approximation of subsurface scattering (it is not a full
 * diffusion model); fabric uses sheen and a knit or twill normal map; leather, rubber, glossy
 * helmet shells and metal facemasks each get their own roughness and coat.
 */
export type Finish = 'skin' | 'clay' | 'jersey' | 'pants' | 'knit' | 'leather' | 'rubber' | 'shell' | 'metal' | 'visor' | 'hair' | 'braid' | 'stubble' | 'eye' | 'iris' | 'lip' | 'nail' | 'decal'

const cache = new Map<string, THREE.Material>()

function lighten(color: THREE.Color, k: number): THREE.Color {
  return color.clone().lerp(new THREE.Color(1, 1, 1), k)
}

/** Adds the scatter term to a physical material (skin only). */
function withScatter(mat: THREE.MeshPhysicalMaterial, scatter: THREE.Color): THREE.MeshPhysicalMaterial {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uScatter = { value: scatter }
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 uScatter;\nvoid main() {')
      .replace(
        '#include <opaque_fragment>',
        `{
          // Light bleeding through thin skin at grazing angles, tinted by the blood under it.
          float facing = abs( dot( normal, normalize( -vViewPosition ) ) );
          outgoingLight += uScatter * diffuseColor.rgb * pow( 1.0 - facing, 2.5 ) * 0.22;
        }
        #include <opaque_fragment>`,
      )
  }
  mat.customProgramCacheKey = () => 'skin-scatter'
  return mat
}

export function material(finish: Finish, hex: string | number = '#ffffff'): THREE.Material {
  const key = `${finish}:${typeof hex === 'number' ? hex.toString(16) : hex}`
  const hit = cache.get(key)
  if (hit) return hit
  const color = new THREE.Color(hex)
  let mat: THREE.Material
  switch (finish) {
    case 'skin': {
      const m = new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.5,
        sheen: 0.35,
        sheenColor: new THREE.Color('#ff8a6a').multiplyScalar(0.6),
        sheenRoughness: 0.55,
        clearcoat: 0.06,
        clearcoatRoughness: 0.55,
      })
      const n = skinNormal()
      if (n) {
        m.normalMap = n
        m.normalScale.set(0.18, 0.18)
      }
      mat = withScatter(m, new THREE.Color('#ff4a2a'))
      break
    }
    case 'clay':
      mat = new THREE.MeshPhysicalMaterial({ color: color.getHex() === 0xffffff ? new THREE.Color('#8e8982') : color, roughness: 0.58, sheen: 0.25, sheenRoughness: 0.7, sheenColor: new THREE.Color('#ffffff') })
      break
    case 'jersey':
    case 'knit': {
      const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.78, sheen: 0.7, sheenColor: lighten(color, 0.45), sheenRoughness: 0.45, side: THREE.DoubleSide })
      const n = knitNormal()
      if (n) {
        m.normalMap = n
        m.normalScale.set(0.35, 0.35)
      }
      mat = m
      break
    }
    case 'pants': {
      const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.7, sheen: 0.45, sheenColor: lighten(color, 0.3), sheenRoughness: 0.5, side: THREE.DoubleSide })
      const n = twillNormal()
      if (n) {
        m.normalMap = n
        m.normalScale.set(0.25, 0.25)
      }
      mat = m
      break
    }
    case 'leather': {
      const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.48, clearcoat: 0.18, clearcoatRoughness: 0.5 })
      const n = leatherNormal()
      if (n) {
        m.normalMap = n
        m.normalScale.set(0.18, 0.18)
      }
      mat = m
      break
    }
    case 'rubber':
      mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.88 })
      break
    case 'shell':
      mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.05 })
      break
    case 'metal':
      mat = new THREE.MeshStandardMaterial({ color, metalness: 0.85, roughness: 0.3 })
      break
    case 'visor':
      mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
      break
    case 'hair':
    case 'braid': {
      const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.62, sheen: 0.35, sheenColor: lighten(color, 0.14), sheenRoughness: 0.4, anisotropy: 0.4 })
      const n = finish === 'braid' ? braidNormal() : hairNormal()
      if (n) {
        m.normalMap = n
        m.normalScale.set(finish === 'braid' ? 0.45 : 0.7, finish === 'braid' ? 0.45 : 0.7)
      }
      mat = m
      break
    }
    case 'stubble': {
      const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.8, transparent: true, depthWrite: false })
      const a = stubbleMap()
      if (a) m.alphaMap = a
      else m.opacity = 0.5
      mat = m
      break
    }
    case 'eye':
      mat = new THREE.MeshPhysicalMaterial({ color: '#d9d0c6', roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.08 })
      break
    case 'iris':
      mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02 })
      break
    case 'lip':
      mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.42, sheen: 0.3, sheenColor: new THREE.Color('#ff9a8a') })
      break
    case 'nail':
      mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 0.6 })
      break
    case 'decal':
      mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.6, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
      break
  }
  cache.set(key, mat)
  return mat
}

/** Skin tones darker than this get a slightly glossier, cooler scatter; purely cosmetic. */
export function lipColor(skin: string): string {
  return new THREE.Color(skin).multiplyScalar(0.72).lerp(new THREE.Color('#5a2e2a'), 0.2).getStyle()
}
