import 'server-only'
import type { NotificationKind } from '@/generated/prisma/enums'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { errorFields, logger } from '@/lib/logger'
import type { Locale } from '@/i18n/config'
import { recipientLocale } from '@/i18n/recipient'
import { isAllowedPushEndpoint, sendWebPush, type VapidConfig } from '@/lib/push/webpush'

/**
 * Lock screens are often visible to others, and many of our users are teenagers, so a push shows a
 * generic line only: never a name, a value or message text. The app shows the details once opened.
 */
const PUSH_TITLES: Record<Locale, Record<NotificationKind, string>> = {
  en: {
    MESSAGE: 'New message',
    CONTACT_REQUEST: 'New contact request',
    CONTACT_UPDATE: 'Update on a contact request',
    COACH_VERIFICATION: 'Account review update',
    TEAM_UPDATE: 'Team update',
    METRIC_VERIFIED: 'Verification result',
    METRIC_REJECTED: 'Verification result',
    COACH_CHANGE: 'Recruiting alert',
    ROSTER_NEED: 'Recruiting alert',
    FAMILY: 'Something needs your attention',
    EVENT: 'Event update',
    TRAINING: 'Training plan update',
  },
  es: {
    MESSAGE: 'Mensaje nuevo',
    CONTACT_REQUEST: 'Nueva solicitud de contacto',
    CONTACT_UPDATE: 'Novedad sobre una solicitud de contacto',
    COACH_VERIFICATION: 'Novedad sobre la revisión de tu cuenta',
    TEAM_UPDATE: 'Novedad del equipo',
    METRIC_VERIFIED: 'Resultado de la verificación',
    METRIC_REJECTED: 'Resultado de la verificación',
    COACH_CHANGE: 'Alerta de reclutamiento',
    ROSTER_NEED: 'Alerta de reclutamiento',
    FAMILY: 'Algo necesita tu atención',
    EVENT: 'Novedad de un evento',
    TRAINING: 'Novedad del plan de entrenamiento',
  },
}
const PUSH_BODY: Record<Locale, string> = { en: 'Open KineticScout to read it.', es: 'Abre KineticScout para leerlo.' }

export function pushPayload(kind: NotificationKind, href: string | null, locale: Locale = 'en'): { title: string; body: string; url: string; tag: string } {
  return { title: PUSH_TITLES[locale][kind], body: PUSH_BODY[locale], url: href && href.startsWith('/') && !href.startsWith('//') ? href : '/dashboard/notifications', tag: kind }
}

export function vapidConfig(): VapidConfig | null {
  const e = env()
  return e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY && e.VAPID_SUBJECT ? { publicKey: e.VAPID_PUBLIC_KEY, privateKey: e.VAPID_PRIVATE_KEY, subject: e.VAPID_SUBJECT } : null
}

const MAX_SUBSCRIPTIONS_PER_USER = 10

export class PushSubscriptionError extends Error {}

/** Saves this device's subscription for the user. An endpoint moves to whoever subscribed last on that browser. */
export async function savePushSubscription(userId: string, input: { endpoint: string; p256dh: string; auth: string }): Promise<void> {
  if (!isAllowedPushEndpoint(input.endpoint)) throw new PushSubscriptionError('This browser’s push service is not supported.')
  if (!/^[A-Za-z0-9_-]{87}$/.test(input.p256dh) || !/^[A-Za-z0-9_-]{22}$/.test(input.auth)) throw new PushSubscriptionError('The browser sent invalid push keys.')
  await db.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: { userId, ...input },
    update: { userId, p256dh: input.p256dh, auth: input.auth, failureCount: 0 },
  })
  // Keep the most recent devices only.
  const extra = await db.pushSubscription.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, skip: MAX_SUBSCRIPTIONS_PER_USER, select: { id: true } })
  if (extra.length) await db.pushSubscription.deleteMany({ where: { id: { in: extra.map((e) => e.id) } } })
}

export async function removePushSubscription(userId: string, endpoint: string): Promise<void> {
  await db.pushSubscription.deleteMany({ where: { userId, endpoint } })
}

/** Worker: delivers one notification to every device the user turned push on for. */
export async function deliverPush(notificationId: string, send: typeof sendWebPush = sendWebPush): Promise<{ sent: number; removed: number }> {
  const vapid = vapidConfig()
  if (!vapid) return { sent: 0, removed: 0 }
  const notification = await db.notification.findUnique({ where: { id: notificationId }, select: { userId: true, kind: true, href: true, readAt: true } })
  if (!notification || notification.readAt) return { sent: 0, removed: 0 }
  const subscriptions = await db.pushSubscription.findMany({ where: { userId: notification.userId }, select: { id: true, endpoint: true, p256dh: true, auth: true, failureCount: true } })
  const payload = pushPayload(notification.kind, notification.href, await recipientLocale(notification.userId))
  let sent = 0
  let removed = 0
  for (const sub of subscriptions) {
    try {
      const result = await send(sub, payload, vapid)
      if (result.ok) {
        sent++
        await db.pushSubscription.update({ where: { id: sub.id }, data: { lastSuccessAt: new Date(), failureCount: 0 } })
      } else if (result.gone || sub.failureCount >= 4) {
        removed++
        await db.pushSubscription.delete({ where: { id: sub.id } })
      } else {
        await db.pushSubscription.update({ where: { id: sub.id }, data: { failureCount: { increment: 1 } } })
      }
    } catch (error) {
      logger.warn({ subscriptionId: sub.id, ...errorFields(error) }, 'push delivery failed')
      await db.pushSubscription.update({ where: { id: sub.id }, data: { failureCount: { increment: 1 } } })
    }
  }
  return { sent, removed }
}
