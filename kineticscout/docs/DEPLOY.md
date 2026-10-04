# Production deploy checklist

Use this for the first production launch and keep it open for every release. Each line is a check
someone ticks, not background reading. Commands run from `kineticscout/`.

## 1. One-time setup (first launch)

### Business and legal

- [ ] The decisions in `docs/COMPLIANCE.md` ("Decisions needed from the business") are made. In particular the `BUSINESS_*` values are the real legal entity; production refuses to boot without them.
- [ ] Counsel has reviewed `/legal/privacy`, `/legal/terms`, `/legal/refunds` and `/legal/cookies` as rendered on staging.
- [ ] Staff are assigned to the review queues the product promises "usually within 2 business days": metric verification clips, coach accounts, and reports about coaches (admin console).
- [ ] Every testimonial, case study and review on the site is real, with written consent on file. The admin console only publishes entries marked as consented.

### Accounts and services

- [ ] **Supabase:** project created; email confirmation on; minimum password length 12; leaked-password protection on; Site URL = `APP_URL`; `APP_URL/auth/confirm` on the redirect allow list; email templates point at `/auth/confirm` (exact templates in README, "Supabase setup").
- [ ] **Postgres:** pooled (transaction mode) URL in `DATABASE_URL`, direct URL in `DIRECT_DATABASE_URL`. Point-in-time recovery enabled on the plan.
- [ ] **Stripe (live mode):** one product, two prices matching `/pricing` exactly ($14.99 monthly, $129 yearly); webhook at `APP_URL/api/webhooks/stripe` for `checkout.session.completed`, `checkout.session.expired`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.paid`, `invoice.payment_failed`; Billing Portal allows cancellation and plan switching; Stripe Tax configured if `STRIPE_AUTOMATIC_TAX=true`.
- [ ] **Google Cloud:** private bucket with uniform access; `infra/gcs-cors.json` applied with the production origin; Video Intelligence API enabled; a service account with `roles/storage.objectAdmin` on the bucket and Video Intelligence access, attached to the worker (no key files in the repo).
- [ ] **Upstash Redis** (rate limits) and a **TLS Redis** for BullMQ (`rediss://`).
- [ ] **Resend:** sending domain verified with SPF and DKIM, a DMARC record published, `EMAIL_FROM` on that domain.
- [ ] **OpenAI:** project key with a hard usage limit at or above `AI_GLOBAL_MONTHLY_BUDGET_USD` (the app enforces its own cap first).
- [ ] **Optional integrations** (Meta, X, program data feed): leave unset unless the business decided to use them. All publishing switches default to off.

### Environment variables

`src/lib/env.ts` refuses to boot a staging or production process with a missing or unsafe value,
and names the variable in the error. `.env.example` lists every variable with a comment.

- [ ] Web: `NODE_ENV=production`, `DEPLOY_ENV=production`, `SERVICE_ROLE=web`, `APP_URL` (https).
- [ ] Worker: same values with `SERVICE_ROLE=worker`.
- [ ] Secrets generated fresh for production (never copied from staging): `HASH_PEPPER` (`openssl rand -base64 48`), `INTERNAL_API_SECRET` (`openssl rand -base64 48`), and `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` if the web app runs on more than one self-hosted instance.
- [ ] `E2E_AUTH_STUB` is **not set**. It is a test-only sign-in; the app refuses to boot with it outside `DEPLOY_ENV=local`, but it should never appear in a deployed environment's settings at all.
- [ ] `LOG_LEVEL` is `info` or quieter. `ALLOW_TEST_PAYMENTS` is unset.
- [ ] `WORKER_HEARTBEAT_URL` points at a dead man's switch (see Monitoring).

## 2. Every release

### Before

- [ ] CI is green on the commit being released: `secrets-scan`, `verify` (typecheck, lint, unit and integration tests, production build, `npm audit --omit=dev`), `monitoring-rules` and `e2e` (WCAG 2.2 AA plus AAA contrast on every page, light and dark).
- [ ] Read every new file under `prisma/migrations/`. Additive changes (new tables, nullable columns, new enum values, new indexes) are safe to apply before the code. Anything that drops, renames or rewrites data needs the expand and contract pattern: ship the code that tolerates both shapes first, migrate, then remove the old shape in a later release.
- [ ] Large tables: an index on a table with more than about a million rows should be created `CONCURRENTLY` in its own migration.
- [ ] `npm run backup:verify` has passed against a staging replica within the last 7 days.
- [ ] If `CURRENT_TERMS_VERSION` changed, the email to account holders about the policy changes is written and scheduled for release day. Signed-in users are asked to accept the new version on their next visit.
- [ ] Run the load simulation against staging when the release touches a public or dashboard route (section 5).

### Release

1. [ ] `npm run db:migrate` against production (uses `DIRECT_DATABASE_URL`). Continue only on "All migrations have been successfully applied" or "No pending migrations to apply".
2. [ ] Deploy the **worker** first, so new job types have a consumer before the web app enqueues them.
3. [ ] Deploy the **web** app.

