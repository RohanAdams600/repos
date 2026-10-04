import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { guardianTeamAction } from '@/lib/teams/actions'
import { pick } from '@/i18n/define'
import { consentMessages } from '@/i18n/messages/consent'
import { formatDay } from '@/i18n/messages/domain'
import { getLocale, messages } from '@/i18n/server'
import { lookupGuardianTeam } from '@/lib/teams/service'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(consentMessages)).team.metaTitle, robots: { index: false, follow: false } }
}

const RESULTS = { approved: 'success', declined: 'success', invalid: 'error', limited: 'error' } as const

export default async function GuardianTeamPage({ searchParams }: PageProps<'/consent/guardian/team'>) {
  const params = await searchParams
  const locale = await getLocale()
  const t = pick(consentMessages, locale)
  const m = t.team
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
  const request = token ? await lookupGuardianTeam(token) : null
  if (!request) {
    return (
      <AuthShell title={m.title}>
        <Alert tone="error">{text.invalid}</Alert>
      </AuthShell>
    )
  }
  const { team, athlete } = request
  return (
    <AuthShell
      title={m.wouldLike(athlete.firstName)}
      intro={<p>{m.intro(athlete.firstName, m.sport[team.sport] ?? team.sport)}</p>}
    >
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
        <dt className="text-fg-muted">{m.team}</dt>
        <dd className="font-bold">{team.name}</dd>
        <dt className="text-fg-muted">{m.organization}</dt>
        <dd>{team.organization}</dd>
        <dt className="text-fg-muted">{m.coach}</dt>
        <dd>
          {team.coachName}, {team.coachTitle}
        </dd>
        <dt className="text-fg-muted">{m.checked}</dt>
        <dd>
          {m.matched}
          {team.reviewedAt ? t.decide.checkedOn(formatDay(team.reviewedAt, locale)) : ''}.
        </dd>
      </dl>
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">{m.canDo}</h2>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>{m.sees(athlete.firstName)}</li>
          <li>{m.records(athlete.firstName)}</li>
        </ul>
        <p className="text-fg-muted">{m.cannot(athlete.firstName)}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <form action={guardianTeamAction}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="decision" value="approve" />
          <Button type="submit">{t.decide.approve}</Button>
        </form>
        <form action={guardianTeamAction}>
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
