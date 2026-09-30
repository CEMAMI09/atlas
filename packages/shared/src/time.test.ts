import { describe, expect, it } from 'vitest'
import { resolveRecentHourRange, zonedTimeToUtc } from './time'

describe('local time ranges', () => {
  it('keeps a 3pm–5pm window in the requested time zone', () => {
    const zone = 'America/Los_Angeles'
    const now = zonedTimeToUtc({ year: 2026, month: 9, day: 30, hour: 18, minute: 0, second: 0 }, zone)
    const range = resolveRecentHourRange(15, 17, now, zone)
    const inside = zonedTimeToUtc({ year: 2026, month: 9, day: 30, hour: 15, minute: 30, second: 0 }, zone)
    const before = zonedTimeToUtc({ year: 2026, month: 9, day: 30, hour: 14, minute: 59, second: 0 }, zone)
    expect(inside.getTime()).toBeGreaterThanOrEqual(range.start.getTime())
    expect(inside.getTime()).toBeLessThan(range.end.getTime())
    expect(before.getTime()).toBeLessThan(range.start.getTime())
    expect(range.label).toContain('America/Los_Angeles')
  })
})
