import { describe, expect, it } from 'vitest'
import { normalizeEvent } from './normalize'

describe('event normalization', () => {
  it('fills category and severity from the catalog', () => {
    const event = normalizeEvent({
      timestamp: '2026-09-30T22:00:00.000Z',
      source: 'vercel',
      type: 'vercel.deployment.ready',
      title: 'Struct production deployment ready',
      dedupeKey: 'test:1',
      isMock: true,
    })
    expect(event.category).toBe('deployment')
    expect(event.severity).toBe('info')
  })

  it('rejects an unknown type with no category', () => {
    expect(() =>
      normalizeEvent({
        timestamp: '2026-09-30T22:00:00.000Z',
        source: 'atlas',
        type: 'custom.unknown',
        title: 'Nope',
      }),
    ).toThrow(/category/)
  })
})
