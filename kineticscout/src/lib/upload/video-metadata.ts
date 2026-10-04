export type VideoMeta = { durationMs: number; width: number; height: number }

/** Reads duration and dimensions locally from the file before anything is uploaded. */
export function readVideoMetadata(file: File): Promise<VideoMeta> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    const cleanup = () => URL.revokeObjectURL(url)
    video.onloadedmetadata = () => {
      const meta = { durationMs: Math.round(video.duration * 1000), width: video.videoWidth, height: video.videoHeight }
      cleanup()
      if (!Number.isFinite(meta.durationMs) || !meta.width || !meta.height) reject(new Error('unreadable'))
      else resolve(meta)
    }
    video.onerror = () => {
      cleanup()
      reject(new Error('unreadable'))
    }
    video.src = url
  })
}
