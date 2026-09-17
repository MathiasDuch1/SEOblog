import { describe, expect, it } from 'vitest'

import { computeDailySlots, type DailySlotsInput } from './slots'
import { localDateOf, localMinutesOf, zonedTimeToUtc } from './zonedTime'

/** Deterministic PRNG (mulberry32) so every run of the suite sees the same slots. */
function seeded(seed: number) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const defaults = (overrides: Partial<DailySlotsInput> = {}): DailySlotsInput => ({
  date: '2026-10-01',
  timezone: 'Europe/Copenhagen',
  postsPerDay: 10,
  windowStart: '08:00',
  windowEnd: '23:30',
  jitterMinutes: 8,
  random: seeded(1),
  ...overrides,
})

const WINDOW_START = 8 * 60
const WINDOW_END = 23 * 60 + 30

function expectInsideWindow(slots: Date[], input: DailySlotsInput) {
  for (const slot of slots) {
    expect(localDateOf(slot, input.timezone)).toBe(input.date)
    expect(localMinutesOf(slot, input.timezone)).toBeGreaterThanOrEqual(WINDOW_START)
    expect(localMinutesOf(slot, input.timezone)).toBeLessThanOrEqual(WINDOW_END)
  }
}

describe('computeDailySlots', () => {
  it('returns 10 strictly increasing slots inside 08:00–23:30 local for the defaults', () => {
    const input = defaults()
    const slots = computeDailySlots(input)

    expect(slots).toHaveLength(10)
    expectInsideWindow(slots, input)
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].getTime()).toBeGreaterThan(slots[i - 1].getTime())
    }
  })

  it('produces different slot times for different seeds', () => {
    const a = computeDailySlots(defaults({ random: seeded(1) })).map((slot) => slot.getTime())
    const b = computeDailySlots(defaults({ random: seeded(2) })).map((slot) => slot.getTime())

    expect(a).not.toEqual(b)
  })

  it('jitters every slot away from its base time, within ± jitterMinutes', () => {
    const input = defaults({ random: seeded(42) })
    const slots = computeDailySlots(input)
    const start = zonedTimeToUtc(input.date, WINDOW_START, input.timezone).getTime()
    const end = zonedTimeToUtc(input.date, WINDOW_END, input.timezone).getTime()
    const interval = (end - start) / 9

    slots.forEach((slot, index) => {
      const distance = Math.abs(slot.getTime() - (start + interval * index))
      expect(distance).toBeGreaterThan(0)
      expect(distance).toBeLessThanOrEqual(input.jitterMinutes * 60_000)
    })
  })

  it('even with no randomness at all, no slot lands exactly on its base time', () => {
    const input = defaults({ random: () => 0.5 })
    const start = zonedTimeToUtc(input.date, WINDOW_START, input.timezone).getTime()
    const end = zonedTimeToUtc(input.date, WINDOW_END, input.timezone).getTime()
    const interval = (end - start) / 9

    computeDailySlots(input).forEach((slot, index) => {
      expect(slot.getTime()).not.toBe(start + interval * index)
    })
  })

  it.each([
    ['Europe/Copenhagen', '2026-03-29'], // EU spring forward
    ['Europe/Copenhagen', '2026-10-25'], // EU fall back
    ['America/New_York', '2026-03-08'], // US spring forward
    ['America/New_York', '2026-11-01'], // US fall back
  ])('keeps %s on the DST day %s inside 08:00–23:30 local', (timezone, date) => {
    for (const seed of [1, 2, 3, 4, 5]) {
      // Extreme jitter at both edges is the case that could leak outside the window.
      for (const random of [seeded(seed), () => 0, () => 0.999999]) {
        const input = defaults({ timezone, date, random })
        const slots = computeDailySlots(input)
        expect(slots).toHaveLength(10)
        expectInsideWindow(slots, input)
      }
    }
  })

  it('puts the same local day in different UTC instants for different timezones', () => {
    const copenhagen = computeDailySlots(defaults({ timezone: 'Europe/Copenhagen', random: () => 0.3 }))
    const newYork = computeDailySlots(defaults({ timezone: 'America/New_York', random: () => 0.3 }))

    expect(copenhagen[0].getTime()).not.toBe(newYork[0].getTime())
    // Copenhagen is 6 hours ahead of New York on 1 October 2026.
    expect(newYork[0].getTime() - copenhagen[0].getTime()).toBe(6 * 60 * 60 * 1000)
  })

  it('handles postsPerDay: 1 without dividing by zero', () => {
    const input = defaults({ postsPerDay: 1 })
    const slots = computeDailySlots(input)

    expect(slots).toHaveLength(1)
    expect(Number.isFinite(slots[0].getTime())).toBe(true)
    expectInsideWindow(slots, input)
  })
})
