import 'server-only'
import { db } from '@/lib/db'

export const EXPORT_SCHEMA_VERSION = 1

/**
 * Everything KineticScout holds about one account, in a machine-readable form (right of access and
 * data portability). Raw videos are listed by id; they can be downloaded from the dashboard while
 * they are retained. Nothing about any other user is included.
 */
export async function buildAccountExport(userId: string, now: Date = new Date()) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      subscriptionTier: true,
      dateOfBirth: true,
      marketingEmailOptIn: true,
      marketingOptInUpdatedAt: true,
      termsVersion: true,
      termsAcceptedAt: true,
      acquisition: true,
      deletionScheduledFor: true,
      createdAt: true,
      stripeCustomerId: true,
      guardianConsent: { select: { guardianEmail: true, status: true, grantedAt: true, revokedAt: true, createdAt: true } },
      athleteProfile: {
        select: {
          firstName: true,
          lastName: true,
          sport: true,
          primaryPosition: true,
          gradYear: true,
          heightInches: true,
          weightLbs: true,
          gpa: true,
          highSchool: true,
          twitterHandle: true,
          bats: true,
          throws: true,
          isPublic: true,
          publicSlug: true,
          createdAt: true,
          updatedAt: true,
          metrics: { orderBy: { date: 'asc' }, select: { id: true, date: true, metricType: true, value: true, verified: true, createdAt: true } },
          pipeline: {
            orderBy: { createdAt: 'asc' },
            select: { status: true, lastContactDate: true, createdAt: true, college: { select: { schoolName: true, division: true, state: true } } },
          },
          videoAnalyses: {
            orderBy: { createdAt: 'asc' },
            select: { id: true, motionType: true, handedness: true, status: true, errorCode: true, durationMs: true, report: true, poseData: true, createdAt: true, completedAt: true },
          },
        },
      },
      subscriptions: { select: { id: true, status: true, interval: true, currentPeriodEnd: true, cancelAtPeriodEnd: true, createdAt: true } },
      testimonials: { select: { displayName: true, descriptor: true, quote: true, rating: true, status: true, consentRecordedAt: true, publishedAt: true } },
      aiUsage: { orderBy: { createdAt: 'asc' }, select: { feature: true, createdAt: true } },
    },
  })

  const [contactMessages, securityEvents] = await Promise.all([
    db.contactMessage.findMany({ where: { email: user.email }, orderBy: { createdAt: 'asc' }, select: { topic: true, message: true, createdAt: true, repliedAt: true } }),
    db.auditLog.findMany({ where: { actorId: userId }, orderBy: { createdAt: 'asc' }, select: { action: true, createdAt: true } }),
  ])

  const profile = user.athleteProfile
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    notes: [
      'Dates are ISO 8601 in UTC. Metric units: mph for velocities, seconds for timed events, yards for distance, percent for spiral efficiency.',
      'Video files are not embedded. Videos you uploaded can be viewed in the dashboard until they are deleted under the retention policy.',
      'Payment card details are held by Stripe, not KineticScout. Invoices are available from the billing portal.',
    ],
    account: {
      id: user.id,
      email: user.email,
      role: user.role,
      plan: user.subscriptionTier,
      dateOfBirth: user.dateOfBirth.toISOString().slice(0, 10),
      createdAt: user.createdAt,
      termsVersionAccepted: user.termsVersion,
      termsAcceptedAt: user.termsAcceptedAt,
      marketingEmail: { optedIn: user.marketingEmailOptIn, updatedAt: user.marketingOptInUpdatedAt },
      firstTouchCampaign: user.acquisition,
      deletionScheduledFor: user.deletionScheduledFor,
      hasStripeCustomer: user.stripeCustomerId !== null,
    },
    guardianConsent: user.guardianConsent,
    athleteProfile: profile
      ? {
          firstName: profile.firstName,
          lastName: profile.lastName,
          sport: profile.sport,
          primaryPosition: profile.primaryPosition,
          gradYear: profile.gradYear,
          heightInches: profile.heightInches,
          weightLbs: profile.weightLbs,
          gpa: profile.gpa === null ? null : Number(profile.gpa),
          highSchool: profile.highSchool,
          twitterHandle: profile.twitterHandle,
          bats: profile.bats,
          throws: profile.throws,
          isPublic: profile.isPublic,
          publicSlug: profile.publicSlug,
          createdAt: profile.createdAt,
          updatedAt: profile.updatedAt,
        }
      : null,
    metrics: (profile?.metrics ?? []).map((m) => ({ ...m, date: m.date.toISOString().slice(0, 10), value: Number(m.value) })),
    recruitingPipeline: (profile?.pipeline ?? []).map((p) => ({ ...p, lastContactDate: p.lastContactDate?.toISOString().slice(0, 10) ?? null })),
    videoAnalyses: profile?.videoAnalyses ?? [],
    subscriptions: user.subscriptions,
    reviews: user.testimonials,
    contactMessages,
    aiFeatureUse: user.aiUsage,
    securityEvents,
  }
}

export type AccountExport = Awaited<ReturnType<typeof buildAccountExport>>
