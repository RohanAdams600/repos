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
/desktop-agent        Tier-gated agent a paying customer downloads and runs on their own machine
/frontend             Next.js + Tailwind site: landing page, waitlist/checkout, founder dashboard
/.github/workflows    CI: typecheck + lint + test + build for all four packages
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

- `/` — the sales deck: outcome-based hero, an animated stats bar, how it
  works, the agent bench, a two-view (owner/customer) owner-control demo,
  a **live voice demo** (talk to the actual Vapi assistant in-browser), an
  **interactive ROI calculator** (`frontend/lib/roi.ts` — a stated
  assumption, not a fabricated "average client" number), an integrations
  grid, decoy pricing, 14-day guarantee, scarcity module, FAQ, and a
  dismissible sticky CTA bar that appears after scrolling past the hero
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

## Part 5 — Real office work, not just marketing copy

Everything the landing page claims Autonoma "does" is backed by working
code in `backend/src/lib/` + `backend/src/routes/`, wired into the
heartbeat loop in `agents/src/heartbeat/scheduler.ts`. Every one of these
follows the same mock-mode pattern as payments/Vapi above: safe, logged
behavior by default, real behavior the moment credentials are set —
nothing requires Stripe, Twilio, or Google to be configured to see it work
end to end.

- **Inbox management** (`backend/src/lib/gmail.ts`) — the heartbeat syncs
  unread mail, Wordsmith drafts a reply for each new message (routed
  through the same Diagnose→Assemble→Action→Assess loop as everything
  else), and the draft sits in `/api/inbox` for the founder to review and
  send from the dashboard. Nothing sends automatically — sending is the
  one `/api/inbox/:id/send` route, founder-gated. Mock mode returns two
  canned emails instead of calling Gmail; set `GMAIL_CLIENT_ID/SECRET/
  REFRESH_TOKEN/USER_EMAIL` to go live.
- **Calendar management** (`backend/src/lib/calendar.ts`) — when an inbox
  or SMS message looks like a scheduling request (keyword heuristic in
  the scheduler), Scout proposes open slots via a real Google Calendar
  freeBusy query. Proposing is all any agent ever does — booking is a
  separate founder action (`/api/calendar/:id/book`), matching
  identity.md boundary #2 exactly. Mock mode returns canned future
  weekday slots; set `GOOGLE_CALENDAR_CLIENT_ID/SECRET/REFRESH_TOKEN` to
  go live.
- **Invoicing** (`backend/src/lib/invoicing.ts`) — drafts an invoice from
  line items via `/api/agents/invoices/draft`, founder approves and sends
  from `/api/invoices/:id/send`, which creates/reuses the Stripe customer,
  adds line items, finalizes, and sends the real Stripe invoice. Reuses
  the same `stripe` client and `PAYMENTS_MODE` flag as checkout — no new
  env vars, no separate live/mock toggle to remember.
- **Text messages** (`backend/src/lib/sms.ts`) — inbound SMS lands on a
  Twilio-signature-verified webhook (`/api/webhooks/twilio/sms`), Wordsmith
  drafts a reply the same way as inbox mail, founder sends from
  `/api/sms/:id/send`. Mock mode logs instead of dispatching; set
  `TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER` to go live.
- **Nightly report** (`backend/src/lib/reports.ts`) — fully real today,
  no credentials needed: once per day the heartbeat compiles a digest
  (leads scored, messages drafted, invoices sent, guarantee SLA status)
  and emails it to the founder via the same Resend/mock path as signup
  notifications. An atomic `INSERT ... ON CONFLICT DO NOTHING` against a
  `report_date` unique column is what makes it idempotent under a cron
  that fires every `HEARTBEAT_INTERVAL_MINUTES` — not a separate
  check-then-write, which would race.

Agents still hold zero database credentials for any of this — inbox
sync/drafting, calendar proposals, and invoice drafts all go through the
same narrow `/api/agents/*` surface as lead scoring, authenticated with
`AGENTS_SERVICE_TOKEN`. See `backend/.env.example` for every optional
credential above.

## Part 6 — Tier-gated desktop agent (the actual subscription deliverable)

Every paid subscription unlocks a real, downloadable copy of the agent
(`/desktop-agent`) that runs on the customer's own machine — not a demo,
the actual product. What tier they bought decides what it can do:

