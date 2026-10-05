import 'server-only'
import type { Position } from '@/generated/prisma/enums'
import { BudgetExceededError } from '@/lib/ai/budget'
import type { LlmClient } from '@/lib/ai/llm'
import { ageBand } from '@/lib/auth/age'
import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email/send'
import { renderLocalizedEmail } from '@/lib/email/localized'
import { env } from '@/lib/env'
import { errorFields, logger } from '@/lib/logger'
import { notify } from '@/lib/notifications/service'
import type { Localized } from '@/i18n/define'
import { recipientLocale } from '@/i18n/recipient'
import { draftOutreach } from '@/lib/recruiting/outreach'

/**
 * Agent 3, the Recruiting Assistant. Athletes switch it on from the dashboard; it then watches the
 * programs in their recruiting pipeline. When a head coach changes or a program posts a roster need,
 * each watching athlete gets an alert and a draft introduction to review.
 */

export type Watcher = { athleteId: string; email: string; firstName: string; emailAlerts: boolean }

/** Pro athletes (with guardian consent if under 18) who follow the program and turned alerts on. */
export async function watchersForChange(changeId: string, now: Date = new Date()): Promise<Watcher[]> {
  const change = await db.programChange.findUnique({ where: { id: changeId }, select: { collegeId: true, kind: true, newValue: true } })
  if (!change) return []
  const need = change.kind === 'ROSTER_NEED_POSTED' ? (change.newValue as { position?: string | null; gradYear?: number | null }) : null
  const rows = await db.recruitingPipeline.findMany({
    where: {
      collegeId: change.collegeId,
      athlete: {
        recruitingAlerts: true,
        ...(need?.position ? { primaryPosition: need.position as Position } : {}),
        ...(need?.gradYear ? { gradYear: need.gradYear } : {}),
        user: { deletionScheduledFor: null, OR: [{ subscriptionTier: 'PRO' }, { role: 'ADMIN' }] },
      },
    },
    select: {
      athlete: {
        select: {
          userId: true,
          firstName: true,
          recruitingAlertEmails: true,
          user: { select: { email: true, dateOfBirth: true, guardianConsent: { select: { status: true } } } },
        },
      },
    },
  })
  return rows
    .filter((r) => {
      const band = ageBand(r.athlete.user.dateOfBirth, now)
      return band === 'ADULT' || (band === 'MINOR' && r.athlete.user.guardianConsent?.status === 'GRANTED')
    })
    .map((r) => ({ athleteId: r.athlete.userId, email: r.athlete.user.email, firstName: r.athlete.firstName, emailAlerts: r.athlete.recruitingAlertEmails }))
}

/** Fan-out step: one draft job per watcher, then the change is marked processed. Safe to repeat. */
export async function processProgramChange(changeId: string, enqueueDraft: (changeId: string, athleteId: string) => Promise<void>, now: Date = new Date()): Promise<{ watchers: number }> {
  const change = await db.programChange.findUnique({ where: { id: changeId }, select: { processedAt: true } })
  if (!change || change.processedAt) return { watchers: 0 }
  const watchers = await watchersForChange(changeId, now)
  for (const w of watchers) await enqueueDraft(changeId, w.athleteId)
  await db.programChange.update({ where: { id: changeId }, data: { processedAt: now } })
  return { watchers: watchers.length }
}

function describeChange(change: { kind: string; newValue: unknown; college: { schoolName: string } }): { title: Localized; detail: Localized } {
  const value = change.newValue as { name?: string; note?: string }
  const school = change.college.schoolName
  if (change.kind === 'HEAD_COACH_CHANGED') {
    return {
      title: { en: `New head coach at ${school}`, es: `Nuevo entrenador principal en ${school}` },
      detail: { en: `${value.name ?? 'A new coach'} is now the head coach at ${school}.`, es: `${value.name ?? 'Un nuevo entrenador'} es ahora el entrenador principal en ${school}.` },
    }
  }
  return {
    title: { en: `${school} posted a roster need`, es: `${school} publicó una necesidad de plantilla` },
    // The note is copied from the program's own posting, so it stays in its original language.
    detail: value.note ? { en: value.note, es: value.note } : { en: 'The program posted a new roster need.', es: 'El programa publicó una nueva necesidad de plantilla.' },
  }
}

