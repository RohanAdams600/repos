/** Builds a minimal ISO BMFF file: ftyp, mdat and moov (with mvhd), in the given order. */
function box(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length)
  new DataView(out.buffer).setUint32(0, out.length)
  out.set([...type].map((c) => c.charCodeAt(0)), 4)
  out.set(payload, 8)
  return out
}

const MP4_EPOCH_OFFSET = 2_082_844_800

export function syntheticMp4(options: { createdAt?: Date | null; durationSec?: number; moovFirst?: boolean; version?: 0 | 1; mdatBytes?: number } = {}): Uint8Array {
  const timescale = 1000
  const created = options.createdAt ? Math.floor(options.createdAt.getTime() / 1000) + MP4_EPOCH_OFFSET : 0
  const duration = Math.round((options.durationSec ?? 8) * timescale)
  const version = options.version ?? 0
  const mvhdPayload = new Uint8Array(version === 1 ? 112 : 100)
  const view = new DataView(mvhdPayload.buffer)
  mvhdPayload[0] = version
  if (version === 1) {
    view.setBigUint64(4, BigInt(created))
    view.setBigUint64(12, BigInt(created))
    view.setUint32(20, timescale)
    view.setBigUint64(24, BigInt(duration))
  } else {
    view.setUint32(4, created)
    view.setUint32(8, created)
    view.setUint32(12, timescale)
    view.setUint32(16, duration)
  }
  const ftyp = box('ftyp', new Uint8Array([...'isom'].map((c) => c.charCodeAt(0)).concat([0, 0, 2, 0])))
  const moov = box('moov', box('mvhd', mvhdPayload))
  const mdat = box('mdat', new Uint8Array(options.mdatBytes ?? 256).fill(7))
  const parts = options.moovFirst ? [ftyp, moov, mdat] : [ftyp, mdat, moov]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}
