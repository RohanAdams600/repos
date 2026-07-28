# Autonoma

A complete productized-service business: a done-with-you AI agent
implementation service for owner-operators, built on Dan Martell's
6-Figure Productized-Service framework (Money Math, Ikigai, Decoy
Pricing, Pre-Sell/Validation) and run internally by a multi-agent AI
system built on the AGENT framework (Aim, Give Identity, Equip, Narrow
Scope, Trust in Stages).

This repo is the whole stack: the business logic, the agent system that
operates it, and the website that sells it.

```
/agents     Multi-agent orchestration system (Kai + 4 sub-agents), heartbeat loop
/backend    Stripe checkout/webhooks, waitlist API, dashboard/agent-status API, Postgres schema
/frontend   Next.js + Tailwind site: landing page, waitlist/checkout, founder dashboard
```

## Part 1 — The business

**Target unit economics:** $100,000 MRR from 100 clients paying
$1,000/mo on the Core tier — not 1 client at $100k (concentration risk),
not 10 clients at $10k (high friction to sell and service), not 1,000
clients at $100 (support nightmare).

**Decoy pricing** (`frontend/components/PricingTiers.tsx`,
`agents/identity/user.md`):

| Tier | Price | Role |
|---|---|---|
| Starter | $500/mo | Decoy — DIY playbooks, makes Core look like the obvious step up |
| **Core** | **$1,000/mo** | **The offer we actually sell** — done-with-you |
| Scale | $10,000/mo | Anchor — done-for-you, makes Core look inexpensive |

**Pre-sell & validation:** nothing client-specific gets built until a
$200 deposit is collected (`backend/src/routes/checkout.ts`, mode:
`deposit`). That deposit starts a 14-day onboarding window
(`agents/playbooks/onboarding-playbook.md`) — we build with real cash
already in the bank, not speculatively.

## Part 2 — The multi-agent system (AGENT framework)

| Letter | Where it lives |
|---|---|
| **A**im for a specific outcome | Definition of Done in `agents/playbooks/onboarding-playbook.md` |
| **G**ive it an identity | `agents/identity/{soul,identity,user}.md` |
| **E**quip with context & tools | `agents/src/lib/memory.ts` assembles a bounded context window from those files + playbooks per task — no unbounded chat history |
| **N**arrow scope, use sub-agents | Kai (`agents/src/orchestrator/manager.ts`) never does task work — it routes to Scout, Wordsmith, Patch, Warden, each with one lane |
| **T**rust in stages | `agents/src/orchestrator/trust.ts` — `manual` → `supervised` → `autonomous`, hard boundaries always gated regardless of stage |

The execution loop (`agents/src/orchestrator/loop.ts`) is
**Diagnose → Assemble → Action → Assess**: every task gets routed and
risk-scored, gets a model and approval gate assigned, gets dispatched (or
queued for founder review), and gets reviewed by Warden before it counts
as done — with one automatic retry if Warden fails it.

Model tiering (`agents/src/config/models.ts`): Haiku for high-volume/
low-ambiguity work (lead scoring), Sonnet as the sub-agent default, Opus
for Kai's own routing judgment and Warden's final QA gate — the two
places a wrong call is expensive.

## Part 3 — Running it

### Prerequisites

- Node.js 20+
- A Postgres database (only `/backend` connects to it directly — see
  "Why agents have no DB credentials" below)
- An [Anthropic API key](https://console.anthropic.com/)
- A [Stripe](https://dashboard.stripe.com/) account (test mode is fine
  to start) with 4 Prices created: one one-time deposit price and three
  recurring monthly prices (Starter/Core/Scale)

### 1. Database

```bash
cd backend
cp .env.example .env   # fill in DATABASE_URL at minimum for this step
npm install
npm run migrate         # applies db/schema.sql
```

### 2. Backend (Stripe, waitlist, dashboard API)

Fill in the rest of `backend/.env`: your Stripe secret key, webhook
secret, the 4 Price IDs, `AGENTS_SERVICE_TOKEN` (shared secret with
`/agents`), and `DASHBOARD_TOKEN` (shared secret with the founder
dashboard).

```bash
npm run dev    # http://localhost:4000
```

Point a Stripe webhook (or the Stripe CLI: `stripe listen --forward-to
localhost:4000/api/stripe/webhook`) at `/api/stripe/webhook`, subscribed
to `checkout.session.completed`, `customer.subscription.updated`,
`customer.subscription.deleted`, `invoice.payment_failed`.

### 3. Agents (Kai + sub-agent bench)

```bash
cd ../agents
cp .env.example .env    # ANTHROPIC_API_KEY, BACKEND_BASE_URL, AGENTS_SERVICE_TOKEN (must match backend's)
npm install
npm run dev
```

Start with `TRUST_STAGE=manual` in `.env` — every sub-agent output queues
for founder review. Move to `supervised`, then `autonomous`, only after
you've watched it operate correctly; see `agents/src/orchestrator/trust.ts`.
The heartbeat cron (`HEARTBEAT_INTERVAL_MINUTES`, default 15) runs
lead-scoring and the 14-day guarantee SLA check on schedule regardless of
trust stage — trust stage only changes what auto-executes vs. what queues.

**Why agents have no database credentials:** every read/write the
orchestrator needs goes through `backend`'s narrow `/api/agents/*` HTTP
surface (`backend/src/routes/agents.ts`), authenticated with
`AGENTS_SERVICE_TOKEN`. There is no generic query endpoint and no
delete/drop path exposed — see the boundaries section of
`agents/identity/identity.md`.

### 4. Frontend

```bash
cd ../frontend
cp .env.example .env.local   # NEXT_PUBLIC_BACKEND_URL
npm install
npm run dev    # http://localhost:3000
```

- `/` — the sales deck: outcome-based hero (Time/Money/Status), decoy
  pricing, 14-day guarantee, scarcity module, FAQ
- `/waitlist` — pre-qualification form → $200 deposit checkout via
  Stripe
- `/dashboard` — founder control center: MRR progress toward the
  $100k target, per-sub-agent health, the heartbeat loop's last run and
  trust stage, and a live feed of recent agent runs. Gated by
  `DASHBOARD_TOKEN` (must match `backend/.env`).

## Deploying

- **Backend & agents:** any long-running Node host (Render, Railway,
  Fly.io, a plain VM). Both are stateless aside from their Postgres/HTTP
  connections, so they scale horizontally without extra work. Run
  `npm run build && npm start` in each.
- **Frontend:** Vercel is the path of least resistance for Next.js App
  Router; set `NEXT_PUBLIC_BACKEND_URL` to your deployed backend's public
  URL.
- **Database:** any managed Postgres (Supabase, Neon, RDS). Run
  `npm run migrate` from `/backend` once against the production
  `DATABASE_URL`.
- **Stripe:** switch from test to live keys/Price IDs in `backend/.env`
  and re-point the webhook endpoint at your deployed backend's
  `/api/stripe/webhook`.

## Customizing for a real launch

1. Fill in the bracketed founder/company fields in `agents/identity/user.md`.
2. Replace the example patterns in `agents/playbooks/voice-style-guide.md`
   by running the real extraction job (`src/lib/memory.ts` loads whatever
   is in this file — regenerate it from real sent-email data before
   agents draft anything client-facing).
3. Swap the `DASHBOARD_TOKEN` bearer-token gate on `/dashboard` for real
   auth once more than one person needs access.
4. Rotate every secret in the `.env.example` files — none of the example
   values are usable credentials.
