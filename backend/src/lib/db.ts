import pg from "pg";
import { env } from "./env.js";

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

export interface Lead {
  id: string;
  email: string;
  business_name: string;
  revenue_band: string;
  team_size: string;
  time_sink: string;
  tier_interest: "starter" | "core" | "scale";
  referred_by_client: boolean;
  score: number | null;
  score_notes: string | null;
  stripe_customer_id: string | null;
  deposit_paid_at: string | null;
  created_at: string;
}

export async function insertLead(input: {
  email: string;
  businessName: string;
  revenueBand: string;
  teamSize: string;
  timeSink: string;
  tierInterest: "starter" | "core" | "scale";
  referredByClient: boolean;
}): Promise<Lead> {
  const result = await pool.query<Lead>(
    `INSERT INTO leads (email, business_name, revenue_band, team_size, time_sink, tier_interest, referred_by_client)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (email) DO UPDATE SET
       business_name = EXCLUDED.business_name,
       revenue_band = EXCLUDED.revenue_band,
       team_size = EXCLUDED.team_size,
       time_sink = EXCLUDED.time_sink,
       tier_interest = EXCLUDED.tier_interest,
       referred_by_client = EXCLUDED.referred_by_client
     RETURNING *`,
    [
      input.email,
      input.businessName,
      input.revenueBand,
      input.teamSize,
      input.timeSink,
      input.tierInterest,
      input.referredByClient,
    ]
  );
  return result.rows[0];
}

export async function findLeadByEmail(email: string): Promise<Lead | null> {
  const result = await pool.query<Lead>(`SELECT * FROM leads WHERE email = $1`, [email]);
  return result.rows[0] ?? null;
}

export async function attachStripeCustomerToLead(email: string, stripeCustomerId: string): Promise<void> {
  await pool.query(`UPDATE leads SET stripe_customer_id = $2 WHERE email = $1`, [email, stripeCustomerId]);
}

export async function markDepositPaid(email: string): Promise<void> {
  await pool.query(`UPDATE leads SET deposit_paid_at = NOW() WHERE email = $1`, [email]);
}

export async function upsertClientFromSubscription(input: {
  leadEmail: string;
  businessName: string;
  tier: "starter" | "core" | "scale";
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  mrrCents: number;
}) {
  const lead = await findLeadByEmail(input.leadEmail);
  const result = await pool.query(
    `INSERT INTO clients (lead_id, email, business_name, tier, stripe_customer_id, stripe_subscription_id, mrr_cents)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (stripe_subscription_id) DO UPDATE SET status = 'active', mrr_cents = EXCLUDED.mrr_cents
     RETURNING id`,
    [
      lead?.id ?? null,
      input.leadEmail,
      input.businessName,
      input.tier,
      input.stripeCustomerId,
      input.stripeSubscriptionId,
      input.mrrCents,
    ]
  );
  const clientId: string = result.rows[0].id;
  await pool.query(
    `INSERT INTO client_onboarding (client_id) VALUES ($1) ON CONFLICT (client_id) DO NOTHING`,
    [clientId]
  );
  return clientId;
}

export async function markSubscriptionStatus(
  stripeSubscriptionId: string,
  status: "active" | "past_due" | "canceled"
): Promise<void> {
  await pool.query(
    `UPDATE clients SET status = $2, canceled_at = CASE WHEN $2 = 'canceled' THEN NOW() ELSE canceled_at END
     WHERE stripe_subscription_id = $1`,
    [stripeSubscriptionId, status]
  );
}

export async function hasProcessedStripeEvent(eventId: string): Promise<boolean> {
  const result = await pool.query(`SELECT 1 FROM stripe_events WHERE id = $1`, [eventId]);
  return (result.rowCount ?? 0) > 0;
}

