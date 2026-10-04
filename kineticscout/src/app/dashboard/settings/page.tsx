import type { Metadata } from 'next'
import Link from 'next/link'
import { CancelDeletionForm, DeleteAccountForm } from '@/components/account/delete-account-form'
import { MarketingPreferenceForm } from '@/components/account/marketing-preference-form'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { activeDeletionRequest, DELETION_GRACE_DAYS } from '@/lib/account/deletion'
import { requireUser } from '@/lib/auth/session'
import { db } from '@/lib/db'

export const metadata: Metadata = { title: 'Settings' }

const MESSAGES: Record<string, { tone: 'success' | 'error' | 'info'; text: string }> = {
  'deletion-scheduled': { tone: 'info', text: 'Your account is scheduled for deletion. We emailed you a confirmation. You can cancel below until the date shown.' },
  'deletion-canceled': { tone: 'success', text: 'Deletion canceled. Your account and data are unchanged.' },
  'export-limit': { tone: 'error', text: 'You have downloaded your data several times in the last hour. Try again later.' },
}

const ROLE_LABEL = { ATHLETE: 'Athlete', COACH: 'Coach', ADMIN: 'Staff' } as const
const CONSENT_LABEL = { PENDING: 'Waiting for consent', GRANTED: 'Consent given', REVOKED: 'Consent withdrawn' } as const

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

export default async function SettingsPage({ searchParams }: PageProps<'/dashboard/settings'>) {
  const user = await requireUser('/dashboard/settings')
  const params = await searchParams
  const key = [params.notice, params.error].find((v): v is string => typeof v === 'string')
  const message = key ? MESSAGES[key] : undefined

  const [account, deletion] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        createdAt: true,
        marketingEmailOptIn: true,
        marketingOptInUpdatedAt: true,
        termsAcceptedAt: true,
        guardianConsent: { select: { guardianEmail: true, status: true, grantedAt: true } },
      },
    }),
    activeDeletionRequest(user.id),
  ])

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Settings' }]} />
        <h1 className="text-3xl font-bold">Settings</h1>
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <section aria-labelledby="account-title" className="flex flex-col gap-4 border-2 border-border-subtle p-6">
        <h2 id="account-title" className="text-xl font-bold">
          Account
        </h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
          <dt className="text-fg-muted">Email</dt>
          <dd className="break-all">{user.email}</dd>
          <dt className="text-fg-muted">Account type</dt>
          <dd>{ROLE_LABEL[user.role]}</dd>
          <dt className="text-fg-muted">Member since</dt>
          <dd>{formatDate(account.createdAt)}</dd>
          {account.termsAcceptedAt && (
            <>
              <dt className="text-fg-muted">Terms accepted</dt>
              <dd>{formatDate(account.termsAcceptedAt)}</dd>
            </>
          )}
        </dl>
        {user.role === 'ATHLETE' && user.hasAthleteProfile && (
          <p>
            <Link href="/dashboard/profile">Edit your athlete profile</Link>
          </p>
        )}
        <p className="text-sm text-fg-muted">
          To change your password, use <Link href="/forgot-password">reset password</Link>. To change your email address, contact us from{' '}
          <Link href="/contact">the contact page</Link>.
        </p>
      </section>

      <section aria-labelledby="email-title" className="flex flex-col gap-4 border-2 border-border-subtle p-6">
        <h2 id="email-title" className="text-xl font-bold">
          Email
        </h2>
        <p className="text-fg-muted">
          Account emails (sign-in links, password resets, billing receipts, consent and deletion notices) are always sent while you have an
          account. Product emails are optional and off unless you turn them on.
        </p>
        <MarketingPreferenceForm mode="settings" optedIn={account.marketingEmailOptIn} disabled={deletion !== null} />
        {account.marketingOptInUpdatedAt && <p className="text-sm text-fg-muted">Last changed {formatDate(account.marketingOptInUpdatedAt)}.</p>}
      </section>

      {account.guardianConsent && (
        <section aria-labelledby="guardian-title" className="flex flex-col gap-4 border-2 border-border-subtle p-6">
          <h2 id="guardian-title" className="text-xl font-bold">
            Parent or guardian
          </h2>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
            <dt className="text-fg-muted">Email on file</dt>
            <dd className="break-all">{account.guardianConsent.guardianEmail}</dd>
            <dt className="text-fg-muted">Status</dt>
            <dd>{CONSENT_LABEL[account.guardianConsent.status]}</dd>
          </dl>
          <p className="text-sm text-fg-muted">
            Your parent or guardian can withdraw consent, cancel a subscription, or ask us to delete this account at any time using the private
            link in their confirmation email. They can request a new link on the <Link href="/legal/your-data">Your data</Link> page.
          </p>
        </section>
      )}

      <section aria-labelledby="data-title" className="flex flex-col gap-4 border-2 border-border-subtle p-6">
        <h2 id="data-title" className="text-xl font-bold">
          Download your data
        </h2>
        <p className="text-fg-muted">
          A JSON file with everything we hold about your account: profile, metrics, video analyses, recruiting pipeline, subscription history,
          email choices and security events.
        </p>
        <form method="post" action="/api/account/export">
          <Button type="submit" variant="secondary">
            Download my data
          </Button>
        </form>
      </section>

      <section aria-labelledby="delete-title" className="flex flex-col gap-4 border-2 border-danger p-6">
        <h2 id="delete-title" className="text-xl font-bold">
          Delete account
        </h2>
        {deletion ? (
          <>
            <p>
              Your account will be permanently deleted on <strong>{formatDate(deletion.scheduledFor)}</strong>. Until then your profile is private,
              product emails are off, and any subscription is set not to renew.
            </p>
            {deletion.requestedBy === 'GUARDIAN' ? (
              <p className="text-fg-muted">
                Your parent or guardian made this request, so only they can cancel it, using the link in their consent emails.
              </p>
            ) : (
              <CancelDeletionForm />
            )}
          </>
        ) : (
          <>
            <p className="text-fg-muted">
              Deletes your profile, metrics, videos, analyses, recruiting pipeline and login, and cancels any subscription. You have{' '}
              {DELETION_GRACE_DAYS} days to change your mind; after that it cannot be undone. Stripe keeps past invoices as tax law requires.
            </p>
            <DeleteAccountForm />
          </>
        )}
      </section>
    </div>
  )
}
