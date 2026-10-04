import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AnalysisDetail } from '@/components/dashboard/analysis-detail'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { analysisMessages } from '@/i18n/messages/analysis'
import { messages } from '@/i18n/server'
import { accountMessages } from '@/i18n/messages/account'
import { requirePro } from '@/lib/auth/session'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(analysisMessages)).reportTitle }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function AnalysisDetailPage({ params }: PageProps<'/dashboard/analysis/[id]'>) {
  const { id } = await params
  await requirePro('video-analysis', `/dashboard/analysis/${id}`)
  if (!UUID.test(id)) notFound()
  const m = await messages(analysisMessages)
  const dash = (await messages(accountMessages)).dashboard
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: dash, href: '/dashboard' }, { label: m.title, href: '/dashboard/analysis' }, { label: m.report }]} />
        <h1 className="text-3xl font-bold">{m.reportTitle}</h1>
      </div>
      <AnalysisDetail id={id} />
      <p>
        <Link href="/dashboard/training">{m.buildPlan}</Link>
        {m.buildPlanTail}
      </p>
    </div>
  )
}
