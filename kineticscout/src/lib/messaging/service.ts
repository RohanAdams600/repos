import 'server-only'
import type { SessionUser } from '@/lib/auth/permissions'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email/send'
import { renderEmail } from '@/lib/email/templates'
import { env } from '@/lib/env'
import { errorFields, logger } from '@/lib/logger'
import { MESSAGE_POLICY, messageProblem, unansweredRun } from '@/lib/messaging/rules'
import { notify } from '@/lib/notifications/service'
import { sanitizeText } from '@/lib/security/sanitize'
import { signSubject, verifySubject } from '@/lib/security/signed-token'

const GUARDIAN_PURPOSE = 'thread-guardian-v1'
const DAY = 86_400_000

export class MessageError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND' | 'NOT_ALLOWED' | 'INVALID' | 'LIMIT' | 'CLOSED',
    message: string,
  ) {
    super(message)
    this.name = 'MessageError'
  }
}

/** Signed, stateless link for the parent or guardian: it works for as long as the thread exists. */
export function guardianThreadToken(threadId: string): string {
  return signSubject(env().HASH_PEPPER, GUARDIAN_PURPOSE, threadId)
}

function guardianThreadUrl(threadId: string): string {
  return `${env().APP_URL}/consent/guardian/messages?thread=${threadId}&token=${encodeURIComponent(guardianThreadToken(threadId))}`
}

function validGuardianToken(threadId: string, token: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(threadId) && verifySubject(env().HASH_PEPPER, GUARDIAN_PURPOSE, threadId, token)
}

const threadSelect = {
  id: true,
  status: true,
  closedBy: true,
  guardianCopy: true,
  coachId: true,
  athleteId: true,
  coach: { select: { firstName: true, lastName: true, title: true, status: true, college: { select: { schoolName: true } } } },
  athlete: { select: { firstName: true, lastName: true, gradYear: true, user: { select: { guardianConsent: { select: { guardianEmail: true, status: true } } } } } },
} as const

function roleIn(thread: { coachId: string; athleteId: string }, userId: string): 'coach' | 'athlete' | null {
  return thread.coachId === userId ? 'coach' : thread.athleteId === userId ? 'athlete' : null
}

const coachName = (c: { firstName: string; lastName: string }) => `Coach ${c.firstName} ${c.lastName}`

/**
 * Opens (or returns) the conversation for an accepted contact request. Contact must still be
 * shared: a block or a guardian withdrawing consent clears the shared addresses and ends it.
 */
export async function openThread(user: SessionUser, contactRequestId: string): Promise<string> {
  const request = await db.contactRequest.findFirst({
    where: { id: contactRequestId, OR: [{ coachId: user.id }, { athleteId: user.id }] },
    select: { id: true, status: true, coachId: true, athleteId: true, guardianRequired: true, sharedEmails: true, coach: { select: { status: true } }, thread: { select: { id: true } } },
  })
  if (!request) throw new MessageError('NOT_FOUND', 'Contact request not found.')
  if (request.thread) return request.thread.id
  if (request.status !== 'ACCEPTED' || request.sharedEmails.length === 0) throw new MessageError('NOT_ALLOWED', 'Messages open once a contact request is accepted.')
  if (request.coach.status !== 'VERIFIED') throw new MessageError('NOT_ALLOWED', 'This coach account is not active.')
  const thread = await db.messageThread.upsert({
    where: { contactRequestId: request.id },
    create: { contactRequestId: request.id, coachId: request.coachId, athleteId: request.athleteId, guardianCopy: request.guardianRequired },
    update: {},
    select: { id: true },
  })
  return thread.id
}