| Plan | Runs | Daily task cap |
|---|---|---|
| Starter | Front Desk (calls/texts/inbox drafting) | 40 |
| Core | + Sales Ledger, Back Office (calendar, invoicing, CRM notes) | 150 |
| Scale | + Night Report (daily/weekly summaries) | 500 |

Both numbers live in exactly one place logically —
`backend/src/lib/tiers.ts` — mirrored by hand into
`desktop-agent/src/config/tiers.ts` and `frontend/lib/types.ts` since
these are independent npm packages with no shared-lib mechanism in this
monorepo; a test in each package's own `tiers.test.ts` pins the exact
shape so a drift between them fails a test rather than shipping silently.

**The flow, end to end:**

1. `POST /api/checkout/subscription` completes (mock or live Stripe) →
   `backend/src/lib/payments.ts` (mock) or
   `backend/src/routes/stripe-webhook.ts` (live) both call the same
   `issueAgentDownloadToken()`, which writes one row to
   `agent_download_tokens`: a URL-facing `token`, a separate
   `agent_key` that only ever gets embedded inside the downloaded
   package (kept distinct on purpose — a URL can end up in browser
   history or a referrer header, the embedded key never should have been
   the same secret), and the tier.
2. The success page (`/waitlist/success?kind=subscription&session_id=...`)
   calls `GET /api/downloads/agent/by-session/:sessionId` to resolve the
   actual token, then renders a "Download your agent" button pointing at
   `GET /api/downloads/agent/:token`.
3. That route (`backend/src/routes/downloads.ts` +
   `backend/src/lib/agent-package.ts`) zips together
   `desktop-agent`'s **already-built** `dist/` (test files filtered out —
   see `agent-package.ts`'s `archive.directory()` filter — a customer
   download is not the place for `*.test.js`), a trimmed `package.json`
   (production dependencies and a single `start` script only — no
   devDependencies, no build/test/lint scripts a customer doesn't need),
   the package's `README.md`, and a generated `.env` with the tier and
   `agent_key` stamped in. `ANTHROPIC_API_KEY` is deliberately left
   blank — the customer's agent runs on their own Anthropic usage, so
   that key never passes through Autonoma's servers.
4. **`desktop-agent` has to be built (`npm run build`) before this route
   can serve anything** — `isDesktopAgentBuilt()` checks for
   `desktop-agent/dist` and the route 503s with a clear log line if it's
   missing, rather than serving a broken zip.

**What the customer actually runs:** `npm install && npm start`. First
run finds no saved business profile, so it starts a tiny local Express
server (`desktop-agent/src/wizard/`) and opens a setup form — business
hours, services, tone, pricing notes, and an Anthropic API key field.
Everything typed there stays on their machine (`data/business-profile.json`,
`.env`) — it's never sent back to Autonoma. Stop the wizard, run
`npm start` again, and this time it launches the actual agent
(`desktop-agent/src/heartbeat.ts`): on an interval, for each lane the
tier unlocks, it drafts a reply to anything in
`data/inbound/<lane>.json` that doesn't have one yet, using
`data/state.json` to enforce the tier's daily cap (resets at local
midnight) and to log what it did for `data/reports/<date>.md`'s nightly
summary. Every draft is written back to the same JSON file for the
owner to review — nothing sends itself, matching the "agent drafts, a
human sends" boundary the hosted product holds to everywhere else. A
failed Anthropic call (bad key, rate limit) is caught per-item and
logged, not left to crash the whole process — this runs unattended on
someone's own desktop with nobody watching it the way a hosted service
would be.

