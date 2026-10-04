# KineticScout architecture

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Web framework | **Next.js 16.3.8** (App Router), React 19.3, TypeScript 6 | The brief asked for Next.js 14, but 14.x is end-of-life (last release Dec 2025) and `npm audit` reports unpatched critical advisories for it, including RCE and SSRF. The App Router code is the same model; the main differences are `proxy.ts` (formerly `middleware.ts`) and async request APIs. |
| Styling | Tailwind CSS 4, shadcn-style components on Radix primitives | First-party SVG icon set (no lucide). Roboto Mono (Apache 2.0) is self-hosted through `next/font`; body text uses Helvetica Neue / system-ui. |
| Charts | Recharts 3 | Single-series progression chart; the kinematic timeline is direct-labelled SVG. |
| API | tRPC 11 + TanStack Query 5 for dashboard data; Route Handlers for webhooks, checkout, health | Every procedure runs through auth, rate-limit and error-mapping middleware. |
| Database | PostgreSQL (Supabase) via **Prisma 7** with `@prisma/adapter-pg` | UUIDv7 keys, composite indexes, partial unique index, CHECK constraints, RLS on every table. |
| Auth | **Supabase Auth**, server-side only, HttpOnly cookies | No browser Supabase client and no `NEXT_PUBLIC_` keys. |
| Cache and rate limits | Upstash Redis (REST) | Sliding-window limits per IP, account and user. Read-through cache for repeat queries. |
| Queues | BullMQ on Redis (TCP, `rediss://`) + node-cron | Deterministic job ids give exactly-once scheduled runs across replicas. |
| Payments | Stripe Checkout + Billing Portal + webhooks | Idempotency keys, an event ledger, and duplicate-subscription refunds. |
| AI | OpenAI Chat Completions (Structured Outputs) for copy and articles; Google Cloud Video Intelligence for pose landmarks | Every paid call reserves budget against hard monthly caps. |
| Storage | Google Cloud Storage (private bucket, V4 signed URLs) | The upload size cap is enforced by GCS through the signed `x-goog-content-length-range` header. |
| Email | Resend HTTP API | Timeouts, retry, idempotency keys. |
| Tests | Vitest 5 (unit + Postgres integration), Playwright smoke | 146 tests. |

## Deployable units

```
                        ┌────────────────────────────┐
 Browser ──HTTPS──────▶ │ Next.js app (Vercel/Node)  │──▶ Supabase Auth (JWT, cookies)
   │  signed PUT/GET    │  proxy.ts: CSRF, CSP, auth │──▶ Postgres (Prisma, pooled)
   ▼                    │  RSC pages, tRPC, webhooks │──▶ Upstash Redis (rate limit, cache)
 Google Cloud Storage   └──────────┬─────────────────┘──▶ Stripe API ◀── Stripe webhooks
   ▲                               │ BullMQ enqueue
   │                               ▼
   │                    ┌────────────────────────────┐
   └────────────────────│ Worker (long-lived Node)   │──▶ Video Intelligence (pose)
                        │  node-cron schedules       │──▶ OpenAI (copy, articles)
                        │  BullMQ consumers          │──▶ Meta Marketing API (optional)
                        │  reconciliation sweep      │──▶ X API v2 counts (optional)
                        └────────────────────────────┘
```

## Directory map

