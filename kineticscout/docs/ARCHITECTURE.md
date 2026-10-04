# KineticScout architecture

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Web framework | **Next.js 16.3.8** (App Router), React 19.3, TypeScript 6 | The brief asked for Next.js 14, but 14.x is end-of-life (last release Dec 2025) and `npm audit` reports unpatched critical advisories for it, including RCE and SSRF. The App Router code is the same model; the main differences are `proxy.ts` (formerly `middleware.ts`) and async request APIs. |
| Styling | Tailwind CSS 4, shadcn-style components on Radix primitives | First-party SVG icon set (no lucide). Roboto Mono (SIL OFL 1.1) is self-hosted through `next/font`; body text uses Helvetica Neue / system-ui. |
| Charts | Recharts 3 | Single-series progression chart; the kinematic timeline is direct-labelled SVG. |
| API | tRPC 11 + TanStack Query 5 for dashboard data; Route Handlers for webhooks, checkout, health | Every procedure runs through auth, rate-limit and error-mapping middleware. |
| Database | PostgreSQL (Supabase) via **Prisma 7** with `@prisma/adapter-pg` | UUIDv7 keys, composite indexes, partial unique index, CHECK constraints, RLS on every table. |
| Auth | **Supabase Auth**, server-side only, HttpOnly cookies | No browser Supabase client and no `NEXT_PUBLIC_` keys. |
| Cache and rate limits | Upstash Redis (REST) | Sliding-window limits per IP, account and user. Read-through cache for repeat queries. |
| Queues | BullMQ on Redis (TCP, `rediss://`) + node-cron | Deterministic job ids give exactly-once scheduled runs across replicas. |
| Payments | Stripe Checkout + Billing Portal + webhooks | Idempotency keys, an event ledger, and duplicate-subscription refunds. |
| AI | OpenAI Chat Completions (Structured Outputs) for copy, articles and outreach drafts; Google Cloud Video Intelligence for pose landmarks | Every paid call reserves budget against hard monthly caps. Outreach drafts are validated against a fact sheet before they are stored. |
| PDF | pdf-lib with @pdf-lib/fontkit | One-page recruiting profile; Roboto Mono embedded as a subset from `assets/fonts/`. |
| Storage | Google Cloud Storage (private bucket, V4 signed URLs) | The upload size cap is enforced by GCS through the signed `x-goog-content-length-range` header. |
| Email | Resend HTTP API | Timeouts, retry, idempotency keys. |
| Tests | Vitest 5 (unit + Postgres integration), Playwright smoke | 214 tests. |

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
│   │   ├── dashboard/             overview, profile and sharing, measurements, insights, analysis (+ compare), matchmaker,
│   │   │                          recruiting assistant, notifications, billing, settings (auth required)
│   │   ├── p/[slug]/              public athlete profile, share image and PDF (Phase 4)
│   │   ├── tools/                 public percentile calculator by build (Phase 4)
│   │   ├── admin/                 growth agent output + article drafts (ADMIN, else 404)
│   │   ├── blog/                  articles published by the Data and SEO agent
│   │   ├── faq/ search/ contact/ about/ reviews/ case-studies/   marketing site (Phase 2)
│   │   ├── legal/                 privacy, terms, refunds, cookies, your-data
│   │   └── api/                   trpc, webhooks/stripe, billing/*, account/export, profile/pdf, email/unsubscribe, health, internal/revalidate
│   ├── components/                ui/ primitives, layout/, auth/, account/, dashboard/, admin/, brand/
│   ├── lib/
│   │   ├── auth/                  Supabase clients, DAL (session.ts), policy (permissions.ts), age rules, guardian consent and management, re-auth, actions
│   │   ├── account/               data export, scheduled deletion (grace period, resumable steps, receipts), settings actions
│   │   ├── profile/               public profile data and visibility, slugs, view counters, PDF renderer
│   │   ├── verification/          evidence policy, MP4 metadata reader, automated checks, reviewer decisions, retention
│   │   ├── insights/              biometric (build-cohort) percentiles, cross-sport equivalents, public calculator
│   │   ├── recruiting/            Agent 3: program changes and feed import, watcher fan-out, grounded outreach drafts
│   │   ├── reference/             licensed reference clip library
│   │   ├── notifications/         in-app notifications (idempotent by dedupe key)
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
│   ├── agents/recruiting/         Agent 3: licensed program feed import (daily, optional)
│   ├── jobs/                      video-analysis, metric-evidence, recruiting (fan-out + drafts), reference-clip
│   └── sweep.ts                   Re-enqueue stuck work, enforce retention, run due deletions, purge evidence, retry program changes
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

**Public profile and PDF (Phase 4).** Profiles are private until the athlete switches them on (minors need guardian consent). The link is `/p/<first name>-<8 random characters>`, so it cannot be guessed and never contains a last name; the athlete can issue a new link at any time. Visibility is re-checked on every request (consent, pending deletion), pages are `noindex`, GPA and high school appear only if chosen, and the share image shows first name and last initial. The PDF is generated per request from the same data, so it is always current. Views and downloads are daily counters with no visitor identifiers, de-duplicated per visitor per hour and excluding bots and the owner.

**Verified badges.** An athlete uploads a clip of one measurement (signed upload under `videos/<user id>/evidence/`, so account deletion removes it). The worker reads the MP4 movie header (duration, recording time) by range requests, hashes the file and checks reuse. A clip already submitted by another athlete, an unreadable file or one over 60 seconds is rejected and deleted at once; anything else goes to a staff review queue with the flags shown. Only a reviewer's approval sets `metrics.verified` (a database CHECK requires a recorded decision). Evidence videos are deleted 30 days after the decision; the hash stays to stop reuse.

**Biometric percentiles and cross-sport equivalents.** The athlete's best value is ranked against KineticScout athletes in the narrowest age, height and weight band that holds at least 25 others (bands widen in four steps and the band used is shown). Cross-sport equivalents read the athlete's percentile on speed, arm or rotational-power metrics across to the same percentile of a related metric in another sport, using the weekly k-anonymous snapshots. Both are labelled as comparisons, never as national rankings or predictions. The public calculator rounds to the nearest 5 and stores nothing.

**Agent 3 (recruiting assistant).** Program data changes come from staff edits in `/admin` or a licensed feed (`PROGRAM_DATA_FEED_URL`, daily, schema-validated, known programs only). A new head coach or a posted roster need is written as a `ProgramChange` with its source and enqueued at once; the sweep retries anything unprocessed. Fan-out selects Pro athletes with the program in their pipeline who turned alerts on (and have guardian consent if under 18; roster needs also match position and class). Each gets an outreach draft written by the LLM from a fixed fact sheet and rejected unless every number appears in it, the coach on file is addressed and no promise or em dash appears, then an in-app notification and, if enabled, an email. If drafting is impossible the alert still goes out. Athletes can also request drafts manually; nothing is ever sent to a coach by KineticScout.

**Side-by-side comparison.** Both clips are aligned on lead foot strike: clip A drives the clock and clip B is re-seeked whenever it drifts by more than about a frame; a left-handed clip is mirrored against a right-handed one. Reference clips are uploaded by staff with licence details (enforced by a CHECK constraint), processed by the same pose pipeline, and playable only while active and within the licence term, re-checked on every request.

**Agents.** node-cron ticks in `AGENT_TIMEZONE`: Growth runs Tuesday and Thursday at 10:00, Data/SEO runs Sunday at 00:00. Each tick enqueues a BullMQ job with id `<agent>-<slot>`, and `AgentRun(agent, slot)` is unique, so every slot runs once across all replicas. Failed runs can be retried.

## Delivery phases

| Phase | Scope | Status |
|---|---|---|
| 1 | Project structure, schema and migrations, security and auth, Stripe billing, Agents 1 and 2, video analysis pipeline, Pro dashboard (video analysis and College Matchmaker), legal pages, admin review console | **Done** |
| 2 | Marketing site: FAQ (5 detailed, expandable, FAQPage schema), site search, contact form + thank-you page, floating contact button and sticky mobile CTA, scroll progress, reviews and case studies (admin-curated, consent-backed, empty until real ones exist), About page with team (from `content/team.json`) and directions link, Organization schema, GA4 behind an equal-choice consent banner (public pages only), UTM first-touch attribution, per-article share images | **Done**. Content still needed from the business: real reviews, case studies, team photos |
| 3 | Settings page; data export (JSON); self-serve account deletion with a 7-day cancellable window, renewal pause, resumable external steps and anonymous receipts; staff entry for emailed requests; one-click unsubscribe (RFC 8058) and token preference centre; guardian management link (withdraw, re-grant, cancel renewal, request or cancel deletion); profile editing; terms re-acceptance gate; public Your data page | **Done** |
| 4 | Public profiles with private share links, one-page PDF and share image; verified metric badges (evidence upload, automated checks, staff review); biometric percentile engine and public calculator; cross-sport equivalents; Agent 3 recruiting assistant (program change feed and admin entry, alerts, grounded outreach drafts); side-by-side comparison synced at foot strike with a licensed reference clip library; notifications | **Done**. Needs from the business: licensed reference footage and a licensed program data source |
