/**
 * Load simulation for a running deployment (staging, never production without notice).
 *
 *   BASE_URL=https://staging.kineticscout.com USERS=50 DURATION_S=60 npm run load:simulate
 *
 * Each virtual user loops through public pages and the health check with think time, like a
 * visitor browsing. Reports throughput, error rate and latency percentiles, and exits non-zero if
 * the error rate exceeds 1% or p95 exceeds P95_BUDGET_MS. Rate limiting (429) is counted
 * separately: it is the expected, healthy response to abusive traffic.
 */
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const USERS = Number(process.env.USERS ?? 25)
const DURATION_S = Number(process.env.DURATION_S ?? 30)
const P95_BUDGET_MS = Number(process.env.P95_BUDGET_MS ?? 1500)
const PATHS = ['/', '/pricing', '/blog', '/sign-in', '/legal/privacy', '/api/health']

type Sample = { ms: number; status: number }

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!
}

async function virtualUser(deadline: number, samples: Sample[]): Promise<void> {
  while (Date.now() < deadline) {
    const path = PATHS[Math.floor(Math.random() * PATHS.length)]!
    const started = performance.now()
    let status = 0
    try {
      const response = await fetch(new URL(path, BASE_URL), { redirect: 'manual', signal: AbortSignal.timeout(10_000) })
      await response.arrayBuffer()
      status = response.status
    } catch {
      status = 0
    }
    samples.push({ ms: performance.now() - started, status })
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 800))
  }
}

async function main() {
  console.log(`Simulating ${USERS} concurrent users against ${BASE_URL} for ${DURATION_S}s`)
  const samples: Sample[] = []
  const deadline = Date.now() + DURATION_S * 1000
  await Promise.all(Array.from({ length: USERS }, () => virtualUser(deadline, samples)))

  const latencies = samples.map((s) => s.ms).sort((a, b) => a - b)
  const errors = samples.filter((s) => s.status === 0 || s.status >= 500).length
  const limited = samples.filter((s) => s.status === 429).length
  const report = {
    requests: samples.length,
    throughputPerSec: Number((samples.length / DURATION_S).toFixed(1)),
    errorRate: Number(((errors / Math.max(1, samples.length)) * 100).toFixed(2)),
    rateLimited: limited,
    p50Ms: Math.round(percentile(latencies, 50)),
    p95Ms: Math.round(percentile(latencies, 95)),
    p99Ms: Math.round(percentile(latencies, 99)),
  }
  console.table(report)
  if (report.errorRate > 1 || report.p95Ms > P95_BUDGET_MS) {
    console.error('Load simulation failed its budget')
    process.exit(1)
  }
}

void main()
