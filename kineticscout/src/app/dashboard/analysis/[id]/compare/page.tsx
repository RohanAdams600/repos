import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ComparisonView } from '@/components/compare/comparison-view'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { requirePro } from '@/lib/auth/session'

export const metadata: Metadata = { title: 'Side-by-side comparison' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function ComparePage({ params }: PageProps<'/dashboard/analysis/[id]/compare'>) {
  const { id } = await params
  await requirePro('video-analysis', `/dashboard/analysis/${id}/compare`)
  if (!UUID.test(id)) notFound()
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs
          items={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Video analysis', href: '/dashboard/analysis' },
            { label: 'Report', href: `/dashboard/analysis/${id}` },
            { label: 'Compare' },
          ]}
        />
        <h1 className="text-3xl font-bold">Side-by-side comparison</h1>
        <p className="text-fg-muted">
          Both clips are lined up on the moment your front foot lands (or on peak hand speed when a foot strike is not visible, common on skates),
          then play together. Slow them down to see which body segment fires first.
        </p>
      </div>
      <ComparisonView analysisId={id} />
    </div>
  )
}
