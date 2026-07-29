import { Router } from "express";
import { z } from "zod";
import { requireAgentsToken } from "../lib/auth.js";
import {
  pool,
  insertInboxMessageIfNew,
  listNewInboxMessages,
  setInboxDraft,
  insertCalendarProposal,
  insertInvoiceDraft,
  listNewSms,
  setSmsDraft,
} from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { maybeSendNightlyReport } from "../lib/reports.js";
import { fetchUnreadEmails } from "../lib/gmail.js";
import { proposeAvailableSlots } from "../lib/calendar.js";

export const agentsRouter = Router();
agentsRouter.use(requireAgentsToken);

const runSchema = z.object({
  taskId: z.string().uuid(),
  taskType: z.string(),
  agent: z.enum(["scout", "wordsmith", "patch", "warden"]),
  status: z.enum(["completed", "failed", "queued_for_review", "blocked"]),
  attempt: z.number().int().positive(),
  startedAt: z.string(),
  finishedAt: z.string(),
  assessmentPassed: z.boolean().nullable(),
  assessmentNotes: z.string().nullable(),
});

agentsRouter.post("/runs", async (req, res) => {
  const parsed = runSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten().fieldErrors });
    return;
  }

  const r = parsed.data;
  await pool.query(
    `INSERT INTO agent_runs
      (task_id, task_type, agent, status, attempt, started_at, finished_at, assessment_passed, assessment_notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [r.taskId, r.taskType, r.agent, r.status, r.attempt, r.startedAt, r.finishedAt, r.assessmentPassed, r.assessmentNotes]
  );
  res.status(201).json({ ok: true });
});

const heartbeatSchema = z.object({
  tasksProcessed: z.number().int().nonnegative(),
  tasksFailed: z.number().int().nonnegative(),
  trustStage: z.enum(["manual", "supervised", "autonomous"]),
});

agentsRouter.post("/heartbeats", async (req, res) => {
  const parsed = heartbeatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }

  await pool.query(
    `INSERT INTO agent_heartbeats (tasks_processed, tasks_failed, trust_stage, ran_at) VALUES ($1,$2,$3,NOW())`,
    [parsed.data.tasksProcessed, parsed.data.tasksFailed, parsed.data.trustStage]
  );
  res.status(201).json({ ok: true });
});

agentsRouter.get("/leads/unscored", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 25, 100);
  const result = await pool.query(
    `SELECT id, revenue_band, team_size, time_sink, tier_interest, referred_by_client
     FROM leads WHERE score IS NULL ORDER BY created_at ASC LIMIT $1`,
    [limit]
  );
  res.status(200).json({
    leads: result.rows.map((row) => ({ id: row.id, payload: row })),
  });
});

const scoreSchema = z.object({ score: z.number().int().min(0).max(100), notes: z.string() });

agentsRouter.patch("/leads/:id/score", async (req, res) => {
  const parsed = scoreSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }

  const result = await pool.query(
    `UPDATE leads SET score = $2, score_notes = $3, scored_at = NOW() WHERE id = $1`,
    [req.params.id, parsed.data.score, parsed.data.notes]
  );
  if (result.rowCount === 0) {
    res.status(404).json({ error: "lead_not_found" });
    return;
  }
  logger.info({ leadId: req.params.id, score: parsed.data.score }, "lead scored by Scout");
  res.status(200).json({ ok: true });
});

agentsRouter.get("/guarantee-breaches", async (_req, res) => {
  const result = await pool.query(
    `SELECT client_id, kickoff_at FROM client_onboarding
     WHERE first_agent_live_at IS NULL AND kickoff_at < NOW() - INTERVAL '14 days'
       AND guarantee_flagged_at IS NULL`
  );
  res.status(200).json({
    breaches: result.rows.map((row) => ({ clientId: row.client_id, kickoffAt: row.kickoff_at })),
  });
});

agentsRouter.post("/guarantee-breaches/:clientId/flag", async (req, res) => {
  await pool.query(`UPDATE client_onboarding SET guarantee_flagged_at = NOW() WHERE client_id = $1`, [
    req.params.clientId,
  ]);
  res.status(200).json({ ok: true });
});

/**
 * Called every heartbeat cycle — cheap no-op most of the time. Only
 * actually compiles and sends once per day, after the configured report
 * hour. See lib/reports.ts.
 */
agentsRouter.post("/nightly-report", async (_req, res) => {
  const result = await maybeSendNightlyReport();
  res.status(200).json(result);
});

// ---------------------------------------------------------------------
// Inbox (Gmail) — Wordsmith's lane. Sync pulls new mail in; drafting a
// reply is a 'content' task through the normal Kai loop; sending only
// ever happens from the founder-gated /api/inbox/:id/send route.
// ---------------------------------------------------------------------

agentsRouter.post("/inbox/sync", async (_req, res) => {
  const messages = await fetchUnreadEmails();
  await Promise.all(
    messages.map((m) =>
      insertInboxMessageIfNew({ externalId: m.externalId, fromEmail: m.fromEmail, subject: m.subject, body: m.body })
    )
  );
  res.status(200).json({ synced: messages.length });
});

agentsRouter.get("/inbox/pending", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 25, 100);
  const messages = await listNewInboxMessages(limit);
  res.status(200).json({ messages });
});

const inboxDraftSchema = z.object({ draftedReply: z.string().min(1) });

agentsRouter.patch("/inbox/:id/draft", async (req, res) => {
  const parsed = inboxDraftSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }
  await setInboxDraft(req.params.id, parsed.data.draftedReply);
  res.status(200).json({ ok: true });
});

// ---------------------------------------------------------------------
// Calendar — Scout's lane (checking availability is research, not a
// write). Creating the real event is founder-gated (routes/calendar.ts).
// ---------------------------------------------------------------------

const calendarProposeSchema = z.object({
  contactName: z.string().min(1),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  purpose: z.string().min(1),
  durationMinutes: z.number().int().positive().default(30),
});

agentsRouter.post("/calendar/propose", async (req, res) => {
  const parsed = calendarProposeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten().fieldErrors });
    return;
  }

  const slots = await proposeAvailableSlots(parsed.data.durationMinutes);
  const proposal = await insertCalendarProposal({
    contactName: parsed.data.contactName,
    contactEmail: parsed.data.contactEmail,
    contactPhone: parsed.data.contactPhone,
    purpose: parsed.data.purpose,
    proposedSlots: slots,
  });
  res.status(201).json({ proposal });
});

// ---------------------------------------------------------------------
// Invoicing — Wordsmith drafts the line items; sending is founder-gated
// (routes/invoices.ts), per identity.md boundary #1.
// ---------------------------------------------------------------------

const invoiceDraftSchema = z.object({
  clientId: z.string().uuid().optional(),
  clientEmail: z.string().email(),
  lineItems: z.array(z.object({ description: z.string().min(1), amountCents: z.number().int().positive() })).min(1),
});

agentsRouter.post("/invoices/draft", async (req, res) => {
  const parsed = invoiceDraftSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const invoice = await insertInvoiceDraft(parsed.data);
  res.status(201).json({ invoice });
});

// ---------------------------------------------------------------------
// SMS (Twilio) — inbound arrives via the public webhook in routes/sms.ts;
// Wordsmith drafts a reply here; sending is founder-gated.
// ---------------------------------------------------------------------

agentsRouter.get("/sms/pending", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 25, 100);
  const messages = await listNewSms(limit);
  res.status(200).json({ messages });
});

const smsDraftSchema = z.object({ draftedReply: z.string().min(1) });

agentsRouter.patch("/sms/:id/draft", async (req, res) => {
  const parsed = smsDraftSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }
  await setSmsDraft(req.params.id, parsed.data.draftedReply);
  res.status(200).json({ ok: true });
});
