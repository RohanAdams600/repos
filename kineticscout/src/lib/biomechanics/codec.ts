import { KEYPOINT_NAMES, type CompactPoseTrack, type PoseFrame, type PoseTrack } from '@/lib/biomechanics/types'

const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places

/** Packs a pose track into fixed-width rows (about 10x smaller than the object form as JSON). */
export function encodePoseTrack(track: PoseTrack): CompactPoseTrack {
  return {
    v: 1,
    aspectRatio: round(track.aspectRatio, 4),
    rows: track.frames.map((frame) => {
      const row: number[] = [round(frame.t, 4)]
      for (const name of KEYPOINT_NAMES) {
        const kp = frame.keypoints[name]
        if (kp) row.push(round(kp.x, 4), round(kp.y, 4), round(kp.score, 2))
        else row.push(-1, -1, -1)
      }
      return row
    }),
  }
}

export function decodePoseTrack(compact: CompactPoseTrack): PoseTrack {
  if (compact.v !== 1) throw new Error(`Unsupported pose track version ${String(compact.v)}`)
  const frames: PoseFrame[] = compact.rows.map((row) => {
    const keypoints: PoseFrame['keypoints'] = {}
    KEYPOINT_NAMES.forEach((name, i) => {
      const x = row[1 + i * 3]
      const y = row[2 + i * 3]
      const score = row[3 + i * 3]
      if (x !== undefined && y !== undefined && score !== undefined && score >= 0) keypoints[name] = { x, y, score }
    })
    return { t: row[0] ?? 0, keypoints }
  })
  return { aspectRatio: compact.aspectRatio, frames }
}

/** Skeleton edges drawn by the overlay player. */
export const SKELETON_EDGES: readonly [(typeof KEYPOINT_NAMES)[number], (typeof KEYPOINT_NAMES)[number]][] = [
  ['left_shoulder', 'right_shoulder'],
  ['left_hip', 'right_hip'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'],
  ['right_elbow', 'right_wrist'],
  ['left_hip', 'left_knee'],
  ['left_knee', 'left_ankle'],
  ['right_hip', 'right_knee'],
  ['right_knee', 'right_ankle'],
]
