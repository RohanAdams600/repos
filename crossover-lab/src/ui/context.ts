import type { Viewer } from '../three/viewer'
import type { Hud } from './hud'

export interface AppContext {
  viewer: Viewer
  hud: Hud
  /** Go to a page. `force` re-renders even when the hash is unchanged. */
  navigate(hash: string, force?: boolean): void
}

/** A page: panel content plus whatever it put on the stage. */
export interface View {
  el: HTMLElement
  /** Called once the panel is in the document. */
  mounted?(): void
  dispose?(): void
}
