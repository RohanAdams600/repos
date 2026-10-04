import type { Job } from 'bullmq'
import type { MetricEvidenceJob } from '@/lib/queue/queues'
import { runEvidenceChecks } from '@/lib/verification/run-checks'

/** Automated pre-checks for a verification request; a staff reviewer makes the decision. */
export async function processMetricEvidence(job: Job<MetricEvidenceJob>): Promise<{ result: string }> {
  return { result: await runEvidenceChecks(job.data.metricId) }
}
