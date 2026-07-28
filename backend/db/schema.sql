-- Autonoma platform schema.
-- Only /backend holds a database connection. The /agents service never
-- gets DB credentials at all (see identity.md boundary #5) — it reaches
-- this data exclusively through /backend's narrow /api/agents/* HTTP
-- surface (backend/src/routes/agents.ts), authenticated with a bearer
-- token. That surface deliberately exposes no DELETE/DROP path.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Waitlist / pre-qualification leads (Pre-Sell & Validation strategy).
CREATE TABLE IF NOT EXISTS leads (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email              TEXT NOT NULL UNIQUE,
  business_name      TEXT NOT NULL,
  revenue_band       TEXT NOT NULL, -- e.g. 'under_20k' | '20k_80k' | '80k_250k' | '250k_plus' (monthly)
  team_size          TEXT NOT NULL, -- e.g. '1_4' | '5_20' | '21_50' | '50_plus'
  time_sink          TEXT NOT NULL, -- free text: the specific recurring task costing them time
  tier_interest      TEXT NOT NULL CHECK (tier_interest IN ('starter', 'core', 'scale')),
  referred_by_client BOOLEAN NOT NULL DEFAULT FALSE,
  score              INTEGER,       -- 0-100, set by Scout
  score_notes        TEXT,
  scored_at          TIMESTAMPTZ,
  stripe_customer_id TEXT,
  deposit_paid_at    TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_score ON leads (score) WHERE score IS NULL;

-- Paying clients (post-conversion), one row per active subscription.
CREATE TABLE IF NOT EXISTS clients (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id                UUID REFERENCES leads (id),
  email                  TEXT NOT NULL,
  business_name          TEXT NOT NULL,
  tier                   TEXT NOT NULL CHECK (tier IN ('starter', 'core', 'scale')),
  stripe_customer_id     TEXT NOT NULL,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  status                 TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled')),
  mrr_cents              INTEGER NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  canceled_at            TIMESTAMPTZ
);

-- 14-day onboarding SLA tracking (guarantee enforcement).
CREATE TABLE IF NOT EXISTS client_onboarding (
  client_id             UUID PRIMARY KEY REFERENCES clients (id),
  kickoff_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_agent_live_at    TIMESTAMPTZ,
  guarantee_flagged_at   TIMESTAMPTZ,
  guarantee_honored_at   TIMESTAMPTZ
);

-- Every agent-loop execution (Diagnose->Assemble->Action->Assess), one row per attempt.
CREATE TABLE IF NOT EXISTS agent_runs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id            UUID NOT NULL,
  task_type          TEXT NOT NULL,
  agent              TEXT NOT NULL CHECK (agent IN ('scout', 'wordsmith', 'patch', 'warden')),
  status             TEXT NOT NULL CHECK (status IN ('completed', 'failed', 'queued_for_review', 'blocked')),
  attempt            INTEGER NOT NULL DEFAULT 1,
  started_at         TIMESTAMPTZ NOT NULL,
  finished_at        TIMESTAMPTZ NOT NULL,
  assessment_passed  BOOLEAN,
  assessment_notes   TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_created_at ON agent_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs (agent);

-- One row per heartbeat cron cycle, for the dashboard's "last run" panel.
CREATE TABLE IF NOT EXISTS agent_heartbeats (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tasks_processed  INTEGER NOT NULL,
  tasks_failed     INTEGER NOT NULL,
  trust_stage      TEXT NOT NULL,
  ran_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_heartbeats_ran_at ON agent_heartbeats (ran_at DESC);

-- Raw Stripe webhook log, kept for audit/debugging/idempotency checks.
CREATE TABLE IF NOT EXISTS stripe_events (
  id           TEXT PRIMARY KEY, -- Stripe event id, enforces idempotency
  type         TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
