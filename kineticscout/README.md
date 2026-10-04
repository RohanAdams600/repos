# KineticScout

Performance data and recruiting tools for high school athletes. Athletes log measurables (exit velocity, pitch velocity, 60-yard dash and more), see their percentile within their graduating class, analyze swing, pitch, hockey shot and football throw mechanics from video, and find college programs whose typical recruit matches their numbers. Verified college coaches can search public profiles, ask to make contact and, once accepted, message athletes, with parents of athletes under 18 copied. High school and travel coaches record testing-day results that athletes accept onto their profiles. Where a licensed national table exists, athletes also see their national standing for their build. It installs on a phone and works offline for logging.

- **Architecture, stack and directory map:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Security controls:** [docs/SECURITY.md](docs/SECURITY.md)
- **Compliance (COPPA, data inventory, SDK audit):** [docs/COMPLIANCE.md](docs/COMPLIANCE.md)
- **Production deploy checklist, monitoring and rollback:** [docs/DEPLOY.md](docs/DEPLOY.md)
- **Load test method and results:** [docs/LOAD-TESTING.md](docs/LOAD-TESTING.md)

## What is in Phase 1

| Area | Delivered |
|---|---|
| Database | Prisma 7 schema for every table in the brief plus billing, consent, agents and ledgers; indexes; partial unique index; CHECK constraints; RLS on all tables |
| Auth and security | Supabase Auth with HttpOnly cookies, COPPA age screen, guardian consent, role and tier permissions, CSRF origin enforcement, per-request CSP nonce, HSTS and security headers, rate limits, env validation |
| Billing | Stripe Checkout (Scout free; Pro $14.99/mo or $129/yr), Billing Portal, verified and idempotent webhooks, upgrade and downgrade sync, duplicate-subscription refunds, price-integrity check |
| Agents | Worker with node-cron + BullMQ. Agent 1 (Growth and Ads, Tue/Thu 10:00): trends, LLM copy, compliance checker, ready-to-publish JSON, guarded Meta Ads push. Agent 2 (Data and SEO, Sun 00:00): k-anonymous percentiles, fact-checked articles, auto-publish |
| Pro dashboard | AI biomechanics video analysis (signed uploads with progress, pose estimation, kinematic sequence report, frame-synced skeleton overlay) and College Matchmaker (fit bands, per-metric comparison, filters, pagination, pipeline) |
| Also | Metric logging with the free-tier quota, class percentiles, progression chart, admin review console, blog, legal pages, 404/error pages, robots, sitemap, OG image |

## What is in Phase 2

FAQ page with five detailed, expandable answers (also on the home page, with FAQPage schema), site search, a contact form with a thank-you page, a floating contact button and sticky mobile sign-up bar, reading progress on long pages, an About page (team, address, directions), and reviews and case studies pages. Google Analytics 4 sits behind an equal-choice consent banner and runs on public pages only. Campaign UTM tags are attributed on a first-touch basis, and each article gets its own share image. Staff manage reviews, case studies and the contact inbox in `/admin`.

**Content rules.** Reviews must belong to a real account holder who agreed to publication. Case studies need a written-consent date. Team members go in `content/team.json`, with photos in `public/team/`. Until real content exists, each section shows an honest empty state or stays hidden.

## What is in Phase 3

Privacy controls that work without contacting support:

- **Settings** (`/dashboard/settings`): account details, product email opt-in, guardian status, Download my data (JSON), Delete my account.
- **Account deletion**: confirmed with the password and a typed `DELETE`. A 7-day window follows, during which the account can be canceled; the profile is private, marketing is off and renewal is switched off. Then the worker deletes the Stripe customer, stored videos, the login and all rows, recording each step so failures resume. Staff can enter emailed requests in `/admin`.
- **Guardian management link**: emailed after consent. Without signing in, a guardian can withdraw consent (immediate), stop renewal, consent again, or request or cancel deletion. A new link can be requested from `/legal/your-data`.
- **Email**: one-click unsubscribe (RFC 8058) at `/api/email/unsubscribe` and a preference centre at `/email/preferences`, both authenticated by a signed token. `sendMarketingEmail` is the only way to send marketing.
- **Profile editing** (`/dashboard/profile`), a **terms re-acceptance** gate when `CURRENT_TERMS_VERSION` changes, and a public **Your data** page.

## What is in Phase 4

