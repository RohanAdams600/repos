import type { Metadata } from 'next'
import { AnalysisList } from '@/components/dashboard/analysis-list'
import { VideoUpload } from '@/components/dashboard/video-upload'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { requirePro } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { env } from '@/lib/env'

export const metadata: Metadata = { title: 'Video analysis' }

export default async function AnalysisPage() {
  const user = await requirePro('video-analysis', '/dashboard/analysis')
  const { sport } = await db.athleteProfile.findUniqueOrThrow({ where: { userId: user.id }, select: { sport: true } })
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Video analysis' }]} />
        <h1 className="text-3xl font-bold">AI biomechanics video analysis</h1>
      </div>
      <VideoUpload monthlyLimit={env().VIDEO_ANALYSES_PER_MONTH} sport={sport} />
      <AnalysisList />
    </div>
  )
}
