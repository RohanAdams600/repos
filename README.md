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
/agents               Multi-agent orchestration system (Kai + 4 sub-agents), heartbeat loop
/backend              Checkout (mock or live Stripe), waitlist API, dashboard/agent-status API, Postgres schema
/frontend             Next.js + Tailwind site: landing page, waitlist/checkout, founder dashboard
/.github/workflows    CI: typecheck + lint + test + build for all three packages
docker-compose.yml    One-command local/demo stack (Postgres + backend + agents + frontend)
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
- An [Anthropic API key](https://console.anthropic.com/) — only needed to
  run `/agents`; the site and backend work without it
- **Stripe is optional to start.** `PAYMENTS_MODE=mock` (the default) runs
  the entire waitlist → deposit → subscription funnel with zero Stripe
  setup — see "Payments: mock mode vs. live" below. Add Stripe whenever
  you're ready to take real money.

### Fastest path: Docker Compose

```bash
docker compose up --build
```

Brings up Postgres, runs the migration, and starts backend
(`localhost:4000`) + frontend (`localhost:3000`) in `PAYMENTS_MODE=mock`
— nothing to configure, no Stripe or Anthropic key required. The `agents`
service also comes up in that stack; it needs `ANTHROPIC_API_KEY` set in a
root `.env` file (copy `.env.example`) or it will exit — comment it out of
`docker-compose.yml` if you just want the site + backend running.

The steps below are the manual, per-service path (useful for active
development, where `npm run dev` gives you hot reload).

### 1. Database

```bash
cd backend
cp .env.example .env   # fill in DATABASE_URL at minimum for this step
npm install
npm run migrate         # applies db/schema.sql
```

### 2. Backend (checkout, waitlist, dashboard API)

`backend/.env`'s defaults (`PAYMENTS_MODE=mock`) need nothing beyond
`DATABASE_URL`, `AGENTS_SERVICE_TOKEN`, and `DASHBOARD_TOKEN` to run the
full funnel. See "Payments: mock mode vs. live" below for switching to
real Stripe later.

```bash
npm run dev    # http://localhost:4000
```

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

- `/` — the sales deck: outcome-based hero (Time/Money/Status), how it
  works, the agent bench, an owner-control demo, a **live voice demo**
  (talk to the actual Vapi assistant in-browser), an integrations grid,
  decoy pricing, 14-day guarantee, scarcity module, FAQ
- `/waitlist` — pre-qualification form → $200 deposit checkout (mock or
  live Stripe)
- `/dashboard` — founder control center, two tabs: **Agent Status** (MRR
  progress toward the $100k target, per-sub-agent health, heartbeat loop,
  recent agent runs) and **Prospects** (the outbound cold-call program —
  see Part 4 below). Gated by `DASHBOARD_TOKEN` (must match `backend/.env`).

## Payments: mock mode vs. live

`backend/.env`'s `PAYMENTS_MODE` (default `mock`) controls this — nothing
else in the code changes when you switch it:

- **`mock`** — `backend/src/lib/payments.ts` completes the deposit or
  subscription checkout synchronously (the same DB write a real Stripe
  webhook would eventually trigger) and redirects straight to the success
  page. No Stripe account, keys, or webhook needed. The success page shows
  a small "Demo mode" note so it's never mistaken for a real charge. This
  is what the site runs on until Stripe is wired up.
- **`live`** — real Stripe Checkout Sessions and webhook-driven
  fulfillment (`backend/src/routes/stripe-webhook.ts`).

**Going live with Stripe**, whenever you're ready:

1. Create a Stripe account, then 4 Prices: one one-time deposit price and
   three recurring monthly prices (Starter $500, Core $1,000, Scale
   $10,000).
2. Fill in the 6 `STRIPE_*` vars in `backend/.env` (secret key, webhook
   secret, 4 price IDs).
3. Set `PAYMENTS_MODE=live`. `backend/src/lib/env.ts` will refuse to start
   if any of the 6 vars are missing once you do — it fails loud, not
   silently.
4. Point a Stripe webhook (or the Stripe CLI: `stripe listen
   --forward-to localhost:4000/api/stripe/webhook`) at
   `/api/stripe/webhook`, subscribed to `checkout.session.completed`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.payment_failed`.

## Part 4 — Outbound sales engine (Vapi voice AI)

Two voice AI touchpoints, both via [Vapi](https://vapi.ai), both hard-scoped
in code (`backend/src/lib/vapi.ts`) to exactly two assistants — no other
assistant ID is ever touched, no matter what's passed in:

- **"Autonoma Website Demo"** — the live "Talk to Autonoma" widget on the
  landing page (`frontend/components/VoiceDemo.tsx`), using Vapi's Web SDK
  with a **public** key (safe to expose client-side, same idea as a Stripe
  publishable key). Renders a disabled "coming soon" state until
  `NEXT_PUBLIC_VAPI_PUBLIC_KEY` + `NEXT_PUBLIC_VAPI_ASSISTANT_ID_DEMO` are
  set.
- **"Autonoma Cold Call"** — outbound prospecting calls, using a
  **private** key that never leaves the backend. Placing a call is always
  a founder action from the dashboard's Prospects tab
  (`POST /api/vapi/cold-call/:prospectId`, gated by `DASHBOARD_TOKEN`) —
  this is identity.md's boundary #6, the same "no agent does this
  unsupervised" pattern as money and the calendar. Runs in mock mode
  (logged, nothing actually dialed) until `VAPI_PRIVATE_API_KEY` and
  `VAPI_PHONE_NUMBER_ID` are set.

**Who to target:** `agents/playbooks/prospecting-playbook.md` defines the
ICP (low headcount, limited/early hours, phone-dependent intake — flagship
example: independent auto repair shops that close at 5-6pm with no
answering service) and the sourcing rule that matters most: every row in
the `prospects` table has to be a real business from a citable source —
Scout's playbook explicitly says to report "I don't have a reliable source
for this city/vertical" rather than produce a plausible-sounding list of
made-up businesses.

**Signup notifications:** every waitlist signup fires a notification to
`FOUNDER_NOTIFICATION_EMAIL` (`backend/src/lib/email.ts`, default
`rohanadams352@gmail.com`) via [Resend](https://resend.com). Logs instead
of sending until `RESEND_API_KEY` is set — same mock-mode pattern as
payments and Vapi.

## Testing & CI

Each package has its own Vitest suite (86 tests total) plus typecheck and
lint — no shared root config, each runs independently:

```bash
cd agents && npm test && npm run typecheck && npm run lint
cd backend && npm test && npm run typecheck && npm run lint
cd frontend && npm test && npm run typecheck && npm run lint
```

What's covered: agents' trust/boundary logic (including the cold-call
boundary) and the full Diagnose→Assemble→Action→Assess loop (mocked model
calls — no live Anthropic calls in tests); backend's env validation, auth
middleware, the mock-mode checkout funnel, the Vapi assistant allowlist,
mock-mode cold-call flow, and prospects CRUD (all via supertest against
the real Express app); frontend's pricing display, waitlist form, and the
voice demo widget's unconfigured-state fallback.

`.github/workflows/ci.yml` runs typecheck + lint + test + build for all
three packages on every push and PR, each as an independent job (no
Postgres service container needed — backend tests mock the DB layer).

## Deploying

Each service has a production `Dockerfile` (multi-stage, non-root
runtime image) — `docker-compose.yml` at the repo root wires all of them
together with Postgres for local use, and the same images are what you'd
push to any container host.

- **Backend & agents:** any long-running Node/container host (Render,
  Railway, Fly.io, a plain VM). Both are stateless aside from their
  Postgres/HTTP connections, so they scale horizontally without extra
  work. Build from each service's `Dockerfile`, or run
  `npm run build && npm start` directly.
- **Frontend:** Vercel is the path of least resistance for Next.js App
  Router (zero config — import the repo, set root directory to
  `frontend`); `frontend/Dockerfile` (Next's `output: "standalone"`) is
  the option if you'd rather run it alongside the rest on your own
  container host. Either way, set `NEXT_PUBLIC_BACKEND_URL` to your
  deployed backend's public URL — it's inlined into the browser bundle at
  build time, so it can't be a docker-internal hostname.
- **Database:** any managed Postgres (Supabase, Neon, RDS). Run
  `npm run migrate` from `/backend` once against the production
  `DATABASE_URL`.
- **Payments:** ships in `PAYMENTS_MODE=mock` — the whole funnel works in
  production before Stripe is connected. Flip to `live` per "Going live
  with Stripe" above whenever you're ready to take real money; nothing
  else about the deploy changes.
- **Security baseline already in place:** `helmet` response headers and a
  rate limiter on the public waitlist/checkout routes
  (`backend/src/lib/rate-limit.ts`) ship by default — nothing extra to
  turn on for a production deploy.

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
5. **Verify the Vapi assistant ID mapping.** `VAPI_ASSISTANT_ID_COLD_CALL`
   / `VAPI_ASSISTANT_ID_WEBSITE_DEMO` in `backend/.env.example` are set to
   the IDs given at setup time, in the order they were given — double
   check in your Vapi dashboard that they're actually assigned to "Autonoma
   Cold Call" and "Autonoma Website Demo" respectively, and swap them in
   `backend/.env` (and `frontend/.env.local`'s
   `NEXT_PUBLIC_VAPI_ASSISTANT_ID_DEMO`) if not — this is a one-line fix,
   but worth confirming before anything goes live given `lib/vapi.ts`
   trusts these values as the entire allowlist.