/**
 * Per-athlete step: draft an introduction, then notify (in the app, and by email if the athlete
 * kept email alerts on). If drafting is impossible (AI budget reached, or the last retry failed)
 * the alert still goes out without a draft.
 */
export async function processDraftForAthlete(
  llm: LlmClient,
  changeId: string,
  athleteId: string,
  options: { finalAttempt: boolean },
): Promise<'drafted' | 'alerted-without-draft' | 'skipped'> {
  const change = await db.programChange.findUnique({ where: { id: changeId }, select: { kind: true, newValue: true, sourceUrl: true, collegeId: true, college: { select: { schoolName: true } } } })
  if (!change) return 'skipped'
  // Re-check eligibility: the athlete may have downgraded or turned alerts off since the fan-out.
  const watcher = (await watchersForChange(changeId)).find((w) => w.athleteId === athleteId)
  if (!watcher) return 'skipped'

  const existing = await db.outreachDraft.findUnique({ where: { athleteId_changeId: { athleteId, changeId } }, select: { id: true } })
  let drafted = Boolean(existing)
  if (!existing) {
    try {
      await draftOutreach(llm, { athleteId, collegeId: change.collegeId, changeId, channel: 'EMAIL', trigger: change.kind === 'HEAD_COACH_CHANGED' ? 'COACH_CHANGE' : 'ROSTER_NEED' })
      drafted = true
    } catch (error) {
      if (!(error instanceof BudgetExceededError) && !options.finalAttempt) throw error
      logger.warn({ changeId, athleteId, ...errorFields(error) }, 'outreach draft unavailable; alerting without a draft')
    }
  }

  const { title, detail } = describeChange(change)
  const body = drafted
    ? { en: `${detail.en} We drafted an introduction for you to review and send.`, es: `${detail.es} Redactamos una presentación para que la revises y la envíes.` }
    : { en: `${detail.en} Open the recruiting assistant to write an introduction.`, es: `${detail.es} Abre el asistente de reclutamiento para escribir una presentación.` }
  const fresh = await notify({ userId: athleteId, kind: change.kind === 'HEAD_COACH_CHANGED' ? 'COACH_CHANGE' : 'ROSTER_NEED', title, body, href: '/dashboard/recruiting', dedupeKey: `change:${changeId}` })
  if (fresh && watcher.emailAlerts) {
    const { subject, text, html } = renderLocalizedEmail(
      {
        subject: title,
        paragraphs: [
          { en: `Hi ${watcher.firstName},`, es: `Hola, ${watcher.firstName}:` },
          detail,
          ...(drafted ? [{ en: 'We drafted an introduction you can review, edit and send from your own email.', es: 'Redactamos una presentación que puedes revisar, editar y enviar desde tu propio correo. Está en inglés, porque va dirigida al entrenador.' }] : []),
          ...(change.sourceUrl ? [{ en: `Source: ${change.sourceUrl}`, es: `Fuente: ${change.sourceUrl}` }] : []),
        ],
        action: { label: { en: 'Open the recruiting assistant', es: 'Abrir el asistente de reclutamiento' }, url: `${env().APP_URL}/dashboard/recruiting` },
        footer: [
          {
            en: 'You get these alerts because you turned on the recruiting assistant. Turn them off on the recruiting assistant page.',
            es: 'Recibes estas alertas porque activaste el asistente de reclutamiento. Puedes desactivarlas en la página del asistente de reclutamiento.',
          },
        ],
      },
      await recipientLocale(athleteId),
    )
    try {
      await sendEmail({ to: watcher.email, subject, text, html, idempotencyKey: `change-${changeId}-${athleteId}` })
    } catch (error) {
      logger.error({ changeId, ...errorFields(error) }, 'recruiting alert email failed')
    }
  }
  return drafted ? 'drafted' : 'alerted-without-draft'
}
