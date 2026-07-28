/**
 * The autonomous loop's clock. In `manual`/`supervised` trust stage this
 * still runs — it just means most of what it finds gets queued for
 * founder review instead of auto-executing (see orchestrator/trust.ts).
 * Promoting to `autonomous` in .env doesn't change this file at all; it
 * only changes what the trust gate allows through.
 */
import cron from "node-cron";
import { kai } from "../orchestrator/manager.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { alertFounder } from "../lib/alerts.js";
import { recordHeartbeat, fetchUnscoredLeads, fetchRecentGuaranteeSLABreaches, markGuaranteeFlagged } from "../lib/db.js";

async function scoreUnscoredLeads(): Promise<void> {
  const leads = await fetchUnscoredLeads();
  if (leads.length === 0) return;

  logger.info({ count: leads.length }, "heartbeat: scoring unscored leads");
  await kai.submitBatch(
    leads.map((lead) => ({
      type: "lead-score",
      summary: `Score inbound lead ${lead.id} against the sales playbook rubric`,
      payload: lead.payload,
      source: "heartbeat",
    }))
  );
}

async function checkGuaranteeSLA(): Promise<void> {
  const breaches = await fetchRecentGuaranteeSLABreaches();
  for (const breach of breaches) {
    await alertFounder(
      `Guarantee SLA breach: client ${breach.clientId} kicked off ${breach.kickoffAt} and still has no live agent at day 14. Comp this month per the sales playbook guarantee.`
    );
    await markGuaranteeFlagged(breach.clientId);
  }
}

async function runHeartbeat(): Promise<void> {
  const start = Date.now();
  logger.info({ trustStage: env.TRUST_STAGE }, "heartbeat: cycle start");

  let tasksProcessed = 0;
  let tasksFailed = 0;

  try {
    await scoreUnscoredLeads();
    await checkGuaranteeSLA();
    const stats = kai.getSessionStats();
    tasksProcessed = stats.processed;
    tasksFailed = stats.failed;
  } catch (err) {
    logger.error({ err }, "heartbeat: cycle failed");
    await alertFounder(`Heartbeat cycle threw an error: ${err instanceof Error ? err.message : String(err)}`);
  }

  await recordHeartbeat({ tasksProcessed, tasksFailed, trustStage: env.TRUST_STAGE }).catch((err) =>
    logger.error({ err }, "failed to persist heartbeat")
  );

  logger.info({ durationMs: Date.now() - start }, "heartbeat: cycle complete");
}

export function startHeartbeat(): void {
  const cronExpression = `*/${env.HEARTBEAT_INTERVAL_MINUTES} * * * *`;
  logger.info({ cronExpression, trustStage: env.TRUST_STAGE }, "heartbeat: scheduling");

  cron.schedule(cronExpression, () => {
    void runHeartbeat();
  });
}

/** Exposed for the dashboard's "run now" control and for tests. */
export { runHeartbeat };
