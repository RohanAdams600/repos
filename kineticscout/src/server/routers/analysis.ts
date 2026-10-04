import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { Handedness, MotionType } from '@/generated/prisma/enums'
import { startOfUtcMonth } from '@/lib/ai/budget'
import { audit } from '@/lib/audit'
import type { ProjectileEstimate } from '@/lib/biomechanics/projectile'
import type { CompactPoseTrack, KinematicReport } from '@/lib/biomechanics/types'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { errorFields, logger } from '@/lib/logger'
import { enqueueVideoAnalysis } from '@/lib/queue/queues'
import { createSignedPlaybackUrl, createSignedUpload, deleteObject, getObjectInfo, readObjectHead } from '@/lib/storage/gcs'
import { extensionFor, isAllowedVideoType, sniffVideoContainer, VIDEO_UPLOAD_POLICY } from '@/lib/storage/video-files'
import { enforceRateLimit, RateLimitError } from '@/lib/security/rate-limit'
import { playableReferenceWhere } from '@/lib/reference/service'
import { isMotionForSport, MOTION_LABELS, motionsForSport } from '@/lib/biomechanics/motions'
import { createRouter, proProcedure } from '@/server/trpc'

const videoProcedure = proProcedure('video-analysis')

export const analysisRouter = createRouter({
  /** Step 1: validate the declared file and hand back a short-lived signed upload URL. */
  createUpload: videoProcedure
    .input(
      z.object({
        motionType: z.enum(MotionType),
        handedness: z.enum(Handedness),
        contentType: z.string().max(64),
        sizeBytes: z.number().int().positive(),
        durationMs: z.number().int().positive(),
        width: z.number().int().min(160).max(8192),
        height: z.number().int().min(160).max(8192),
        /** Puck or ball tracking (beta). */
        trackObject: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await enforceRateLimit('upload', ctx.user.id)
      } catch (error) {
        if (error instanceof RateLimitError) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Upload limit reached. Try again in an hour.' })
        throw error
      }
      if (!isAllowedVideoType(input.contentType)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Upload an MP4 or MOV video.' })
      const profile = await db.athleteProfile.findUniqueOrThrow({ where: { userId: ctx.user.id }, select: { sport: true } })
      if (!isMotionForSport(input.motionType, profile.sport)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Choose a ${motionsForSport(profile.sport).map((m) => MOTION_LABELS[m].toLowerCase()).join(' or ')} for your sport.` })
      }
      if (input.sizeBytes > VIDEO_UPLOAD_POLICY.maxBytes) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Videos must be 150 MB or smaller.' })
      if (input.durationMs > VIDEO_UPLOAD_POLICY.maxDurationMs) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Trim the clip to 20 seconds or less.' })
      if (input.durationMs < VIDEO_UPLOAD_POLICY.minDurationMs) throw new TRPCError({ code: 'BAD_REQUEST', message: 'The clip must be at least 1 second long.' })

      const usedThisMonth = await db.videoAnalysis.count({
        where: { athleteId: ctx.user.id, createdAt: { gte: startOfUtcMonth() }, status: { not: 'AWAITING_UPLOAD' } },
      })
      if (usedThisMonth >= env().VIDEO_ANALYSES_PER_MONTH) {
        throw new TRPCError({ code: 'FORBIDDEN', message: `You have used all ${env().VIDEO_ANALYSES_PER_MONTH} analyses for this month.` })
      }

      const analysis = await db.videoAnalysis.create({
        data: {
          athleteId: ctx.user.id,
          motionType: input.motionType,
          handedness: input.handedness,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
          durationMs: input.durationMs,
          widthPx: input.width,
          heightPx: input.height,
          trackObject: input.trackObject,
          // Object key is server-generated: no user-controlled path segments.
          objectKey: `pending/${crypto.randomUUID()}`,
        },
        select: { id: true },
      })
      const objectKey = `videos/${ctx.user.id}/${analysis.id}.${extensionFor(input.contentType)}`
      await db.videoAnalysis.update({ where: { id: analysis.id }, data: { objectKey } })
      const upload = await createSignedUpload(objectKey, input.contentType, input.sizeBytes)
      return { analysisId: analysis.id, upload }
    }),

  /** Step 2: confirm the object landed, check its real size and magic bytes, then queue analysis. */
  completeUpload: videoProcedure.input(z.object({ analysisId: z.uuid() })).mutation(async ({ ctx, input }) => {
    const analysis = await db.videoAnalysis.findFirst({
      where: { id: input.analysisId, athleteId: ctx.user.id },
      select: { id: true, status: true, objectKey: true, sizeBytes: true },
    })
    if (!analysis) throw new TRPCError({ code: 'NOT_FOUND', message: 'Upload not found.' })
    if (analysis.status !== 'AWAITING_UPLOAD') return { status: analysis.status }

    const info = await getObjectInfo(analysis.objectKey)
    const reject = async (reason: string, message: string) => {
      await deleteObject(analysis.objectKey)
      await db.videoAnalysis.update({ where: { id: analysis.id }, data: { status: 'FAILED', errorCode: 'UNSUPPORTED_FILE' } })
      await audit('upload.rejected', { actorId: ctx.user.id, targetType: 'video_analysis', targetId: analysis.id, metadata: { reason } })
      throw new TRPCError({ code: 'BAD_REQUEST', message })
    }
    if (!info.exists) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'The upload has not finished yet.' })
    if (info.sizeBytes > Math.min(analysis.sizeBytes, VIDEO_UPLOAD_POLICY.maxBytes)) await reject('size-mismatch', 'The uploaded file is larger than declared.')
    if (!sniffVideoContainer(await readObjectHead(analysis.objectKey))) await reject('magic-bytes', 'That file is not a valid MP4 or MOV video.')

    await db.videoAnalysis.update({ where: { id: analysis.id }, data: { status: 'QUEUED', sizeBytes: info.sizeBytes } })
    try {
      await enqueueVideoAnalysis(analysis.id)
    } catch (error) {
      // The worker's reconciliation sweep re-enqueues QUEUED rows, so the athlete is not stuck.
      logger.error({ analysisId: analysis.id, ...errorFields(error) }, 'enqueue failed; sweep will retry')
    }
    return { status: 'QUEUED' as const }
  }),

  list: videoProcedure
    .input(z.object({ cursor: z.uuid().nullish(), limit: z.number().int().min(1).max(25).default(10) }))
    .query(async ({ ctx, input }) => {
      const rows = await db.videoAnalysis.findMany({
        where: { athleteId: ctx.user.id, status: { not: 'AWAITING_UPLOAD' } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: { id: true, motionType: true, status: true, errorCode: true, createdAt: true, report: true },
      })
      const page = rows.slice(0, input.limit)
      return {
        items: page.map((row) => {
          const report = row.report as KinematicReport | null
          return {
            id: row.id,
            motionType: row.motionType,
            status: row.status,
            errorCode: row.errorCode,
            createdAt: row.createdAt.toISOString(),
            sequenceIsIdeal: report?.sequenceIsIdeal ?? null,
            findingCount: report?.findings.length ?? null,
          }
        }),
        nextCursor: rows.length > input.limit ? (page[page.length - 1]?.id ?? null) : null,
      }
    }),

  get: videoProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
    const row = await db.videoAnalysis.findFirst({
      where: { id: input.id, athleteId: ctx.user.id },
      select: { id: true, motionType: true, handedness: true, status: true, errorCode: true, createdAt: true, objectKey: true, report: true, poseData: true, trackObject: true, projectile: true },
    })
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Analysis not found.' })
    const playable = row.status === 'COMPLETE' && row.errorCode !== 'VIDEO_PURGED'
    return {
      id: row.id,
      motionType: row.motionType,
      handedness: row.handedness,
      status: row.status,
      errorCode: row.errorCode,
      createdAt: row.createdAt.toISOString(),
      report: row.report as KinematicReport | null,
      pose: row.poseData as CompactPoseTrack | null,
      trackObject: row.trackObject,
      projectile: row.projectile as ProjectileEstimate | null,
      videoUrl: playable ? await createSignedPlaybackUrl(row.objectKey) : null,
    }
  }),

  /** What this analysis can be compared with: the athlete's other synced clips and licensed reference clips. */
  compareOptions: videoProcedure.input(z.object({ analysisId: z.uuid() })).query(async ({ ctx, input }) => {
    const base = await db.videoAnalysis.findFirst({ where: { id: input.analysisId, athleteId: ctx.user.id }, select: { motionType: true, status: true, report: true, errorCode: true } })
    if (!base) throw new TRPCError({ code: 'NOT_FOUND', message: 'Analysis not found.' })
    // Every completed analysis has a hand peak, so it can be synced (on foot strike when both clips have one).
    const syncable = base.status === 'COMPLETE' && base.errorCode !== 'VIDEO_PURGED' && base.report !== null
    const [own, references] = await Promise.all([
      db.videoAnalysis.findMany({
        where: { athleteId: ctx.user.id, motionType: base.motionType, status: 'COMPLETE', id: { not: input.analysisId }, OR: [{ errorCode: null }, { errorCode: { not: 'VIDEO_PURGED' } }] },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, createdAt: true, handedness: true, report: true },
      }),
      db.referenceClip.findMany({ where: playableReferenceWhere(base.motionType), orderBy: { playerName: 'asc' }, select: { id: true, title: true, playerName: true, level: true, handedness: true, attribution: true } }),
    ])
    return {
      syncable,
      own: own.filter((o) => o.report !== null).map((o) => ({ id: o.id, createdAt: o.createdAt.toISOString(), handedness: o.handedness })),
      references,
    }
  }),

  comparison: videoProcedure
    .input(z.object({ analysisId: z.uuid(), other: z.object({ kind: z.enum(['own', 'reference']), id: z.uuid() }) }))
    .query(async ({ ctx, input }) => {
      const select = { id: true, handedness: true, objectKey: true, report: true, poseData: true, createdAt: true } as const
      const base = await db.videoAnalysis.findFirst({ where: { id: input.analysisId, athleteId: ctx.user.id, status: 'COMPLETE' }, select: { ...select, errorCode: true } })
      if (!base || base.errorCode === 'VIDEO_PURGED' || !base.poseData) throw new TRPCError({ code: 'NOT_FOUND', message: 'Analysis not found.' })
      if (!base.report) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'This analysis has no report to compare.' })

      type Side = { label: string; videoUrl: string; pose: CompactPoseTrack; report: KinematicReport; handedness: 'RIGHT' | 'LEFT'; attribution: string | null }
      const side = async (row: { objectKey: string; poseData: unknown; report: unknown; handedness: 'RIGHT' | 'LEFT' }, label: string, attribution: string | null): Promise<Side> => ({
        label,
        videoUrl: await createSignedPlaybackUrl(row.objectKey),
        pose: row.poseData as CompactPoseTrack,
        report: row.report as KinematicReport,
        handedness: row.handedness,
        attribution,
      })

      let other: Side
      if (input.other.kind === 'own') {
        const row = await db.videoAnalysis.findFirst({ where: { id: input.other.id, athleteId: ctx.user.id, status: 'COMPLETE' }, select: { ...select, errorCode: true } })
        if (!row || row.errorCode === 'VIDEO_PURGED' || !row.poseData || !row.report) throw new TRPCError({ code: 'NOT_FOUND', message: 'That clip cannot be compared.' })
        other = await side(row, `Your clip from ${row.createdAt.toISOString().slice(0, 10)}`, null)
      } else {
        // Playable only while active, processed and licensed: checked again on every request.
        const clip = await db.referenceClip.findFirst({
          where: { id: input.other.id, ...playableReferenceWhere((await db.videoAnalysis.findUniqueOrThrow({ where: { id: base.id }, select: { motionType: true } })).motionType) },
          select: { objectKey: true, poseData: true, report: true, handedness: true, playerName: true, level: true, attribution: true },
        })
        if (!clip?.poseData || !clip.report) throw new TRPCError({ code: 'NOT_FOUND', message: 'That reference clip is not available.' })
        other = await side(clip, `${clip.playerName} (${clip.level})`, clip.attribution)
      }
      return { a: await side(base, `Your clip from ${base.createdAt.toISOString().slice(0, 10)}`, null), b: other }
    }),
})