export async function listThreads(userId: string) {
  const threads = await db.messageThread.findMany({
    where: { OR: [{ coachId: userId }, { athleteId: userId }] },
    orderBy: { lastMessageAt: 'desc' },
    take: 100,
    select: {
      ...threadSelect,
      lastMessageAt: true,
      messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { body: true, senderId: true, createdAt: true } },
      _count: { select: { messages: { where: { readAt: null, senderId: { not: userId } } } } },
    },
  })
  return threads.map((t) => {
    const role = roleIn(t, userId)!
    return {
      id: t.id,
      status: t.status,
      guardianCopy: t.guardianCopy,
      withName: role === 'athlete' ? coachName(t.coach) : `${t.athlete.firstName} ${t.athlete.lastName}`,
      withDetail: role === 'athlete' ? `${t.coach.title}${t.coach.college ? `, ${t.coach.college.schoolName}` : ''}` : `Class of ${t.athlete.gradYear}`,
      lastMessageAt: t.lastMessageAt,
      preview: t.messages[0] ? `${t.messages[0].senderId === userId ? 'You: ' : ''}${t.messages[0].body.slice(0, 120)}` : null,
      unread: t._count.messages,
    }
  })
}

export async function unreadMessageCount(userId: string): Promise<number> {
  return db.message.count({ where: { readAt: null, senderId: { not: userId }, thread: { OR: [{ coachId: userId }, { athleteId: userId }] } } })
}

/** The conversation for one participant. Opening it marks the other person's messages as read. */
export async function threadView(user: SessionUser, threadId: string) {
  const thread = await db.messageThread.findUnique({ where: { id: threadId }, select: threadSelect })
  const role = thread ? roleIn(thread, user.id) : null
  if (!thread || !role) throw new MessageError('NOT_FOUND', 'Conversation not found.')
  const messages = await db.message.findMany({ where: { threadId }, orderBy: { createdAt: 'asc' }, take: 500, select: { id: true, senderId: true, body: true, createdAt: true, readAt: true } })
  await db.message.updateMany({ where: { threadId, senderId: { not: user.id }, readAt: null }, data: { readAt: new Date() } })
  return {
    id: thread.id,
    role,
    status: thread.status,
    closedBy: thread.closedBy,
    guardianCopy: thread.guardianCopy,
    withName: role === 'athlete' ? coachName(thread.coach) : `${thread.athlete.firstName} ${thread.athlete.lastName}`,
    withDetail: role === 'athlete' ? `${thread.coach.title}${thread.coach.college ? `, ${thread.coach.college.schoolName}` : ''}` : `Class of ${thread.athlete.gradYear}`,
    messages: messages.map((m) => ({ ...m, mine: m.senderId === user.id })),
  }
}

async function guardianCopyEmail(thread: { id: string; athlete: { firstName: string; user: { guardianConsent: { guardianEmail: string; status: string } | null } }; coach: { firstName: string; lastName: string } }, senderLabel: string, body: string, messageId: string) {
  const guardian = thread.athlete.user.guardianConsent
  if (!guardian || guardian.status !== 'GRANTED') return
  const { text, html } = renderEmail({
    paragraphs: [
      `A copy of a message between ${thread.athlete.firstName} and ${coachName(thread.coach)} on KineticScout. You receive every message in this conversation.`,
      `${senderLabel} wrote:`,
      body,
      'If anything here worries you, you can report it or end the conversation from the link below.',
    ],
    action: { label: 'Read the conversation', url: guardianThreadUrl(thread.id) },
  })
  try {
    await sendEmail({ to: guardian.guardianEmail, subject: `Message between ${thread.athlete.firstName} and ${coachName(thread.coach)}`, text, html, idempotencyKey: `message-guardian-${messageId}` })
  } catch (error) {
    logger.error(errorFields(error), 'guardian message copy failed')
  }
}