This package doesn't wire up real Gmail/Calendar/Twilio/Stripe
integrations on its own (that's what the hosted backend does) — it's a
local drafting loop against JSON files the owner edits directly. See
`desktop-agent/README.md`'s "Connecting real inboxes" section for how to
extend it.

## Testing & CI

Each package has its own Vitest suite (198 tests total) plus typecheck and
lint — no shared root config, each runs independently:

```bash
cd agents && npm test && npm run typecheck && npm run lint
cd backend && npm test && npm run typecheck && npm run lint
cd desktop-agent && npm test && npm run typecheck && npm run lint
cd frontend && npm test && npm run typecheck && npm run lint
```

What's covered: agents' trust/boundary logic (including the cold-call
boundary) and the full Diagnose→Assemble→Action→Assess loop (mocked model
calls — no live Anthropic calls in tests), including the regression test
for manual trust stage actually producing a draft rather than silently
skipping the sub-agent, plus the heartbeat scheduler's inbox/SMS drafting
and reactive calendar-proposal wiring; backend's env validation, auth
middleware, the mock-mode checkout funnel and its agent-download-token
issuance, the Vapi assistant allowlist, mock-mode cold-call flow,
prospects CRUD, the Gmail/Calendar/Twilio/invoicing libraries and their
founder-gated send/book routes in both mock and (mocked-client) live
mode, the nightly report's atomic idempotency claim, and the download
route's zip contents — a trimmed package.json, a correctly-stamped
`.env`, and confirmation that test files never make it into a customer's
zip (all via supertest against the real Express app); desktop-agent's
tier-gating (capability lanes and the shared daily cap enforced across
lanes, including the day-rollover reset), the setup wizard's validation
and `.env`-patching, and a per-item catch around every Anthropic call so
one failed draft can't crash the whole local process; frontend's pricing
display, waitlist form, the ROI calculator's math, the sticky CTA's
scroll/dismiss behavior, the voice demo widget's unconfigured-state
fallback, and the subscription success page's tier-aware download flow.

Beyond the automated suite, the whole downloadable-agent path has been
run for real at least once: a live Postgres, a real `POST
/api/checkout/subscription` call, a real zip streamed from
`GET /api/downloads/agent/:token`, unzipped and run with
`npm install && npm start` exactly as a customer would — through the
setup wizard, into the heartbeat loop, correctly gated to the tier that
was purchased.

`.github/workflows/ci.yml` runs typecheck + lint + test + build for all
four packages on every push and PR, each as an independent job (no
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
  `npm run build && npm start` directly. **Backend's `Dockerfile` builds
  from the repo root** (not `backend/` alone, unlike every other service
  here) because it bundles a built copy of `desktop-agent/` into every
  subscription download — see Part 6. Running outside Docker, build
  `desktop-agent` (`cd desktop-agent && npm ci && npm run build`) before
  starting backend, or `/api/downloads/agent/:token` 503s with a clear
  log line telling you to.
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

### Deploying the frontend to GitHub Pages

`.github/workflows/deploy-pages.yml` builds `frontend/` as a fully static
export and publishes it — scoped to this branch only, so it never
touches or interacts with anything else in the repo (including the
separate, unrelated static site that lives on `main`).

**One manual step required** (can't be done from a git push): go to this
repo's **Settings → Pages**, and under "Build and deployment," set
**Source** to **GitHub Actions**. After that, every push to this branch
that touches `frontend/` deploys automatically — or trigger it manually
from the **Actions** tab → "Deploy to GitHub Pages" → **Run workflow**.

The published URL will be `https://<your-github-username>.github.io/repos/`
(a project-page subpath, since the repo isn't named
`<username>.github.io`) — `frontend/next.config.js` sets the matching
`basePath` automatically for this build via `NEXT_PUBLIC_DEPLOY_TARGET`,
set only inside that workflow; every other build target (`npm run dev`,
Docker, Vercel) is unaffected.

**What works out of the box vs. what needs configuring:**
- The full page renders immediately — hero, stats, ROI calculator,
  pricing, agents showcase, everything static.
- The waitlist form and voice demo need real values wired up as repository
  variables/secrets (**Settings → Secrets and variables → Actions**) to
  actually work: `NEXT_PUBLIC_BACKEND_URL` (var, once `/backend` is
  deployed somewhere — Render/Railway per above), `NEXT_PUBLIC_VAPI_PUBLIC_KEY`
  (secret) and `NEXT_PUBLIC_VAPI_ASSISTANT_ID_DEMO` (var) for the live
  voice widget. Without these the page still renders correctly — the
  waitlist form will fail to submit and the voice demo shows its
  "coming soon" state, exactly like running locally without a `.env.local`.
- GitHub Pages is static-hosting only — there's no server, so this can
  never run `/backend`, `/agents`, or the founder dashboard's data fetch
  (the dashboard page itself loads, it just has nothing to show without
  a reachable backend). That's inherent to Pages, not something to
  configure around; use the Docker/Render/Railway path above for those.

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
