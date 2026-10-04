/** Plain-language guidance for each analysis failure code produced by the worker. */
export const ANALYSIS_FAILURES: Record<string, { title: string; help: string }> = {
  FILE_MISSING: { title: 'The upload did not finish', help: 'Upload the video again.' },
  UNSUPPORTED_FILE: { title: 'That file is not a supported video', help: 'Export the clip as MP4 or MOV and upload it again.' },
  FILE_TOO_LARGE: { title: 'The file is too large', help: 'Trim the clip to just the motion (20 seconds or less).' },
  NO_PERSON: { title: 'No athlete was detected', help: 'Make sure your whole body is in frame and well lit, with no one else in the shot.' },
  POSE_INCOMPLETE: {
    title: 'Not enough of the body was visible',
    help: 'Hips, shoulders, arms and ankles must stay in frame for the whole motion. Film from a little further back.',
  },
  BUDGET_EXHAUSTED: { title: 'Analysis is paused for this month', help: 'Your monthly analysis allowance is used up. It resets on the 1st.' },
  PROCESSING_ERROR: { title: 'We could not finish the analysis', help: 'This was a problem on our side. Upload the clip again in a few minutes.' },
  UPLOAD_EXPIRED: { title: 'The upload expired', help: 'The upload was never completed. Start a new upload.' },
}

export const STATUS_LABELS: Record<string, string> = {
  AWAITING_UPLOAD: 'Waiting for upload',
  QUEUED: 'Queued',
  PROCESSING: 'Analyzing',
  COMPLETE: 'Complete',
  FAILED: 'Failed',
}
