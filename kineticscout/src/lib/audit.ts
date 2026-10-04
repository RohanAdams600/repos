import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { db } from '@/lib/db'
import { errorFields, logger } from '@/lib/logger'

export type AuditAction =
  | 'auth.sign_up'
  | 'auth.sign_in_failed'
  | 'auth.account_completed'
  | 'auth.age_screen_refused'
  | 'guardian.consent_requested'
  | 'guardian.consent_granted'
  | 'profile.created'
  | 'billing.checkout_started'
  | 'billing.subscription_synced'
  | 'billing.duplicate_subscription_canceled'
  | 'billing.duplicate_refund_failed'
  | 'admin.marketing_asset_reviewed'
  | 'admin.blog_post_reviewed'
  | 'upload.rejected'

/** Records a security-relevant event. Never throws: auditing must not break the user flow. */
export async function audit(
  action: AuditAction,
  details: { actorId?: string | null; targetType?: string; targetId?: string; metadata?: Prisma.InputJsonValue } = {},
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        action,
        actorId: details.actorId ?? null,
        targetType: details.targetType,
        targetId: details.targetId,
        metadata: details.metadata,
      },
    })
  } catch (error) {
    logger.error({ action, ...errorFields(error) }, 'audit write failed')
  }
}