### Smoke test (within 15 minutes of release)

- [ ] `curl -s https://kineticscout.com/api/health` returns `{"status":"ok", ...}` with HTTP 200.
- [ ] The metrics scrape succeeds: `up{job="kineticscout"} == 1` and `kineticscout_queue_reachable == 1` in Prometheus.
- [ ] Home, pricing and a legal page load signed out; the cookie banner offers Accept and Reject with equal weight.
- [ ] Sign in with the staff test account; the dashboard loads; sign out works.
- [ ] Open a known public test profile at `/p/<slug>` and download its PDF.
- [ ] The worker logged its startup line and the heartbeat monitor is green.
- [ ] No new alerts fired in the 15 minutes after release.

## 3. Monitoring

Files are in `infra/monitoring/`. CI validates and unit tests the alert rules with `promtool`.

- [ ] **Scrape:** add the jobs in `infra/monitoring/prometheus.yml` (or the equivalent in Grafana Agent or Alloy). The bearer token is `INTERNAL_API_SECRET`, read from a file. The endpoint is `GET /api/internal/metrics`; it returns counts only, never identifiers.
- [ ] **Uptime:** the `kineticscout-health` job probes `/api/health` through a blackbox exporter. Any external uptime monitor pointed at the same URL works too.
- [ ] **Alerts:** load `infra/monitoring/alerts.yml`. Route `severity: page` to the on-call phone and `severity: warning` to the team channel.
- [ ] **Dashboard:** import `infra/monitoring/grafana-dashboard.json` and pick the Prometheus data source.
- [ ] **Worker heartbeat:** set `WORKER_HEARTBEAT_URL` to a dead man's switch (Healthchecks.io, Better Stack or similar) expecting a ping every 5 minutes, alerting after 15.
- [ ] **Logs:** ship the JSON logs from both services to a log store with at least 30 days' retention. The logger redacts emails, passwords, tokens, cookies and dates of birth by field name; check any new log call that passes free text.

### What each paging alert means

| Alert | First steps |
|---|---|
| `KineticScoutDown` | `/api/health` reports which dependency failed (`database` or `cache`). Check the Postgres and Upstash status pages, then recent deploys. Roll back if it started with a release. |
| `KineticScoutMetricsScrapeFailing` | 401: the scrape token does not match `INTERNAL_API_SECRET`. 503: the metrics query failed; the web logs have `metrics collection failed` with the error. |
| `KineticScoutQueueUnreachable` | The web app cannot reach `REDIS_URL`. Uploads and verification checks queue up but nothing processes. Check the Redis provider and its connection limit. |
| `AccountDeletionOverdue` | A privacy commitment is being missed. Search worker logs for `account deletion step failed; will retry`, fix the cause, and confirm the next sweep (every 10 minutes) clears it. |
| `CoachReportUnresolvedLong` | A report about a coach has waited 3 days. Review it in the admin console (Coaches). Suspend first if the report describes contact with a minor outside the platform rules. |
| `MetricVerificationBacklogBreached`, `CoachVerificationBacklogBreached` | Users have waited longer than we tell them. Add reviewer time; do not bulk-approve. |
| `VideoAnalysisQueueStalled` | No worker is consuming `video-analysis`. Check that the worker is running and its heartbeat; restart it. Queued analyses resume on their own. |
| `AiBudgetNearlyExhausted` | AI features stop at 100% until the 1st (UTC). Check `kineticscout_ai_spend_usd` by feature for a runaway before raising `AI_GLOBAL_MONTHLY_BUDGET_USD`. |

## 4. Rollback

- **Web or worker:** redeploy the previous build (on Vercel, Instant Rollback). Both services read the same schema, and releases keep migrations additive, so the previous build runs against the new schema.
- **Migrations are forward only.** Never run `prisma migrate reset` or edit an applied migration in production. To undo a schema change, write a new migration. If data was damaged, restore to a new database from point-in-time recovery, verify it with `scripts/backup-restore-check.sh`, then switch `DATABASE_URL`.
- **Secrets:** if a secret leaks, rotate it at the provider, update the environment and redeploy both services. Rotating `HASH_PEPPER` invalidates email preference links, guardian links and every other peppered hash, so treat it as a planned migration unless it actually leaked.
- **Stripe:** webhook processing is idempotent, so events Stripe retries during a rollback are applied once.

## 5. Capacity

`npm run load:simulate` drives virtual users through every public route group and, with
`SESSION_COOKIE`, the signed-in dashboard. It fails if any group exceeds 1% errors or its p95
budget. Results from the last run and how to read them are in `docs/LOAD-TESTING.md`.

- [ ] Before launch, run it against staging with production-sized instances: `BASE_URL=https://staging... USERS=100 DURATION_S=300 PROFILE_SLUG=<test profile> npm run load:simulate`.
- [ ] Tell the hosting provider before any test above a few hundred users, and never point it at production without notice.
- [ ] `DATABASE_POOL_MAX` times the number of web instances, plus the worker's pool, must stay below the pooler's connection limit.
