import type { Metadata } from 'next'
import Link from 'next/link'
import { GuardianLinkRequestForm, GuardianManageForm } from '@/components/account/guardian-manage-forms'
import { AuthShell } from '@/components/auth/auth-shell'
import { Alert } from '@/components/ui/alert'
import { lookupManageToken } from '@/lib/auth/guardian-manage'

export const metadata: Metadata = { title: 'Manage parent or guardian consent', robots: { index: false, follow: false } }

const STATUS_TEXT = {
  GRANTED: 'Consent is given. The profile can be public if your teen chooses, and purchases and coach outreach are allowed.',
  REVOKED: 'Consent is withdrawn. The profile is private, and purchases, contact with coaches and team memberships have stopped.',
  PENDING: 'Consent is not given. The profile is private, and purchases and coach outreach are blocked.',
} as const

function doneMessage(done: unknown, name: string): string | null {
  switch (done) {
    case 'revoke':
      return `Consent withdrawn. ${name}'s profile is now private, and purchases, contact with coaches and team memberships have stopped.`
    case 'regrant':
      return `Consent recorded for ${name}'s account.`
    case 'delete':
      return `Deletion scheduled. We emailed you and ${name} to confirm. You can cancel from this page until the date below.`
    case 'cancel-deletion':
      return `Deletion canceled. ${name}'s account and data are unchanged.`
    default:
      return null
  }
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

export default async function GuardianManagePage({ searchParams }: PageProps<'/consent/guardian/manage'>) {
  const params = await searchParams
  const token = typeof params.token === 'string' ? params.token : ''
  const ctx = token ? await lookupManageToken(token) : null

  if (!ctx) {
    return (
      <AuthShell
        title="Manage consent"
        intro={<p>Parents and guardians of KineticScout athletes under 18 can withdraw consent, cancel a subscription, or have the account deleted here.</p>}
      >
        {token && <Alert tone="error">This link is not valid or has expired. Request a new one below.</Alert>}
        <GuardianLinkRequestForm />
        <p className="text-sm text-fg-muted">
          Management links work for one year and replace any earlier link. See <Link href="/legal/your-data">Your data</Link> for other options.
        </p>
      </AuthShell>
    )
  }

  const name = ctx.athleteFirstName ?? 'your teen'
  const done = doneMessage(params.done, name)
  return (
    <AuthShell title={`Manage consent for ${name}`} intro={<p>{STATUS_TEXT[ctx.status]}</p>}>
      {done && (
        <Alert tone="success" focusOnMount>
          {done}
        </Alert>
      )}
      {ctx.deletionScheduledFor && (
        <Alert tone="info" title="Deletion scheduled">
          {name}&apos;s account will be permanently deleted on {formatDate(ctx.deletionScheduledFor)}
          {ctx.deletionRequestedBy === 'GUARDIAN' ? ', at your request.' : ', at their own request.'}
        </Alert>
      )}

      {ctx.status === 'GRANTED' ? (
        <GuardianManageForm
          key="revoke"
          token={token}
          intent="revoke"
          title="Withdraw consent"
          description={`Takes effect immediately: ${name}'s profile becomes private, purchases and contact with coaches stop, open coach contact requests are declined, conversations with college coaches end, team memberships end, and email addresses already shared with coaches are removed from their KineticScout pages (a coach who already wrote one down keeps it). ${name} can still log metrics and see their own numbers, and we email them to say consent was withdrawn.`}
          submitLabel="Withdraw consent"
          pendingLabel="Withdrawing"
          checkbox={ctx.liveSubscriptionId && !ctx.cancelAtPeriodEnd ? { name: 'cancelSubscription', label: 'Also stop the Pro subscription from renewing (access continues until the end of the paid period).', required: false } : undefined}
        />
      ) : (
        <GuardianManageForm
          key="regrant"
          token={token}
          intent="regrant"
          title="Give consent"
          description={`Allows ${name} to make their profile public, draft outreach to college coaches, and lets an adult purchase Pro. See the Privacy Policy for what we collect.`}
          submitLabel="Give consent"
          pendingLabel="Recording consent"
          checkbox={{ name: 'attest', label: `I am ${name}'s parent or legal guardian, I have read the Privacy Policy, and I consent to these uses.`, required: true }}
        />
      )}

      {ctx.deletionScheduledFor ? (
        ctx.deletionRequestedBy === 'GUARDIAN' && (
          <GuardianManageForm
            key="cancel-deletion"
            token={token}
            intent="cancel-deletion"
            title="Cancel deletion"
            description={`Keeps ${name}'s account and data exactly as they are.`}
            submitLabel="Cancel deletion"
            pendingLabel="Canceling"
          />
        )
      ) : (
        <GuardianManageForm
          key="delete"
          token={token}
          intent="delete"
          danger
          title="Delete the account"
          description={`Permanently deletes ${name}'s profile, metrics, videos, analyses and login after 7 days, and cancels any subscription. You can cancel from this page during those 7 days. We email you and ${name} to confirm.`}
          submitLabel="Delete the account"
          pendingLabel="Scheduling deletion"
          checkbox={{ name: 'confirmDelete', label: `I want ${name}'s KineticScout account and all of its data deleted.`, required: true }}
        />
      )}

      <p className="text-sm text-fg-muted">
        Keep this link private; anyone with it can change these settings. It expires one year after it was sent. Questions? Use our{' '}
        <Link href="/contact">contact page</Link>.
      </p>
    </AuthShell>
  )
}
