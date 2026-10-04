import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ConsentDisclosures } from '@/components/consent/consent-disclosures'
import { FamilyActionForm } from '@/components/family/family-action-form'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { guardedAthlete, requireGuardian } from '@/lib/auth/session'
import { formatEventDates } from '@/lib/events/rules'
import { childDetail } from '@/lib/family/service'
import { MOTION_LABEL } from '@/lib/training/rules'
import { SPORT_LABEL } from '@/lib/sports'

export const metadata: Metadata = { title: 'Family' }

const STATUS_TEXT = {
  GRANTED: 'Consent is given. The profile can be public if they choose, and purchases, coach contact and teams are allowed with your approval.',
  REVOKED: 'Consent is withdrawn. The profile is private, and purchases, contact with coaches and team memberships have stopped.',
  PENDING: 'Consent is not given yet. The account stays private, and purchases and coach outreach are blocked until you decide.',
} as const

function doneMessage(done: unknown, name: string): string | null {
  switch (done) {
    case 'grant':
    case 'regrant':
      return `Consent recorded for ${name}'s account. We emailed you a confirmation with a management link you can use without signing in.`
    case 'revoke':
      return `Consent withdrawn. ${name}'s profile is now private, and purchases, contact with coaches and team memberships have stopped.`
    case 'delete':
      return `Deletion scheduled. We emailed you and ${name} to confirm. You can cancel here until the date below.`
    case 'cancel-deletion':
      return `Deletion canceled. ${name}'s account and data are unchanged.`
    case 'team-approve':
      return `Approved. ${name} is now on the team.`
    case 'team-decline':
      return `Declined. ${name} was not added to the team.`
    case 'contact-approve':
      return `Approved. The coach now has ${name}'s email address and yours.`
    case 'contact-decline':
      return 'Declined. No contact details were shared with the coach.'
    default:
      return null
  }
}

const day = (d: Date) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })

