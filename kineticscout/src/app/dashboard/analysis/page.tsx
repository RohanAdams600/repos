import type { Metadata } from 'next'
import { AnalysisList } from '@/components/dashboard/analysis-list'
import { VideoUpload } from '@/components/dashboard/video-upload'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { requirePro } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { analysisMessages } from '@/i18n/messages/analysis'
import { messages } from '@/i18n/server'
import { accountMessages } from '@/i18n/messages/account'
import { env } from '@/lib/env'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(analysisMessages)).title }
}

export default async function AnalysisPage() {
  const user = await requirePro('video-analysis', '/dashboard/analysis')
  const m = await messages(analysisMessages)
  const dash = (await messages(accountMessages)).dashboard
  const { sport } = await db.athleteProfile.findUniqueOrThrow({ where: { userId: user.id }, select: { sport: true } })
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: dash, href: '/dashboard' }, { label: m.title }]} />
        <h1 className="text-3xl font-bold">{m.h1}</h1>
      </div>
      <VideoUpload monthlyLimit={env().VIDEO_ANALYSES_PER_MONTH} sport={sport} />
      <AnalysisList />
    </div>
  )
}