export async function sendMessage(user: SessionUser, threadId: string, rawBody: string, now: Date = new Date()): Promise<{ id: string }> {
  const thread = await db.messageThread.findUnique({ where: { id: threadId }, select: threadSelect })
  const role = thread ? roleIn(thread, user.id) : null
  if (!thread || !role) throw new MessageError('NOT_FOUND', 'Conversation not found.')
  if (thread.status !== 'OPEN') throw new MessageError('CLOSED', 'This conversation has ended.')
  if (thread.coach.status !== 'VERIFIED') throw new MessageError('NOT_ALLOWED', 'This coach account is not active.')
  const body = sanitizeText(rawBody).trim()
  const problem = messageProblem(body)
  if (problem) throw new MessageError('INVALID', problem)
  if (role === 'coach') {
    const recent = await db.message.findMany({ where: { threadId }, orderBy: { createdAt: 'desc' }, take: MESSAGE_POLICY.maxUnansweredFromCoach, select: { senderId: true } })
    if (unansweredRun(recent.map((m) => m.senderId).reverse(), user.id) >= MESSAGE_POLICY.maxUnansweredFromCoach) {
      throw new MessageError('LIMIT', `Wait for a reply before sending more. Coaches can send ${MESSAGE_POLICY.maxUnansweredFromCoach} messages in a row.`)
    }
  }
  const [message] = await db.$transaction([
    db.message.create({ data: { threadId, senderId: user.id, body, createdAt: now }, select: { id: true } }),
    db.messageThread.update({ where: { id: threadId }, data: { lastMessageAt: now } }),
  ])
  const recipientId = role === 'coach' ? thread.athleteId : thread.coachId
  const senderLabel = role === 'coach' ? coachName(thread.coach) : thread.athlete.firstName
  await notify({ userId: recipientId, kind: 'MESSAGE', title: `New message from ${senderLabel}`, body: body.slice(0, 140), href: `/dashboard/messages/${threadId}`, dedupeKey: `message-${message.id}` })
  if (thread.guardianCopy) await guardianCopyEmail(thread, senderLabel, body, message.id)
  return message
}

export async function closeThread(user: SessionUser, threadId: string, now: Date = new Date()): Promise<void> {
  const thread = await db.messageThread.findUnique({ where: { id: threadId }, select: { coachId: true, athleteId: true } })
  const role = thread ? roleIn(thread, user.id) : null
  if (!thread || !role) throw new MessageError('NOT_FOUND', 'Conversation not found.')
  await db.messageThread.updateMany({ where: { id: threadId, status: 'OPEN' }, data: { status: 'CLOSED', closedBy: role, closedAt: now } })
  await audit('message.thread_closed', { actorId: user.id, targetType: 'message_thread', targetId: threadId, metadata: { by: role } })
}

/**
 * Closes conversations as part of a larger change (a block, consent withdrawal, a suspension).
 * Returned as an operation so the caller runs it inside its own transaction.
 */
export function closeThreadsOperation(scope: { athleteId?: string; coachId?: string }, by: 'block' | 'consent' | 'suspended' | 'staff', now: Date) {
  return db.messageThread.updateMany({ where: { ...scope, status: 'OPEN' }, data: { status: 'CLOSED', closedBy: by, closedAt: now } })
}

/** Participants report the other person's messages. Staff see the message with its context. */
export async function reportMessage(user: SessionUser, messageId: string, reason: string): Promise<void> {
  const message = await db.message.findUnique({ where: { id: messageId }, select: { senderId: true, threadId: true, thread: { select: { coachId: true, athleteId: true } } } })
  const role = message ? roleIn(message.thread, user.id) : null
  if (!message || !role) throw new MessageError('NOT_FOUND', 'Message not found.')
  if (message.senderId === user.id) throw new MessageError('NOT_ALLOWED', 'You can report messages sent to you.')
  await db.messageReport.create({ data: { messageId, reporterKind: role === 'coach' ? 'COACH' : 'ATHLETE', reporterId: user.id, reason: sanitizeText(reason).slice(0, 1000) } })
  await audit('message.reported', { actorId: user.id, targetType: 'message', targetId: messageId, metadata: { by: role } })
}

// ---------------------------------------------------------------------------------------------
// Parent or guardian, through the signed link
// ---------------------------------------------------------------------------------------------

