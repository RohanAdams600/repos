import 'server-only'
import { db } from '@/lib/db'
import { notify } from '@/lib/notifications/service'

/**
 * In-app notice for the athlete's parent or guardian, when they have a guardian account under the
 * address the athlete named. The email the guardian already receives is unchanged; this only adds
 * the item to their Family page and notifications.
 */
export async function notifyGuardianAccount(athleteId: string, input: { title: string; body: string; dedupeKey: string }): Promise<boolean> {
  const consent = await db.guardianConsent.findUnique({ where: { userId: athleteId }, select: { guardianEmail: true } })
  if (!consent) return false
  const guardian = await db.user.findFirst({ where: { email: consent.guardianEmail.toLowerCase(), role: 'GUARDIAN', deletionScheduledFor: null }, select: { id: true } })
  if (!guardian) return false
  return notify({ userId: guardian.id, kind: 'FAMILY', title: input.title, body: input.body, href: `/dashboard/family/${athleteId}`, dedupeKey: input.dedupeKey })
}
