# Launch readiness (v1.0.0 release candidate)

This is the one page to work from on the way to go-live. It says what has been verified, what only
the business can do, and the order to do it in. The detailed steps live in
[DEPLOY.md](DEPLOY.md) (accounts, environment, release, monitoring, rollback) and
[COMPLIANCE.md](COMPLIANCE.md) ("Decisions needed from the business").

## 1. What is verified (2026-10-13)

| Area | Status | Evidence |
|---|---|---|
| Type checks, lint | Clean | `npm run typecheck`, `npm run lint` |
| Unit and integration tests | All pass, including the authorization matrix over every API procedure | `npm run test:all` |
| End-to-end and accessibility | Every page in English and Spanish, light and dark, WCAG 2.2 AA plus AAA contrast, no console or CSP errors; every page for every role fits a 360px phone screen in both languages | `npm run build && npm run test:e2e` |
| Security audit | No known vulnerabilities in production dependencies; headers, CSRF, webhooks, internal routes, RLS and the bundle checked; two issues found and fixed | [SECURITY.md](SECURITY.md), "Phase 8 launch audit" |
| Database | 19 migrations apply cleanly with no drift; RLS on every table; a dump restores with matching row counts | `npm run backup:verify` |
| Links and SEO | No broken internal links across the 29 public pages in either language; robots blocks indexing everywhere except production; sitemap, canonical, Open Graph and the 404 page checked | link crawl during the Phase 8 audit |
| Performance | Layout shift 0 and first large paint under 0.3 s on every public page; all route groups within budget at 100 concurrent users on one instance | [LOAD-TESTING.md](LOAD-TESTING.md), run of 2026-10-13 |
| CI | `secrets-scan`, `verify`, `monitoring-rules` and `e2e` green on the release commit | GitHub Actions |

What has **not** been verified, because it needs the real accounts: live Stripe payments and the
billing portal, real email delivery through Resend, Supabase Auth emails, Google Cloud video
analysis, OpenAI drafting, Web Push delivery, and the monitoring stack. The staging pass in section 3
covers them.

## 2. Before launch: only the business can do these

**Blocking.** The site must not go live without them.

1. **Legal entity.** Real `BUSINESS_*` values (legal name, postal address, support email, phone,
   governing law). Production refuses to boot without them.
2. **Counsel review** of the Privacy Policy, Terms, Refund and Cookie policies, the coach terms
   against the recruiting rules of the associations you serve, and the parental consent flow and
   email (COPPA). Set `LEGAL_LAST_UPDATED` and `LEGAL_UPDATED_ON` in `src/lib/legal.ts` to the
   publication date.
3. **Spanish review.** A translator and counsel check the Spanish legal pages and the Spanish
   parental consent email. If that cannot happen before launch, set `SPANISH_ENABLED = false` in
   `src/i18n/config.ts` and launch in English; nothing else changes.
4. **Accounts and keys** (DEPLOY.md section 1): Supabase project with the settings and bilingual
   email templates, Postgres with point-in-time recovery, Stripe live mode with the two prices,
   Google Cloud bucket and Video Intelligence, Upstash, a TLS Redis for the worker, Resend with SPF,
   DKIM and DMARC, OpenAI with a hard usage limit, and fresh production secrets.
5. **College program data** from a licensed or public source (the fixtures are fictional and are
   blocked outside local). Without it the matchmaker has nothing to match.
6. **People on the review queues** the product promises "usually within 2 business days": metric
   verification clips, coach accounts, team accounts and event listings, plus reports about coaches
   and messages, which can involve minors. Decide who may suspend an account out of hours.
7. **Monitoring** wired up (DEPLOY.md section 3): uptime, alert routing to a phone, worker heartbeat,
   log retention.

**Not blocking.** The product says plainly when these are missing, so launch can go ahead without them.

- Licensed national norms tables (athletes see KineticScout comparisons only).
- Licensed reference footage for side-by-side comparisons (athletes compare their own clips).
- Training drills from qualified coaches, and their Spanish versions (the plans page says the
  library does not cover a focus area yet).
- VAPID keys for push notifications (the setting is hidden without them).
- Real reviews and case studies (those pages stay empty until consented entries exist).
- Spanish product-news emails (product email is off unless a user opts in).

**Not needed for a first launch.** COMPLIANCE.md items 8, 10, 14 and 18 ask for an email to existing
account holders when the policies change. At first launch there are no account holders, so the
current terms version (`2026-10-05.3`) is simply the starting version. Those steps apply to every
later policy change.

## 3. Staging pass (one day)

Deploy the release commit to a staging environment with the real providers in test mode, then:

1. Run every item of the DEPLOY.md smoke test.
2. Sign up as an adult athlete, a 15-year-old athlete (parent email to an inbox you control, once in
   English and once in Spanish), a college coach, a team coach and a parent. Confirm each email
   arrives, in the right language, with working links.
3. Buy Pro with a Stripe test card, open the billing portal, cancel, and check the webhook updates the
   plan. Then the same purchase as the minor: it must be blocked until the parent consents.
4. Upload a short swing video and confirm the analysis completes and the report shows.
5. Request account deletion, cancel it, request it again and let the worker complete it after the
   window (or shorten `DELETION_GRACE_DAYS` on staging only).
6. Run `npm run backup:verify` against the staging database and the load simulation against staging
   (LOAD-TESTING.md).
7. Run the live probes below against staging.

## 4. Live probes

Replace `B` with the environment's URL. Each line prints the expected status.

```bash
B=https://staging.example.com
curl -s -o /dev/null -w '%{http_code} cross-origin POST (403)\n' -X POST $B/api/billing/checkout -H 'Origin: https://evil.example' -d x
curl -s -o /dev/null -w '%{http_code} server action from another origin (403)\n' -X POST $B/sign-in -H 'Origin: https://evil.example' -H 'Next-Action: x' -d x
curl -s -o /dev/null -w '%{http_code} unsigned Stripe webhook (400)\n' -X POST $B/api/webhooks/stripe -H 'Content-Type: application/json' -d '{}'
curl -s -o /dev/null -w '%{http_code} metrics without token (401)\n' $B/api/internal/metrics
curl -s -o /dev/null -w '%{http_code} API signed out (401)\n' $B/api/trpc/metrics.summary
curl -s -o /dev/null -w '%{http_code} PUT to a page (405)\n' -X PUT $B/ -H "Origin: $B"
curl -s -o /dev/null -w '%{http_code} TRACE blocked at the edge (405 or 403)\n' -X TRACE $B/
curl -sI $B/ | grep -iE 'strict-transport-security|content-security-policy|x-frame-options|cache-control'
```

## 5. Go or no-go

Go when every blocking item in section 2 is done, the staging pass found nothing new, CI is green on
the commit being released, and someone is on call for the first week. Then follow DEPLOY.md
section 2 (migrate, worker, web, smoke test).

## 6. First week after launch

- Work the review queues daily. The verification alerts warn at 36 hours and page at 4 days, and
  report alerts page at 3 days; the product promises 2 business days, so aim to clear each queue
  before the first warning.
- Check the AI spend and video analysis budget panels daily until the pattern is clear.
- Read every report about coaches or messages the same day.
- Re-run `npm audit --omit=dev` weekly; the dev-only `braces` advisory has no fix yet.
- Keep the restore drill on its 7-day cadence.
