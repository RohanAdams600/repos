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
├── docs/                          Architecture, security, compliance, deploy checklist, load testing
├── e2e/                           Playwright + axe specs (English and Spanish), seed, local auth stub cookies
├── infra/
│   ├── gcs-cors.json              Upload bucket CORS (PUT from APP_URL only)
│   └── monitoring/                Prometheus scrape config, alert rules + promtool tests, Grafana dashboard (Phase 5)
├── next.config.ts                 Static security headers, image policy, body limits, service worker headers
├── public/                        sw.js (offline page and push only), icons/ (Phase 6)
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
│   │   ├── consent/guardian/      parent or guardian consent; manage/ (withdraw, re-grant, delete via private link); contact/ (approve a coach request)
│   │   ├── coach/verify-email/    POST-confirmed school email confirmation for coach accounts (Phase 5)
│   │   ├── consent/guardian/team, consent/guardian/messages   guardian approval of a team join; read, report or end a copied conversation (Phase 6)
│   │   ├── offline/               page the service worker shows when the network is unreachable (Phase 6)
│   │   ├── manifest.ts, apple-icon.png   installable app manifest and icons (Phase 6)
│   │   ├── email/preferences/     token-authenticated email preference centre (Phase 3)
│   │   ├── terms-update/          re-acceptance gate when CURRENT_TERMS_VERSION changes (Phase 3)
│   │   ├── dashboard/             overview, profile and sharing, measurements, insights, analysis (+ compare), matchmaker,
│   │   │                          recruiting assistant, contact requests, notifications, billing, settings (auth required);
│   │   │                          coaches: prospects, saved, contact requests (Phase 5); messages, teams (athletes),
│   │   │                          team/ (team coaches: roster, record a testing day, sessions) (Phase 6)
│   │   ├── p/[slug]/              public athlete profile, share image and PDF (Phase 4)
│   │   ├── tools/                 public percentile calculator by build (Phase 4)
│   │   ├── admin/                 growth agent output + article drafts (ADMIN, else 404)
│   │   ├── blog/                  articles published by the Data and SEO agent
│   │   ├── faq/ search/ contact/ about/ reviews/ case-studies/   marketing site (Phase 2)
│   │   ├── legal/                 privacy, terms, refunds, cookies, your-data
│   │   └── api/                   trpc, webhooks/stripe, billing/*, account/export, profile/pdf, email/unsubscribe, health, internal/revalidate, internal/metrics,
│   │                              admin/norms (norm table upload), push/subscription (Phase 6)
│   ├── components/                ui/ primitives, layout/, auth/, account/, dashboard/, admin/, brand/
│   ├── i18n/                      Languages: config (locales, cookie, Accept-Language), server and client helpers, recipient language for emails, messages/ catalogues (English shape, Spanish checked against it)
│   ├── lib/
│   │   ├── auth/                  Supabase clients, DAL (session.ts), policy (permissions.ts), age rules, guardian consent and management, re-auth, actions,
│   │   │                          e2e-stub.ts (test-only sign-in, refused outside DEPLOY_ENV=local)
│   │   ├── coach/                 coach verification, prospect search and boards, contact requests (guardian approval, block, report), rules
│   │   ├── ops/                   operational gauges and Prometheus text format (Phase 5)
│   │   ├── teams/                 team rules, join codes, guardian approval, testing days, coach-recorded results (Phase 6)
│   │   ├── messaging/             conversations after an accepted contact, guardian copies, reports, retention (Phase 6)
│   │   ├── push/                  Web Push encryption and VAPID (node:crypto), endpoint allowlist, delivery (Phase 6)
│   │   ├── pwa/                   offline outbox and device helpers for the installable app (Phase 6)
│   │   ├── family/                parent and guardian accounts: overview, actions, in-app notices (Phase 7)
│   │   ├── events/                event listings, review, attendance, coach view, recruiting calendar, retention (Phase 7)
│   │   ├── training/              drill library (two-person review), plan building from analysis findings, practice log (Phase 7)
│   │   ├── account/               data export, scheduled deletion (grace period, resumable steps, receipts), settings actions
│   │   ├── profile/               public profile data and visibility, slugs, view counters, PDF renderer
│   │   ├── verification/          evidence policy, MP4 metadata reader, automated checks, reviewer decisions, retention
│   │   ├── insights/              biometric (build-cohort) percentiles, licensed national norms (import, bands, precedence), cross-sport equivalents, public calculator
│   │   ├── recruiting/            Agent 3: program changes and feed import, watcher fan-out, grounded outreach drafts
│   │   ├── reference/             licensed reference clip library
│   │   ├── notifications/         in-app notifications (idempotent by dedupe key)
│   │   ├── email/                 Resend client, HTML templates, marketing sender (consent re-check), signed preference links
│   │   ├── security/              CSP, origin/CSRF, rate limits, hashing, sanitization
│   │   ├── billing/               plans, Stripe client, checkout, webhook processing, subscription sync
│   │   ├── biomechanics/          pose types, codec, motions by sport, 2D kinematic sequence analysis, comparison anchors, projectile estimate
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
│   ├── pose/                      Google Video Intelligence adapter (person detection, optional object tracking)
│   ├── agents/recruiting/         Agent 3: licensed program feed import (daily, optional)
│   ├── jobs/                      video-analysis, metric-evidence, recruiting (fan-out + drafts), reference-clip
│   └── sweep.ts                   Re-enqueue stuck work, enforce retention, run due deletions, purge evidence, retry program changes,
│                                  expire contact requests
└── tests/                         unit/, integration/ (Postgres), helpers/, setup/
```

## Data model

`User` 1–1 `AthleteProfile` 1–n `Metric`, `VideoAnalysis`, `RecruitingPipeline` n–1 `CollegeProgram`.
`User` 1–n `Subscription`, `CheckoutSession`, `AiUsage`; 1–1 `GuardianConsent`.
Agent tables: `AgentRun` 1–n `MarketingAsset`, `BlogPost`; `PercentileBaseline` holds weekly snapshots.
Coaches (Phase 5): `User` 1–1 `CoachProfile` n–1 `CollegeProgram`; `CoachProfile` 1–n `SavedProspect`, `ContactRequest`, `CoachReport` (each also n–1 the athlete); `CoachBlock` joins athlete and coach.
Phase 7: `User` (GUARDIAN) has no foreign key to athletes: access is `GuardianConsent.guardianEmail` equal to the account's confirmed email. `Event` 1–n `EventAttendance` n–1 `AthleteProfile`; `RecruitingPeriod` stands alone with its source. `Drill` 1–n `TrainingPlanItem` n–1 `TrainingPlan` n–1 `AthleteProfile` (and optionally the `VideoAnalysis` it came from); `TrainingPlanItem` 1–n `TrainingLog` (one row per practiced day).
Phase 6: `NormDataset` 1–n `NormRow` (licensed quantile bands; rows immutable by trigger). `User` (TEAM_COACH) 1–n `Team` 1–n `TeamMember`, `TestingSession` 1–n `TeamEntry`; an accepted entry becomes a `Metric` with `source = TEAM` and a stored attribution. `ContactRequest` 1–1 `MessageThread` 1–n `Message` 1–n `MessageReport`. `User` 1–n `PushSubscription`. `Metric.clientRef` makes offline resends idempotent.
Ledgers: `StripeEvent` (webhook idempotency), `AuditLog` (security events), `DataDeletionReceipt` (proof a deletion was requested and completed; keyed hash of the user id only).

Column names follow the brief exactly (`stripe_customer_id`, `subscription_tier`, `grad_year`, `primary_position`, `height`, `weight`, `gpa`, `high_school`, `twitter_handle`, `metric_type`, `value`, `verified`, `video_url`, `average_recruiting_metrics`, `head_coach_email`, `last_contact_date`). Where the brief named a column without a unit, the Prisma field carries it (`heightInches @map("height")`). `60_YARD_DASH` is not a valid identifier, so the enum key is `SIXTY_YARD_DASH @map("60_YARD_DASH")`; the stored value matches the brief.

## Key flows

**Sign-up (COPPA).** The server action checks the date of birth on the server. Under 13: nothing is stored, a 24-hour cookie blocks resubmission, and the message is neutral. Ages 13–17: a guardian email is required, the profile stays private, and a consent link goes out after the athlete confirms their own email. Purchases, public profiles and outreach are blocked until a guardian consents.

**Checkout.** A plain form POSTs to `/api/billing/checkout`. The handler checks the origin and rate limit, then the price is compared against the amount shown on the page. Next, under a per-user advisory lock, it checks for live subscriptions in the database and in Stripe and reuses any open session. Otherwise it creates the session with an idempotency key and returns a 303 redirect to Stripe.

**Webhook.** The handler verifies the signature on the raw body and skips event ids already in the ledger. It re-reads the subscription from Stripe under the per-user lock, so delivery order does not matter, and recomputes the user's tier from all subscription rows. A second live subscription is cancelled and refunded. The ledger row is written last, so failures are retried.

**Video analysis.** Step 1: the tRPC `createUpload` call validates type, size and duration and returns a signed PUT URL. Step 2: the browser uploads with a progress bar. Step 3: `completeUpload` checks the real size and magic bytes, then enqueues the job. The worker re-verifies the file, reserves budget, gets pose landmarks from Video Intelligence, runs `kseq-2d-v1`, and stores the report and a compact pose track. The dashboard polls the analysis, then plays the video with a canvas skeleton synced per frame.

**Languages (Phase 7).** English and Spanish. The request's language comes from the `ks_locale` cookie (set by the language switch), then the `?lang=` parameter of an emailed link (the proxy copies it into a request header), then the signed-in account's saved language, then `Accept-Language`, then English. Text lives in typed catalogues under `src/i18n/messages/`: each catalogue's Spanish half must have exactly the shape of the English half, so a missing translation is a compile error. Server code keeps writing messages in English; `translateServerText` translates them where they are shown (alerts and field errors), and a unit test checks that every literal server message has a Spanish entry. Emails and notifications are written in both languages at the call site and resolved when sent, from `users.locale` or, for a guardian without an account, `guardian_consents.locale`; push payloads stay generic in either language. Content written by people (drill instructions, event listings, staff notes, outreach drafts for US coaches) is shown as written and marked `lang="en"` where it is English inside a Spanish page. The PDF profile stays English because coaches read it.

**Account deletion.** A request from Settings (password re-entered, typed confirmation), from a guardian's management link, or entered by staff for an emailed request sets `users.deletion_scheduled_for` to 7 days out, forces the profile private, turns marketing email off, switches off subscription renewal (flagged in Stripe metadata so a cancellation restores only what it changed), writes a `DataDeletionReceipt`, and emails the account holder (and guardian). Only the side that asked can cancel: a guardian's request cannot be undone by the teen, and vice versa. The worker sweep then deletes the Stripe customer, the GCS objects and prefix, and the Supabase login, recording each step on the receipt so a failed run resumes, and finally deletes the user row (cascading to every owned table) and contact messages from that address in one transaction.

**Email preferences.** Links in emails carry `u=<user id>&t=<HMAC(HASH_PEPPER, purpose, user id)>`. `/email/preferences` shows a masked address and one checkbox; `POST /api/email/unsubscribe` implements RFC 8058 one-click (CSRF-exempt because mail providers post without an Origin; the token is the authorization) and a GET only redirects to the preference centre, so link scanners change nothing. `sendMarketingEmail` is the only marketing path: it re-checks opt-in, guardian consent for minors and pending deletion at send time, and adds `List-Unsubscribe`, a visible link and the postal address.

**Terms re-acceptance.** `session.ts` compares the accepted version with `CURRENT_TERMS_VERSION`. `requireUser` sends outdated accounts to `/terms-update`, and the tRPC `protectedProcedure` refuses API calls with `PRECONDITION_FAILED`. Data export and account deletion stay available from that page without accepting.

**Public profile and PDF (Phase 4).** Profiles are private until the athlete switches them on (minors need guardian consent). The link is `/p/<first name>-<8 random characters>`, so it cannot be guessed and never contains a last name; the athlete can issue a new link at any time. Visibility is re-checked on every request (consent, pending deletion), pages are `noindex`, GPA and high school appear only if chosen, and the share image shows first name and last initial. The PDF is generated per request from the same data, so it is always current. Views and downloads are daily counters with no visitor identifiers, de-duplicated per visitor per hour and excluding bots and the owner.

**Verified badges.** An athlete uploads a clip of one measurement (signed upload under `videos/<user id>/evidence/`, so account deletion removes it). The worker reads the MP4 movie header (duration, recording time) by range requests, hashes the file and checks reuse. A clip already submitted by another athlete, an unreadable file or one over 60 seconds is rejected and deleted at once; anything else goes to a staff review queue with the flags shown. Only a reviewer's approval sets `metrics.verified` (a database CHECK requires a recorded decision). Evidence videos are deleted 30 days after the decision; the hash stays to stop reuse.

**Biometric percentiles and cross-sport equivalents.** The athlete's best value is ranked against KineticScout athletes in the narrowest age, height and weight band that holds at least 25 others (bands widen in four steps and the band used is shown). Cross-sport equivalents read the athlete's percentile on speed, arm or rotational-power metrics across to the same percentile of a related metric in another sport, using the weekly k-anonymous snapshots. Both are labelled as comparisons, never as national rankings or predictions. The public calculator rounds to the nearest 5 and stores nothing.

**Agent 3 (recruiting assistant).** Program data changes come from staff edits in `/admin` or a licensed feed (`PROGRAM_DATA_FEED_URL`, daily, schema-validated, known programs only). A new head coach or a posted roster need is written as a `ProgramChange` with its source and enqueued at once; the sweep retries anything unprocessed. Fan-out selects Pro athletes with the program in their pipeline who turned alerts on (and have guardian consent if under 18; roster needs also match position and class). Each gets an outreach draft written by the LLM from a fixed fact sheet and rejected unless every number appears in it, the coach on file is addressed and no promise or em dash appears, then an in-app notification and, if enabled, an email. If drafting is impossible the alert still goes out. Athletes can also request drafts manually; nothing is ever sent to a coach by KineticScout.

**Side-by-side comparison.** Both clips are aligned on lead foot strike when both have one, otherwise on the driving hand's peak speed (hockey shots can lack a clear plant): clip A drives the clock and clip B is re-seeked whenever it drifts by more than about a frame; a left-handed clip is mirrored against a right-handed one. Reference clips are uploaded by staff with licence details (enforced by a CHECK constraint), processed by the same pose pipeline, and playable only while active and within the licence term, re-checked on every request.

**Puck and ball tracking (Phase 5, beta).** When the athlete opts in, the worker adds `OBJECT_TRACKING` to the Video Intelligence request (its cost is part of the budget reservation). `projectile.ts` keeps tracks labelled as the sport's ball or puck, picks the one with the most observations in the 250 ms after peak hand speed (release), and fits a straight line to its centre over that window. The athlete's entered height is the ruler from image units to feet. The result is a launch angle in the image plane and a speed reported as a lower bound, because motion toward or away from the camera is invisible in 2D. Too few points, a poor fit, a missing height or a speed outside the plausible range for the matching metric produce a warning instead of a number.

**Coach verification and contact (Phase 5).** A coach account is adults-only. The coach names their program and a school or program email address; a hashed, expiring link confirms the inbox (POST-confirmed so mail scanners cannot click it), then staff match the person to the program's public staff directory. A database CHECK refuses `VERIFIED` without a confirmed email and a review. Verified coaches search public profiles with the same visibility rules as `/p/<slug>` applied in SQL (consent for minors, no pending deletion, blocks excluded) and see only the public card. A contact request carries a first message without links or phone numbers and an attestation that the coach's association allows contact now; one open request per pair (partial unique index), 20 per coach per day, 90 days' wait after a decline, expiry after 30 days. The athlete accepts or declines; for a minor, acceptance emails the guardian a hashed 14-day link, and only their approval shares both addresses (a CHECK keeps `shared_emails` empty unless accepted). Blocking a coach, or a guardian withdrawing consent, declines open requests and clears shared addresses from the coach's page. Reports go to the admin console; suspension withdraws the coach's open requests.

**National norms (Phase 6).** Staff upload a licensed table as CSV through `POST /api/admin/norms` (a route handler, because tables exceed the 64 KB API cap). `norms.ts` parses and checks it: known metrics, plausible values, ascending quantiles, a sample of at least 25 per band, and bands per metric that are separate or fully nested, so the lookup never depends on row order. A table is stored as a draft; staff preview it against a sample athlete, then activate it. For each metric, the most recently activated table with a band covering the athlete wins, and its narrowest covering band is used; a table whose licence has ended stops being used the next day. Insights and the public calculator show the national figure (with publisher, edition, population and sample size) next to the KineticScout cohort, and cross-sport equivalents are read entirely from national tables when they cover both metrics.

**Team accounts (Phase 6).** A `TEAM_COACH` account registers a team; staff match the coach to the school or club staff page before the team can take players. An athlete asks to join with the team's code; the coach approves; for a minor, a guardian then approves through a hashed 14-day link. Coaches see roster names, classes and positions only. A testing day records results for active members in the team's sport, all or nothing; each athlete accepts or declines every result. Accepting creates a `Metric` with `source = TEAM` and a stored attribution ("coach-recorded", shown with an outline badge, never the volt Verified fill), dated on the testing day and outside the free logging limit. Leaving, removal, guardian withdrawal and suspension withdraw pending results; staff can also strip a suspended team's labels.

**Messaging (Phase 6).** A conversation opens for an accepted contact request while contact is still shared. Messages are plain text (no automatic links), 2,000 characters, 30 per hour per sender, and a coach can send three in a row before the athlete replies; a database trigger rejects a sender outside the thread. For athletes under 18 every message is emailed to the guardian with a signed link (HMAC of the thread id) to read the thread, report a message or end it. Blocks, guardian withdrawal and coach suspension close conversations. Reports go to staff, who see five messages either side; every load of that queue is audited. Closed conversations are purged after 12 months unless a report is open.

**Parent and guardian accounts (Phase 7).** A `GUARDIAN` account (adults only) acts for every athlete whose guardian consent names its email address; sign-in requires a confirmed address, so this is the same proof as the emailed links. `guardedAthlete()` in `session.ts` resolves the athlete for every Family page, action and route, and answers nothing for anyone else. The token flows (consent, team and contact approval, message copies) now call id-based cores that the account path shares, with the guardian's user id recorded in the audit log. Until the guardian answers the consent request, giving consent is the only action. In-app notices go to the guardian account wherever a guardian email is sent.

**Events and the recruiting calendar (Phase 7).** Team coaches, college coaches and parents submit listings; staff publish after checking the organizer's page (CHECK: no `PUBLISHED` without a review). Event pages are public with `SportsEvent` JSON-LD. Athletes mark attendance on open listed events; `attendeesForCoach` shows a verified college coach only athletes who chose to share, whose profile is publicly visible (guardian consent for minors) and who have not blocked that coach. Edits and cancellations notify attendees and their guardian accounts. Staff enter recruiting periods with an https source; periods for one sport and division cannot overlap (checked under an advisory lock). The sweep deletes attendance a year after an event and events two years after.

**Training plans (Phase 7).** Staff write or license drills; a different staff member publishes them (CHECK: reviewer differs from writer). A Pro athlete builds a four-week plan from a completed analysis: findings are taken most serious first, each matched to the most targeted published drill for that motion, at most four, one active plan per motion (partial unique index). A licensed drill whose licence has ended disappears from plans and is never offered. Practice is one row per drill per day. The plan shows measurements logged since it started next to the best value of the 90 days before, with wording that claims no cause.

**Installable app (Phase 6).** `manifest.ts` and icons make the site installable. `public/sw.js` serves the offline page when a navigation fails and shows push notifications; it caches nothing personal. Measurements logged offline go to a `localStorage` outbox with a random `clientRef`; `OutboxSync` sends them when the device reconnects, and the server returns the first result for a repeated `clientRef` (unique per athlete). Push is opt-in per device from Settings: `notify()` queues a delivery when the user has subscriptions; the worker encrypts the payload (RFC 8291) and signs VAPID (RFC 8292) with `node:crypto`, only to allowlisted push services, and the payload is a generic line with no names or message text. Signing out clears the outbox and removes the device's push subscription.

**Agents.** node-cron ticks in `AGENT_TIMEZONE`: Growth runs Tuesday and Thursday at 10:00, Data/SEO runs Sunday at 00:00. Each tick enqueues a BullMQ job with id `<agent>-<slot>`, and `AgentRun(agent, slot)` is unique, so every slot runs once across all replicas. Failed runs can be retried.

## Delivery phases

| Phase | Scope | Status |
|---|---|---|
| 1 | Project structure, schema and migrations, security and auth, Stripe billing, Agents 1 and 2, video analysis pipeline, Pro dashboard (video analysis and College Matchmaker), legal pages, admin review console | **Done** |
| 2 | Marketing site: FAQ (5 detailed, expandable, FAQPage schema), site search, contact form + thank-you page, floating contact button and sticky mobile CTA, scroll progress, reviews and case studies (admin-curated, consent-backed, empty until real ones exist), About page with team (from `content/team.json`) and directions link, Organization schema, GA4 behind an equal-choice consent banner (public pages only), UTM first-touch attribution, per-article share images | **Done**. Content still needed from the business: real reviews, case studies, team photos |
| 3 | Settings page; data export (JSON); self-serve account deletion with a 7-day cancellable window, renewal pause, resumable external steps and anonymous receipts; staff entry for emailed requests; one-click unsubscribe (RFC 8058) and token preference centre; guardian management link (withdraw, re-grant, cancel renewal, request or cancel deletion); profile editing; terms re-acceptance gate; public Your data page | **Done** |
| 4 | Public profiles with private share links, one-page PDF and share image; verified metric badges (evidence upload, automated checks, staff review); biometric percentile engine and public calculator; cross-sport equivalents; Agent 3 recruiting assistant (program change feed and admin entry, alerts, grounded outreach drafts); side-by-side comparison synced at foot strike with a licensed reference clip library; notifications | **Done**. Needs from the business: licensed reference footage and a licensed program data source |
| 5 | Hockey shot and football throw analysis (sport-aware motions, comparison anchored at foot strike or hand peak); puck and ball tracking beta (Video Intelligence object tracking, launch angle and lower-bound speed scaled by athlete height); coach tools (school email and staff directory verification, prospect search over public profiles, saved boards with private notes, contact requests with athlete acceptance and guardian approval for minors, block and report, admin review); hardening (Playwright + axe e2e suite with a local auth stub, CI e2e and alert-rule jobs, load simulation by route group, `/api/internal/metrics`, alert rules, Grafana dashboard, deploy checklist) | **Done**. Needs from the business: staff time for coach reviews and reports, and the policy-change email |
| 7 (part 2) | Spanish: every page athletes, parents and coaches use (staff console stays English), `<html lang>` per request, a language switch on every page and a language setting saved on the account, emails and notifications written in each recipient's language (a guardian's from the language chosen for them at sign-up), push titles per language, analysis findings rebuilt from their codes, courtesy translations of the legal pages with an "English governs" notice, Spanish site search, Spanish e2e and axe runs | **Done**. Needs from the business: a professional review of the Spanish (legal pages first), Spanish drill content, the bilingual Supabase email templates, and the policy-change email |
| 7 (part 1) | Parent and guardian accounts (Family pages sharing the emailed-link code paths), events and camps (staff-checked listings, attendance with coach visibility rules, recruiting calendar with sources), training plans from analysis findings (two-person drill review, practice log, neutral progress) | **Done**. Needs from the business: drill content from qualified staff coaches, staff time for event reviews, recruiting calendar entry from the published calendars, and the policy-change email. Spanish follows in part 2 |
| 6 | Licensed national norms (staff CSV import, validation, draft and activation, band precedence, licence expiry) in insights, the public calculator and cross-sport equivalents; team accounts for high school and travel coaches (staff-checked teams, join codes, guardian approval, testing days, athlete-accepted coach-recorded results); messaging after an accepted contact (guardian copies for minors, reports, staff review, retention); installable app (manifest, offline page, offline measurement outbox with idempotent resend, opt-in Web Push with generic payloads, camera capture) | **Done**. Needs from the business: a licensed national norms source, VAPID keys, staff time for team reviews and message reports, and the policy-change email |
