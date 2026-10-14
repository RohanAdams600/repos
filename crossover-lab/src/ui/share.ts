/** A matchup, small enough to live in a link: #m.<base64url JSON>. */
export type Mode = 'sprint' | 'jump' | 'lift' | 'arm' | 'atbat' | 'shoot' | 'agility'

export interface Matchup {
  v: 1
  ids: string[]
  mode: Mode
  opts: Record<string, string | number | boolean>
  seed: number
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(code: string): string {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((code.length + 3) % 4)
  const bin = atob(b64)
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

export function encodeMatchup(m: Matchup): string {
  return toBase64Url(JSON.stringify(m))
}

const MODES: Mode[] = ['sprint', 'jump', 'lift', 'arm', 'atbat', 'shoot', 'agility']

export function decodeMatchup(code: string): Matchup | null {
  try {
    const raw = JSON.parse(fromBase64Url(code.trim().replace(/^#?m\./, ''))) as Partial<Matchup>
    if (raw.v !== 1 || !Array.isArray(raw.ids) || !raw.ids.every((x) => typeof x === 'string') || !MODES.includes(raw.mode as Mode)) return null
    const opts: Matchup['opts'] = {}
    for (const [k, val] of Object.entries(raw.opts ?? {})) if (['string', 'number', 'boolean'].includes(typeof val)) opts[k] = val as string | number | boolean
    return { v: 1, ids: raw.ids.slice(0, 6), mode: raw.mode as Mode, opts, seed: Number.isFinite(raw.seed) ? Number(raw.seed) >>> 0 : 1 }
  } catch {
    return null
  }
}