export async function guardianThread(threadId: string, token: string) {
  if (!validGuardianToken(threadId, token)) return null
  return guardianThreadView({ id: threadId })
}

export async function guardianCloseThread(threadId: string, token: string, now: Date = new Date()): Promise<boolean> {
  if (!validGuardianToken(threadId, token)) return false
  return closeAsGuardian({ id: threadId }, now)
}

export async function guardianReport(threadId: string, token: string, messageId: string, reason: string): Promise<boolean> {
  if (!validGuardianToken(threadId, token)) return false
  return reportAsGuardian({ id: threadId }, messageId, reason)
}

// ---------------------------------------------------------------------------------------------
// Parent or guardian, signed in. Callers check guardedAthlete() first; the athlete id is part of
// every query so a thread id belonging to another athlete finds nothing.
// ---------------------------------------------------------------------------------------------

/** Conversations copied to the guardian for one athlete, newest activity first. */
export async function guardianThreadsFor(athleteId: string) {
  const threads = await db.messageThread.findMany({
    where: { athleteId, guardianCopy: true },
    orderBy: { lastMessageAt: 'desc' },
    take: 50,
    select: { ...threadSelect, lastMessageAt: true, _count: { select: { messages: true } } },
  })
  return threads.map((t) => ({ id: t.id, status: t.status, lastMessageAt: t.lastMessageAt, messageCount: t._count.messages, coachLabel: coachLabel(t.coach) }))
}

export async function guardianAccountThread(guardianUserId: string, athleteId: string, threadId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(threadId)) return null
  const view = await guardianThreadView({ id: threadId, athleteId })
  if (view) await audit('message.guardian_viewed', { actorId: guardianUserId, targetType: 'message_thread', targetId: threadId })
  return view
}

export async function guardianAccountCloseThread(guardianUserId: string, athleteId: string, threadId: string, now: Date = new Date()): Promise<boolean> {
  return /^[0-9a-f-]{36}$/i.test(threadId) && closeAsGuardian({ id: threadId, athleteId }, now, guardianUserId)
}

export async function guardianAccountReport(guardianUserId: string, athleteId: string, threadId: string, messageId: string, reason: string): Promise<boolean> {
  return /^[0-9a-f-]{36}$/i.test(threadId) && /^[0-9a-f-]{36}$/i.test(messageId) && reportAsGuardian({ id: threadId, athleteId }, messageId, reason, guardianUserId)
}

type GuardianThreadWhere = { id: string; athleteId?: string }

function coachLabel(coach: { firstName: string; lastName: string; title: string; college: { schoolName: string } | null }) {
  return `${coachName(coach)}, ${coach.title}${coach.college ? `, ${coach.college.schoolName}` : ''}`
}

async function guardianThreadView(where: GuardianThreadWhere) {
  const thread = await db.messageThread.findFirst({ where: { ...where, guardianCopy: true }, select: threadSelect })
  if (!thread) return null
  const messages = await db.message.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: 'asc' }, take: 500, select: { id: true, senderId: true, body: true, createdAt: true } })
  return {
    id: thread.id,
    status: thread.status,
    closedBy: thread.closedBy,
    athleteFirstName: thread.athlete.firstName,
    coachLabel: coachLabel(thread.coach),
    messages: messages.map((m) => ({ id: m.id, fromCoach: m.senderId === thread.coachId, body: m.body, createdAt: m.createdAt })),
  }
}

async function closeAsGuardian(where: GuardianThreadWhere, now: Date, guardianUserId?: string): Promise<boolean> {
  const result = await db.messageThread.updateMany({ where: { ...where, guardianCopy: true, status: 'OPEN' }, data: { status: 'CLOSED', closedBy: 'guardian', closedAt: now } })
  if (result.count) await audit('message.thread_closed', { actorId: guardianUserId, targetType: 'message_thread', targetId: where.id, metadata: { by: 'guardian', via: guardianUserId ? 'account' : 'link' } })
  return result.count > 0
}

