# Security controls

Each item from the brief, mapped to where it is enforced and how it is verified.

## Authentication and access

| Control | Implementation | Verified by |
|---|---|---|
| Strict auth | Supabase Auth, server-side only. Sessions live in **HttpOnly, Secure, SameSite=Lax** cookies (`src/lib/auth/cookies.ts`); no browser client exists, so page scripts cannot read tokens. | `tests/unit/security.test.ts` (cookie hardening) |
| Session validation | `getClaims()` verifies the JWT signature and expiry on every request (`src/lib/auth/session.ts`). The proxy refreshes tokens; pages, actions and procedures re-check them. | Manual + build |
| Permission checks | Pure policy functions (`src/lib/auth/permissions.ts`) used by pages (`requireUser/requirePro/requireAdmin`), tRPC middleware (`protected/athlete/pro/admin` procedures) and Server Actions. Ownership is enforced in the SQL `WHERE` clause (`updateMany({ where: { id, athleteId } })`). | `tests/unit/auth-policy.test.ts`, `tests/integration/trpc-permissions.test.ts` |
| Admin routes | `/admin` layout and every admin procedure require `role = ADMIN` and return **404** to everyone else. Admin can only be granted by CLI (`npm run admin:grant`), which is audit-logged. Sign-up cannot select ADMIN. | `trpc-permissions.test.ts`, `auth-policy.test.ts` |
| Brute force / credential stuffing | Sign-in limited per IP and per account; sign-up, reset and guardian email are limited too (`src/lib/security/rate-limit.ts`). Generic error messages; sign-up and reset never reveal whether an email exists. | `security.test.ts` (limiter) |
| Email links | Confirmation and recovery links are verified by **POST** from a button, so email scanners that prefetch links cannot use up the one-time token. | Manual |
| Password policy | 12 to 128 characters; Supabase leaked-password protection surfaces as a field error. A password change signs out other sessions. | `auth-policy.test.ts` |

## Data protection

| Control | Implementation |
|---|---|
| Input sanitization | Every input passes a zod schema (types, ranges, formats), then `sanitizeText` (NFKC; strips control, bidi and zero-width characters). Metric values are checked against plausibility bounds. DB `CHECK` constraints repeat the critical ranges. |
| XSS | React escapes all output. Markdown renders through `react-markdown` with `skipHtml` (no `rehype-raw`), external links dropped and images removed. `react/no-danger` is an ESLint **error**; the one exception (JSON-LD) escapes `<` and carries the CSP nonce. A strict CSP (nonce + `strict-dynamic`, no `unsafe-inline` scripts) is the backstop. |
| SQL injection | Prisma parameterises all queries. Raw SQL uses tagged templates (`$queryRaw\`…${value}\``), which bind parameters; there is no string concatenation of user input into SQL. |
| DB rules | **RLS enabled with no policies** on every table, and grants revoked from Supabase `anon`/`authenticated`, so a leaked publishable key cannot read anything through the Data API. Cascading deletes. Partial unique index: one live subscription per user. k-anonymity floor `sample_size >= 10` in the schema. Verified in `tests/integration/agents-and-privacy.test.ts` and `scripts/backup-restore-check.sh`. |
| Secrets at rest | Guardian consent tokens are stored as SHA-256 hashes. IPs and emails used as rate-limit keys are HMAC-SHA256 with a server pepper. Logs redact passwords, tokens, cookies, emails and dates of birth (`src/lib/logger.ts`). |

## Network security

| Control | Implementation |
|---|---|
| HTTPS / HSTS | `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` when served over https. `APP_URL` must be https outside local development (boot fails otherwise). |
| CSRF | `src/proxy.ts` rejects unsafe-method requests whose `Origin` is not `APP_URL`, and rejects requests with no Origin unless `Sec-Fetch-Site: same-origin`. This is stricter than the built-in Server Action check, which lets requests without an Origin through. Route Handlers repeat the check. Webhooks and internal routes are exempt and authenticated by signature or shared secret. |
| CORS | No CORS headers are sent: the API is same-origin only. The GCS bucket allows PUT/GET only from `APP_URL` (`infra/gcs-cors.json`). |
| Security headers | CSP (per-request nonce), `X-Content-Type-Options`, `X-Frame-Options: DENY` + `frame-ancestors 'none'`, `Referrer-Policy`, `Permissions-Policy`, COOP, CORP; API responses get `default-src 'none'` and `no-store`. `poweredByHeader` is off. Smoke-tested in Chromium with zero CSP violations. |
| Cookies | HttpOnly, Secure (https), SameSite=Lax, Path=/ forced on every auth cookie. Auth responses carry `Cache-Control: private, no-store`. |