export default async function FamilyAthletePage({ params, searchParams }: PageProps<'/dashboard/family/[athleteId]'>) {
  const user = await requireGuardian()
  const { athleteId } = await params
  const athlete = await guardedAthlete(user, athleteId)
  if (!athlete) notFound()
  const detail = await childDetail(athlete)
  const name = athlete.firstName
  const done = doneMessage((await searchParams).done, name)

  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <div className="flex flex-col gap-3">
        <Breadcrumbs items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Family', href: '/dashboard/family' }, { label: `${athlete.firstName} ${athlete.lastName}` }]} />
        <h1 className="text-3xl font-bold">
          {athlete.firstName} {athlete.lastName}
        </h1>
        <p className="text-fg-muted">
          {SPORT_LABEL[detail.sport]}, class of <span className="tabular">{detail.gradYear}</span>
          {detail.highSchool ? `, ${detail.highSchool}` : ''}. Profile is {detail.isPublic ? 'public' : 'private'}.
        </p>
        <p>{STATUS_TEXT[athlete.consentStatus]}</p>
      </div>

      {done && (
        <Alert tone="success" focusOnMount>
          {done}
        </Alert>
      )}
      {detail.deletion && (
        <Alert tone="info" title="Deletion scheduled">
          {name}&apos;s account will be permanently deleted on {day(detail.deletion.scheduledFor)}
          {detail.deletion.requestedBy === 'GUARDIAN' ? ', at your request.' : ', at their own request.'}
        </Alert>
      )}

      {athlete.consentStatus === 'PENDING' ? (
        <section aria-labelledby="consent-heading" className="flex flex-col gap-6">
          <h2 id="consent-heading" className="text-2xl font-bold">
            Consent
          </h2>
          <p className="text-fg-muted">{name} listed you as their parent or guardian. Here is what you are agreeing to.</p>
          <ConsentDisclosures headingLevel={3} />
          <FamilyActionForm
            athleteId={athlete.athleteId}
            intent="grant"
            title="Give consent"
            submitLabel="Give consent"
            pendingLabel="Recording consent"
            checkbox={{ name: 'attest', label: `I am ${name}'s parent or legal guardian, I have read the Privacy Policy, and I consent to these uses.`, required: true }}
          />
          <p className="text-fg-muted">If you do not consent, you do not need to do anything: the account stays private. You can ask us to delete it through our <Link href="/contact">contact page</Link>.</p>
        </section>
      ) : (
        <>
          <section aria-labelledby="requests-heading" className="flex flex-col gap-4">
            <h2 id="requests-heading" className="text-2xl font-bold">
              Requests waiting for you
            </h2>
            {detail.pendingTeams.length === 0 && detail.pendingContacts.length === 0 ? (
              <p className="text-fg-muted">Nothing is waiting for your answer.</p>
            ) : (
              <ul className="flex flex-col gap-4">
                {detail.pendingTeams.map((m) => (
                  <li key={m.id} className="flex flex-col gap-3 border-2 border-border-subtle p-5">
                    <h3 className="text-lg font-bold">Join {m.team.name}</h3>
                    <p className="text-fg-muted">
                      {m.team.organization}, {SPORT_LABEL[m.team.sport]}. Coach: {m.team.coachName}, {m.team.coachTitle}.{' '}
                      {m.team.reviewedAt ? 'Our staff checked this coach against the school or club staff page.' : ''}
                    </p>
                    <p className="text-fg-muted">If you approve, the coach sees {name}&apos;s name and can record testing-day results, which {name} accepts or declines one by one.</p>
                    <div className="flex flex-wrap gap-3">
                      <FamilyActionForm bare athleteId={athlete.athleteId} intent="team-approve" itemId={m.id} submitLabel={`Approve ${m.team.name}`} pendingLabel="Approving" />
                      <FamilyActionForm bare athleteId={athlete.athleteId} intent="team-decline" itemId={m.id} submitLabel={`Decline ${m.team.name}`} pendingLabel="Declining" />
                    </div>
                  </li>
                ))}
                {detail.pendingContacts.map((r) => {
                  const coach = `Coach ${r.coach.firstName} ${r.coach.lastName}`
                  return (
                    <li key={r.id} className="flex flex-col gap-3 border-2 border-border-subtle p-5">
                      <h3 className="text-lg font-bold">Contact from {coach}</h3>
                      <p className="text-fg-muted">
                        {r.coach.title}
                        {r.coach.college ? `, ${r.coach.college.schoolName} (${r.coach.college.division})` : ''}. {name} would like to accept.
                        {r.coach.reviewedAt ? ' Our staff matched this coach to the program staff directory.' : ''}
                      </p>
                      <p className="border-2 border-border-subtle p-4 break-words whitespace-pre-wrap">{r.message}</p>
                      <p className="text-fg-muted">If you approve, the coach receives {name}&apos;s email address and yours, and messages on KineticScout are copied to you.</p>
                      <div className="flex flex-wrap gap-3">
                        <FamilyActionForm bare athleteId={athlete.athleteId} intent="contact-approve" itemId={r.id} submitLabel={`Approve ${coach}`} pendingLabel="Approving" />
                        <FamilyActionForm bare athleteId={athlete.athleteId} intent="contact-decline" itemId={r.id} submitLabel={`Decline ${coach}`} pendingLabel="Declining" />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="conversations-heading" className="flex flex-col gap-4">
            <h2 id="conversations-heading" className="text-2xl font-bold">
              Conversations with college coaches
            </h2>
            {detail.threads.length === 0 ? (
              <p className="text-fg-muted">No conversations yet. When a coach and {name} message each other on KineticScout, every message is copied to you here and by email.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {detail.threads.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-2 border-2 border-border-subtle p-4">
                    <Link href={`/dashboard/family/${athlete.athleteId}/messages/${t.id}`} className="font-bold">
                      {t.coachLabel}
                    </Link>
                    <span className="text-sm text-fg-muted">
                      <span className="tabular">{t.messageCount}</span> {t.messageCount === 1 ? 'message' : 'messages'}
                      {t.status === 'CLOSED' ? ', ended' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="teams-heading" className="flex flex-col gap-3">
            <h2 id="teams-heading" className="text-2xl font-bold">
              Teams
            </h2>
            {detail.activeTeams.length === 0 ? (
              <p className="text-fg-muted">{name} is not on a team on KineticScout.</p>
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
              Events
            </h2>
            {detail.events.length === 0 ? (
              <p className="text-fg-muted">{name} has not marked any upcoming events.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {detail.events.map(({ event, shareWithCoaches }) => (
                  <li key={event.id} className="flex flex-col gap-1 border-2 border-border-subtle p-3">
                    <Link href={`/events/${event.id}`} className="font-bold">
                      {event.name}
                    </Link>
                    <span className="text-sm text-fg-muted">
                      {formatEventDates(event.startDate, event.endDate)}, {event.city}, {event.state}.{' '}
                      {event.status === 'CANCELED' ? 'Canceled.' : shareWithCoaches ? 'Shown to verified college coaches.' : 'Not shown to coaches.'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="training-heading" className="flex flex-col gap-3">
            <h2 id="training-heading" className="text-2xl font-bold">
              Training plans
            </h2>
            {detail.plans.length === 0 ? (
              <p className="text-fg-muted">{name} has no training plan in progress.</p>
            ) : (
              <ul className="flex list-disc flex-col gap-1 pl-5">
                {detail.plans.map((p) => (
                  <li key={p.id}>
                    <Link href={`/dashboard/family/${athlete.athleteId}/training/${p.id}`}>
                      {MOTION_LABEL[p.motionType]} plan, {formatEventDates(p.startsOn, p.endsOn)}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="data-heading" className="flex flex-col gap-3">
            <h2 id="data-heading" className="text-2xl font-bold">
              Their data
            </h2>
            <p className="text-fg-muted">Download everything we hold about {name}&apos;s account as a JSON file: profile, measurements, analyses, teams, contact requests and conversations.</p>
            <form method="post" action={`/api/family/${athlete.athleteId}/export`}>
              <Button type="submit" variant="secondary">
                Download {name}&apos;s data
              </Button>
            </form>
          </section>

          <section aria-labelledby="controls-heading" className="flex flex-col gap-4">
            <h2 id="controls-heading" className="text-2xl font-bold">
              Consent and account
            </h2>
            {athlete.consentStatus === 'GRANTED' ? (
              <FamilyActionForm
                athleteId={athlete.athleteId}
                intent="revoke"
                title="Withdraw consent"
                description={`Takes effect immediately: ${name}'s profile becomes private, purchases and contact with coaches stop, open coach contact requests are declined, conversations with college coaches end, team memberships end, and email addresses already shared with coaches are removed from their KineticScout pages (a coach who already wrote one down keeps it). ${name} can still log metrics and see their own numbers, and we email them to say consent was withdrawn.`}
                submitLabel="Withdraw consent"
                pendingLabel="Withdrawing"
                checkbox={detail.subscription && !detail.subscription.cancelAtPeriodEnd ? { name: 'cancelSubscription', label: 'Also stop the Pro subscription from renewing (access continues until the end of the paid period).', required: false } : undefined}
              />
            ) : (
              <FamilyActionForm
                athleteId={athlete.athleteId}
                intent="regrant"
                title="Give consent again"
                description={`Allows ${name} to make their profile public, draft outreach to college coaches, and lets an adult purchase Pro. Teams and coach contact still need your approval each time.`}
                submitLabel="Give consent"
                pendingLabel="Recording consent"
                checkbox={{ name: 'attest', label: `I am ${name}'s parent or legal guardian, I have read the Privacy Policy, and I consent to these uses.`, required: true }}
              />
            )}
            {detail.deletion ? (
              detail.deletion.requestedBy === 'GUARDIAN' && (
                <FamilyActionForm athleteId={athlete.athleteId} intent="cancel-deletion" title="Cancel deletion" description={`Keeps ${name}'s account and data exactly as they are.`} submitLabel="Cancel deletion" pendingLabel="Canceling" />
              )
            ) : (
              <FamilyActionForm
                athleteId={athlete.athleteId}
                intent="delete"
                danger
                title="Delete the account"
                description={`Permanently deletes ${name}'s profile, metrics, videos, analyses and login after 7 days, and cancels any subscription. You can cancel here during those 7 days. We email you and ${name} to confirm.`}
                submitLabel="Delete the account"
                pendingLabel="Scheduling deletion"
                checkbox={{ name: 'confirmDelete', label: `I want ${name}'s KineticScout account and all of its data deleted.`, required: true }}
              />
            )}
          </section>
        </>
      )}
    </div>
  )
}
