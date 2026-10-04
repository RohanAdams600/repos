import 'server-only'
import { ageBand } from '@/lib/auth/age'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email/send'
import { notifyGuardianAccount } from '@/lib/family/notify'
import { renderEmail } from '@/lib/email/templates'
import { env } from '@/lib/env'
import { errorFields, logger } from '@/lib/logger'
import { closeThreadsOperation } from '@/lib/messaging/service'
import { notify } from '@/lib/notifications/service'
import { isPubliclyVisible } from '@/lib/profile/public'
import { randomToken, sha256Hex } from '@/lib/security/hash'
import { sanitizeText } from '@/lib/security/sanitize'
import { CONTACT_POLICY, contactMessageProblem } from '@/lib/coach/rules'

const DAY = 86_400_000

export class ContactError extends Error {
  constructor(
    public readonly code: 'NOT_VERIFIED' | 'UNAVAILABLE' | 'INVALID_MESSAGE' | 'ATTESTATION' | 'ALREADY_OPEN' | 'COOLDOWN' | 'LIMIT' | 'NOT_FOUND' | 'NOT_ALLOWED',
    message: string,
  ) {
    super(message)
    this.name = 'ContactError'
  }
}

async function email(to: string, subject: string, paragraphs: string[], key: string, action?: { label: string; url: string }) {
  const { text, html } = renderEmail({ paragraphs, action })
  try {
    await sendEmail({ to, subject, text, html, idempotencyKey: key })
  } catch (error) {
    logger.error(errorFields(error), 'contact request email failed')
  }
}

function coachLine(coach: { firstName: string; lastName: string; title: string; college: { schoolName: string } | null }): string {
  return `${coach.firstName} ${coach.lastName}, ${coach.title}${coach.college ? ` at ${coach.college.schoolName}` : ''}`
}

/**
 * A verified coach asks to contact a public athlete. The coach attests the contact is allowed under
 * their association's recruiting calendar; KineticScout cannot check that rule for them.
 */
export async function sendContactRequest(coachId: string, athleteId: string, input: { message: string; rulesAttested: boolean }, now: Date = new Date()): Promise<string> {
  const coach = await db.coachProfile.findFirst({ where: { userId: coachId, status: 'VERIFIED' }, select: { firstName: true, lastName: true, title: true, college: { select: { schoolName: true } } } })
  if (!coach) throw new ContactError('NOT_VERIFIED', 'Only verified coaches can send contact requests.')
  if (!input.rulesAttested) throw new ContactError('ATTESTATION', 'Confirm that this contact is allowed under your recruiting rules.')
  const message = sanitizeText(input.message)
  const problem = contactMessageProblem(message)
  if (problem) throw new ContactError('INVALID_MESSAGE', problem)

  const blocked = await db.coachBlock.findUnique({ where: { athleteId_coachId: { athleteId, coachId } }, select: { athleteId: true } })
  if (blocked || !(await isPubliclyVisible(athleteId))) throw new ContactError('UNAVAILABLE', 'This athlete is not accepting requests from you.')

  const [open, recentDecline, sentToday] = await Promise.all([
    db.contactRequest.count({ where: { coachId, athleteId, status: { in: ['PENDING', 'ATHLETE_ACCEPTED'] } } }),
    db.contactRequest.count({ where: { coachId, athleteId, status: 'DECLINED', OR: [{ athleteRespondedAt: { gte: new Date(now.getTime() - CONTACT_POLICY.cooldownDaysAfterDecline * DAY) } }, { guardianRespondedAt: { gte: new Date(now.getTime() - CONTACT_POLICY.cooldownDaysAfterDecline * DAY) } }] } }),
    db.contactRequest.count({ where: { coachId, createdAt: { gte: new Date(now.getTime() - DAY) } } }),
  ])
  if (open) throw new ContactError('ALREADY_OPEN', 'You already have an open request with this athlete.')
  if (recentDecline) throw new ContactError('COOLDOWN', 'This athlete declined a request from you recently.')
  if (sentToday >= CONTACT_POLICY.perDay) throw new ContactError('LIMIT', `You can send ${CONTACT_POLICY.perDay} requests a day.`)

  const athlete = await db.athleteProfile.findUniqueOrThrow({ where: { userId: athleteId }, select: { firstName: true, user: { select: { email: true, dateOfBirth: true } } } })
  const guardianRequired = ageBand(athlete.user.dateOfBirth, now) !== 'ADULT'
  let id: string
  try {
    ;({ id } = await db.contactRequest.create({
      data: { coachId, athleteId, message, guardianRequired, expiresAt: new Date(now.getTime() + CONTACT_POLICY.expiresDays * DAY), createdAt: now },
      select: { id: true },
    }))
  } catch (error) {
    // The partial unique index rejects a second open request sent concurrently.
    if ((error as { code?: string }).code === 'P2002') throw new ContactError('ALREADY_OPEN', 'You already have an open request with this athlete.')
    throw error
  }
  await audit('contact.requested', { actorId: coachId, targetType: 'contact_request', targetId: id })
  const who = coachLine(coach)
  await notify({ userId: athleteId, kind: 'CONTACT_REQUEST', title: `${who} would like to contact you`, body: 'Read the message and decide whether to share your email address. Nothing is shared unless you accept.', href: '/dashboard/contact-requests', dedupeKey: `contact:${id}` })
  await email(
    athlete.user.email,
    `A verified coach would like to contact you`,
    [`Hi ${athlete.firstName},`, `${who} sent you a contact request on KineticScout. KineticScout staff verified that this coach works at the program.`, 'Your email address is shared only if you accept.'],
    `contact-new-${id}`,
    { label: 'Read the request', url: `${env().APP_URL}/dashboard/contact-requests` },
  )
  return id
}

