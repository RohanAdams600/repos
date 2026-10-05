import 'server-only'
import { z } from 'zod'
import { audit } from '@/lib/audit'
import { db } from '@/lib/db'
import { closeThreadsOperation } from '@/lib/messaging/service'
import { sendEmail } from '@/lib/email/send'
import { renderLocalizedEmail } from '@/lib/email/localized'
import { env } from '@/lib/env'
import { errorFields, logger } from '@/lib/logger'
import { notify } from '@/lib/notifications/service'
import { randomToken, sha256Hex } from '@/lib/security/hash'
import { normalizeEmail, sanitizeText } from '@/lib/security/sanitize'
import { isLocale } from '@/i18n/config'
import { recipientLocale } from '@/i18n/recipient'
import { workEmailAllowed } from '@/lib/coach/rules'

const TOKEN_TTL_MS = 48 * 3600_000

const name = (label: string) =>
  z
    .string()
    .transform((v) => sanitizeText(v))
    .pipe(z.string().min(1, `Enter your ${label}`).max(50, `${label} is too long`))

export const coachProfileSchema = z.object({
  firstName: name('first name'),
  lastName: name('last name'),
  title: z
    .string()
    .transform((v) => sanitizeText(v))
    .pipe(z.string().min(2, 'Enter your title, for example Assistant Coach').max(80)),
  collegeId: z.uuid({ error: 'Choose your program' }),
  workEmail: z
    .string()
    .trim()
    .max(254)
    .pipe(z.email('Enter your school email address'))
    .transform(normalizeEmail),
  staffDirectoryUrl: z
    .string()
    .trim()
    .max(512)
    .pipe(z.url('Enter the link to your program staff directory'))
    .refine((v) => v.startsWith('https://'), 'Use the https:// link to the staff directory'),
})

export type CoachProfileInput = z.infer<typeof coachProfileSchema>

export class CoachVerificationError extends Error {
  constructor(
    public readonly field: 'workEmail' | 'collegeId' | 'form',
    message: string,
  ) {
    super(message)
    this.name = 'CoachVerificationError'
  }
}

/**
 * Step 1: details plus a link to the school email address. A changed submission restarts
 * verification, so a verified coach cannot move to a different program without review.
 */
export async function submitCoachProfile(userId: string, input: CoachProfileInput): Promise<void> {
  const program = await db.collegeProgram.findUnique({ where: { id: input.collegeId }, select: { schoolName: true, headCoachEmail: true } })
  if (!program) throw new CoachVerificationError('collegeId', 'Choose your program from the list.')
  if (!workEmailAllowed(input.workEmail, program.headCoachEmail)) {
    throw new CoachVerificationError('workEmail', 'Use your school email address (ending in .edu or your athletic department domain).')
  }
  const current = await db.coachProfile.findUnique({ where: { userId }, select: { status: true } })
  if (current?.status === 'SUSPENDED') throw new CoachVerificationError('form', 'This coach account is suspended. Contact support.')

  const token = randomToken()
  const data = {
    ...input,
    workEmailTokenHash: sha256Hex(token),
    workEmailTokenExpiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    workEmailVerifiedAt: null,
    status: 'EMAIL_PENDING' as const,
    reviewNote: null,
    reviewedById: null,
    reviewedAt: null,
  }
  await db.coachProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data })
  await audit('coach.verification_submitted', { actorId: userId, targetType: 'coach_profile', targetId: userId, metadata: { collegeId: input.collegeId } })

  const link = `${env().APP_URL}/coach/verify-email?token=${encodeURIComponent(token)}`
  const { subject, text, html } = renderLocalizedEmail(
    {
      subject: { en: 'Confirm your school email for KineticScout', es: 'Confirma tu correo de la universidad para KineticScout' },
      paragraphs: [
        { en: `Confirm that ${input.workEmail} is your address at ${program.schoolName}.`, es: `Confirma que ${input.workEmail} es tu dirección en ${program.schoolName}.` },
        {
          en: 'After you confirm, a KineticScout staff member checks your program staff directory, usually within 2 business days. If you did not request this, ignore this email.',
          es: 'Después de confirmar, una persona del equipo de KineticScout revisa el directorio de personal de tu programa, normalmente en un plazo de 2 días hábiles. Si no lo solicitaste, ignora este correo.',
        },
      ],
      action: { label: { en: 'Confirm my school email', es: 'Confirmar mi correo de la universidad' }, url: link },
    },
    await recipientLocale(userId),
  )
  await sendEmail({ to: input.workEmail, subject, text, html, idempotencyKey: `coach-email-${userId}-${data.workEmailTokenHash.slice(0, 12)}` })
}

