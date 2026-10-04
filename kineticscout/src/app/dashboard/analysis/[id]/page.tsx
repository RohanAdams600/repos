import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AnalysisDetail } from '@/components/dashboard/analysis-detail'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { requirePro } from '@/lib/auth/session'

export const metadata: Metadata = { title: 'Analysis report' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function AnalysisDetailPage({ params }: PageProps<'/dashboard/analysis/[id]'>) {
  const { id } = await params
  await requirePro('video-analysis', `/dashboard/analysis/${id}`)
  if (!UUID.test(id)) notFound()
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Video analysis', href: '/dashboard/analysis' }, { label: 'Report' }]} />
        <h1 className="text-3xl font-bold">Analysis report</h1>
      </div>
      <AnalysisDetail id={id} />
      <p>
        <Link href="/dashboard/training">Build a training plan</Link> from this analysis&apos;s focus areas.
      </p>
    </div>
  )
}
