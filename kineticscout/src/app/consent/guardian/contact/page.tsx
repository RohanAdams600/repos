import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { guardianContactAction } from '@/lib/coach/actions'
import { pick } from '@/i18n/define'
import { consentMessages } from '@/i18n/messages/consent'
import { formatDay } from '@/i18n/messages/domain'
import { getLocale, messages } from '@/i18n/server'
import { lookupGuardianContact } from '@/lib/coach/contact'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(consentMessages)).contact.metaTitle, robots: { index: false, follow: false } }
}

const RESULTS = { approved: 'success', declined: 'success', invalid: 'error', limited: 'error' } as const

export default async function GuardianContactPage({ searchParams }: PageProps<'/consent/guardian/contact'>) {
  const params = await searchParams
  const locale = await getLocale()
  const t = pick(consentMessages, locale)
  const m = t.contact
  const text = { approved: m.approved, declined: m.declined, invalid: t.decide.invalid, limited: t.decide.limited }
  const result = typeof params.result === 'string' && params.result in RESULTS ? (params.result as keyof typeof RESULTS) : null
  if (result) {
    return (
      <AuthShell title={m.title}>
        <Alert tone={RESULTS[result]} focusOnMount>
          {text[result]}
        </Alert>
      </AuthShell>
    )
  }
  const token = typeof params.token === 'string' ? params.token : ''
  const request = token ? await lookupGuardianContact(token) : null
  if (!request) {
    return (
      <AuthShell title={m.title}>
        <Alert tone="error">{text.invalid}</Alert>
      </AuthShell>
    )
  }
  const coach = request.coach
  return (
    <AuthShell
      title={m.wouldLike(request.athlete.firstName)}
      intro={<p>{m.intro(request.athlete.firstName)}</p>}
    >
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
        <dt className="text-fg-muted">{m.coach}</dt>
        <dd className="font-bold">
          {coach.firstName} {coach.lastName}, {coach.title}
        </dd>
        <dt className="text-fg-muted">{m.program}</dt>
        <dd>
          {coach.college?.schoolName} ({coach.college?.division})
        </dd>
        <dt className="text-fg-muted">{m.verified}</dt>
        <dd>
          {m.matched}
          {coach.reviewedAt ? t.decide.checkedOn(formatDay(coach.reviewedAt, locale)) : ''}.
        </dd>
      </dl>
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">{m.message}</h2>
        <p className="border-2 border-border-subtle p-4 whitespace-pre-wrap">{request.message}</p>
      </div>
      <p className="text-fg-muted">{m.ifApprove(request.athlete.firstName)}</p>
      <div className="flex flex-wrap gap-3">
        <form action={guardianContactAction}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="decision" value="approve" />
          <Button type="submit">{t.decide.approve}</Button>
        </form>
        <form action={guardianContactAction}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="decision" value="decline" />
          <Button type="submit" variant="secondary">
            {t.decide.decline}
          </Button>
        </form>
      </div>
    </AuthShell>
  )
}