/** Step 2: the link from the school inbox. Moves the coach to staff review. */
export async function confirmWorkEmail(token: string): Promise<'confirmed' | 'invalid'> {
  if (token.length < 20 || token.length > 100) return 'invalid'
  const result = await db.coachProfile.updateMany({
    where: { workEmailTokenHash: sha256Hex(token), status: 'EMAIL_PENDING', workEmailTokenExpiresAt: { gt: new Date() } },
    data: { status: 'IN_REVIEW', workEmailVerifiedAt: new Date(), workEmailTokenHash: null, workEmailTokenExpiresAt: null },
  })
  return result.count === 1 ? 'confirmed' : 'invalid'
}

/** Step 3: staff decision (or a later suspension). Notifies the coach either way. */
export async function decideCoach(reviewerId: string, coachId: string, decision: 'VERIFIED' | 'REJECTED' | 'SUSPENDED', note: string | null): Promise<boolean> {
  const allowedFrom = decision === 'SUSPENDED' ? ['VERIFIED', 'IN_REVIEW'] : ['IN_REVIEW']
  const result = await db.coachProfile.updateMany({
    where: { userId: coachId, status: { in: allowedFrom as ('VERIFIED' | 'IN_REVIEW')[] } },
    data: { status: decision, reviewNote: note ? sanitizeText(note).slice(0, 500) : null, reviewedById: reviewerId, reviewedAt: new Date() },
  })
  if (result.count === 0) return false
  if (decision === 'SUSPENDED') {
    // A suspended coach's open requests are withdrawn so athletes are not left waiting, and their conversations end.
    await db.$transaction([
      db.contactRequest.updateMany({ where: { coachId, status: { in: ['PENDING', 'ATHLETE_ACCEPTED'] } }, data: { status: 'WITHDRAWN', guardianTokenHash: null } }),
      closeThreadsOperation({ coachId }, 'suspended', new Date()),
    ])
  }
  await audit(decision === 'VERIFIED' ? 'coach.verified' : decision === 'REJECTED' ? 'coach.rejected' : 'coach.suspended', { actorId: reviewerId, targetType: 'coach_profile', targetId: coachId })
  const titles = {
    VERIFIED: { en: 'Your coach account is verified', es: 'Tu cuenta de entrenador está verificada' },
    REJECTED: { en: 'We could not verify your coach account', es: 'No pudimos verificar tu cuenta de entrenador' },
    SUSPENDED: { en: 'Your coach account is suspended', es: 'Tu cuenta de entrenador está suspendida' },
  }
  const bodies = {
    VERIFIED: { en: 'You can now search public athlete profiles, save prospects and send contact requests.', es: 'Ya puedes buscar perfiles públicos de atletas, guardar prospectos y enviar solicitudes de contacto.' },
    REJECTED: {
      en: `We could not match you to your program staff directory.${note ? ` Reviewer note: ${note}` : ''} You can update your details and submit again.`,
      es: `No pudimos encontrarte en el directorio de personal de tu programa.${note ? ` Nota del revisor: ${note}` : ''} Puedes actualizar tus datos y volver a enviarlos.`,
    },
    SUSPENDED: {
      en: `Your coach account is suspended after a review.${note ? ` Reason: ${note}` : ''} Contact support if you think this is a mistake.`,
      es: `Tu cuenta de entrenador quedó suspendida después de una revisión.${note ? ` Motivo: ${note}` : ''} Contacta a soporte si crees que es un error.`,
    },
  }
  await notify({ userId: coachId, kind: 'COACH_VERIFICATION', title: titles[decision], body: bodies[decision], href: '/dashboard', dedupeKey: `coach-${decision}-${Date.now()}` })
  const user = await db.user.findUnique({ where: { id: coachId }, select: { email: true, locale: true } })
  if (user) {
    const { subject, text, html } = renderLocalizedEmail(
      { subject: titles[decision], paragraphs: [bodies[decision]], action: { label: { en: 'Open KineticScout', es: 'Abrir KineticScout' }, url: `${env().APP_URL}/dashboard` } },
      isLocale(user.locale) ? user.locale : 'en',
    )
    try {
      await sendEmail({ to: user.email, subject, text, html, idempotencyKey: `coach-decision-${coachId}-${decision}-${Date.now()}` })
    } catch (error) {
      logger.error(errorFields(error), 'coach decision email failed')
    }
  }
  return true
}

export async function verifiedCoach(userId: string) {
  return db.coachProfile.findFirst({ where: { userId, status: 'VERIFIED' }, select: { userId: true, firstName: true, lastName: true, title: true, college: { select: { id: true, schoolName: true, division: true, sport: true } } } })
}
