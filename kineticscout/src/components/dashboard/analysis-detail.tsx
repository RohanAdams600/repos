'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { KinematicReportView } from '@/components/dashboard/kinematic-report'
import { PoseOverlayPlayer } from '@/components/dashboard/pose-overlay-player'
import { ProjectilePanel } from '@/components/dashboard/projectile-panel'
import { Alert } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useMessages } from '@/i18n/client'
import { analysisMessages } from '@/i18n/messages/analysis'
import { errorMessage, useTRPC } from '@/trpc/client'

export function AnalysisDetail({ id }: { id: string }) {
  const trpc = useTRPC()
  const query = useQuery(
    trpc.analysis.get.queryOptions(
      { id },
      { refetchInterval: (q) => (q.state.data && (q.state.data.status === 'QUEUED' || q.state.data.status === 'PROCESSING') ? 4_000 : false) },
    ),
  )

  const t = useMessages(analysisMessages)
  const m = t.detail
  if (query.isPending) return <Spinner label={m.loading} />
  if (query.isError) return <Alert tone="error">{errorMessage(query.error)}</Alert>
  const analysis = query.data

  if (analysis.status === 'QUEUED' || analysis.status === 'PROCESSING') {
    return (
      <div className="flex flex-col gap-3 border-2 border-border-subtle p-6" aria-live="polite">
        <Spinner label={t.status[analysis.status]} />
        <p className="font-bold">{t.status[analysis.status]}</p>
        <p className="text-fg-muted">{m.wait}</p>
      </div>
    )
  }
  if (analysis.status === 'FAILED') {
    const failure = t.failures[analysis.errorCode ?? ''] ?? t.failures.PROCESSING_ERROR!
    return (
      <Alert tone="error" title={failure.title}>
        {failure.help} <Link href="/dashboard/analysis">{m.another}</Link>
      </Alert>
    )
  }
  if (!analysis.report) return <Alert tone="error">{m.noReport}</Alert>

  return (
    <div className="flex flex-col gap-8">
      {analysis.videoUrl && analysis.pose ? (
        <PoseOverlayPlayer videoUrl={analysis.videoUrl} pose={analysis.pose} footStrikeTime={analysis.report.footStrikeTime} trajectory={analysis.projectile?.points} />
      ) : (
        <p className="text-fg-muted">{m.deleted}</p>
      )}
      {analysis.videoUrl && (
        <Link href={`/dashboard/analysis/${analysis.id}/compare`} className={buttonVariants({ variant: 'secondary' })}>
          {m.compare}
        </Link>
      )}
      {analysis.projectile && <ProjectilePanel estimate={analysis.projectile} noun={t.projectile.noun[analysis.motionType]} />}
      <KinematicReportView report={analysis.report} motion={analysis.motionType} />
    </div>
  )
}