export async function recordStripeEvent(eventId: string, type: string): Promise<void> {
  await pool.query(`INSERT INTO stripe_events (id, type) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [eventId, type]);
}

export interface DashboardMetrics {
  activeClients: number;
  mrrCents: number;
  waitlistCount: number;
  averageLeadScore: number | null;
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const [clientsResult, waitlistResult, scoreResult] = await Promise.all([
    pool.query<{ count: string; mrr: string | null }>(
      `SELECT COUNT(*) AS count, COALESCE(SUM(mrr_cents), 0) AS mrr FROM clients WHERE status = 'active'`
    ),
    pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM leads`),
    pool.query<{ avg: string | null }>(`SELECT AVG(score) AS avg FROM leads WHERE score IS NOT NULL`),
  ]);

  return {
    activeClients: Number(clientsResult.rows[0].count),
    mrrCents: Number(clientsResult.rows[0].mrr ?? 0),
    waitlistCount: Number(waitlistResult.rows[0].count),
    averageLeadScore: scoreResult.rows[0].avg ? Math.round(Number(scoreResult.rows[0].avg)) : null,
  };
}

export async function getRecentAgentRuns(limit = 20) {
  const result = await pool.query(
    `SELECT task_id, task_type, agent, status, attempt, started_at, finished_at, assessment_passed, assessment_notes
     FROM agent_runs ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
}

export async function getAgentRunCountsByAgent() {
  const result = await pool.query(
    `SELECT agent, status, COUNT(*) AS count FROM agent_runs GROUP BY agent, status`
  );
  return result.rows as { agent: string; status: string; count: string }[];
}

export async function getLastHeartbeat() {
  const result = await pool.query(
    `SELECT tasks_processed, tasks_failed, trust_stage, ran_at FROM agent_heartbeats ORDER BY ran_at DESC LIMIT 1`
  );
  return result.rows[0] ?? null;
}

export interface Prospect {
  id: string;
  business_name: string;
  category: string;
  phone: string;
  city: string | null;
  state: string | null;
  team_size: string | null;
  fit_reasoning: string;
  source: string;
  status: "new" | "approved" | "calling" | "called" | "interested" | "not_interested" | "converted";
  created_at: string;
}

export async function listProspects(): Promise<Prospect[]> {
  const result = await pool.query<Prospect>(`SELECT * FROM prospects ORDER BY created_at DESC`);
  return result.rows;
}

export async function getProspect(id: string): Promise<Prospect | null> {
  const result = await pool.query<Prospect>(`SELECT * FROM prospects WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function insertProspect(input: {
  businessName: string;
  category: string;
  phone: string;
  city?: string;
  state?: string;
  teamSize?: string;
  fitReasoning: string;
  source: string;
}): Promise<Prospect> {
  const result = await pool.query<Prospect>(
    `INSERT INTO prospects (business_name, category, phone, city, state, team_size, fit_reasoning, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      input.businessName,
      input.category,
      input.phone,
      input.city ?? null,
      input.state ?? null,
      input.teamSize ?? null,
      input.fitReasoning,
      input.source,
    ]
  );
  return result.rows[0];
}

export async function setProspectStatus(id: string, status: Prospect["status"]): Promise<void> {
  await pool.query(`UPDATE prospects SET status = $2 WHERE id = $1`, [id, status]);
}

export async function insertColdCall(input: {
  prospectId: string;
  vapiCallId: string;
  assistantId: string;
  status: "queued" | "in_progress";
  triggeredBy: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO cold_calls (prospect_id, vapi_call_id, assistant_id, status, triggered_by)
     VALUES ($1,$2,$3,$4,$5)`,
    [input.prospectId, input.vapiCallId, input.assistantId, input.status, input.triggeredBy]
  );
}

export async function listColdCallsForProspect(prospectId: string) {
  const result = await pool.query(
    `SELECT * FROM cold_calls WHERE prospect_id = $1 ORDER BY created_at DESC`,
    [prospectId]
  );
  return result.rows;
}