async function reportAsGuardian(where: GuardianThreadWhere, messageId: string, reason: string, guardianUserId?: string): Promise<boolean> {
  const message = await db.message.findFirst({ where: { id: messageId, threadId: where.id, thread: { ...(where.athleteId ? { athleteId: where.athleteId } : {}), guardianCopy: true } }, select: { id: true } })
  if (!message) return false
  await db.messageReport.create({ data: { messageId, reporterKind: 'GUARDIAN', reporterId: guardianUserId ?? null, reason: sanitizeText(reason).slice(0, 1000) } })
  await audit('message.reported', { actorId: guardianUserId, targetType: 'message', targetId: messageId, metadata: { by: 'guardian', via: guardianUserId ? 'account' : 'link' } })
  return true
}

// ---------------------------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------------------------

/** Open reports with five messages either side for context. Every load is audited: staff are reading private messages. */
export async function messageReportQueue(adminId: string) {
  const reports = await db.messageReport.findMany({
    where: { resolvedAt: null },
    orderBy: { createdAt: 'asc' },
    take: 25,
    select: { id: true, reason: true, reporterKind: true, createdAt: true, message: { select: { id: true, threadId: true, createdAt: true, senderId: true, thread: { select: threadSelect } } } },
  })
  const out = await Promise.all(
    reports.map(async (r) => {
      const thread = r.message.thread
      const [before, after] = await Promise.all([
        db.message.findMany({ where: { threadId: thread.id, createdAt: { lte: r.message.createdAt } }, orderBy: { createdAt: 'desc' }, take: 6, select: { id: true, senderId: true, body: true, createdAt: true } }),
        db.message.findMany({ where: { threadId: thread.id, createdAt: { gt: r.message.createdAt } }, orderBy: { createdAt: 'asc' }, take: 5, select: { id: true, senderId: true, body: true, createdAt: true } }),
      ])
      return {
        id: r.id,
        reason: r.reason,
        reporterKind: r.reporterKind,
        createdAt: r.createdAt,
        reportedMessageId: r.message.id,
        thread: { id: thread.id, status: thread.status, coachId: thread.coachId, coach: `${coachName(thread.coach)}, ${thread.coach.title}`, athlete: `${thread.athlete.firstName} ${thread.athlete.lastName}`, guardianCopy: thread.guardianCopy },
        context: [...before.reverse(), ...after].map((m) => ({ ...m, fromCoach: m.senderId === thread.coachId })),
      }
    }),
  )
  if (out.length) await audit('message.staff_viewed', { actorId: adminId, metadata: { reports: out.map((r) => r.id) } })
  return out
}

export async function resolveMessageReport(adminId: string, reportId: string, resolution: string, options: { closeThread: boolean }, now: Date = new Date()): Promise<boolean> {
  const report = await db.messageReport.findFirst({ where: { id: reportId, resolvedAt: null }, select: { message: { select: { threadId: true } } } })
  if (!report) return false
  await db.$transaction([
    db.messageReport.update({ where: { id: reportId }, data: { resolvedAt: now, resolution: sanitizeText(resolution).slice(0, 500) } }),
    ...(options.closeThread ? [db.messageThread.updateMany({ where: { id: report.message.threadId, status: 'OPEN' }, data: { status: 'CLOSED', closedBy: 'staff', closedAt: now } })] : []),
  ])
  await audit('message.report_resolved', { actorId: adminId, targetType: 'message_report', targetId: reportId, metadata: { closedThread: options.closeThread } })
  return true
}

/** Sweep: closed conversations are deleted after the retention period unless a report is still open. */
export async function purgeClosedThreads(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - MESSAGE_POLICY.retentionDaysAfterClose * DAY)
  const result = await db.messageThread.deleteMany({ where: { status: 'CLOSED', closedAt: { lt: cutoff }, messages: { none: { reports: { some: { resolvedAt: null } } } } } })
  return result.count
}
