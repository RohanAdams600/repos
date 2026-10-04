import { afterEach, describe, expect, it, vi } from 'vitest'
import { e2eSessionValue, e2eStubEnabled, readE2eSession } from '@/lib/auth/e2e-stub'
import { ageSeconds, formatPrometheus } from '@/lib/ops/prometheus'

const SECRET = 'p'.repeat(32)
const USER = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'

describe('end-to-end sign-in stub', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('is off unless explicitly enabled for a local run', () => {
    vi.stubEnv('E2E_AUTH_STUB', '')
    vi.stubEnv('DEPLOY_ENV', 'local')
    expect(e2eStubEnabled()).toBe(false)
    expect(readE2eSession(e2eSessionValue(USER, SECRET), SECRET)).toBeNull()
  })

  it('accepts a correctly signed cookie locally', () => {
    vi.stubEnv('E2E_AUTH_STUB', 'true')
    vi.stubEnv('DEPLOY_ENV', 'local')
    expect(readE2eSession(e2eSessionValue(USER, SECRET), SECRET)).toBe(USER)
  })

  it('never accepts a cookie in a deployed environment, even with the flag set', () => {
    vi.stubEnv('E2E_AUTH_STUB', 'true')
    for (const deploy of ['staging', 'production']) {
      vi.stubEnv('DEPLOY_ENV', deploy)
      expect(e2eStubEnabled()).toBe(false)
      expect(readE2eSession(e2eSessionValue(USER, SECRET), SECRET)).toBeNull()
    }
  })

  it('rejects forged, re-targeted and malformed cookies', () => {
    vi.stubEnv('E2E_AUTH_STUB', 'true')
    vi.stubEnv('DEPLOY_ENV', 'local')
    const valid = e2eSessionValue(USER, SECRET)
    const other = '0190a1b2-c3d4-7e5f-8a9b-ffffffffffff'
    expect(readE2eSession(e2eSessionValue(USER, 'q'.repeat(32)), SECRET)).toBeNull()
    expect(readE2eSession(`${other}${valid.slice(USER.length)}`, SECRET)).toBeNull()
    expect(readE2eSession(USER, SECRET)).toBeNull()
    expect(readE2eSession(`not-a-uuid.${valid.split('.')[1]}`, SECRET)).toBeNull()
    expect(readE2eSession(valid, undefined)).toBeNull()
  })
})

describe('Prometheus exposition', () => {
  it('writes HELP, TYPE and samples with labels', () => {
    const text = formatPrometheus([
      { name: 'ks_backlog', help: 'Items waiting.', samples: [{ value: 3 }] },
      { name: 'ks_jobs', help: 'Jobs by state.', samples: [{ labels: { queue: 'video-analysis', state: 'waiting' }, value: 2 }, { labels: { queue: 'video-analysis', state: 'failed' }, value: 0 }] },
    ])
    expect(text).toBe(
      [
        '# HELP ks_backlog Items waiting.',
        '# TYPE ks_backlog gauge',
        'ks_backlog 3',
        '# HELP ks_jobs Jobs by state.',
        '# TYPE ks_jobs gauge',
        'ks_jobs{queue="video-analysis",state="waiting"} 2',
        'ks_jobs{queue="video-analysis",state="failed"} 0',
        '',
      ].join('\n'),
    )
  })

  it('escapes label values and help text, and spells special values the Prometheus way', () => {
    const text = formatPrometheus([{ name: 'ks_x', help: 'Line one\nback\\slash', samples: [{ labels: { l: 'a"b\\c\nd' }, value: Infinity }, { value: NaN }, { value: -Infinity }] }])
    expect(text).toContain('# HELP ks_x Line one\\nback\\\\slash')
    expect(text).toContain('ks_x{l="a\\"b\\\\c\\nd"} +Inf')
    expect(text).toContain('ks_x NaN')
    expect(text).toContain('ks_x -Inf')
  })

  it('refuses invalid or duplicate names instead of emitting a broken scrape', () => {
    expect(() => formatPrometheus([{ name: 'bad-name', help: 'x', samples: [] }])).toThrow(/Invalid metric name/)
    expect(() => formatPrometheus([{ name: 'ok', help: 'x', samples: [{ labels: { 'bad-label': 'v' }, value: 1 }] }])).toThrow(/Invalid label name/)
    expect(() => formatPrometheus([{ name: 'ok', help: 'x', samples: [{ labels: { __reserved: 'v' }, value: 1 }] }])).toThrow(/Invalid label name/)
    expect(() => formatPrometheus([{ name: 'ok', help: 'x', samples: [] }, { name: 'ok', help: 'y', samples: [] }])).toThrow(/Duplicate/)
  })

  it('reports zero age when nothing is waiting', () => {
    const now = new Date('2026-10-04T12:00:00Z')
    expect(ageSeconds(null, now)).toBe(0)
    expect(ageSeconds(new Date('2026-10-04T11:58:30Z'), now)).toBe(90)
    expect(ageSeconds(new Date('2026-10-04T12:05:00Z'), now)).toBe(0)
  })
})
