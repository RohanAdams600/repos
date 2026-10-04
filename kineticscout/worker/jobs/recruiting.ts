import type { Job } from 'bullmq'
import type { LlmClient } from '@/lib/ai/llm'
import { enqueueOutreachDraft, type RecruitingJob } from '@/lib/queue/queues'
import { processDraftForAthlete, processProgramChange } from '@/lib/recruiting/assistant'

/** Agent 3 queue consumer: fan-out jobs per change, then one draft job per watching athlete. */
export function createRecruitingProcessor(llm: () => LlmClient) {
  return async function processRecruitingJob(job: Job<RecruitingJob>): Promise<unknown> {
    if (job.data.kind === 'change') return processProgramChange(job.data.changeId, enqueueOutreachDraft)
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1)
    return { result: await processDraftForAthlete(llm(), job.data.changeId, job.data.athleteId, { finalAttempt }) }
  }
}