## Infrastructure

| Control | Implementation |
|---|---|
| API keys hidden | No `NEXT_PUBLIC_` secrets. Secret-bearing modules import `server-only`, so importing them into client code fails the build. |
| `.env` checks | `src/lib/env.ts` validates every variable with zod. Staging and production fail to boot if any required key is missing, keys are test keys, URLs are not https/TLS, or debug logging is on. Error messages name variables, never values. Checked at startup by `src/instrumentation.ts`. Tested in `tests/unit/env.test.ts`. |
| Exposed keys in Git | `.gitignore` excludes `.env*`, keys and service-account files. CI runs **gitleaks over the full history**. Current scan: clean, apart from two reviewed public Vapi assistant ids in the Autonoma landing page (`.gitleaksignore`). |
| Secure file uploads | Type allowlist (MP4/MOV), a 150 MB cap enforced by GCS through the signed `x-goog-content-length-range`, 20 s duration cap, server-generated object keys, magic-byte verification (twice), private bucket, 15-minute signed playback URLs, per-user upload rate and monthly caps, retention purge. |
| Debug off in production | `LOG_LEVEL=debug/trace` is rejected in production. Error boundaries show only a digest. tRPC replaces internal error messages. Source maps are not shipped to browsers. |
| Dependency hygiene | `npm audit --omit=dev --audit-level=high` gates CI: **0 production vulnerabilities**. Overrides pin patched `uuid`, `mysql2` and `deepmerge-ts`. The 5 remaining high findings are in dev-only lint tooling (`braces` via `eslint-config-next`, no upstream fix); they never ship. |

## Resilience

| Control | Implementation |
|---|---|
| Rate limiting / API limits | Upstash sliding windows (fail-open with an error log after 1 s, so a Redis outage cannot take down sign-in; Supabase applies its own auth limits). tRPC body cap 64 KB, Server Action cap 64 KB, webhook cap 512 KB. |
| Caching repeat requests | Program catalogue (10 min) and matchmaker results keyed by metrics and filters (5 min) through `src/lib/cache.ts`. |
| Failed requests and timeouts | Client: 20 s fetch timeout, no retries on 4xx, plain-language errors. Server: Stripe (10 s, 2 retries with idempotency keys), OpenAI (60 s, 2 retries, one schema-repair attempt), Resend (8 s, 1 retry), Meta (15 s, retries on transient errors), X API (8 s per call), Postgres `statement_timeout` 10 s and pool timeouts. |
| Spending caps | AI reservations under an advisory lock enforce the global and per-user monthly budgets, tested with 10 concurrent callers. Video analyses are capped per user per month. Meta ads require an account spending limit with headroom and an adults-only ad set, and are created **PAUSED** by default. Checkout refuses to run if the Stripe price differs from the displayed price. |
| Duplicate payments | See the checkout layers in ARCHITECTURE.md. Duplicates that slip through are cancelled and refunded automatically. Tested in `stripe-webhook.test.ts`. |
| Monitoring | `GET /api/health` (database and Redis checks, 503 when degraded) for uptime monitors. The worker pings `WORKER_HEARTBEAT_URL` every 5 minutes as a dead man's switch. Structured JSON logs. |
| Concurrency simulation | Integration tests fire simultaneous metric submissions, webhooks, AI reservations and agent triggers. `npm run load:simulate` drives N virtual users against a deployment with latency and error budgets. |
| Backups | `npm run backup:verify` dumps, restores into a scratch database, and compares row counts, migrations and RLS. Run it weekly in CI against a staging replica. |

## Known residual risks and follow-ups

- Rate limits fail open during an Upstash outage (a deliberate availability trade-off).
- Video analysis relies on a third-party pose model. The report states its 2D limits and confidence.
- Phase 3 must add in-app data export and deletion and a one-click unsubscribe endpoint before marketing email is sent.
- Configure in Supabase: email confirmation on, leaked-password protection on, minimum password length 12, email templates pointing to `/auth/confirm?token_hash={{ .TokenHash }}&type=…&next=…`, and the site URL set to `APP_URL`.
