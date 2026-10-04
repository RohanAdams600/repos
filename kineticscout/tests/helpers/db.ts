import { randomUUID } from 'node:crypto'
import type { Position, SubscriptionTier } from '@/generated/prisma/enums'
import type { SessionUser } from '@/lib/auth/permissions'
import { db } from '@/lib/db'

const TABLES = [
  'testimonials', 'contact_messages',
  'ai_usage', 'audit_logs', 'marketing_assets', 'blog_posts', 'agent_runs', 'percentile_baselines', 'video_analyses',
  'stripe_events', 'checkout_sessions', 'subscriptions', 'recruiting_pipeline', 'college_programs', 'metrics',
  'athlete_profiles', 'guardian_consents', 'users',
]

export async function resetDb(): Promise<void> {
  await db.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`)
}

export async function createAthlete(options: { tier?: SubscriptionTier; gradYear?: number; position?: Position; stripeCustomerId?: string } = {}): Promise<SessionUser> {
  const id = randomUUID()
  await db.user.create({
    data: {
      id,
      email: `athlete-${id.slice(0, 8)}@example.test`,
      dateOfBirth: new Date(Date.UTC(2008, 0, 15)),
      subscriptionTier: options.tier ?? 'FREE',
      stripeCustomerId: options.stripeCustomerId,
      termsVersion: 'test',
      termsAcceptedAt: new Date(),
      athleteProfile: {
        create: {
          firstName: 'Test',
          lastName: 'Athlete',
          gradYear: options.gradYear ?? 2027,
          primaryPosition: options.position ?? 'SHORTSTOP',
        },
      },
    },
  })
  return {
    id,
    email: `athlete-${id.slice(0, 8)}@example.test`,
    role: 'ATHLETE',
    tier: options.tier ?? 'FREE',
    ageBand: 'ADULT',
    guardianConsent: 'NOT_REQUIRED',
    hasAthleteProfile: true,
  }
}