/** Athlete decision. For an athlete under 18, acceptance goes to the parent or guardian for approval. */
export async function respondAsAthlete(athleteId: string, requestId: string, decision: 'accept' | 'decline', options: { block?: boolean } = {}, now: Date = new Date()): Promise<'accepted' | 'awaiting-guardian' | 'declined'> {
  const request = await db.contactRequest.findFirst({
    where: { id: requestId, athleteId, status: 'PENDING', expiresAt: { gt: now } },
    select: { coachId: true, guardianRequired: true, coach: { select: { firstName: true, lastName: true, title: true, college: { select: { schoolName: true } }, user: { select: { email: true } } } }, athlete: { select: { firstName: true, lastName: true, user: { select: { email: true, guardianConsent: { select: { guardianEmail: true, status: true } } } } } } },
  })
  if (!request) throw new ContactError('NOT_FOUND', 'This request is no longer open.')
  const who = coachLine(request.coach)
  const athleteName = `${request.athlete.firstName} ${request.athlete.lastName}`

  if (decision === 'decline') {
    await db.contactRequest.update({ where: { id: requestId }, data: { status: 'DECLINED', athleteRespondedAt: now } })
    if (options.block) await blockCoach(athleteId, request.coachId)
    await audit('contact.declined', { actorId: athleteId, targetType: 'contact_request', targetId: requestId, metadata: { by: 'athlete', blocked: Boolean(options.block) } })
    await notify({ userId: request.coachId, kind: 'CONTACT_UPDATE', title: `${request.athlete.firstName} declined your request`, body: 'The athlete chose not to share contact details.', href: '/dashboard/contact-requests', dedupeKey: `contact-declined:${requestId}` })
    return 'declined'
  }

  if (request.guardianRequired) {
    const guardian = request.athlete.user.guardianConsent
    if (!guardian || guardian.status !== 'GRANTED') throw new ContactError('NOT_ALLOWED', 'A parent or guardian must give consent before contact details can be shared.')
    const token = randomToken()
    await db.contactRequest.update({ where: { id: requestId }, data: { status: 'ATHLETE_ACCEPTED', athleteRespondedAt: now, guardianTokenHash: sha256Hex(token), guardianTokenExpiresAt: new Date(now.getTime() + 14 * DAY) } })
    await audit('contact.accepted', { actorId: athleteId, targetType: 'contact_request', targetId: requestId, metadata: { awaitingGuardian: true } })
    await email(
      guardian.guardianEmail,
      `${request.athlete.firstName} would like to share contact details with a college coach`,
      [
        `${who} asked to contact ${request.athlete.firstName} through KineticScout, and ${request.athlete.firstName} would like to accept. KineticScout staff verified that this coach works at the program.`,
        `If you approve, the coach receives ${request.athlete.firstName}'s email address and yours. If you decline, nothing is shared.`,
      ],
      `contact-guardian-${requestId}`,
      { label: 'Review the request', url: `${env().APP_URL}/consent/guardian/contact?token=${encodeURIComponent(token)}` },
    )
    await notifyGuardianAccount(athleteId, { title: `${request.athlete.firstName} would like to share contact details with a college coach`, body: 'Review the request on your Family page. Nothing is shared unless you approve.', dedupeKey: `contact-guardian-${requestId}` })
    return 'awaiting-guardian'
  }

  await shareContact(requestId, [request.athlete.user.email], now)
  await audit('contact.accepted', { actorId: athleteId, targetType: 'contact_request', targetId: requestId })
  await notify({ userId: request.coachId, kind: 'CONTACT_UPDATE', title: `${athleteName} accepted your request`, body: 'Their email address is now on your contact requests page.', href: '/dashboard/contact-requests', dedupeKey: `contact-accepted:${requestId}` })
  await email(request.coach.user.email, `${athleteName} accepted your contact request`, [`${athleteName} accepted your request on KineticScout. Their email address is on your contact requests page.`], `contact-accepted-${requestId}`, { label: 'Open contact requests', url: `${env().APP_URL}/dashboard/contact-requests` })
  return 'accepted'
}

