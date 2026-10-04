import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { db } from '@/lib/db'
import { errorFields, logger } from '@/lib/logger'

export type AuditAction =
  | 'auth.sign_up'
  | 'auth.sign_in_failed'
  | 'auth.account_completed'
  | 'auth.age_screen_refused'
  | 'auth.reauth_failed'
  | 'guardian.consent_requested'
  | 'guardian.consent_granted'
  | 'profile.created'
  | 'profile.updated'
  | 'profile.visibility_changed'
  | 'profile.link_rotated'
  | 'verification.requested'
  | 'verification.approved'
  | 'verification.rejected'
  | 'program.updated'
  | 'program.roster_need_posted'
  | 'outreach.drafted'
  | 'reference_clip.created'
  | 'reference_clip.updated'
  | 'coach.verification_submitted'
  | 'coach.verified'
  | 'coach.rejected'
  | 'coach.suspended'
  | 'coach.reported'
  | 'contact.requested'
  | 'contact.accepted'
  | 'contact.declined'
  | 'contact.guardian_approved'
  | 'contact.guardian_declined'
  | 'contact.withdrawn'
  | 'contact.blocked'
  | 'billing.checkout_started'
  | 'billing.subscription_synced'
  | 'billing.duplicate_subscription_canceled'
  | 'billing.duplicate_refund_failed'
  | 'admin.marketing_asset_reviewed'
  | 'admin.blog_post_reviewed'
  | 'admin.case_study_created'
  | 'admin.testimonial_created'
  | 'admin.testimonial_reviewed'
  | 'upload.rejected'
  | 'account.data_exported'
  | 'account.deletion_scheduled'
  | 'account.deletion_canceled'
  | 'account.deleted'
  | 'email.preferences_updated'
  | 'guardian.consent_revoked'
  | 'guardian.manage_link_sent'
  | 'legal.terms_accepted'
  | 'norms.imported'
  | 'norms.activated'
  | 'norms.retired'
  | 'norms.deleted'
  | 'team.created'
  | 'team.resubmitted'
  | 'team.verified'
  | 'team.rejected'
  | 'team.suspended'
  | 'team.join_requested'
  | 'team.join_decided'
  | 'team.guardian_decided'
  | 'team.member_ended'
  | 'team.session_recorded'
  | 'message.thread_closed'
  | 'message.reported'
  | 'message.report_resolved'
  | 'message.staff_viewed'
  | 'message.guardian_viewed'
  | 'guardian.data_exported'
  | 'event.submitted'
  | 'event.published'
  | 'event.rejected'
  | 'event.updated'
  | 'event.canceled'
  | 'calendar.period_added'
  | 'calendar.period_removed'
  | 'training.drill_created'
  | 'training.drill_published'
  | 'training.drill_retired'
  | 'training.plan_created'

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
