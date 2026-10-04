import { VideoIntelligenceServiceClient, protos } from '@google-cloud/video-intelligence'
import { KEYPOINT_NAMES, type KeypointName, type PoseFrame, type PoseTrack } from '@/lib/biomechanics/types'
import { requireEnv } from '@/lib/env'

export interface PoseEstimator {
  estimate(input: { gcsUri: string; aspectRatio: number }): Promise<PoseTrack>
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
    const [operation] = await this.client.annotateVideo(
      {
        inputUri: gcsUri,
        features: [protos.google.cloud.videointelligence.v1.Feature.PERSON_DETECTION],
        videoContext: {
          personDetectionConfig: { includeBoundingBoxes: true, includePoseLandmarks: true, includeAttributes: false },
        },
      },
      { timeout: 60_000 },
    )
    const [response] = await operation.promise()
    const tracks = response.annotationResults?.[0]?.personDetectionAnnotations?.flatMap((a) => a.tracks ?? []) ?? []
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
    return { aspectRatio, frames }
  }
}