async function shareContact(requestId: string, emails: string[], now: Date) {
  await db.contactRequest.update({ where: { id: requestId }, data: { status: 'ACCEPTED', sharedEmails: [...new Set(emails)], guardianTokenHash: null, guardianTokenExpiresAt: null, ...(emails.length > 1 ? { guardianRespondedAt: now } : { athleteRespondedAt: now }) } })
}

export async function lookupGuardianContact(token: string, now: Date = new Date()) {
  if (token.length < 20 || token.length > 100) return null
  return db.contactRequest.findFirst({
    where: { guardianTokenHash: sha256Hex(token), status: 'ATHLETE_ACCEPTED', guardianTokenExpiresAt: { gt: now } },
    select: {
      id: true,
      message: true,
      createdAt: true,
      athlete: { select: { firstName: true } },
      coach: { select: { firstName: true, lastName: true, title: true, reviewedAt: true, college: { select: { schoolName: true, division: true } } } },
    },
  })
}

export async function guardianDecideContact(token: string, approve: boolean, now: Date = new Date()): Promise<'approved' | 'declined' | 'invalid'> {
  if (token.length < 20 || token.length > 100) return 'invalid'
  const found = await db.contactRequest.findFirst({ where: { guardianTokenHash: sha256Hex(token), status: 'ATHLETE_ACCEPTED', guardianTokenExpiresAt: { gt: now } }, select: { id: true } })
  return found ? guardianDecideContactRequest(found.id, approve, now) : 'invalid'
}

/**
 * The guardian's decision on a contact request, from the emailed link or a guardian account.
 * Callers establish the guardian's authority first; `guardianUserId` is set for the account path.
 */
export async function guardianDecideContactRequest(requestId: string, approve: boolean, now: Date = new Date(), guardianUserId?: string): Promise<'approved' | 'declined' | 'invalid'> {
  const request = await db.contactRequest.findFirst({
    where: { id: requestId, status: 'ATHLETE_ACCEPTED', guardianTokenExpiresAt: { gt: now } },
    select: { id: true, coachId: true, athleteId: true, athlete: { select: { firstName: true, lastName: true, user: { select: { email: true, guardianConsent: { select: { guardianEmail: true, status: true } } } } } }, coach: { select: { user: { select: { email: true } } } } },
  })
  if (!request) return 'invalid'
  const guardian = request.athlete.user.guardianConsent
  const athleteName = `${request.athlete.firstName} ${request.athlete.lastName}`
  if (!approve || guardian?.status !== 'GRANTED') {
    await db.contactRequest.update({ where: { id: request.id }, data: { status: 'DECLINED', guardianRespondedAt: now, guardianTokenHash: null, guardianTokenExpiresAt: null } })
    await audit('contact.guardian_declined', { actorId: guardianUserId, targetType: 'contact_request', targetId: request.id, metadata: { via: guardianUserId ? 'account' : 'link' } })
    await notify({ userId: request.athleteId, kind: 'CONTACT_UPDATE', title: 'Your parent or guardian declined a contact request', body: 'No contact details were shared with the coach.', href: '/dashboard/contact-requests', dedupeKey: `contact-guardian-declined:${request.id}` })
    await notify({ userId: request.coachId, kind: 'CONTACT_UPDATE', title: `Your request to ${request.athlete.firstName} was declined`, body: 'No contact details were shared.', href: '/dashboard/contact-requests', dedupeKey: `contact-declined:${request.id}` })
    return 'declined'
  }
  await shareContact(request.id, [request.athlete.user.email, guardian.guardianEmail], now)
  await audit('contact.guardian_approved', { actorId: guardianUserId, targetType: 'contact_request', targetId: request.id, metadata: { via: guardianUserId ? 'account' : 'link' } })
  await notify({ userId: request.athleteId, kind: 'CONTACT_UPDATE', title: 'Your parent or guardian approved a contact request', body: 'The coach now has your email address and your parent or guardian’s.', href: '/dashboard/contact-requests', dedupeKey: `contact-guardian-approved:${request.id}` })
  await notify({ userId: request.coachId, kind: 'CONTACT_UPDATE', title: `${athleteName} accepted your request`, body: 'Their email address and their parent or guardian’s are on your contact requests page. Include the parent or guardian in your messages.', href: '/dashboard/contact-requests', dedupeKey: `contact-accepted:${request.id}` })
  await email(request.coach.user.email, `${athleteName} accepted your contact request`, [`${athleteName} and their parent or guardian accepted your request on KineticScout. Both email addresses are on your contact requests page; please include the parent or guardian in your messages.`], `contact-accepted-${request.id}`, { label: 'Open contact requests', url: `${env().APP_URL}/dashboard/contact-requests` })
  return 'approved'
}

