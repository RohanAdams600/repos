# Load testing

`npm run load:simulate` (`scripts/simulate-concurrent-users.ts`) runs concurrent virtual users.
Each one picks a route group by weight, requests it, then waits 200 to 1000 ms like someone reading
the page. The run fails if any group goes over 1% errors (network failures and 5xx) or over its p95
budget. Responses with 429 are counted separately and left out of the latency figures: from one
machine they show a per-IP limit working, not a failure.

| Group | Weight | p95 budget | Routes |
|---|---|---|---|
| Marketing pages | 30 | 1500 ms | `/`, `/pricing`, `/faq`, `/about`, `/blog`, `/reviews` |
| Legal pages | 8 | 1500 ms | privacy, terms, cookies, your data |
| Auth pages | 8 | 1500 ms | `/sign-in`, `/sign-up` |
| Percentile calculator | 10 | 1500 ms | `/tools/percentile-calculator` |
| Sitemap and robots | 4 | 2000 ms | `/sitemap.xml`, `/robots.txt` |
| Health | 5 | 500 ms | `/api/health` (database round trip) |
| Public profile | 20 | 1500 ms | `/p/[slug]` (needs `PROFILE_SLUG`) |
| Profile PDF | 3 | 4000 ms | `/p/[slug]/pdf` |
| Profile share image | 3 | 4000 ms | `/p/[slug]/opengraph-image` |
| Signed-in dashboard | 15 | 2000 ms | overview, measurements, insights, profile (needs `SESSION_COOKIE`) |

## Run of 2026-10-04 (local, Phase 5)

**Setup.** One `next start` production build on a 4 vCPU Intel Xeon (2.1 GHz) container with 15 GiB
of memory. Postgres 16 and the load generator ran on the same machine, so they competed with the app
for CPU. The rate limiter was the in-memory one (production uses Upstash, which adds one network
round trip per limited request). The dashboard group signed in through the local e2e stub.

**Fix made during this run.** At 200 users the public profile was the slowest group. Its
`generateMetadata` and page body each loaded the profile, so every view ran the profile and
measurement queries twice. A request-scoped `cache()` in `src/app/p/[slug]/page.tsx` now shares one
load. At 200 users that cut public profile p50 from 2346 ms to 1953 ms and raised total throughput
from 117 to 127 requests per second. All figures below are after the fix.

| Virtual users | Requests per second | Errors | p50 (all) | p95 (all) | Within budget |
|---|---|---|---|---|---|
| 50 | 75 | 0 | 38 ms | 207 ms | all groups |
| 100 | 122 | 0 | 195 ms | 518 ms | all groups |
| 200 | 127 | 0 | 598 ms | 2368 ms | 7 of 10 groups |

At 200 users, by group:

| Group | p50 | p95 | Budget |
|---|---|---|---|
| Marketing pages | 502 ms | 929 ms | 1500 ms, met |
| Health | 354 ms | 755 ms | 500 ms, missed |
| Public profile | 1953 ms | 2432 ms | 1500 ms, missed |
| Signed-in dashboard | 2032 ms | 2711 ms | 2000 ms, missed |
| Profile PDF | 79 ms (50 users) | 902 ms (50 users) | 4000 ms, met. At 100 and 200 users every PDF request was rate limited: earlier runs in the same hour had used the 30 per hour allowance for this IP |

**Reading it.** Throughput levels off at about 125 requests per second between 100 and 200 users,
and nothing errors. Latency rises across every group at once, including the health check, which
does almost no work. That pattern means a CPU-bound Node process is queueing requests, not a slow
query or lock. One instance of this size serves about 100 concurrent active users within every
budget. Beyond that, add instances: serverless hosting does this automatically, and self-hosted
deployments should scale on CPU above 70%.

**Limits of this run.** Generator, database and app shared 4 vCPUs, so absolute numbers are
pessimistic for the app and optimistic for the database (no network between them). Signed-in write
paths (logging metrics, uploads, coach search) were not included; their per-user rate limits cap
them well below these read rates. Repeat the run on staging before launch (see `docs/DEPLOY.md`,
Capacity).

## Reproduce

```bash
npm run build
E2E_AUTH_STUB=true DEPLOY_ENV=local APP_URL=http://localhost:3100 npx next start -p 3100 &
npm run test:e2e          # seeds e2e/.state.json with a public profile and stub sessions
SLUG=$(node -p "require('./e2e/.state.json').athlete.slug")
COOKIE=$(node -p "require('./e2e/.state.json').athlete.cookie")
BASE_URL=http://localhost:3100 USERS=100 DURATION_S=60 PROFILE_SLUG=$SLUG \
  SESSION_COOKIE="ks_e2e_session=$COOKIE" npm run load:simulate
```
