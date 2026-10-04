import { describe, expect, it } from 'vitest'
import { formatUsd, PRO_PRICES, yearlySavingsDollars } from '@/lib/billing/plans'
import { isLiveStatus, mapStripeStatus, tierFor } from '@/lib/billing/status'
import { METRIC_DEFINITIONS, METRIC_TYPES, metricDbValue, metricTypeFromDb } from '@/lib/metrics/definitions'
import { positionDbValue, positionFromDb } from '@/lib/athletes/positions'
import { isAllowedVideoType, sniffVideoContainer } from '@/lib/storage/video-files'
import { scheduleSlot } from '@worker/schedule'
import { rankTopics } from '@worker/agents/growth/trends'

describe('subscription status mapping', () => {
  it('maps Stripe statuses and never grants access for unknown ones', () => {
    expect(mapStripeStatus('active')).toBe('ACTIVE')
    expect(mapStripeStatus('past_due')).toBe('PAST_DUE')
    expect(mapStripeStatus('some_future_status')).toBe('UNPAID')
    expect(isLiveStatus('INCOMPLETE')).toBe(true)
    expect(isLiveStatus('CANCELED')).toBe(false)
  })
  it('grants Pro for active, trialing and past_due Pro prices only', () => {
    expect(tierFor([{ status: 'PAST_DUE', isProPrice: true }])).toBe('PRO')
    expect(tierFor([{ status: 'CANCELED', isProPrice: true }, { status: 'UNPAID', isProPrice: true }])).toBe('FREE')
    expect(tierFor([{ status: 'ACTIVE', isProPrice: false }])).toBe('FREE')
  })
  it('shows the specified prices', () => {
    expect(PRO_PRICES.monthly.amountCents).toBe(1499)
    expect(PRO_PRICES.yearly.amountCents).toBe(12900)
    expect(formatUsd(1499)).toBe('$14.99')
    expect(formatUsd(12900)).toBe('$129')
    expect(yearlySavingsDollars()).toBe(51)
  })
})

describe('upload validation', () => {
  const head = (box: string, brand = 'isom') => new Uint8Array([0, 0, 0, 24, ...Buffer.from(box), ...Buffer.from(brand), 0, 0])
  it('identifies MP4 and QuickTime by magic bytes', () => {
    expect(sniffVideoContainer(head('ftyp', 'isom'))).toBe('mp4')
    expect(sniffVideoContainer(head('ftyp', 'qt  '))).toBe('quicktime')
    expect(sniffVideoContainer(head('moov'))).toBe('quicktime')
  })
  it('rejects disguised files', () => {
    expect(sniffVideoContainer(new Uint8Array(Buffer.from('<?php echo 1; ?>....')))).toBeNull()
    expect(sniffVideoContainer(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull()
    expect(isAllowedVideoType('video/webm')).toBe(false)
    expect(isAllowedVideoType('text/html')).toBe(false)
  })
})

describe('enum database values', () => {
  it('round-trips metric and position values used in raw SQL', () => {
    expect(metricDbValue('SIXTY_YARD_DASH')).toBe('60_YARD_DASH')
    expect(metricTypeFromDb('60_YARD_DASH')).toBe('SIXTY_YARD_DASH')
    for (const t of METRIC_TYPES) expect(metricTypeFromDb(metricDbValue(t))).toBe(t)
    expect(positionDbValue('FIRST_BASE')).toBe('1B')
    expect(positionFromDb('1B')).toBe('FIRST_BASE')
  })
  it('defines sane plausibility ranges', () => {
    for (const def of Object.values(METRIC_DEFINITIONS)) expect(def.min).toBeLessThan(def.max)
  })
})

describe('agent scheduling', () => {
  it('derives the same slot id in the schedule time zone on every replica', () => {
    // 14:00 UTC is 10:00 in New York during daylight saving time.
    expect(scheduleSlot(new Date('2026-10-06T14:00:30Z'), 'America/New_York')).toBe('2026-10-06T10:00')
    expect(scheduleSlot(new Date('2026-10-04T04:00:00Z'), 'America/New_York')).toBe('2026-10-04T00:00')
  })
  it('blends trend sources and ranks topics deterministically', () => {
    const ranked = rankTopics(
      [
        [{ topic: 'a', score: 1, source: 'seasonal', evidence: 'in season' }, { topic: 'b', score: 0.15, source: 'seasonal', evidence: 'off' }],
        [{ topic: 'b', score: 1, source: 'x-recent-counts', evidence: 'spike' }],
      ],
      2,
    )
    expect(ranked.map((r) => r.topic)).toEqual(['a', 'b'])
    expect(ranked[1]!.evidence).toHaveLength(2)
  })
})
