import { describe, expect, it } from 'vitest'
import { addToOutbox, clearOutbox, pendingFor, readOutbox, removeFromOutbox, type OutboxEntry } from '@/lib/pwa/outbox'

function memory() {
  const data = new Map<string, string>()
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k), data }
}

const entry = (over: Partial<OutboxEntry> = {}): OutboxEntry => ({ clientRef: crypto.randomUUID(), userId: 'u1', metricType: 'EXIT_VELOCITY', value: 88, date: '2026-10-05', queuedAt: Date.now(), ...over })

describe('offline outbox', () => {
  it('keeps entries per account and removes them once sent', () => {
    const s = memory()
    const a = entry()
    const b = entry({ userId: 'u2' })
    expect(addToOutbox(a, s)).toBe(true)
    addToOutbox(b, s)
    addToOutbox(a, s)
    expect(readOutbox(s)).toHaveLength(2)
    expect(pendingFor('u1', s).map((e) => e.clientRef)).toEqual([a.clientRef])
    removeFromOutbox(a.clientRef, s)
    expect(pendingFor('u1', s)).toEqual([])
    clearOutbox(s)
    expect(s.data.size).toBe(0)
  })

  it('drops old or malformed entries and survives unavailable storage', () => {
    const s = memory()
    s.setItem('ks_outbox_v1', JSON.stringify([entry({ queuedAt: Date.now() - 31 * 86_400_000 }), { clientRef: 'x' }, entry()]))
    expect(readOutbox(s)).toHaveLength(1)
    s.setItem('ks_outbox_v1', 'not json')
    expect(readOutbox(s)).toEqual([])
    expect(readOutbox(null)).toEqual([])
    expect(addToOutbox(entry(), null)).toBe(false)
    const full = { ...memory(), setItem: () => { throw new Error('QuotaExceededError') } }
    expect(addToOutbox(entry(), full)).toBe(false)
  })
})
