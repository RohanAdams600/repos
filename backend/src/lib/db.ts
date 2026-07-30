import pg from "pg";
import { randomUUID } from "node:crypto";
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

// --- Desktop agent downloads ---

export interface AgentDownloadToken {
  id: string;
  client_id: string;
  token: string;
  agent_key: string;
  tier: "starter" | "core" | "scale";
  stripe_checkout_session_id: string;
  download_count: number;
  downloaded_at: string | null;
  created_at: string;
}

/** Called once per completed subscription checkout — mock path (payments.ts) and live path (stripe-webhook.ts) both call this, so a client only ever gets one token per checkout session. */
export async function issueAgentDownloadToken(input: {
  clientId: string;
  tier: "starter" | "core" | "scale";
  stripeCheckoutSessionId: string;
}): Promise<AgentDownloadToken> {
  const token = randomToken();
  const agentKey = randomToken();
  const result = await pool.query<AgentDownloadToken>(
    `INSERT INTO agent_download_tokens (client_id, token, agent_key, tier, stripe_checkout_session_id)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (stripe_checkout_session_id) DO UPDATE SET tier = EXCLUDED.tier
     RETURNING *`,
    [input.clientId, token, agentKey, input.tier, input.stripeCheckoutSessionId]
  );
  return result.rows[0];
}

export async function findDownloadTokenBySession(sessionId: string): Promise<AgentDownloadToken | null> {
  const result = await pool.query<AgentDownloadToken>(
    `SELECT * FROM agent_download_tokens WHERE stripe_checkout_session_id = $1`,
    [sessionId]
  );
  return result.rows[0] ?? null;
}

export async function findDownloadToken(token: string): Promise<AgentDownloadToken | null> {
  const result = await pool.query<AgentDownloadToken>(`SELECT * FROM agent_download_tokens WHERE token = $1`, [
    token,
  ]);
  return result.rows[0] ?? null;
}

export async function markTokenDownloaded(token: string): Promise<void> {
  await pool.query(
    `UPDATE agent_download_tokens SET downloaded_at = NOW(), download_count = download_count + 1 WHERE token = $1`,
    [token]
  );
}

function randomToken(): string {
  return randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "").slice(0, 8);
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

// ---------------------------------------------------------------------
// Inbox management (Gmail)
// ---------------------------------------------------------------------

export interface InboxMessage {
  id: string;
  external_id: string | null;
  from_email: string;
  subject: string;
  body: string;
  category: string | null;
  drafted_reply: string | null;
  status: "new" | "triaged" | "drafted" | "approved" | "sent" | "ignored";
  created_at: string;
}

