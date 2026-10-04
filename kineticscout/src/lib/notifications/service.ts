import 'server-only'
import type { NotificationKind } from '@/generated/prisma/enums'
import { db } from '@/lib/db'

export type NewNotification = { userId: string; kind: NotificationKind; title: string; body: string; href?: string; dedupeKey?: string }

/** Idempotent when a dedupe key is given: a retried job never notifies twice. Returns false for a duplicate. */
export async function notify(input: NewNotification): Promise<boolean> {
  if (input.dedupeKey) {
    const existing = await db.notification.findUnique({ where: { userId_dedupeKey: { userId: input.userId, dedupeKey: input.dedupeKey } }, select: { id: true } })
    if (existing) return false
  }
  try {
    await db.notification.create({
      data: { userId: input.userId, kind: input.kind, title: input.title.slice(0, 160), body: input.body.slice(0, 1000), href: input.href, dedupeKey: input.dedupeKey },
    })
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
