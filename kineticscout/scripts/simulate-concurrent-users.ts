/**
 * Load simulation for a running deployment (staging, never production without notice).
 *
 *   BASE_URL=https://staging.kineticscout.com USERS=50 DURATION_S=60 PROFILE_SLUG=avery-k3m9x2pq npm run load:simulate
 *
 * Each virtual user picks a route group by weight, requests it, then waits 200 to 1000 ms like a
 * visitor reading. The report has one row per group with throughput, error rate and latency
 * percentiles, and the run exits non-zero if any group's error rate exceeds 1% or its p95 exceeds
 * its budget (P95_BUDGET_MS scales every budget, default 1).
 *
 * Rate limiting (429) is counted separately: it is the expected, healthy response once one machine
 * exceeds a per-IP limit (the profile PDF allows 30 per hour per IP, so a long run from one host
 * will see 429s there).
 *
 * Optional groups:
 *   PROFILE_SLUG     a public profile to load, with its PDF and share image
 *   SESSION_COOKIE   a signed-in dashboard session, as name=value. Against a local production build
 *                    with E2E_AUTH_STUB=true this can be the stub cookie from e2e/.state.json
 *                    (ks_e2e_session=...); against staging, copy a test account's session cookie.
 */
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const USERS = Number(process.env.USERS ?? 25)
const DURATION_S = Number(process.env.DURATION_S ?? 30)
const BUDGET_SCALE = Number(process.env.P95_BUDGET_SCALE ?? 1)
const PROFILE_SLUG = process.env.PROFILE_SLUG
const SESSION_COOKIE = process.env.SESSION_COOKIE

type Group = { name: string; weight: number; p95BudgetMs: number; paths: string[]; cookie?: string }

const GROUPS: Group[] = [
  { name: 'marketing pages', weight: 30, p95BudgetMs: 1500, paths: ['/', '/pricing', '/faq', '/about', '/blog', '/reviews'] },
  { name: 'legal pages', weight: 8, p95BudgetMs: 1500, paths: ['/legal/privacy', '/legal/terms', '/legal/cookies', '/legal/your-data'] },
  { name: 'auth pages', weight: 8, p95BudgetMs: 1500, paths: ['/sign-in', '/sign-up'] },
  { name: 'percentile calculator', weight: 10, p95BudgetMs: 1500, paths: ['/tools/percentile-calculator'] },
  { name: 'sitemap and robots', weight: 4, p95BudgetMs: 2000, paths: ['/sitemap.xml', '/robots.txt'] },
  { name: 'health', weight: 5, p95BudgetMs: 500, paths: ['/api/health'] },
  ...(PROFILE_SLUG
    ? [
        { name: 'public profile', weight: 20, p95BudgetMs: 1500, paths: [`/p/${PROFILE_SLUG}`] },
        { name: 'profile PDF', weight: 3, p95BudgetMs: 4000, paths: [`/p/${PROFILE_SLUG}/pdf`] },
        { name: 'profile share image', weight: 3, p95BudgetMs: 4000, paths: [`/p/${PROFILE_SLUG}/opengraph-image`] },
      ]
    : []),
  ...(SESSION_COOKIE
    ? [{ name: 'signed-in dashboard', weight: 15, p95BudgetMs: 2000, paths: ['/dashboard', '/dashboard/metrics', '/dashboard/insights', '/dashboard/profile'], cookie: SESSION_COOKIE }]
    : []),
]
const TOTAL_WEIGHT = GROUPS.reduce((sum, g) => sum + g.weight, 0)

type Sample = { group: string; ms: number; status: number }

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!
}

function pickGroup(): Group {
  let roll = Math.random() * TOTAL_WEIGHT
  for (const group of GROUPS) {
    roll -= group.weight
    if (roll < 0) return group
  }
  return GROUPS[GROUPS.length - 1]!
}

async function virtualUser(deadline: number, samples: Sample[]): Promise<void> {
  while (Date.now() < deadline) {
    const group = pickGroup()
    const path = group.paths[Math.floor(Math.random() * group.paths.length)]!
    const started = performance.now()
    let status = 0
    try {
      const response = await fetch(new URL(path, BASE_URL), {
        redirect: 'manual',
        signal: AbortSignal.timeout(15_000),
        headers: group.cookie ? { cookie: group.cookie } : undefined,
      })
      await response.arrayBuffer()
      status = response.status
    } catch {
      status = 0
    }
    samples.push({ group: group.name, ms: performance.now() - started, status })
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 800))
  }
}

type Row = { group: string; requests: number; perSec: number; errorPct: number; limited: number; redirects: number; p50Ms: number; p95Ms: number; p99Ms: number; budgetMs: number; ok: boolean }

function summarize(group: Group, samples: Sample[]): Row {
  const mine = samples.filter((s) => s.group === group.name)
  // Rate-limited responses return early, so they would flatter the latency figures.
  const latencies = mine.filter((s) => s.status !== 429).map((s) => s.ms).sort((a, b) => a - b)
  const errors = mine.filter((s) => s.status === 0 || s.status >= 500).length
  // A signed-in page answering with a redirect means the session was not accepted.
  const redirects = mine.filter((s) => s.status >= 300 && s.status < 400).length
  const errorPct = Number(((errors / Math.max(1, mine.length)) * 100).toFixed(2))
  const p95Ms = Math.round(percentile(latencies, 95))
  const budgetMs = Math.round(group.p95BudgetMs * BUDGET_SCALE)
  return {
    group: group.name,
    requests: mine.length,
    perSec: Number((mine.length / DURATION_S).toFixed(1)),
    errorPct,
    limited: mine.filter((s) => s.status === 429).length,
    redirects,
    p50Ms: Math.round(percentile(latencies, 50)),
    p95Ms,
    p99Ms: Math.round(percentile(latencies, 99)),
    budgetMs,
    ok: errorPct <= 1 && p95Ms <= budgetMs && !(group.cookie && redirects > 0),
  }
}

async function main() {
  console.log(`Simulating ${USERS} concurrent users against ${BASE_URL} for ${DURATION_S}s across ${GROUPS.length} route groups`)
  const samples: Sample[] = []
  const deadline = Date.now() + DURATION_S * 1000
  await Promise.all(Array.from({ length: USERS }, () => virtualUser(deadline, samples)))

  const rows = GROUPS.map((g) => summarize(g, samples))
  const all = samples.filter((s) => s.status !== 429).map((s) => s.ms).sort((a, b) => a - b)
  console.table(rows)
  console.log(
    `Total: ${samples.length} requests, ${(samples.length / DURATION_S).toFixed(1)}/s, p50 ${Math.round(percentile(all, 50))} ms, p95 ${Math.round(percentile(all, 95))} ms, ${samples.filter((s) => s.status === 429).length} rate limited`,
  )
  const failed = rows.filter((r) => !r.ok)
  if (failed.length > 0) {
    console.error(`Load simulation failed its budget: ${failed.map((r) => r.group).join(', ')}`)
    process.exit(1)
  }
}

void main()
