import type { Metadata } from 'next'
import Link from 'next/link'
import { ManageBillingForm, ProCheckoutForms } from '@/components/billing/plan-forms'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { Alert } from '@/components/ui/alert'
import { canPurchase, hasProAccess } from '@/lib/auth/permissions'
import { requireUser } from '@/lib/auth/session'
import { db } from '@/lib/db'

export const metadata: Metadata = { title: 'Plan and billing' }

const MESSAGES: Record<string, { tone: 'success' | 'error' | 'info'; text: string }> = {
  success: { tone: 'success', text: 'Payment received. Pro features unlock as soon as Stripe confirms the subscription, usually within a few seconds. Refresh if they are not available yet.' },
  'already-subscribed': { tone: 'info', text: 'You already have an active subscription. Use the billing portal to change or cancel it.' },
  'guardian-consent': { tone: 'error', text: 'A parent or guardian must give consent before a purchase can be made on this account.' },
  'portal-unavailable': { tone: 'error', text: 'The billing portal is unavailable right now. Try again in a few minutes.' },
}

export default async function BillingPage({ searchParams }: PageProps<'/dashboard/billing'>) {
  const user = await requireUser('/dashboard/billing')
  const params = await searchParams
  const key = [params.checkout, params.notice, params.error].find((v): v is string => typeof v === 'string')
  const message = key ? MESSAGES[key] : undefined
  const subscription = await db.subscription.findFirst({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
    select: { status: true, interval: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
  })
  const pro = hasProAccess(user)

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Plan and billing' }]} />
        <h1 className="text-3xl font-bold">Plan and billing</h1>
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <section aria-labelledby="plan-title" className="flex flex-col gap-3 border-2 border-border-subtle p-6">
        <h2 id="plan-title" className="text-xl font-bold">
          Current plan: {pro ? 'Pro Prospect' : 'Scout (free)'}
        </h2>
        {subscription && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
            <dt className="text-fg-muted">Status</dt>
            <dd>{subscription.status.replace('_', ' ').toLowerCase()}</dd>
            <dt className="text-fg-muted">Billing</dt>
            <dd>{subscription.interval === 'YEAR' ? 'Yearly' : 'Monthly'}</dd>
            {subscription.currentPeriodEnd && (
              <>
                <dt className="text-fg-muted">{subscription.cancelAtPeriodEnd ? 'Access ends' : 'Renews'}</dt>
                <dd className="tabular">{subscription.currentPeriodEnd.toISOString().slice(0, 10)}</dd>
              </>
            )}
          </dl>
        )}
        {subscription?.status === 'PAST_DUE' && (
          <Alert tone="error">Your last payment failed. Update your card in the billing portal to keep Pro access.</Alert>
        )}
        {pro || subscription ? (
          <div className="flex flex-col gap-2">
            <ManageBillingForm />
            <p className="text-sm text-fg-muted">Change plan, update your card, download invoices, or cancel in one step. Cancelling keeps Pro until the end of the paid period.</p>
          </div>
        ) : canPurchase(user) ? (
          <ProCheckoutForms />
        ) : (
          <Alert tone="info">A parent or guardian must give consent before a purchase can be made. They should also be the one to complete the payment.</Alert>
        )}
      </section>
      <p className="text-sm text-fg-muted">
        See the <Link href="/legal/refunds">Refund Policy</Link>. Payments are processed by Stripe; KineticScout never sees or stores your card number.
      </p>
    </div>
  )
}