export async function withdrawContactRequest(coachId: string, requestId: string): Promise<boolean> {
  const result = await db.contactRequest.updateMany({ where: { id: requestId, coachId, status: { in: ['PENDING', 'ATHLETE_ACCEPTED'] } }, data: { status: 'WITHDRAWN', guardianTokenHash: null, guardianTokenExpiresAt: null } })
  if (result.count) await audit('contact.withdrawn', { actorId: coachId, targetType: 'contact_request', targetId: requestId })
  return result.count === 1
}

/**
 * Ends contact between an athlete and one coach (a block) or every coach (a guardian withdrawing
 * consent): open requests are declined, email addresses already shared are removed from the
 * coaches' pages, and open conversations are closed. Returned as operations so the caller runs them
 * inside its own transaction.
 */
export function endContactOperations(athleteId: string, by: 'athlete' | 'guardian', now: Date, coachId?: string) {
  const scope = coachId ? { athleteId, coachId } : { athleteId }
  return [
    db.contactRequest.updateMany({
      where: { ...scope, status: { in: ['PENDING', 'ATHLETE_ACCEPTED'] } },
      data: { status: 'DECLINED', ...(by === 'athlete' ? { athleteRespondedAt: now } : { guardianRespondedAt: now }), guardianTokenHash: null, guardianTokenExpiresAt: null },
    }),
    db.contactRequest.updateMany({ where: { ...scope, status: 'ACCEPTED', NOT: { sharedEmails: { isEmpty: true } } }, data: { sharedEmails: [] } }),
    closeThreadsOperation(scope, by === 'athlete' ? 'block' : 'consent', now),
  ]
}

/** Blocking also ends contact (see endContactOperations) and removes the athlete from the coach's board. */
export async function blockCoach(athleteId: string, coachId: string): Promise<void> {
  await db.$transaction([
    db.coachBlock.upsert({ where: { athleteId_coachId: { athleteId, coachId } }, create: { athleteId, coachId }, update: {} }),
    ...endContactOperations(athleteId, 'athlete', new Date(), coachId),
    db.savedProspect.deleteMany({ where: { athleteId, coachId } }),
  ])
  await audit('contact.blocked', { actorId: athleteId, targetType: 'coach_profile', targetId: coachId })
}

/** Only athletes a coach has contacted can report that coach. */
export async function reportCoach(reporterId: string, coachId: string, reason: string): Promise<void> {
  const contacted = await db.contactRequest.count({ where: { coachId, athleteId: reporterId } })
  if (!contacted) throw new ContactError('NOT_ALLOWED', 'You can report a coach who has contacted you.')
  await db.coachReport.create({ data: { coachId, reporterId, reason: sanitizeText(reason).slice(0, 1000) } })
  await audit('coach.reported', { actorId: reporterId, targetType: 'coach_profile', targetId: coachId })
}

/** Sweep: unanswered requests expire, and guardian links stop working. */
export async function expireContactRequests(now: Date = new Date()): Promise<number> {
  const result = await db.contactRequest.updateMany({ where: { status: { in: ['PENDING', 'ATHLETE_ACCEPTED'] }, expiresAt: { lte: now } }, data: { status: 'EXPIRED', guardianTokenHash: null, guardianTokenExpiresAt: null } })
  return result.count
}
