import { describe, expect, it } from 'vitest'
import { decodeMatchup, encodeMatchup, type Matchup } from '../src/ui/share'

describe('matchup links', () => {
  const m: Matchup = { v: 1, ids: ['jonathan-taylor', 'donovan-mitchell'], mode: 'sprint', opts: { distance: '40yd', normalize: true }, seed: 123 }

  it('round-trips through a link-safe code', () => {
    const code = encodeMatchup(m)
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeMatchup(code)).toEqual(m)
    expect(decodeMatchup(`#m.${code}`)).toEqual(m)
  })

  it('rejects anything that is not a matchup', () => {
    expect(decodeMatchup('not-a-code')).toBeNull()
    expect(decodeMatchup(btoa(JSON.stringify({ v: 1, ids: [1], mode: 'sprint' })))).toBeNull()
    expect(decodeMatchup(btoa(JSON.stringify({ ...m, mode: 'boxing' })))).toBeNull()
  })

  it('drops option values of unexpected types', () => {
    const code = btoa(JSON.stringify({ ...m, opts: { distance: '40yd', bad: { nested: 1 } } }))
    expect(decodeMatchup(code)!.opts).toEqual({ distance: '40yd' })
  })
})
