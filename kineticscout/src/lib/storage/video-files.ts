/**
 * Upload policy for swing and pitch videos. Pure, shared by the browser uploader (for instant
 * feedback) and the server (for enforcement). The server never trusts the browser's checks.
 */

export const VIDEO_UPLOAD_POLICY = {
  maxBytes: 150 * 1024 * 1024,
  maxDurationMs: 20_000,
  minDurationMs: 1_000,
  allowedContentTypes: ['video/mp4', 'video/quicktime'] as const,
  /** Signed upload URLs expire quickly; the upload must start within this window. */
  uploadUrlTtlSeconds: 10 * 60,
} as const

export type AllowedVideoType = (typeof VIDEO_UPLOAD_POLICY.allowedContentTypes)[number]

export function isAllowedVideoType(contentType: string): contentType is AllowedVideoType {
  return (VIDEO_UPLOAD_POLICY.allowedContentTypes as readonly string[]).includes(contentType)
}

export function extensionFor(contentType: AllowedVideoType): 'mp4' | 'mov' {
  return contentType === 'video/quicktime' ? 'mov' : 'mp4'
}

const ISO_BMFF_BOX_TYPES = new Set(['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip', 'pnot'])

/**
 * Identifies the container from the first bytes of the file (magic numbers), independent of the
 * declared Content-Type or file name. Returns null for anything that is not MP4 or QuickTime.
 */
export function sniffVideoContainer(head: Uint8Array): 'mp4' | 'quicktime' | null {
  if (head.length < 12) return null
  const boxType = String.fromCharCode(head[4]!, head[5]!, head[6]!, head[7]!)
  if (!ISO_BMFF_BOX_TYPES.has(boxType)) return null
  if (boxType === 'ftyp') {
    const brand = String.fromCharCode(head[8]!, head[9]!, head[10]!, head[11]!)
    return brand === 'qt  ' ? 'quicktime' : 'mp4'
  }
  return 'quicktime'
}
