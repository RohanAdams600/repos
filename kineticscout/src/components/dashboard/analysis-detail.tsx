'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { ANALYSIS_FAILURES, STATUS_LABELS } from '@/components/dashboard/analysis-messages'
import { KinematicReportView } from '@/components/dashboard/kinematic-report'
import { PoseOverlayPlayer } from '@/components/dashboard/pose-overlay-player'
import { Alert } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import { errorMessage, useTRPC } from '@/trpc/client'

export function AnalysisDetail({ id }: { id: string }) {
  const trpc = useTRPC()
  const query = useQuery(
    trpc.analysis.get.queryOptions(
      { id },
      { refetchInterval: (q) => (q.state.data && (q.state.data.status === 'QUEUED' || q.state.data.status === 'PROCESSING') ? 4_000 : false) },
    ),
  )

  if (query.isPending) return <Spinner label="Loading analysis" />
  if (query.isError) return <Alert tone="error">{errorMessage(query.error)}</Alert>
  const analysis = query.data

  if (analysis.status === 'QUEUED' || analysis.status === 'PROCESSING') {
    return (
      <div className="flex flex-col gap-3 border-2 border-border-subtle p-6" aria-live="polite">
        <Spinner label={STATUS_LABELS[analysis.status]} />
        <p className="font-bold">{STATUS_LABELS[analysis.status]}</p>
        <p className="text-fg-muted">This usually takes one to three minutes. You can leave this page; results are saved to your history.</p>
      </div>
    )
  }
  if (analysis.status === 'FAILED') {
    const failure = ANALYSIS_FAILURES[analysis.errorCode ?? ''] ?? ANALYSIS_FAILURES.PROCESSING_ERROR!
    return (
      <Alert tone="error" title={failure.title}>
        {failure.help} <Link href="/dashboard/analysis">Upload another clip</Link>
      </Alert>
    )
  }
  if (!analysis.report) return <Alert tone="error">This analysis has no report.</Alert>

  return (
    <div className="flex flex-col gap-8">
      {analysis.videoUrl && analysis.pose ? (
        <PoseOverlayPlayer videoUrl={analysis.videoUrl} pose={analysis.pose} footStrikeTime={analysis.report.footStrikeTime} />
      ) : (
        <p className="text-fg-muted">The original video has been deleted under our retention policy. The report below is kept.</p>
      )}
      <KinematicReportView report={analysis.report} />
    </div>
  )
}
