import 'server-only'
import type { Handedness, MotionType } from '@/generated/prisma/enums'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import { errorFields, logger } from '@/lib/logger'
import { enqueueReferenceClip } from '@/lib/queue/queues'
import { createSignedUpload, deleteObject, getObjectInfo, readObjectHead, type SignedUpload } from '@/lib/storage/gcs'
import { extensionFor, isAllowedVideoType, sniffVideoContainer, VIDEO_UPLOAD_POLICY } from '@/lib/storage/video-files'

/**
 * Licensed reference footage for side-by-side comparisons. A clip can only be created with its
 * licence recorded (licensor, licence reference, attribution; enforced by a database constraint)
 * and is playable only while active, processed and within its licence term.
 */

export type ReferenceClipInput = {
  title: string
  playerName: string
  level: string
  motionType: MotionType
  handedness: Handedness
  contentType: string
  sizeBytes: number
  durationMs: number
  width: number
  height: number
  licensor: string
  licenseReference: string
  licenseExpiresAt: Date | null
  attribution: string
}

export async function createReferenceUpload(actorId: string, input: ReferenceClipInput): Promise<{ clipId: string; upload: SignedUpload }> {
  if (!isAllowedVideoType(input.contentType)) throw new Error('Upload an MP4 or MOV video.')
  if (input.sizeBytes > VIDEO_UPLOAD_POLICY.maxBytes || input.durationMs > VIDEO_UPLOAD_POLICY.maxDurationMs) throw new Error('Reference clips follow the same 150 MB and 20 second limits as athlete videos.')
  const id = crypto.randomUUID()
  const objectKey = `reference/${id}.${extensionFor(input.contentType)}`
  await db.referenceClip.create({
    data: {
      id,
      title: input.title,
      playerName: input.playerName,
      level: input.level,
      motionType: input.motionType,
      handedness: input.handedness,
      objectKey,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      durationMs: input.durationMs,
      widthPx: input.width,
      heightPx: input.height,
      licensor: input.licensor,
      licenseReference: input.licenseReference,
      licenseExpiresAt: input.licenseExpiresAt,
      attribution: input.attribution,
      createdById: actorId,
    },
  })
  await audit('reference_clip.created', { actorId, targetType: 'reference_clip', targetId: id, metadata: { licensor: input.licensor, licenseReference: input.licenseReference } })
  return { clipId: id, upload: await createSignedUpload(objectKey, input.contentType, input.sizeBytes) }
}

export async function completeReferenceUpload(clipId: string): Promise<'PROCESSING'> {
  const clip = await db.referenceClip.findUniqueOrThrow({ where: { id: clipId }, select: { status: true, objectKey: true, sizeBytes: true } })
  if (clip.status !== 'AWAITING_UPLOAD') return 'PROCESSING'
  const info = await getObjectInfo(clip.objectKey)
  if (!info.exists) throw new Error('The upload has not finished yet.')
  if (info.sizeBytes > clip.sizeBytes || !sniffVideoContainer(await readObjectHead(clip.objectKey))) {
    await deleteObject(clip.objectKey)
    await db.referenceClip.update({ where: { id: clipId }, data: { status: 'FAILED', errorCode: 'UNSUPPORTED_FILE' } })
    throw new Error('That file is not a valid MP4 or MOV video.')
  }
  await db.referenceClip.update({ where: { id: clipId }, data: { status: 'PROCESSING', sizeBytes: info.sizeBytes } })
  try {
    await enqueueReferenceClip(clipId)
  } catch (error) {
    logger.error({ clipId, ...errorFields(error) }, 'reference clip enqueue failed')
  }
  return 'PROCESSING'
}

/** Clips an athlete may watch right now. */
export function playableReferenceWhere(motionType: MotionType, now: Date = new Date()) {
  return { motionType, active: true, status: 'READY' as const, OR: [{ licenseExpiresAt: null }, { licenseExpiresAt: { gt: now } }] }
}

export async function setReferenceClipActive(actorId: string, clipId: string, active: boolean): Promise<void> {
  const clip = await db.referenceClip.findUniqueOrThrow({ where: { id: clipId }, select: { status: true, licenseExpiresAt: true } })
  if (active && clip.status !== 'READY') throw new Error('Only processed clips can be activated.')
  if (active && clip.licenseExpiresAt && clip.licenseExpiresAt.getTime() <= Date.now()) throw new Error('The licence for this clip has expired.')
  await db.referenceClip.update({ where: { id: clipId }, data: { active } })
  await audit('reference_clip.updated', { actorId, targetType: 'reference_clip', targetId: clipId, metadata: { active } })
}

export async function deleteReferenceClip(actorId: string, clipId: string): Promise<void> {
  const clip = await db.referenceClip.findUniqueOrThrow({ where: { id: clipId }, select: { objectKey: true } })
  await deleteObject(clip.objectKey)
  await db.referenceClip.delete({ where: { id: clipId } })
  await audit('reference_clip.updated', { actorId, targetType: 'reference_clip', targetId: clipId, metadata: { deleted: true } })
}