- **Public profile and PDF**: a private share link (`/p/<name>-<random>`), share image and one-page PDF that always show current numbers, with view and download counts. Athletes choose whether GPA and high school appear.
- **Verified badges**: send a clip of a measurement; automatic checks run first, then a staff reviewer confirms the value in `/admin`.
- **Insights**: percentiles against athletes of a similar age, height and weight, plus cross-sport equivalents. A public calculator lives at `/tools/percentile-calculator`.
- **Recruiting assistant (Agent 3, Pro)**: watches pipeline programs for coaching changes and roster needs (staff entry in `/admin` or a licensed feed via `PROGRAM_DATA_FEED_URL`), alerts the athlete and drafts an introduction from verified facts.
- **Side-by-side comparison (Pro)**: two clips synced at foot strike with skeleton overlays and a kinematic sequence timeline, against the athlete's own clips or licensed reference footage uploaded in `/admin`.

## What is in Phase 5

- **Hockey and football analysis**: hockey shots and football throws join baseball swings and pitches, with sport-specific filming guidance and findings. Comparisons sync at foot strike, or at peak hand speed when a clip has no clear plant.
- **Puck and ball tracking (beta)**: opt-in per upload. Video Intelligence object tracking finds the puck or ball after release; the athlete's height scales it to a launch angle and a speed shown as a lower bound, drawn as a trail on the video.
- **Coach tools**: coach accounts confirm a school email address and are checked against their program's staff directory. Verified coaches search public profiles by sport, class, position and measurements, save athletes with private notes, and send contact requests. Athletes accept, decline, block or report; for athletes under 18 a parent or guardian approves before any email address is shared.
- **Launch readiness**: Playwright and axe tests of every page (WCAG 2.2 AA plus AAA contrast, light and dark) with a local sign-in stub, run in CI; a load simulation by route group with recorded results; `/api/internal/metrics` with Prometheus alert rules (unit tested) and a Grafana dashboard; a production deploy checklist.

## What is in Phase 6

