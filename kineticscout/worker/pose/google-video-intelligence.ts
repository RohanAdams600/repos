import { VideoIntelligenceServiceClient, protos } from '@google-cloud/video-intelligence'
import type { ObjectTrackCandidate } from '@/lib/biomechanics/projectile'
import { KEYPOINT_NAMES, type KeypointName, type PoseFrame, type PoseTrack } from '@/lib/biomechanics/types'
import { requireEnv } from '@/lib/env'

export interface PoseEstimator {
  estimate(input: { gcsUri: string; aspectRatio: number }): Promise<PoseTrack>
  /** Pose plus labelled object tracks (puck or ball tracking). One API call, both features. */
  estimateWithObjects?(input: { gcsUri: string; aspectRatio: number }): Promise<{ track: PoseTrack; objects: ObjectTrackCandidate[] }>
}

type ObjectAnnotation = {
  entity?: { description?: string | null } | null
  confidence?: number | null
  frames?: { normalizedBoundingBox?: { left?: number | null; top?: number | null; right?: number | null; bottom?: number | null } | null; timeOffset?: unknown }[] | null
}

/** Maps Video Intelligence object annotations to candidates. Exported for tests. */
export function toObjectCandidates(annotations: readonly ObjectAnnotation[]): ObjectTrackCandidate[] {
  return annotations
    .filter((a) => a.entity?.description && a.frames?.length)
    .map((a) => ({
      label: a.entity!.description!,
      confidence: a.confidence ?? 0,
      observations: a.frames!.map((f) => ({
        t: seconds(f.timeOffset as Duration),
        box: { left: f.normalizedBoundingBox?.left ?? 0, top: f.normalizedBoundingBox?.top ?? 0, right: f.normalizedBoundingBox?.right ?? 0, bottom: f.normalizedBoundingBox?.bottom ?? 0 },
      })),
    }))
}

export class NoPersonDetectedError extends Error {
  constructor() {
    super('No person was tracked in the video')
    this.name = 'NoPersonDetectedError'
  }
}

type Duration = { seconds?: number | string | Long | null; nanos?: number | null } | null | undefined
type Long = { toNumber(): number }

function seconds(offset: Duration): number {
  if (!offset) return 0
  const s = offset.seconds
  const whole = typeof s === 'number' ? s : typeof s === 'string' ? Number(s) : s ? s.toNumber() : 0
  return whole + (offset.nanos ?? 0) / 1e9
}

const NAMES = new Set<string>(KEYPOINT_NAMES)

/**
 * Pose landmarks from Google Cloud Video Intelligence person detection.
 * The athlete is the person track with the most observations, which in a framed swing or pitch
 * clip is the subject; bystanders appear briefly or partially.
 */
export class GoogleVideoIntelligencePoseEstimator implements PoseEstimator {
  private readonly client: VideoIntelligenceServiceClient

  constructor() {
    const { GCP_PROJECT_ID } = requireEnv('Video Intelligence', ['GCP_PROJECT_ID'])
    const keyB64 = process.env.GCP_SERVICE_ACCOUNT_KEY_B64
    this.client = new VideoIntelligenceServiceClient({
      projectId: GCP_PROJECT_ID,
      ...(keyB64 ? { credentials: JSON.parse(Buffer.from(keyB64, 'base64').toString('utf8')) } : {}),
    })
  }

  async estimate({ gcsUri, aspectRatio }: { gcsUri: string; aspectRatio: number }): Promise<PoseTrack> {
    return (await this.run(gcsUri, aspectRatio, false)).track
  }

  async estimateWithObjects({ gcsUri, aspectRatio }: { gcsUri: string; aspectRatio: number }): Promise<{ track: PoseTrack; objects: ObjectTrackCandidate[] }> {
    return this.run(gcsUri, aspectRatio, true)
  }

  private async run(gcsUri: string, aspectRatio: number, trackObjects: boolean): Promise<{ track: PoseTrack; objects: ObjectTrackCandidate[] }> {
    const Feature = protos.google.cloud.videointelligence.v1.Feature
    const [operation] = await this.client.annotateVideo(
      {
        inputUri: gcsUri,
        features: trackObjects ? [Feature.PERSON_DETECTION, Feature.OBJECT_TRACKING] : [Feature.PERSON_DETECTION],
        videoContext: {
          personDetectionConfig: { includeBoundingBoxes: true, includePoseLandmarks: true, includeAttributes: false },
        },
      },
      { timeout: 60_000 },
    )
    const [response] = await operation.promise()
    const results = response.annotationResults ?? []
    const tracks = results.flatMap((r) => r.personDetectionAnnotations ?? []).flatMap((a) => a.tracks ?? [])
    const subject = tracks.sort((a, b) => (b.timestampedObjects?.length ?? 0) - (a.timestampedObjects?.length ?? 0))[0]
    if (!subject?.timestampedObjects?.length) throw new NoPersonDetectedError()

    const frames: PoseFrame[] = subject.timestampedObjects.map((obj) => {
      const keypoints: PoseFrame['keypoints'] = {}
      for (const landmark of obj.landmarks ?? []) {
        if (!landmark.name || !NAMES.has(landmark.name)) continue
        keypoints[landmark.name as KeypointName] = {
          x: landmark.point?.x ?? Number.NaN,
          y: landmark.point?.y ?? Number.NaN,
          score: landmark.confidence ?? 0,
        }
      }
      return { t: seconds(obj.timeOffset as Duration), keypoints }
    })
    const objects = trackObjects ? toObjectCandidates(results.flatMap((r) => (r.objectAnnotations ?? []) as ObjectAnnotation[])) : []
    return { track: { aspectRatio, frames }, objects }
  }
}