```
kineticscout/
├── AGENTS.md                      Agent guidance (Next.js version docs + project rules)
├── .env.example                   Every variable, with deploy requirements
├── docs/                          Architecture, security, compliance
├── infra/gcs-cors.json            Upload bucket CORS (PUT from APP_URL only)
├── next.config.ts                 Static security headers, image policy, body limits
├── prisma.config.ts               Prisma 7 CLI config (direct URL for migrations)
├── prisma/
│   ├── schema.prisma              All tables, enums, relations, indexes
│   ├── migrations/…_init/         Generated SQL + hand-written constraints and RLS
│   └── seed.ts                    Local-only fictional fixtures
├── scripts/
│   ├── grant-admin.ts             Only way to grant ADMIN (audited)
│   ├── backup-restore-check.sh    Automated dump → restore → verify
│   └── simulate-concurrent-users.ts  Load simulation with latency and error budgets
├── src/
│   ├── proxy.ts                   CSRF origin check, CSP nonce, session refresh, coarse guards
│   ├── instrumentation.ts         Fail-fast env validation at server start
│   ├── app/                       Routes (pages, layouts, route handlers, metadata files)
│   │   ├── (auth)/                sign-in, sign-up, password reset
│   │   ├── auth/confirm/          POST-confirmed email links (scanner-safe)
│   │   ├── onboarding/            account completion + athlete profile
│   │   ├── consent/guardian/      parent or guardian consent; manage/ (withdraw, re-grant, delete via private link)
│   │   ├── email/preferences/     token-authenticated email preference centre (Phase 3)
│   │   ├── terms-update/          re-acceptance gate when CURRENT_TERMS_VERSION changes (Phase 3)
│   │   ├── dashboard/             overview, profile, analysis, matchmaker, billing, settings (auth required)
│   │   ├── admin/                 growth agent output + article drafts (ADMIN, else 404)
│   │   ├── blog/                  articles published by the Data and SEO agent
│   │   ├── faq/ search/ contact/ about/ reviews/ case-studies/   marketing site (Phase 2)
│   │   ├── legal/                 privacy, terms, refunds, cookies, your-data
│   │   └── api/                   trpc, webhooks/stripe, billing/*, account/export, email/unsubscribe, health, internal/revalidate
│   ├── components/                ui/ primitives, layout/, auth/, account/, dashboard/, admin/, brand/
│   ├── lib/
│   │   ├── auth/                  Supabase clients, DAL (session.ts), policy (permissions.ts), age rules, guardian consent and management, re-auth, actions
│   │   ├── account/               data export, scheduled deletion (grace period, resumable steps, receipts), settings actions
│   │   ├── email/                 Resend client, HTML templates, marketing sender (consent re-check), signed preference links
│   │   ├── security/              CSP, origin/CSRF, rate limits, hashing, sanitization
│   │   ├── billing/               plans, Stripe client, checkout, webhook processing, subscription sync
│   │   ├── biomechanics/          pose types, codec, 2D kinematic sequence analysis
│   │   ├── matchmaker/            program fit scoring
│   │   ├── metrics/               metric catalogue, quota-safe logging, percentile ranks
│   │   ├── ai/                    OpenAI client with structured output, budget reservations
│   │   ├── marketing/             claims/policy checker, UTM
│   │   ├── content/               article fact checker, FAQ, team, Organization schema, post lookup
│   │   ├── search/                site search (static index + published posts)
│   │   ├── consent.ts             analytics consent cookie and page allow-list
│   │   ├── storage/               GCS signed URLs, upload policy, magic-byte sniffing
│   │   ├── queue/                 BullMQ queues
│   │   └── env.ts, db.ts, logger.ts, cache.ts, audit.ts, legal.ts
│   ├── server/                    tRPC init, middleware, routers
│   └── trpc/                      tRPC + TanStack Query client provider
├── worker/
│   ├── index.ts                   Boot: cron schedules, queue consumers, heartbeat, graceful shutdown
│   ├── agents/growth/             Agent 1: trends → copy → compliance → payloads → Meta (guarded)
│   ├── agents/seo/                Agent 2: k-anonymous percentiles → article → fact check → publish
│   ├── jobs/video-analysis.ts     Pose estimation + kinematic report
│   ├── pose/                      Google Video Intelligence adapter
│   └── sweep.ts                   Re-enqueue stuck work, expire uploads, enforce retention, run due account deletions
└── tests/                         unit/, integration/ (Postgres), helpers/, setup/
```

## Data model

`User` 1–1 `AthleteProfile` 1–n `Metric`, `VideoAnalysis`, `RecruitingPipeline` n–1 `CollegeProgram`.
`User` 1–n `Subscription`, `CheckoutSession`, `AiUsage`; 1–1 `GuardianConsent`.
Agent tables: `AgentRun` 1–n `MarketingAsset`, `BlogPost`; `PercentileBaseline` holds weekly snapshots.
Ledgers: `StripeEvent` (webhook idempotency), `AuditLog` (security events), `DataDeletionReceipt` (proof a deletion was requested and completed; keyed hash of the user id only).

Column names follow the brief exactly (`stripe_customer_id`, `subscription_tier`, `grad_year`, `primary_position`, `height`, `weight`, `gpa`, `high_school`, `twitter_handle`, `metric_type`, `value`, `verified`, `video_url`, `average_recruiting_metrics`, `head_coach_email`, `last_contact_date`). Where the brief named a column without a unit, the Prisma field carries it (`heightInches @map("height")`). `60_YARD_DASH` is not a valid identifier, so the enum key is `SIXTY_YARD_DASH @map("60_YARD_DASH")`; the stored value matches the brief.

## Key flows

**Sign-up (COPPA).** The server action checks the date of birth on the server. Under 13: nothing is stored, a 24-hour cookie blocks resubmission, and the message is neutral. Ages 13–17: a guardian email is required, the profile stays private, and a consent link goes out after the athlete confirms their own email. Purchases, public profiles and outreach are blocked until a guardian consents.