/** Inserts a synced email if its external_id isn't already known — the sync step is idempotent. */
export async function insertInboxMessageIfNew(input: {
  externalId: string;
  fromEmail: string;
  subject: string;
  body: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO inbox_messages (external_id, from_email, subject, body)
     VALUES ($1,$2,$3,$4) ON CONFLICT (external_id) DO NOTHING`,
    [input.externalId, input.fromEmail, input.subject, input.body]
  );
}

export async function listInboxMessages(): Promise<InboxMessage[]> {
  const result = await pool.query<InboxMessage>(`SELECT * FROM inbox_messages ORDER BY created_at DESC LIMIT 100`);
  return result.rows;
}

export async function getInboxMessage(id: string): Promise<InboxMessage | null> {
  const result = await pool.query<InboxMessage>(`SELECT * FROM inbox_messages WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function listNewInboxMessages(limit = 25): Promise<InboxMessage[]> {
  const result = await pool.query<InboxMessage>(
    `SELECT * FROM inbox_messages WHERE status = 'new' ORDER BY created_at ASC LIMIT $1`,
    [limit]
  );
  return result.rows;
}

export async function setInboxDraft(id: string, draftedReply: string): Promise<void> {
  await pool.query(`UPDATE inbox_messages SET drafted_reply = $2, status = 'drafted' WHERE id = $1`, [
    id,
    draftedReply,
  ]);
}

export async function setInboxStatus(id: string, status: InboxMessage["status"]): Promise<void> {
  await pool.query(`UPDATE inbox_messages SET status = $2 WHERE id = $1`, [id, status]);
}

// ---------------------------------------------------------------------
// Calendar (Google Calendar) — agents may only ever propose, never book.
// ---------------------------------------------------------------------

export interface CalendarProposal {
  id: string;
  contact_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  purpose: string;
  proposed_slots: string[];
  status: "proposed" | "booked" | "declined";
  google_event_id: string | null;
  booked_slot: string | null;
  created_at: string;
}

export async function insertCalendarProposal(input: {
  contactName: string;
  contactEmail?: string;
  contactPhone?: string;
  purpose: string;
  proposedSlots: string[];
}): Promise<CalendarProposal> {
  const result = await pool.query<CalendarProposal>(
    `INSERT INTO calendar_proposals (contact_name, contact_email, contact_phone, purpose, proposed_slots)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [input.contactName, input.contactEmail ?? null, input.contactPhone ?? null, input.purpose, JSON.stringify(input.proposedSlots)]
  );
  return result.rows[0];
}

export async function listCalendarProposals(): Promise<CalendarProposal[]> {
  const result = await pool.query<CalendarProposal>(`SELECT * FROM calendar_proposals ORDER BY created_at DESC LIMIT 100`);
  return result.rows;
}

export async function getCalendarProposal(id: string): Promise<CalendarProposal | null> {
  const result = await pool.query<CalendarProposal>(`SELECT * FROM calendar_proposals WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function markCalendarProposalBooked(
  id: string,
  input: { googleEventId: string | null; bookedSlot: string }
): Promise<void> {
  await pool.query(
    `UPDATE calendar_proposals SET status = 'booked', google_event_id = $2, booked_slot = $3 WHERE id = $1`,
    [id, input.googleEventId, input.bookedSlot]
  );
}

export async function markCalendarProposalDeclined(id: string): Promise<void> {
  await pool.query(`UPDATE calendar_proposals SET status = 'declined' WHERE id = $1`, [id]);
}

// ---------------------------------------------------------------------
// Invoicing (Stripe Invoices) — agents may only ever draft.
// ---------------------------------------------------------------------

export interface InvoiceLineItem {
  description: string;
  amountCents: number;
}

export interface Invoice {
  id: string;
  client_id: string | null;
  client_email: string;
  line_items: InvoiceLineItem[];
  amount_cents: number;
  stripe_invoice_id: string | null;
  status: "draft" | "approved" | "sent" | "paid" | "void";
  created_at: string;
}

export async function insertInvoiceDraft(input: {
  clientId?: string;
  clientEmail: string;
  lineItems: InvoiceLineItem[];
}): Promise<Invoice> {
  const amountCents = input.lineItems.reduce((sum, item) => sum + item.amountCents, 0);
  const result = await pool.query<Invoice>(
    `INSERT INTO invoices (client_id, client_email, line_items, amount_cents)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [input.clientId ?? null, input.clientEmail, JSON.stringify(input.lineItems), amountCents]
  );
  return result.rows[0];
}

export async function listInvoices(): Promise<Invoice[]> {
  const result = await pool.query<Invoice>(`SELECT * FROM invoices ORDER BY created_at DESC LIMIT 100`);
  return result.rows;
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  const result = await pool.query<Invoice>(`SELECT * FROM invoices WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function markInvoiceSent(id: string, stripeInvoiceId: string | null): Promise<void> {
  await pool.query(`UPDATE invoices SET status = 'sent', stripe_invoice_id = $2 WHERE id = $1`, [id, stripeInvoiceId]);
}

// ---------------------------------------------------------------------
// SMS (Twilio)
// ---------------------------------------------------------------------

export interface SmsMessage {
  id: string;
  phone: string;
  direction: "inbound" | "outbound";
  body: string;
  drafted_reply: string | null;
  twilio_sid: string | null;
  status: "received" | "drafted" | "sent" | "failed";
  created_at: string;
}

/** Inserts an inbound text if this Twilio message sid isn't already recorded. */
export async function insertInboundSms(input: { phone: string; body: string; twilioSid: string }): Promise<void> {
  await pool.query(
    `INSERT INTO sms_messages (phone, direction, body, twilio_sid)
     VALUES ($1,'inbound',$2,$3) ON CONFLICT (twilio_sid) DO NOTHING`,
    [input.phone, input.body, input.twilioSid]
  );
}

export async function listNewSms(limit = 25): Promise<SmsMessage[]> {
  const result = await pool.query<SmsMessage>(
    `SELECT * FROM sms_messages WHERE direction = 'inbound' AND status = 'received' ORDER BY created_at ASC LIMIT $1`,
    [limit]
  );
  return result.rows;
}

/** Wordsmith's draft goes onto the inbound row it's replying to — mirrors setInboxDraft. */
export async function setSmsDraft(id: string, draftedReply: string): Promise<void> {
  await pool.query(`UPDATE sms_messages SET drafted_reply = $2, status = 'drafted' WHERE id = $1`, [id, draftedReply]);
}

export async function getSmsMessage(id: string): Promise<SmsMessage | null> {
  const result = await pool.query<SmsMessage>(`SELECT * FROM sms_messages WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function listSmsMessages(): Promise<SmsMessage[]> {
  const result = await pool.query<SmsMessage>(`SELECT * FROM sms_messages ORDER BY created_at DESC LIMIT 100`);
  return result.rows;
}

/** Records the outbound send as its own audit-log row and marks the inbound message replied-to. */
export async function recordSmsSent(inboundId: string, input: { phone: string; body: string; twilioSid: string | null }): Promise<void> {
  await pool.query(
    `INSERT INTO sms_messages (phone, direction, body, twilio_sid, status) VALUES ($1,'outbound',$2,$3,'sent')`,
    [input.phone, input.body, input.twilioSid]
  );
  await pool.query(`UPDATE sms_messages SET status = 'sent' WHERE id = $1`, [inboundId]);
}
