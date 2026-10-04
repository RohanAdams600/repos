/** Evidence clips for metric verification. Pure; shared by the uploader and the server. */
export const EVIDENCE_POLICY = {
  maxBytes: 60 * 1024 * 1024,
  maxDurationMs: 60_000,
  allowedContentTypes: ['video/mp4', 'video/quicktime'] as const,
  /** Verification requests per athlete per calendar month (reviews are done by people). */
  monthlyRequests: 10,
  /** A recording time this far from the measurement date is flagged for the reviewer. */
  recordedWindowDays: 3,
  /** Evidence videos are deleted this long after the review decision; the decision and file hash remain. */
  retentionDaysAfterDecision: 30,
} as const

export const REJECTION_LABELS = {
  UNREADABLE_FILE: 'The file could not be read as a video.',
  DUPLICATE_VIDEO: 'This video was already submitted for a different athlete.',
  TOO_LONG: 'The clip is longer than 60 seconds.',
  VALUE_NOT_VISIBLE: 'The measured value is not clearly visible in the video.',
  VALUE_MISMATCH: 'The value shown in the video does not match the logged value.',
  WRONG_EVENT: 'The video does not show this measurement.',
  OTHER: 'The video could not be used to confirm this measurement.',
} as const
