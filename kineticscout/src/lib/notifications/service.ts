import 'server-only'
import type { NotificationKind } from '@/generated/prisma/enums'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { errorFields, logger } from '@/lib/logger'
import { isLocalized, recipientLocale, textIn, type Text } from '@/i18n/recipient'
import { enqueuePush } from '@/lib/queue/queues'

/** Title and body are stored in the recipient's language: give both languages, or one fixed string. */
export type NewNotification = { userId: string; kind: NotificationKind; title: Text; body: Text; href?: string; dedupeKey?: string }

/** Idempotent when a dedupe key is given: a retried job never notifies twice. Returns false for a duplicate. */
export async function notify(input: NewNotification): Promise<boolean> {
  if (input.dedupeKey) {
    const existing = await db.notification.findUnique({ where: { userId_dedupeKey: { userId: input.userId, dedupeKey: input.dedupeKey } }, select: { id: true } })
    if (existing) return false
  }
  const locale = isLocalized(input.title) || isLocalized(input.body) ? await recipientLocale(input.userId) : 'en'
  try {
    const created = await db.notification.create({
      data: { userId: input.userId, kind: input.kind, title: textIn(input.title, locale).slice(0, 160), body: textIn(input.body, locale).slice(0, 1000), href: input.href, dedupeKey: input.dedupeKey },
      select: { id: true },
    })
    await queuePush(input.userId, created.id)
    return true
  } catch (error) {
    // Unique violation from a concurrent duplicate.
    if ((error as { code?: string }).code === 'P2002') return false
    throw error
  }
}

export async function unreadCount(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } })
}

/**
 * Push to the user's devices, if push is configured and they turned it on somewhere. A queue
 * outage never fails the notification itself: the in-app notification is already stored.
 */
async function queuePush(userId: string, notificationId: string): Promise<void> {
  const e = env()
  if (!e.VAPID_PUBLIC_KEY || !e.REDIS_URL) return
  try {
    if ((await db.pushSubscription.count({ where: { userId } })) === 0) return
    await enqueuePush(notificationId)
  } catch (error) {
    logger.warn({ notificationId, ...errorFields(error) }, 'push not queued')
  }
}
