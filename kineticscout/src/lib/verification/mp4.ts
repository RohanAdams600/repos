/**
 * Minimal ISO base media (MP4 / QuickTime) reader: finds top-level boxes and reads the movie
 * header (mvhd) for duration and creation time. Pure functions over bytes; no dependencies.
 */

export type BoxRef = { type: string; start: number; size: number; headerSize: number }

/** Reads one box header at `offset`. `readAt` returns up to 16 bytes from the file. */
export async function readBoxHeader(readAt: (start: number, length: number) => Promise<Uint8Array>, offset: number, fileSize: number): Promise<BoxRef | null> {
  if (offset + 8 > fileSize) return null
  const head = await readAt(offset, Math.min(16, fileSize - offset))
  if (head.length < 8) return null
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength)
  let size = view.getUint32(0)
  const type = String.fromCharCode(head[4]!, head[5]!, head[6]!, head[7]!)
  let headerSize = 8
  if (size === 1) {
    if (head.length < 16) return null
    size = Number(view.getBigUint64(8))
    headerSize = 16
  } else if (size === 0) {
    size = fileSize - offset
  }
  if (size < headerSize || offset + size > fileSize || !/^[\x20-\x7e]{4}$/.test(type)) return null
  return { type, start: offset, size, headerSize }
}

/** Walks the top-level boxes (at most `maxBoxes`) and returns the moov box, which may sit after mdat. */
export async function findMoovBox(readAt: (start: number, length: number) => Promise<Uint8Array>, fileSize: number, maxBoxes = 64): Promise<BoxRef | null> {
  let offset = 0
  for (let i = 0; i < maxBoxes; i++) {
    const box = await readBoxHeader(readAt, offset, fileSize)
    if (!box) return null
    if (box.type === 'moov') return box
    offset += box.size
  }
  return null
}

/** Seconds between the MP4 epoch (1904-01-01) and the Unix epoch. */
const MP4_EPOCH_OFFSET = 2_082_844_800

export type MovieHeader = { durationMs: number | null; createdAt: Date | null }

/** Parses mvhd inside a moov payload (the bytes after the moov header). */
export function parseMovieHeader(moovPayload: Uint8Array, now: Date = new Date()): MovieHeader | null {
  const view = new DataView(moovPayload.buffer, moovPayload.byteOffset, moovPayload.byteLength)
  let offset = 0
  while (offset + 8 <= moovPayload.length) {
    const size = view.getUint32(offset)
    const type = String.fromCharCode(moovPayload[offset + 4]!, moovPayload[offset + 5]!, moovPayload[offset + 6]!, moovPayload[offset + 7]!)
    if (size < 8 || offset + size > moovPayload.length) return null
    if (type === 'mvhd') {
      const body = offset + 8
      const version = moovPayload[body]
      let created: number
      let timescale: number
      let duration: number
      if (version === 1) {
        if (body + 32 > offset + size) return null
        created = Number(view.getBigUint64(body + 4))
        timescale = view.getUint32(body + 20)
        duration = Number(view.getBigUint64(body + 24))
      } else {
        if (body + 20 > offset + size) return null
        created = view.getUint32(body + 4)
        timescale = view.getUint32(body + 12)
        duration = view.getUint32(body + 16)
      }
      const unixSeconds = created - MP4_EPOCH_OFFSET
      // Cameras that never set a clock write 0 (1904) or a value in the future; treat both as unknown.
      const createdAt = created > 0 && unixSeconds > 946_684_800 && unixSeconds * 1000 <= now.getTime() + 86_400_000 ? new Date(unixSeconds * 1000) : null
      const durationMs = timescale > 0 && duration > 0 && duration !== 0xffffffff ? Math.round((duration / timescale) * 1000) : null
      return { durationMs, createdAt }
    }
    offset += size
  }
  return null
}
