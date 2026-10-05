import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ConsentDisclosures } from '@/components/consent/consent-disclosures'
import { FamilyActionForm } from '@/components/family/family-action-form'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { guardedAthlete, requireGuardian } from '@/lib/auth/session'
import { pick } from '@/i18n/define'
import { accountMessages } from '@/i18n/messages/account'
import { consentMessages } from '@/i18n/messages/consent'
import { domain, formatDay, formatDayRange } from '@/i18n/messages/domain'
import { familyMessages } from '@/i18n/messages/family'
import { getLocale, messages } from '@/i18n/server'
import { trainingMessages } from '@/i18n/messages/training'
import { childDetail } from '@/lib/family/service'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await messages(familyMessages)).title }
}

export default async function FamilyAthletePage({ params, searchParams }: PageProps<'/dashboard/family/[athleteId]'>) {
  const user = await requireGuardian()
  const { athleteId } = await params
  const athlete = await guardedAthlete(user, athleteId)
  if (!athlete) notFound()
  const detail = await childDetail(athlete)
  const name = athlete.firstName
  const doneKey = (await searchParams).done
  const locale = await getLocale()
  const m = pick(familyMessages, locale)
  const c = pick(consentMessages, locale).manage
  const d = domain(locale)
  const dash = pick(accountMessages, locale).dashboard
  const day = (date: Date) => formatDay(date, locale)
  const t = pick(trainingMessages, locale)
  const done = typeof doneKey === 'string' && doneKey in m.done ? m.done[doneKey]!(name) : null

  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: dash, href: '/dashboard' }, { label: m.title, href: '/dashboard/family' }, { label: `${athlete.firstName} ${athlete.lastName}` }]} />
        <h1 className="text-3xl font-bold">
          {athlete.firstName} {athlete.lastName}
        </h1>
        <p className="text-fg-muted">{m.summarySchool(d.sport[detail.sport], detail.gradYear, detail.highSchool, detail.isPublic)}</p>
        <p>{m.status[athlete.consentStatus]}</p>
      </div>

      {done && (
        <Alert tone="success" focusOnMount>
          {done}
        </Alert>
      )}
      {detail.deletion && (
        <Alert tone="info" title={c.deletionTitle}>
          {c.deletionOn(name, day(detail.deletion.scheduledFor), detail.deletion.requestedBy === 'GUARDIAN')}
        </Alert>
      )}

      {athlete.consentStatus === 'PENDING' ? (
        <section aria-labelledby="consent-heading" className="flex flex-col gap-6">
          <h2 id="consent-heading" className="text-2xl font-bold">
            {m.consentTitle}
          </h2>
          <p className="text-fg-muted">{m.listedYou(name)}</p>
          <ConsentDisclosures headingLevel={3} />
          <FamilyActionForm
            athleteId={athlete.athleteId}
            intent="grant"
            title={c.regrant.title}
            submitLabel={c.regrant.submit}
            pendingLabel={c.regrant.pending}
            checkbox={{ name: 'attest', label: c.regrant.attest(name), required: true }}
          />
          <p className="text-fg-muted">
            {m.noConsent} <Link href="/contact">{m.contactPage}</Link>.
          </p>
        </section>
      ) : (
        <>
          <section aria-labelledby="requests-heading" className="flex flex-col gap-4">
            <h2 id="requests-heading" className="text-2xl font-bold">
              {m.requests}
            </h2>
            {detail.pendingTeams.length === 0 && detail.pendingContacts.length === 0 ? (
              <p className="text-fg-muted">{m.nothing}</p>
            ) : (
              <ul className="flex flex-col gap-4">
                {detail.pendingTeams.map((t) => (
                  <li key={t.id} className="flex flex-col gap-3 border-2 border-border-subtle p-5">
                    <h3 className="text-lg font-bold">{m.join(t.team.name)}</h3>
                    <p className="text-fg-muted">
                      {m.teamLine(t.team.organization, d.sport[t.team.sport], t.team.coachName, t.team.coachTitle)} {t.team.reviewedAt ? m.teamChecked : ''}
                    </p>
                    <p className="text-fg-muted">{m.teamIf(name)}</p>
                    <div className="flex flex-wrap gap-3">
                      <FamilyActionForm bare athleteId={athlete.athleteId} intent="team-approve" itemId={t.id} submitLabel={m.approve(t.team.name)} pendingLabel={m.approving} />
                      <FamilyActionForm bare athleteId={athlete.athleteId} intent="team-decline" itemId={t.id} submitLabel={m.decline(t.team.name)} pendingLabel={m.declining} />
                    </div>
                  </li>
                ))}
                {detail.pendingContacts.map((r) => {
                  const coach = `Coach ${r.coach.firstName} ${r.coach.lastName}`
                  return (
                    <li key={r.id} className="flex flex-col gap-3 border-2 border-border-subtle p-5">
                      <h3 className="text-lg font-bold">{m.contactFrom(coach)}</h3>
                      <p className="text-fg-muted">
                        {r.coach.title}
                        {r.coach.college ? `, ${r.coach.college.schoolName} (${r.coach.college.division})` : ''}.{m.wouldAccept(name)}
                        {r.coach.reviewedAt ? m.contactChecked : ''}
                      </p>
                      <p className="border-2 border-border-subtle p-4 break-words whitespace-pre-wrap">{r.message}</p>
                      <p className="text-fg-muted">{m.contactIf(name)}</p>
                      <div className="flex flex-wrap gap-3">
                        <FamilyActionForm bare athleteId={athlete.athleteId} intent="contact-approve" itemId={r.id} submitLabel={m.approve(coach)} pendingLabel={m.approving} />
                        <FamilyActionForm bare athleteId={athlete.athleteId} intent="contact-decline" itemId={r.id} submitLabel={m.decline(coach)} pendingLabel={m.declining} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="conversations-heading" className="flex flex-col gap-4">
            <h2 id="conversations-heading" className="text-2xl font-bold">
              {m.conversations}
            </h2>
            {detail.threads.length === 0 ? (
              <p className="text-fg-muted">{m.noConversations(name)}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {detail.threads.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-2 border-2 border-border-subtle p-4">
                    <Link href={`/dashboard/family/${athlete.athleteId}/messages/${t.id}`} className="font-bold">
                      {t.coachLabel}
                    </Link>
                    <span className="tabular text-sm text-fg-muted">{m.messageCount(t.messageCount, t.status === 'CLOSED')}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="teams-heading" className="flex flex-col gap-3">
            <h2 id="teams-heading" className="text-2xl font-bold">
              {m.teams}
            </h2>
            {detail.activeTeams.length === 0 ? (
              <p className="text-fg-muted">{m.noTeams(name)}</p>
            ) : (
              <ul className="flex list-disc flex-col gap-1 pl-5">
                {detail.activeTeams.map((t) => (
                  <li key={`${t.name}-${t.organization}`}>
                    {t.name}, {t.organization}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="events-heading" className="flex flex-col gap-3">
            <h2 id="events-heading" className="text-2xl font-bold">
              {m.events}
            </h2>
            {detail.events.length === 0 ? (
              <p className="text-fg-muted">{m.noEvents(name)}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {detail.events.map(({ event, shareWithCoaches }) => (
                  <li key={event.id} className="flex flex-col gap-1 border-2 border-border-subtle p-3">
                    <Link href={`/events/${event.id}`} className="font-bold">
                      {event.name}
                    </Link>
                    <span className="text-sm text-fg-muted">
                      {formatDayRange(event.startDate, event.endDate, locale)}, {event.city}, {event.state}.{' '}
                      {event.status === 'CANCELED' ? m.canceled : shareWithCoaches ? m.shown : m.notShown}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="training-heading" className="flex flex-col gap-3">
            <h2 id="training-heading" className="text-2xl font-bold">
              {m.training}
            </h2>
            {detail.plans.length === 0 ? (
              <p className="text-fg-muted">{m.noPlans(name)}</p>
            ) : (
              <ul className="flex list-disc flex-col gap-1 pl-5">
                {detail.plans.map((p) => (
                  <li key={p.id}>
                    <Link href={`/dashboard/family/${athlete.athleteId}/training/${p.id}`}>
                      {t.finishedItem(d.motion[p.motionType], formatDayRange(p.startsOn, p.endsOn, locale))}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="data-heading" className="flex flex-col gap-3">
            <h2 id="data-heading" className="text-2xl font-bold">
              {m.data}
            </h2>
            <p className="text-fg-muted">{m.dataIntro(name)}</p>
            <form method="post" action={`/api/family/${athlete.athleteId}/export`}>
              <Button type="submit" variant="secondary">
                {m.download(name)}
              </Button>
            </form>
          </section>

          <section aria-labelledby="controls-heading" className="flex flex-col gap-4">
            <h2 id="controls-heading" className="text-2xl font-bold">
              {m.controls}
            </h2>
            {athlete.consentStatus === 'GRANTED' ? (
              <FamilyActionForm
                athleteId={athlete.athleteId}
                intent="revoke"
                title={c.revoke.title}
                description={c.revoke.description(name)}
                submitLabel={c.revoke.submit}
                pendingLabel={c.revoke.pending}
                checkbox={detail.subscription && !detail.subscription.cancelAtPeriodEnd ? { name: 'cancelSubscription', label: c.revoke.cancelSubscription, required: false } : undefined}
              />
            ) : (
              <FamilyActionForm
                athleteId={athlete.athleteId}
                intent="regrant"
                title={m.regrantTitle}
                description={m.regrantDescription(name)}
                submitLabel={c.regrant.submit}
                pendingLabel={c.regrant.pending}
                checkbox={{ name: 'attest', label: c.regrant.attest(name), required: true }}
              />
            )}
            {detail.deletion ? (
              detail.deletion.requestedBy === 'GUARDIAN' && (
                <FamilyActionForm athleteId={athlete.athleteId} intent="cancel-deletion" title={c.cancelDeletion.title} description={c.cancelDeletion.description(name)} submitLabel={c.cancelDeletion.submit} pendingLabel={c.cancelDeletion.pending} />
              )
            ) : (
              <FamilyActionForm
                athleteId={athlete.athleteId}
                intent="delete"
                danger
                title={c.del.title}
                description={m.cancelHere(name)}
                submitLabel={c.del.submit}
                pendingLabel={c.del.pending}
                checkbox={{ name: 'confirmDelete', label: c.del.confirm(name), required: true }}
              />
            )}
          </section>
        </>
      )}
    </div>
  )
}
