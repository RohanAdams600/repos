/**
 * The nightly report — the one Night Desk/Autonoma claim that's fully
 * real today with zero third-party credentials, since it's built
 * entirely from data already in this database. Idempotent per calendar
 * day (nightly_reports.report_date is UNIQUE) and only fires once the
 * configured report hour has passed, so it reads as "compiled at close
 * of business," not "whenever the heartbeat happens to poll."
 */
import { pool } from "./db.js";
import { notifyFounder } from "./email.js";
import { logger } from "./logger.js";

const REPORT_HOUR = 20; // 8pm local server time — configurable if this ever needs to move

interface DigestCounts {
  newLeads: number;
  newProspects: number;
  callsPlaced: number;
  inboxHandled: number;
  smsHandled: number;
  agentRunsCompleted: number;
  agentRunsFailed: number;
  flaggedForReview: number;
}

async function gatherCounts(): Promise<DigestCounts> {
  const [leads, prospects, calls, inbox, sms, runs, flagged] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS n FROM leads WHERE created_at::date = CURRENT_DATE`),
    pool.query(`SELECT COUNT(*) AS n FROM prospects WHERE created_at::date = CURRENT_DATE`),
    pool.query(`SELECT COUNT(*) AS n FROM cold_calls WHERE created_at::date = CURRENT_DATE`),
    pool.query(`SELECT COUNT(*) AS n FROM inbox_messages WHERE status = 'sent' AND created_at::date = CURRENT_DATE`),
    pool.query(`SELECT COUNT(*) AS n FROM sms_messages WHERE status = 'sent' AND created_at::date = CURRENT_DATE`),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'completed') AS completed,
         COUNT(*) FILTER (WHERE status = 'failed') AS failed
       FROM agent_runs WHERE created_at::date = CURRENT_DATE`
    ),
    pool.query(
      `SELECT COUNT(*) AS n FROM agent_runs WHERE status = 'queued_for_review' AND created_at::date = CURRENT_DATE`
    ),
  ]);

  return {
    newLeads: Number(leads.rows[0].n),
    newProspects: Number(prospects.rows[0].n),
    callsPlaced: Number(calls.rows[0].n),
    inboxHandled: Number(inbox.rows[0].n),
    smsHandled: Number(sms.rows[0].n),
    agentRunsCompleted: Number(runs.rows[0].completed),
    agentRunsFailed: Number(runs.rows[0].failed),
    flaggedForReview: Number(flagged.rows[0].n),
  };
}

function formatDigest(counts: DigestCounts, dateLabel: string): string {
  const lines = [
    `Night Desk — Nightly Report — ${dateLabel}`,
    "",
    `New waitlist leads: ${counts.newLeads}`,
    `New prospects added: ${counts.newProspects}`,
    `Cold calls placed: ${counts.callsPlaced}`,
    `Inbox replies sent: ${counts.inboxHandled}`,
    `Texts sent: ${counts.smsHandled}`,
    `Agent tasks completed: ${counts.agentRunsCompleted}`,
    `Agent tasks failed: ${counts.agentRunsFailed}`,
    `Waiting on your review: ${counts.flaggedForReview}`,
  ];

  if (counts.flaggedForReview > 0) {
    lines.push("", `${counts.flaggedForReview} item(s) need you specifically — check the dashboard.`);
  }

  return lines.join("\n");
}

/**
 * Called every heartbeat cycle by /agents (cheap no-op most of the time).
 * Only actually compiles and sends once per day, after REPORT_HOUR, and
 * never twice for the same calendar day.
 */
export async function maybeSendNightlyReport(): Promise<{ sent: boolean }> {
  const now = new Date();
  if (now.getHours() < REPORT_HOUR) return { sent: false };

  const counts = await gatherCounts();
  const dateLabel = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const summary = formatDigest(counts, dateLabel);

  // The INSERT itself is the atomic claim on today — ON CONFLICT DO
  // NOTHING means a second concurrent call (or a retried heartbeat) sees
  // rowCount 0 and skips the send, rather than a check-then-insert race
  // where two callers could both see "not sent yet" and both send.
  let claimed = false;
  try {
    const result = await pool.query(
      `INSERT INTO nightly_reports (report_date, summary) VALUES (CURRENT_DATE, $1)
       ON CONFLICT (report_date) DO NOTHING`,
      [summary]
    );
    claimed = (result.rowCount ?? 0) > 0;
  } catch (err) {
    logger.error({ err }, "failed to record nightly_reports row");
    return { sent: false };
  }

  if (!claimed) return { sent: false };

  await notifyFounder(`Nightly Report — ${dateLabel}`, summary);
  logger.info({ dateLabel }, "nightly report sent");
  return { sent: true };
}
