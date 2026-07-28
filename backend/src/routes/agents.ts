import { Router } from "express";
import { z } from "zod";
import { requireAgentsToken } from "../lib/auth.js";
import { pool } from "../lib/db.js";
import { logger } from "../lib/logger.js";

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
