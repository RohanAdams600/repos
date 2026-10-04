import 'server-only'
import { Storage } from '@google-cloud/storage'
import { requireEnv } from '@/lib/env'
import { VIDEO_UPLOAD_POLICY } from '@/lib/storage/video-files'

/**
 * Private Google Cloud Storage bucket for uploaded videos. The bucket has uniform bucket-level
 * access, no public principals, and a CORS rule allowing PUT from APP_URL only (infra/gcs-cors.json).
 * Browsers never receive credentials, only short-lived V4 signed URLs scoped to one object.
 */

let storage: Storage | undefined

function client(): Storage {
  if (!storage) {
    const { GCP_PROJECT_ID } = requireEnv('Video storage', ['GCP_PROJECT_ID', 'GCS_UPLOAD_BUCKET'])
    const keyB64 = process.env.GCP_SERVICE_ACCOUNT_KEY_B64
    storage = new Storage({
      projectId: GCP_PROJECT_ID,
      ...(keyB64 ? { credentials: JSON.parse(Buffer.from(keyB64, 'base64').toString('utf8')) } : {}),
      retryOptions: { autoRetry: true, maxRetries: 3 },
    })
  }
  return storage
}

function bucket() {
  const { GCS_UPLOAD_BUCKET } = requireEnv('Video storage', ['GCS_UPLOAD_BUCKET'])
  return client().bucket(GCS_UPLOAD_BUCKET)
}

export function gcsUri(objectKey: string): string {
  const { GCS_UPLOAD_BUCKET } = requireEnv('Video storage', ['GCS_UPLOAD_BUCKET'])
  return `gs://${GCS_UPLOAD_BUCKET}/${objectKey}`
}

export type SignedUpload = { url: string; headers: Record<string, string>; expiresAt: string }

/**
 * Signed PUT URL. The x-goog-content-length-range extension header is part of the signature, so
 * Cloud Storage itself rejects any body larger than the declared size cap.
 */
export async function createSignedUpload(objectKey: string, contentType: string, sizeBytes: number): Promise<SignedUpload> {
  const expires = Date.now() + VIDEO_UPLOAD_POLICY.uploadUrlTtlSeconds * 1000
  const cap = Math.min(sizeBytes, VIDEO_UPLOAD_POLICY.maxBytes)
  const headers = { 'Content-Type': contentType, 'x-goog-content-length-range': `1,${cap}` }
  const [url] = await bucket()
    .file(objectKey)
    .getSignedUrl({
      version: 'v4',
      action: 'write',
      expires,
      contentType,
      extensionHeaders: { 'x-goog-content-length-range': headers['x-goog-content-length-range'] },
    })
  return { url, headers, expiresAt: new Date(expires).toISOString() }
}

export async function createSignedPlaybackUrl(objectKey: string, ttlSeconds = 15 * 60): Promise<string> {
  const [url] = await bucket()
    .file(objectKey)
    .getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + ttlSeconds * 1000 })
  return url
}

export async function getObjectInfo(objectKey: string): Promise<{ exists: boolean; sizeBytes: number; contentType: string | null }> {
  const file = bucket().file(objectKey)
  const [exists] = await file.exists()
  if (!exists) return { exists: false, sizeBytes: 0, contentType: null }
  const [metadata] = await file.getMetadata()
  return { exists: true, sizeBytes: Number(metadata.size ?? 0), contentType: metadata.contentType ?? null }
}

export async function readObjectHead(objectKey: string, bytes = 64): Promise<Uint8Array> {
  const [buffer] = await bucket().file(objectKey).download({ start: 0, end: bytes - 1 })
  return new Uint8Array(buffer)
}

export async function deleteObject(objectKey: string): Promise<void> {
  await bucket().file(objectKey).delete({ ignoreNotFound: true })
}

/** Deletes every object under a prefix (used when an account is deleted). */
export async function deletePrefix(prefix: string): Promise<void> {
  if (!/^videos\/[0-9a-f-]{36}\/$/i.test(prefix)) throw new Error('Refusing to delete an unexpected prefix')
  await bucket().deleteFiles({ prefix, force: true })
}
