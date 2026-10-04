import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { RecruitingAssistant } from '@/components/recruiting/recruiting-assistant'
import { Alert } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'
import { canDraftOutreach, hasProAccess } from '@/lib/auth/permissions'
import { requireAthlete } from '@/lib/auth/session'

export const metadata: Metadata = { title: 'Recruiting assistant' }

export default async function RecruitingPage() {
  const user = await requireAthlete('/dashboard/recruiting')
  if (user.role !== 'ATHLETE') redirect('/dashboard')
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Recruiting assistant' }]} />
        <h1 className="text-3xl font-bold">Recruiting assistant</h1>
        <p className="text-fg-muted">
          Watches the programs in your pipeline and drafts introductions from your real numbers and sourced program facts. You review, edit and
          send every message yourself; KineticScout never contacts coaches for you.
        </p>
      </div>
      {canDraftOutreach(user) ? (
        <RecruitingAssistant />
      ) : !hasProAccess(user) ? (
        <div className="flex flex-col items-start gap-3 border-2 border-border-subtle p-6">
          <p>The recruiting assistant is part of Pro.</p>
          <Link href="/pricing?feature=outreach" className={buttonVariants({ variant: 'primary' })}>
            See Pro
          </Link>
        </div>
      ) : (
        <Alert tone="info">A parent or guardian must give consent before you can contact college coaches.</Alert>
      )}
    </div>
  )
}
