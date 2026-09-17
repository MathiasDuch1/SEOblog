/**
 * Wall-clock time in a named timezone, without a date library. Pure and free of
 * `server-only`, because collection configs (and so the Payload CLI) import it.
 */

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

export function isValidTimezone(value: unknown): value is string {
  return typeof value === 'string' && Intl.supportedValuesOf('timeZone').includes(value)
}

/** `'08:00'` → 480 (minutes after midnight), or `null` when not a 24-hour `HH:MM`. */
export function parseWallClock(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function partsIn(timezone: string, instant: Date) {
  let formatter = formatters.get(timezone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(timezone, formatter)
  }
  const parts = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]))
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  }
}

/** Offset of `timezone` from UTC at `instant`, in milliseconds (Copenhagen summer: +2h). */
function offsetAt(timezone: string, instant: number): number {
  const p = partsIn(timezone, new Date(instant))
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(instant / 1000) * 1000
}

/**
 * The UTC instant at which clocks in `timezone` show `date` (`YYYY-MM-DD`) at `minutes` after
 * midnight. On a spring-forward day a time inside the skipped hour resolves to the instant
 * just after the jump; on a fall-back day an ambiguous time resolves to its first occurrence.
 */
export function zonedTimeToUtc(date: string, minutes: number, timezone: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  const wallClock = Date.UTC(year, month - 1, day) + minutes * MINUTE
  // The offsets a day either side cover both sides of any transition on this date.
  const candidates = [...new Set([-DAY, DAY].map((shift) => wallClock - offsetAt(timezone, wallClock + shift)))]
  const exact = candidates.filter((candidate) => wallClock - candidate === offsetAt(timezone, candidate))
  return new Date(exact.length > 0 ? Math.min(...exact) : Math.max(...candidates))
}

/** The calendar day (`YYYY-MM-DD`) that `instant` falls on in `timezone`. */
export function localDateOf(instant: Date, timezone: string): string {
  const p = partsIn(timezone, instant)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** Minutes after local midnight at `instant` in `timezone`. */
export function localMinutesOf(instant: Date, timezone: string): number {
  const p = partsIn(timezone, instant)
  return p.hour * 60 + p.minute + p.second / 60
}

/** `'2026-10-01'` + 2 → `'2026-10-03'`. Pure calendar arithmetic, no timezone involved. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}
