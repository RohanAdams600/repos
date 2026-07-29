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
import {
  recordHeartbeat,
  fetchUnscoredLeads,
  fetchRecentGuaranteeSLABreaches,
  markGuaranteeFlagged,
  triggerNightlyReport,
  syncInbox,
  fetchPendingInboxMessages,
  submitInboxDraft,
  fetchPendingSms,
  submitSmsDraft,
  proposeCalendarSlots,
} from "../lib/db.js";

/** Cheap signal that an inbound message is asking to get on the calendar — proposeCalendarSlots only ever proposes, never books (identity.md boundary #2). */
const SCHEDULING_KEYWORDS =
  /\b(schedule|reschedule|appointment|book|booking|availability|available|meet up|meeting|calendar|time slot|swing by|come by|stop by)\b/i;

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

/** Wordsmith drafts a reply; the founder sends it from the dashboard — drafting here never sends anything. */
async function processInboxMessages(): Promise<void> {
  const { synced } = await syncInbox();
  if (synced > 0) logger.info({ synced }, "heartbeat: synced inbox");

  const pending = await fetchPendingInboxMessages();
  if (pending.length === 0) return;

  logger.info({ count: pending.length }, "heartbeat: drafting inbox replies");
  const outcomes = await kai.submitBatch(
    pending.map((message) => ({
      type: "content",
      summary: `Draft a reply to an inbound email from ${message.from_email}: "${message.subject}"`,
      payload: { from: message.from_email, subject: message.subject, body: message.body },
      source: "heartbeat",
    }))
  );

  await Promise.all(
    pending.map(async (message, i) => {
      const draft = outcomes[i]?.result.output;
      if (!draft) return;
      await submitInboxDraft(message.id, draft);
      if (SCHEDULING_KEYWORDS.test(`${message.subject} ${message.body}`)) {
        await proposeCalendarSlots({
          contactName: message.from_email,
          contactEmail: message.from_email,
          purpose: message.subject || "Requested via inbound email",
        }).catch((err) => logger.error({ err, messageId: message.id }, "heartbeat: failed to propose calendar slots"));
      }
    })
  );
}

/** Same drafting pattern as inbox, over SMS instead of email. */
async function processSmsMessages(): Promise<void> {
  const pending = await fetchPendingSms();
  if (pending.length === 0) return;

  logger.info({ count: pending.length }, "heartbeat: drafting sms replies");
  const outcomes = await kai.submitBatch(
    pending.map((message) => ({
      type: "content",
      summary: `Draft an SMS reply to an inbound text from ${message.phone}`,
      payload: { phone: message.phone, body: message.body },
      source: "heartbeat",
    }))
  );

  await Promise.all(
    pending.map(async (message, i) => {
      const draft = outcomes[i]?.result.output;
      if (!draft) return;
      await submitSmsDraft(message.id, draft);
      if (SCHEDULING_KEYWORDS.test(message.body)) {
        await proposeCalendarSlots({
          contactName: message.phone,
          contactPhone: message.phone,
          purpose: "Requested via inbound text",
        }).catch((err) => logger.error({ err, messageId: message.id }, "heartbeat: failed to propose calendar slots"));
      }
    })
  );
}

async function runHeartbeat(): Promise<void> {
  const start = Date.now();
  logger.info({ trustStage: env.TRUST_STAGE }, "heartbeat: cycle start");

  let tasksProcessed = 0;
  let tasksFailed = 0;

  try {
    await scoreUnscoredLeads();
    await checkGuaranteeSLA();
    await processInboxMessages();
    await processSmsMessages();
    await triggerNightlyReport();
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
