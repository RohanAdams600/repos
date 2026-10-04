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
          publicShowGpa: true,
          publicShowSchool: true,
          publicSince: true,
          recruitingAlerts: true,
          recruitingAlertEmails: true,
          createdAt: true,
          updatedAt: true,
          metrics: {
            orderBy: { date: 'asc' },
            select: {
              id: true,
              date: true,
              metricType: true,
              value: true,
              verified: true,
              createdAt: true,
              verification: { select: { status: true, rejectionReason: true, reviewerNote: true, recordedAt: true, durationMs: true, reviewedAt: true, createdAt: true, videoDeletedAt: true } },
            },
          },
          outreachDrafts: { orderBy: { createdAt: 'asc' }, select: { trigger: true, channel: true, subject: true, body: true, createdAt: true, copiedAt: true, college: { select: { schoolName: true } } } },
          profileViews: { orderBy: { day: 'asc' }, select: { day: true, views: true, pdfDownloads: true } },
          contactRequests: {
            orderBy: { createdAt: 'asc' },
            select: { status: true, message: true, createdAt: true, athleteRespondedAt: true, guardianRespondedAt: true, coach: { select: { firstName: true, lastName: true, title: true, college: { select: { schoolName: true } } } } },
          },
          coachBlocks: { select: { createdAt: true, coach: { select: { firstName: true, lastName: true } } } },
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
      notifications: { orderBy: { createdAt: 'asc' }, select: { kind: true, title: true, body: true, createdAt: true, readAt: true } },
      coachProfile: {
        select: {
          firstName: true,
          lastName: true,
          title: true,
          workEmail: true,
          workEmailVerifiedAt: true,
          staffDirectoryUrl: true,
          status: true,
          reviewNote: true,
          reviewedAt: true,
          createdAt: true,
          college: { select: { schoolName: true } },
          savedProspects: { select: { note: true, createdAt: true, updatedAt: true, athlete: { select: { firstName: true, lastName: true, gradYear: true } } } },
          contactRequests: { select: { status: true, message: true, createdAt: true, sharedEmails: true, athlete: { select: { firstName: true, lastName: true } } } },
        },
      },
      coachReports: { select: { reason: true, createdAt: true, resolvedAt: true } },
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
      'Verification evidence clips are reviewed privately and deleted 30 days after the decision; the decision is kept with the measurement.',
      'Public profile counts are daily totals with no information about who viewed your profile.',
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
          publicShowGpa: profile.publicShowGpa,
          publicShowSchool: profile.publicShowSchool,
          publicSince: profile.publicSince,
          recruitingAlerts: profile.recruitingAlerts,
          recruitingAlertEmails: profile.recruitingAlertEmails,
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
    outreachDrafts: (profile?.outreachDrafts ?? []).map((d) => ({ ...d, college: d.college.schoolName })),
    publicProfileDailyCounts: (profile?.profileViews ?? []).map((v) => ({ ...v, day: v.day.toISOString().slice(0, 10) })),
    notifications: user.notifications,
    contactRequestsReceived: (profile?.contactRequests ?? []).map((r) => ({ ...r, coach: { name: `${r.coach.firstName} ${r.coach.lastName}`, title: r.coach.title, school: r.coach.college?.schoolName ?? null } })),
    blockedCoaches: (profile?.coachBlocks ?? []).map((b) => ({ coach: `${b.coach.firstName} ${b.coach.lastName}`, blockedAt: b.createdAt })),
    coachAccount: user.coachProfile,
    reportsYouMade: user.coachReports,
    aiFeatureUse: user.aiUsage,
    securityEvents,
  }
}

export type AccountExport = Awaited<ReturnType<typeof buildAccountExport>>
