import 'server-only'
import { AiFeature } from '@/generated/prisma/enums'
import { startOfUtcMonth } from '@/lib/ai/budget'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { errorFields, logger } from '@/lib/logger'
import { ageSeconds, type Gauge } from '@/lib/ops/prometheus'
import { getQueue, QUEUE_NAMES } from '@/lib/queue/queues'

/** An analysis still PROCESSING after this long has lost its worker. The sweep requeues QUEUED rows after 10 minutes. */
export const STUCK_PROCESSING_MINUTES = 30

type Backlogs = {
  verifications_in_review: number
  verifications_oldest: Date | null
  coaches_in_review: number
  coaches_oldest: Date | null
  coach_reports_open: number
  coach_reports_oldest: Date | null
  program_changes_unprocessed: number
  program_changes_oldest: Date | null
  deletions_scheduled: number
  deletions_overdue: number
  analyses_queued: number
  analyses_queued_oldest: Date | null
  analyses_processing_stuck: number
  analyses_failed_24h: number
  contact_pending: number
  contact_guardian_pending: number
  contact_guardian_oldest: Date | null
  ai_spend_micros: bigint
  teams_in_review: number
  teams_oldest: Date | null
  message_reports_open: number
  message_reports_oldest: Date | null
  norm_datasets_active: number
  norm_licences_expiring: number
  push_devices: number
}

type FeatureSpend = { feature: string; micros: bigint }
type AgentHealth = { agent: string; last_success: Date | null; failed_24h: number }

const QUEUE_STATES = ['waiting', 'active', 'delayed', 'failed'] as const

async function queueGauges(): Promise<Gauge[]> {
  const names = Object.values(QUEUE_NAMES)
  if (!env().REDIS_URL) return [{ name: 'kineticscout_queue_reachable', help: 'Whether the job queue could be read during this scrape (1) or not (0).', samples: [{ value: 0 }] }]
  try {
    const counts = await Promise.race([
      Promise.all(names.map(async (name) => ({ name, counts: await getQueue(name).getJobCounts(...QUEUE_STATES) }))),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('queue count timeout')), 2_000)),
    ])
    return [
      { name: 'kineticscout_queue_reachable', help: 'Whether the job queue could be read during this scrape (1) or not (0).', samples: [{ value: 1 }] },
      {
        name: 'kineticscout_queue_jobs',
        help: 'Background jobs by queue and state.',
        samples: counts.flatMap(({ name, counts }) => QUEUE_STATES.map((state) => ({ labels: { queue: name, state }, value: counts[state] ?? 0 }))),
      },
    ]
  } catch (error) {
    logger.warn(errorFields(error), 'metrics: queue counts unavailable')
    return [{ name: 'kineticscout_queue_reachable', help: 'Whether the job queue could be read during this scrape (1) or not (0).', samples: [{ value: 0 }] }]
  }
}

/**
 * Operational gauges for dashboards and alerts: review backlogs, overdue deletions, stuck jobs and
 * AI spend. Counts only; no identifiers or personal data leave this function.
 */
