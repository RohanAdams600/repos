import type { Metadata } from 'next'
import Link from 'next/link'
import { GuardianLinkRequestForm, GuardianManageForm } from '@/components/account/guardian-manage-forms'
import { AuthShell } from '@/components/auth/auth-shell'
import { Alert } from '@/components/ui/alert'
import { consentMessages } from '@/i18n/messages/consent'
import { formatDay } from '@/i18n/messages/domain'
import { getLocale, messages } from '@/i18n/server'
import { pick } from '@/i18n/define'
import { lookupManageToken } from '@/lib/auth/guardian-manage'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(consentMessages)).manage.metaTitle, robots: { index: false, follow: false } }
}

export default async function GuardianManagePage({ searchParams }: PageProps<'/consent/guardian/manage'>) {
  const params = await searchParams
  const token = typeof params.token === 'string' ? params.token : ''
  const ctx = token ? await lookupManageToken(token) : null
  const locale = await getLocale()
  const m = pick(consentMessages, locale).manage

  if (!ctx) {
    return (
      <AuthShell title={m.title} intro={<p>{m.intro}</p>}>
        {token && <Alert tone="error">{m.badLink}</Alert>}
        <GuardianLinkRequestForm />
        <p className="text-sm text-fg-muted">
          {m.linksWork} <Link href="/legal/your-data">{m.yourData}</Link> {m.otherOptions}
        </p>
      </AuthShell>
    )
  }

  const name = ctx.athleteFirstName ?? m.yourTeen
  const done = typeof params.done === 'string' && params.done in m.done ? m.done[params.done]!(name) : null
  return (
    <AuthShell title={m.titleFor(name)} intro={<p>{m.status[ctx.status]}</p>}>
      {done && (
        <Alert tone="success" focusOnMount>
          {done}
        </Alert>
      )}
      {ctx.deletionScheduledFor && (
        <Alert tone="info" title={m.deletionTitle}>
          {m.deletionOn(name, formatDay(ctx.deletionScheduledFor, locale), ctx.deletionRequestedBy === 'GUARDIAN')}
        </Alert>
      )}

      {ctx.status === 'GRANTED' ? (
        <GuardianManageForm
          key="revoke"
          token={token}
          intent="revoke"
          title={m.revoke.title}
          description={m.revoke.description(name)}
          submitLabel={m.revoke.submit}
          pendingLabel={m.revoke.pending}
          checkbox={ctx.liveSubscriptionId && !ctx.cancelAtPeriodEnd ? { name: 'cancelSubscription', label: m.revoke.cancelSubscription, required: false } : undefined}
        />
      ) : (
        <GuardianManageForm
          key="regrant"
          token={token}
          intent="regrant"
          title={m.regrant.title}
          description={m.regrant.description(name)}
          submitLabel={m.regrant.submit}
          pendingLabel={m.regrant.pending}
          checkbox={{ name: 'attest', label: m.regrant.attest(name), required: true }}
        />
      )}

      {ctx.deletionScheduledFor ? (
        ctx.deletionRequestedBy === 'GUARDIAN' && (
          <GuardianManageForm
            key="cancel-deletion"
            token={token}
            intent="cancel-deletion"
            title={m.cancelDeletion.title}
            description={m.cancelDeletion.description(name)}
            submitLabel={m.cancelDeletion.submit}
            pendingLabel={m.cancelDeletion.pending}
          />
        )
      ) : (
        <GuardianManageForm
          key="delete"
          token={token}
          intent="delete"
          danger
          title={m.del.title}
          description={m.del.description(name)}
          submitLabel={m.del.submit}
          pendingLabel={m.del.pending}
          checkbox={{ name: 'confirmDelete', label: m.del.confirm(name), required: true }}
        />
      )}

      <p className="text-sm text-fg-muted">
        {m.keepPrivate} <Link href="/contact">{m.contactPage}</Link>.
      </p>
    </AuthShell>
  )
}
