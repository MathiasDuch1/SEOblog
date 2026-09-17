import { parseWallClock, zonedTimeToUtc } from './zonedTime'

const MINUTE = 60_000

export type DailySlotsInput = {
  /** Calendar day in the domain's timezone, `YYYY-MM-DD`. */
  date: string
  timezone: string
  postsPerDay: number
  /** Local `HH:MM`. */
  windowStart: string
  windowEnd: string
  jitterMinutes: number
  /** Returns a number in [0, 1). Injectable so tests are deterministic. */
  random: () => number
}

/**
 * One domain's publish slots for one local day, as UTC instants in increasing order.
 *
 * Slots start evenly spaced across the window — (end − start) ÷ (postsPerDay − 1), about
 * 103 minutes for 10 posts across 08:00–23:30 — and every slot then moves by its own random
 * jitter in ±`jitterMinutes` (spec §7). A slot jittered past a window edge is reflected back
 * inside instead of clamped onto the edge, so no slot lands exactly on its base time.
 * The window is wall-clock time, so DST days still run 08:00–23:30 local.
 */
export function computeDailySlots({
  date,
  timezone,
  postsPerDay,
  windowStart,
  windowEnd,
  jitterMinutes,
  random,
}: DailySlotsInput): Date[] {
  const startMinutes = parseWallClock(windowStart)
  const endMinutes = parseWallClock(windowEnd)
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    throw new Error(`Invalid publishing window ${windowStart}–${windowEnd}`)
  }
  const count = Math.max(1, Math.floor(postsPerDay))

  const start = zonedTimeToUtc(date, startMinutes, timezone).getTime()
  const end = zonedTimeToUtc(date, endMinutes, timezone).getTime()
  const interval = count === 1 ? 0 : (end - start) / (count - 1)
  const jitter = jitterMinutes * MINUTE

  const slots: number[] = []
  for (let index = 0; index < count; index++) {
    const base = start + interval * index
    // Whole seconds keep timestamps tidy; a zero offset is nudged so no slot sits on its base time.
    let offset = Math.round(((random() * 2 - 1) * jitter) / 1000) * 1000
    if (offset === 0) offset = 1000
    let slot = base + offset
    if (slot < start) slot = start + (start - slot)
    if (slot > end) slot = end - (slot - end)

    const previous = slots[slots.length - 1]
    if (previous !== undefined && slot <= previous) slot = Math.min(previous + MINUTE, end)
    if (previous !== undefined && slot <= previous) break // the window is too full for more slots
    slots.push(slot)
  }

  return slots.map((slot) => new Date(slot))
}
