import type { Metadata } from 'next'
import Link from 'next/link'
import { ManageBillingForm, ProCheckoutForms } from '@/components/billing/plan-forms'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { Alert } from '@/components/ui/alert'
import { canPurchase, hasProAccess } from '@/lib/auth/permissions'
import { requireUser } from '@/lib/auth/session'
import { pick } from '@/i18n/define'
import { accountMessages } from '@/i18n/messages/account'
import { formatDay } from '@/i18n/messages/domain'
import { getLocale, messages } from '@/i18n/server'
import { db } from '@/lib/db'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(accountMessages)).billing.title }
}

export default async function BillingPage({ searchParams }: PageProps<'/dashboard/billing'>) {
  const user = await requireUser('/dashboard/billing')
  const params = await searchParams
  const locale = await getLocale()
  const t = pick(accountMessages, locale)
  const m = t.billing
  const key = [params.checkout, params.notice, params.error].find((v): v is string => typeof v === 'string')
  const message = key ? m.notices[key] : undefined
  const subscription = await db.subscription.findFirst({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
    select: { status: true, interval: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
  })
  const pro = hasProAccess(user)

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: t.dashboard, href: '/dashboard' }, { label: m.title }]} />
        <h1 className="text-3xl font-bold">{m.title}</h1>
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <section aria-labelledby="plan-title" className="flex flex-col gap-3 border-2 border-border-subtle p-6">
        <h2 id="plan-title" className="text-xl font-bold">
          {m.current(pro)}
        </h2>
        {subscription && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
            <dt className="text-fg-muted">{m.status}</dt>
            <dd>{m.statuses[subscription.status] ?? subscription.status}</dd>
            <dt className="text-fg-muted">{m.billing}</dt>
            <dd>{subscription.interval === 'YEAR' ? m.yearly : m.monthly}</dd>
            {subscription.currentPeriodEnd && (
              <>
                <dt className="text-fg-muted">{subscription.cancelAtPeriodEnd ? m.ends : m.renews}</dt>
                <dd className="tabular">{formatDay(subscription.currentPeriodEnd, locale)}</dd>
              </>
            )}
          </dl>
        )}
        {subscription?.status === 'PAST_DUE' && (
          <Alert tone="error">{m.pastDue}</Alert>
        )}
        {pro || subscription ? (
          <div className="flex flex-col gap-2">
            <ManageBillingForm />
            <p className="text-sm text-fg-muted">{m.manageNote}</p>
          </div>
        ) : canPurchase(user) ? (
          <ProCheckoutForms />
        ) : user.role === 'GUARDIAN' || user.role === 'TEAM_COACH' ? (
          <Alert tone="info">{m.athleteOnly}</Alert>
        ) : (
          <Alert tone="info">{m.needConsent}</Alert>
        )}
      </section>
      <p className="text-sm text-fg-muted">
        {m.see} <Link href="/legal/refunds">{m.refunds}</Link>
        {m.stripe}
      </p>
    </div>
  )
}
