import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { RecruitingAssistant } from '@/components/recruiting/recruiting-assistant'
import { Alert } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'
import { canDraftOutreach, hasProAccess } from '@/lib/auth/permissions'
import { accountMessages } from '@/i18n/messages/account'
import { recruitingMessages } from '@/i18n/messages/recruiting'
import { messages } from '@/i18n/server'
import { requireAthlete } from '@/lib/auth/session'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(recruitingMessages)).assistant.title }
}

export default async function RecruitingPage() {
  const user = await requireAthlete('/dashboard/recruiting')
  if (user.role !== 'ATHLETE') redirect('/dashboard')
  const m = (await messages(recruitingMessages)).assistant
  const dash = (await messages(accountMessages)).dashboard
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: dash, href: '/dashboard' }, { label: m.title }]} />
        <h1 className="text-3xl font-bold">{m.title}</h1>
        <p className="text-fg-muted">{m.intro}</p>
        {m.draftLanguage && <p className="text-sm text-fg-muted">{m.draftLanguage}</p>}
      </div>
      {canDraftOutreach(user) ? (
        <RecruitingAssistant />
      ) : !hasProAccess(user) ? (
        <div className="flex flex-col items-start gap-3 border-2 border-border-subtle p-6">
          <p>{m.proOnly}</p>
          <Link href="/pricing?feature=outreach" className={buttonVariants({ variant: 'primary' })}>
            {m.seePro}
          </Link>
        </div>
      ) : (
        <Alert tone="info">{m.needConsent}</Alert>
      )}
    </div>
  )
}
