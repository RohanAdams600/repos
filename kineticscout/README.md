# KineticScout

Performance data and recruiting tools for high school athletes. Athletes log measurables (exit velocity, pitch velocity, 60-yard dash and more), see their percentile within their graduating class, analyze swing and pitch mechanics from video, and find college programs whose typical recruit matches their numbers.

- **Architecture, stack and directory map:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Security controls:** [docs/SECURITY.md](docs/SECURITY.md)
- **Compliance (COPPA, data inventory, SDK audit):** [docs/COMPLIANCE.md](docs/COMPLIANCE.md)

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
| `npm run load:simulate` | Concurrent-user load simulation (`BASE_URL`, `USERS`, `DURATION_S`) |

## Deploying

- **Web:** any Node host (Vercel works as-is). Set `DEPLOY_ENV=production`, `NODE_ENV=production`, `SERVICE_ROLE=web`. If you self-host on several instances, set `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`.
- **Worker:** a long-running process (Railway, Fly.io, ECS, Cloud Run with min instances). Command: `npm run worker`, with `SERVICE_ROLE=worker`. Replicas are safe; each scheduled run executes once.
- **Monitoring:** point an uptime monitor at `GET /api/health` and set `WORKER_HEARTBEAT_URL` for a worker dead man's switch.
- **Migrations:** `npm run db:migrate` (uses `DIRECT_DATABASE_URL`) before releasing a new version.

## Testing

146 tests: 117 unit and 29 integration. They cover the kinematic analysis (synthetic pose tracks with known peak timing), matchmaker scoring, percentile ranks, CSP/CSRF/redirect/cookie rules, env validation, COPPA age bands, permissions, marketing compliance and article fact checking, and WCAG AAA contrast computed from the CSS tokens. Against Postgres they test the free-tier quota under 12 concurrent submissions, Stripe webhook idempotency, out-of-order and concurrent delivery, duplicate-subscription refunds, k-anonymous percentile SQL, AI budget caps under a race, exactly-once agent runs, RLS on every table and tRPC authorization.