export async function collectOperationalMetrics(now: Date = new Date()): Promise<Gauge[]> {
  const started = performance.now()
  const monthStart = startOfUtcMonth(now)
  const dayAgo = new Date(now.getTime() - 24 * 3600_000)
  const stuckBefore = new Date(now.getTime() - STUCK_PROCESSING_MINUTES * 60_000)

  const [[b], features, agents, queues] = await Promise.all([
    db.$queryRaw<Backlogs[]>`
      SELECT
        (SELECT count(*)::int FROM metric_verifications WHERE status = 'IN_REVIEW') AS verifications_in_review,
        (SELECT min(created_at) FROM metric_verifications WHERE status = 'IN_REVIEW') AS verifications_oldest,
        (SELECT count(*)::int FROM coach_profiles WHERE status = 'IN_REVIEW') AS coaches_in_review,
        (SELECT min(updated_at) FROM coach_profiles WHERE status = 'IN_REVIEW') AS coaches_oldest,
        (SELECT count(*)::int FROM coach_reports WHERE resolved_at IS NULL) AS coach_reports_open,
        (SELECT min(created_at) FROM coach_reports WHERE resolved_at IS NULL) AS coach_reports_oldest,
        (SELECT count(*)::int FROM program_changes WHERE processed_at IS NULL) AS program_changes_unprocessed,
        (SELECT min(detected_at) FROM program_changes WHERE processed_at IS NULL) AS program_changes_oldest,
        (SELECT count(*)::int FROM users WHERE deletion_scheduled_for IS NOT NULL) AS deletions_scheduled,
        (SELECT count(*)::int FROM users WHERE deletion_scheduled_for < ${now}) AS deletions_overdue,
        (SELECT count(*)::int FROM video_analyses WHERE status = 'QUEUED') AS analyses_queued,
        (SELECT min(created_at) FROM video_analyses WHERE status = 'QUEUED') AS analyses_queued_oldest,
        (SELECT count(*)::int FROM video_analyses WHERE status = 'PROCESSING' AND COALESCE(started_at, created_at) < ${stuckBefore}) AS analyses_processing_stuck,
        (SELECT count(*)::int FROM video_analyses WHERE status = 'FAILED' AND created_at >= ${dayAgo} AND COALESCE(error_code, '') NOT IN ('UPLOAD_EXPIRED', 'VIDEO_PURGED')) AS analyses_failed_24h,
        (SELECT count(*)::int FROM contact_requests WHERE status = 'PENDING') AS contact_pending,
        (SELECT count(*)::int FROM contact_requests WHERE status = 'ATHLETE_ACCEPTED') AS contact_guardian_pending,
        (SELECT min(athlete_responded_at) FROM contact_requests WHERE status = 'ATHLETE_ACCEPTED') AS contact_guardian_oldest,
        (SELECT COALESCE(sum(cost_micros), 0)::bigint FROM ai_usage WHERE created_at >= ${monthStart}) AS ai_spend_micros,
        (SELECT count(*)::int FROM teams WHERE status = 'PENDING') AS teams_in_review,
        (SELECT min(updated_at) FROM teams WHERE status = 'PENDING') AS teams_oldest,
        (SELECT count(*)::int FROM message_reports WHERE resolved_at IS NULL) AS message_reports_open,
        (SELECT min(created_at) FROM message_reports WHERE resolved_at IS NULL) AS message_reports_oldest,
        (SELECT count(*)::int FROM norm_datasets WHERE status = 'ACTIVE' AND (licence_expires_at IS NULL OR licence_expires_at >= ${now}::date)) AS norm_datasets_active,
        (SELECT count(*)::int FROM norm_datasets WHERE status = 'ACTIVE' AND licence_expires_at >= ${now}::date AND licence_expires_at < (${now}::date + 30)) AS norm_licences_expiring,
        (SELECT count(*)::int FROM push_subscriptions) AS push_devices`,
    db.$queryRaw<FeatureSpend[]>`
      SELECT feature::text AS feature, COALESCE(sum(cost_micros), 0)::bigint AS micros FROM ai_usage WHERE created_at >= ${monthStart} GROUP BY feature`,
    db.$queryRaw<AgentHealth[]>`
      SELECT a.agent::text AS agent,
        (SELECT max(finished_at) FROM agent_runs r WHERE r.agent = a.agent AND r.status = 'SUCCEEDED') AS last_success,
        (SELECT count(*)::int FROM agent_runs r WHERE r.agent = a.agent AND r.status = 'FAILED' AND r.started_at >= ${dayAgo}) AS failed_24h
      FROM unnest(enum_range(NULL::"AgentType")) AS a(agent)`,
    queueGauges(),
  ])
  if (!b) throw new Error('metrics query returned no row')

  const spendByFeature = new Map(features.map((f) => [f.feature, Number(f.micros) / 1_000_000]))
  const e = env()
  const gauges: Gauge[] = [
    { name: 'kineticscout_metric_verifications_in_review', help: 'Metric verification clips waiting for staff review.', samples: [{ value: b.verifications_in_review }] },
    { name: 'kineticscout_metric_verifications_oldest_age_seconds', help: 'Age of the oldest verification waiting for review (0 when none).', samples: [{ value: ageSeconds(b.verifications_oldest, now) }] },
    { name: 'kineticscout_coach_verifications_in_review', help: 'Coach accounts waiting for staff review.', samples: [{ value: b.coaches_in_review }] },
    { name: 'kineticscout_coach_verifications_oldest_age_seconds', help: 'Age of the oldest coach account waiting for review (0 when none).', samples: [{ value: ageSeconds(b.coaches_oldest, now) }] },
    { name: 'kineticscout_coach_reports_open', help: 'Reports about coaches not yet resolved by staff.', samples: [{ value: b.coach_reports_open }] },
    { name: 'kineticscout_coach_reports_oldest_age_seconds', help: 'Age of the oldest unresolved coach report (0 when none).', samples: [{ value: ageSeconds(b.coach_reports_oldest, now) }] },
    { name: 'kineticscout_team_verifications_in_review', help: 'High school and travel teams waiting for staff review.', samples: [{ value: b.teams_in_review }] },
    { name: 'kineticscout_team_verifications_oldest_age_seconds', help: 'Age of the oldest team waiting for review (0 when none).', samples: [{ value: ageSeconds(b.teams_oldest, now) }] },
    { name: 'kineticscout_message_reports_open', help: 'Reported messages not yet resolved by staff.', samples: [{ value: b.message_reports_open }] },
    { name: 'kineticscout_message_reports_oldest_age_seconds', help: 'Age of the oldest unresolved message report (0 when none).', samples: [{ value: ageSeconds(b.message_reports_oldest, now) }] },
    { name: 'kineticscout_norm_datasets_active', help: 'Licensed national norm tables currently in use.', samples: [{ value: b.norm_datasets_active }] },
    { name: 'kineticscout_norm_licences_expiring_30d', help: 'Active norm tables whose licence ends within 30 days.', samples: [{ value: b.norm_licences_expiring }] },
    { name: 'kineticscout_push_devices', help: 'Devices with push notifications turned on.', samples: [{ value: b.push_devices }] },
    { name: 'kineticscout_program_changes_unprocessed', help: 'Detected college program changes the recruiting assistant has not processed.', samples: [{ value: b.program_changes_unprocessed }] },
    { name: 'kineticscout_program_changes_oldest_age_seconds', help: 'Age of the oldest unprocessed program change (0 when none).', samples: [{ value: ageSeconds(b.program_changes_oldest, now) }] },
    { name: 'kineticscout_account_deletions_scheduled', help: 'Accounts inside their deletion grace period.', samples: [{ value: b.deletions_scheduled }] },
    { name: 'kineticscout_account_deletions_overdue', help: 'Accounts whose scheduled deletion time has passed but still exist.', samples: [{ value: b.deletions_overdue }] },
    { name: 'kineticscout_video_analyses_queued', help: 'Video analyses waiting for a worker.', samples: [{ value: b.analyses_queued }] },
    { name: 'kineticscout_video_analyses_queued_oldest_age_seconds', help: 'Age of the oldest queued video analysis (0 when none).', samples: [{ value: ageSeconds(b.analyses_queued_oldest, now) }] },
    { name: 'kineticscout_video_analyses_processing_stuck', help: `Video analyses still processing after ${STUCK_PROCESSING_MINUTES} minutes.`, samples: [{ value: b.analyses_processing_stuck }] },
    { name: 'kineticscout_video_analyses_failed_24h', help: 'Video analyses that failed in the last 24 hours, excluding expired uploads.', samples: [{ value: b.analyses_failed_24h }] },
    {
      name: 'kineticscout_contact_requests_open',
      help: 'Open coach contact requests by stage.',
      samples: [
        { labels: { stage: 'athlete' }, value: b.contact_pending },
        { labels: { stage: 'guardian' }, value: b.contact_guardian_pending },
      ],
    },
    { name: 'kineticscout_contact_requests_guardian_oldest_age_seconds', help: 'Time the oldest request has waited for guardian approval since the athlete accepted (0 when none).', samples: [{ value: ageSeconds(b.contact_guardian_oldest, now) }] },
    {
      name: 'kineticscout_ai_spend_usd',
      help: 'AI spend this UTC month in US dollars, by feature (reservations count until settled).',
      samples: Object.values(AiFeature).map((feature) => ({ labels: { feature }, value: spendByFeature.get(feature) ?? 0 })),
    },
    { name: 'kineticscout_ai_spend_month_usd', help: 'Total AI spend this UTC month in US dollars.', samples: [{ value: Number(b.ai_spend_micros) / 1_000_000 }] },
    { name: 'kineticscout_ai_budget_month_usd', help: 'Configured global monthly AI budget in US dollars.', samples: [{ value: e.AI_GLOBAL_MONTHLY_BUDGET_USD }] },
    {
      name: 'kineticscout_agent_last_success_timestamp_seconds',
      help: 'Unix time of the last successful run per agent (0 when it has never succeeded).',
      samples: agents.map((a) => ({ labels: { agent: a.agent }, value: a.last_success ? Math.floor(a.last_success.getTime() / 1000) : 0 })),
    },
    { name: 'kineticscout_agent_runs_failed_24h', help: 'Failed agent runs in the last 24 hours.', samples: agents.map((a) => ({ labels: { agent: a.agent }, value: a.failed_24h })) },
    ...queues,
  ]
  gauges.push({ name: 'kineticscout_metrics_collect_seconds', help: 'Time taken to collect these metrics.', samples: [{ value: Number(((performance.now() - started) / 1000).toFixed(3)) }] })
  return gauges
}