- **National norms**: staff import licensed percentile tables (CSV, validated, drafted, previewed, then activated). Insights, the public calculator and cross-sport equivalents show the national standing for the athlete's age and build, naming the table and publisher, beside the KineticScout comparison.
- **Team accounts**: high school and travel coaches register a team, which staff check against the school or club staff page. Players join with a code (coach approval, and a parent's for minors). Coaches record testing days on a phone; each athlete accepts results, which then show as coach-recorded.
- **Messages**: after an athlete accepts a college coach's request, they can talk inside KineticScout. Parents of athletes under 18 get a copy of every message and can end the conversation or report it. Staff review reports.
- **Installable app**: add to home screen, an offline page, measurements logged offline and sent on reconnect (never twice), camera capture for uploads, and opt-in notifications per device that never show names or message text. Web Push is implemented with `node:crypto`, no extra dependency.

## What is in Phase 7 (part 1)

- **Parent and guardian accounts**: a parent signs up with the email address their athlete gave us and gets a Family page for every athlete under 18 who named it: give or withdraw consent, approve team joins and coach contact requests, read copies of conversations with college coaches, see events and training plans, download the athlete's data, or delete the account. The emailed links keep working and share the same code.
- **Events and camps**: coaches and parents submit showcases, camps, combines and tournaments; staff check each against the organizer's page before it is listed (public pages with schema.org event data). Athletes mark events they are going to and choose whether verified college coaches may see it (only with a public profile, so guardian consent for minors). A recruiting calendar shows contact, evaluation, quiet and dead periods that staff copy from the published calendars, each with its source.
- **Training plans (Pro)**: four-week plans built from the focus areas of a video analysis, using drills written or licensed by staff coaches and published only after a second staff member reviews them. Athletes mark practice days; the plan shows measurements logged afterwards next to the starting value, without claiming cause.

## Local development

Requirements: Node 22.12+, PostgreSQL 15+, Redis 7+.

```bash
cd kineticscout
cp .env.example .env              # fill in at least the Core, Database, Supabase and Secrets sections
npm install
npx prisma migrate deploy         # or: npm run db:migrate:dev
npm run db:seed                   # fictional college programs for trying the matchmaker (local only)
npm run dev                       # http://localhost:3000
npm run worker                    # in a second terminal: schedules and queue consumers
```

Generate the secrets with `openssl rand -base64 48`. Without Stripe, OpenAI, GCS or Resend keys the matching features answer "temporarily unavailable", and outgoing emails are suppressed (only the subject is logged). Deployed environments refuse to start without them.

### Supabase setup

1. Create a project. Copy the URL, publishable key and secret key into `.env`. Use the pooled connection string for `DATABASE_URL` and the direct one for `DIRECT_DATABASE_URL`.
2. Authentication → Providers → Email: confirm email **on**, minimum password length **12**, leaked password protection **on**.
3. Authentication → URL configuration: Site URL = `APP_URL`; add `APP_URL/auth/confirm` to the redirect allow list.
4. Authentication → Email templates: point the links at the POST-confirmed page:
   - Confirm signup: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding`
   - Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`
5. Run `npx prisma migrate deploy` against the direct URL. The migration enables RLS and revokes Data API grants.

### Stripe setup

Create one product with two recurring prices ($14.99 monthly, $129 yearly) and set their ids. Checkout refuses to start if a price ever differs from the amount on the pricing page. Add a webhook endpoint at `APP_URL/api/webhooks/stripe` for: `checkout.session.completed`, `checkout.session.expired`, `customer.subscription.created/updated/deleted/paused/resumed`, `invoice.paid`, `invoice.payment_failed`. Enable cancellation and plan switching in the Billing Portal settings.

### Google Cloud setup

Create a private bucket with uniform access, apply `infra/gcs-cors.json` (`gcloud storage buckets update gs://BUCKET --cors-file=infra/gcs-cors.json`, with your domain), enable the Video Intelligence API, and give a service account `roles/storage.objectAdmin` on the bucket and Video Intelligence access.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js app |
| `npm run worker` | Background worker (`-- --run growth` or `-- --run seo` for a one-off run) |
| `npm run typecheck` / `lint` | Type and lint checks |
| `npm test` | Unit tests |
| `npm run test:integration` | Integration tests against Postgres (`TEST_DATABASE_URL`, defaults to `kineticscout_test` on localhost) |
| `npm run admin:grant -- email@example.com` | Grant ADMIN (`--revoke` to remove); audit-logged |
| `npm run backup:verify` | Dump, restore into a scratch DB and verify (uses `DIRECT_DATABASE_URL`) |
| `npm run test:e2e` | Playwright + axe against a production build (run `npm run build` first; starts the server with the local sign-in stub) |
| `npm run load:simulate` | Load simulation by route group (`BASE_URL`, `USERS`, `DURATION_S`, optional `PROFILE_SLUG`, `SESSION_COOKIE`); see docs/LOAD-TESTING.md |

## Deploying

Follow [docs/DEPLOY.md](docs/DEPLOY.md) for every release. In short:

- **Web:** any Node host (Vercel works as-is). Set `DEPLOY_ENV=production`, `NODE_ENV=production`, `SERVICE_ROLE=web`. If you self-host on several instances, set `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`.
- **Worker:** a long-running process (Railway, Fly.io, ECS, Cloud Run with min instances). Command: `npm run worker`, with `SERVICE_ROLE=worker`. Replicas are safe; each scheduled run executes once.
- **Monitoring:** point an uptime monitor at `GET /api/health`, set `WORKER_HEARTBEAT_URL` for a worker dead man's switch, and scrape `GET /api/internal/metrics` with the rules and dashboard in `infra/monitoring/`.
- **Migrations:** `npm run db:migrate` (uses `DIRECT_DATABASE_URL`) before releasing a new version.

## Testing

323 Vitest tests (195 unit, 128 integration), 74 Playwright end-to-end tests and 9 `promtool` alert-rule test groups. The Vitest suites cover the kinematic analysis (synthetic pose tracks with known peak timing), matchmaker scoring, percentile ranks, CSP/CSRF/redirect/cookie rules, env validation, COPPA age bands, permissions, marketing compliance and article fact checking, and WCAG AAA contrast computed from the CSS tokens. Against Postgres they test the free-tier quota under 12 concurrent submissions, Stripe webhook idempotency, out-of-order and concurrent delivery, duplicate-subscription refunds, k-anonymous percentile SQL, AI budget caps under a race, exactly-once agent runs, RLS on every table and tRPC authorization. Phase 5 adds hockey and football kinematics, the projectile estimate and the tracking job's cost, coach verification, prospect search visibility, contact requests with guardian approval, blocking and consent withdrawal, the operational metrics, and the e2e sign-in stub's refusal outside local. Phase 6 adds the norm table parser and band selection, national figures with edition precedence and licence expiry, team joining with guardian approval, testing-day validation and coach-recorded acceptance, messaging access, guardian copies, closure and staff review, Web Push encryption checked by an independent decryption, the push endpoint allowlist, and idempotent offline logging under concurrent resends. Phase 7 adds guardian account scope (address matching, cross-athlete ids, consent first), event listing validation and review, attendee visibility rules, the recruiting calendar overlap rule, event retention, drill selection, the two-person drill rule, plan baselines and practice logging.

The end-to-end suite (`npm run test:e2e`, also in CI) signs in as an athlete, college coaches, a team coach and an admin through the local stub, exercises logging a measurement, sharing, saving a prospect, the contact dialog, accepting a request, a team coach recording a testing day and the athlete accepting a result, both sides of a conversation, guardian links, and the installable app's manifest and service worker, and runs axe (WCAG 2.2 A and AA plus AAA contrast) on every public, athlete, coach and admin page in light and dark mode.