**Checkout.** A plain form POSTs to `/api/billing/checkout`. The handler checks the origin and rate limit, then the price is compared against the amount shown on the page. Next, under a per-user advisory lock, it checks for live subscriptions in the database and in Stripe and reuses any open session. Otherwise it creates the session with an idempotency key and returns a 303 redirect to Stripe.

**Webhook.** The handler verifies the signature on the raw body and skips event ids already in the ledger. It re-reads the subscription from Stripe under the per-user lock, so delivery order does not matter, and recomputes the user's tier from all subscription rows. A second live subscription is cancelled and refunded. The ledger row is written last, so failures are retried.

**Video analysis.** Step 1: the tRPC `createUpload` call validates type, size and duration and returns a signed PUT URL. Step 2: the browser uploads with a progress bar. Step 3: `completeUpload` checks the real size and magic bytes, then enqueues the job. The worker re-verifies the file, reserves budget, gets pose landmarks from Video Intelligence, runs `kseq-2d-v1`, and stores the report and a compact pose track. The dashboard polls the analysis, then plays the video with a canvas skeleton synced per frame.

**Account deletion.** A request from Settings (password re-entered, typed confirmation), from a guardian's management link, or entered by staff for an emailed request sets `users.deletion_scheduled_for` to 7 days out, forces the profile private, turns marketing email off, switches off subscription renewal (flagged in Stripe metadata so a cancellation restores only what it changed), writes a `DataDeletionReceipt`, and emails the account holder (and guardian). Only the side that asked can cancel: a guardian's request cannot be undone by the teen, and vice versa. The worker sweep then deletes the Stripe customer, the GCS objects and prefix, and the Supabase login, recording each step on the receipt so a failed run resumes, and finally deletes the user row (cascading to every owned table) and contact messages from that address in one transaction.

**Email preferences.** Links in emails carry `u=<user id>&t=<HMAC(HASH_PEPPER, purpose, user id)>`. `/email/preferences` shows a masked address and one checkbox; `POST /api/email/unsubscribe` implements RFC 8058 one-click (CSRF-exempt because mail providers post without an Origin; the token is the authorization) and a GET only redirects to the preference centre, so link scanners change nothing. `sendMarketingEmail` is the only marketing path: it re-checks opt-in, guardian consent for minors and pending deletion at send time, and adds `List-Unsubscribe`, a visible link and the postal address.

**Terms re-acceptance.** `session.ts` compares the accepted version with `CURRENT_TERMS_VERSION`. `requireUser` sends outdated accounts to `/terms-update`, and the tRPC `protectedProcedure` refuses API calls with `PRECONDITION_FAILED`. Data export and account deletion stay available from that page without accepting.

**Agents.** node-cron ticks in `AGENT_TIMEZONE`: Growth runs Tuesday and Thursday at 10:00, Data/SEO runs Sunday at 00:00. Each tick enqueues a BullMQ job with id `<agent>-<slot>`, and `AgentRun(agent, slot)` is unique, so every slot runs once across all replicas. Failed runs can be retried.

## Delivery phases

| Phase | Scope | Status |
|---|---|---|
| 1 | Project structure, schema and migrations, security and auth, Stripe billing, Agents 1 and 2, video analysis pipeline, Pro dashboard (video analysis and College Matchmaker), legal pages, admin review console | **Done** |
| 2 | Marketing site: FAQ (5 detailed, expandable, FAQPage schema), site search, contact form + thank-you page, floating contact button and sticky mobile CTA, scroll progress, reviews and case studies (admin-curated, consent-backed, empty until real ones exist), About page with team (from `content/team.json`) and directions link, Organization schema, GA4 behind an equal-choice consent banner (public pages only), UTM first-touch attribution, per-article share images | **Done**. Content still needed from the business: real reviews, case studies, team photos |
| 3 | Settings page; data export (JSON); self-serve account deletion with a 7-day cancellable window, renewal pause, resumable external steps and anonymous receipts; staff entry for emailed requests; one-click unsubscribe (RFC 8058) and token preference centre; guardian management link (withdraw, re-grant, cancel renewal, request or cancel deletion); profile editing; terms re-acceptance gate; public Your data page | **Done** |
| 4 | Agent 3 (coaching-change monitor and outreach drafts), verified metric badges, side-by-side pro comparison (needs licensed reference footage), one-click PDF export and share URL, public profiles, biometric percentile engine, cross-sport projectability score | Planned |
