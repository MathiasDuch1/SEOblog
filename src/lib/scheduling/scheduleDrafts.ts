import 'server-only'

import { getReadiness } from '@/lib/generation/readiness'
import { getPayloadClient } from '@/lib/payload'
import type { Post } from '@/payload-types'

import { computeDailySlots } from './slots'
import { addDays, localDateOf, zonedTimeToUtc } from './zonedTime'

const MINUTE = 60_000

export type ScheduleReport = {
  domainId: number
  filled: { postId: number; scheduledAt: string }[]
  /** Free slots in the range that no ready draft was left to fill. */
  emptySlots: number
  skipped: { postId: number; title: string; missing: string[] }[]
}

/**
 * Fills one domain's free publish slots with its ready drafts, oldest first.
 *
 * Each day's slots are recomputed with fresh jitter, so a slot counts as taken when a
 * scheduled or published post sits within ±2 × jitter of it — both times are within ±jitter
 * of the same base time. Posts that match no slot still count toward `postsPerDay`, so a
 * local day never holds more than that. Slots already in the past are never used. Re-running
 * over the same range therefore schedules nothing new.
 */
export async function scheduleDrafts({
  domainId,
  startDate,
  days,
  postIds,
  now = new Date(),
}: {
  domainId: number
  /** First local day, `YYYY-MM-DD`; defaults to today in the domain's timezone. */
  startDate?: string
  days: number
  postIds?: number[]
  now?: Date
}): Promise<ScheduleReport> {
  const payload = await getPayloadClient()
  const domain = await payload.findByID({ collection: 'domains', id: domainId, depth: 0 })
  const { timezone, schedule } = domain
  const firstDay = startDate ?? localDateOf(now, timezone)
  const tolerance = schedule.jitterMinutes * 2 * MINUTE

  const drafts = await payload.find({
    collection: 'posts',
    where: {
      and: [
        { domain: { equals: domainId } },
        { status: { equals: 'draft' } },
        ...(postIds ? [{ id: { in: postIds } }] : []),
      ],
    },
    sort: 'createdAt',
    pagination: false,
    depth: 0,
  })

  const report: ScheduleReport = { domainId, filled: [], emptySlots: 0, skipped: [] }
  const ready: Post[] = []
  for (const draft of drafts.docs) {
    const { ready: isReady, missing } = getReadiness(draft)
    if (isReady) ready.push(draft)
    else report.skipped.push({ postId: draft.id, title: draft.title, missing })
  }

  for (let offset = 0; offset < days; offset++) {
    const day = addDays(firstDay, offset)
    const dayStart = zonedTimeToUtc(day, 0, timezone)
    const dayEnd = zonedTimeToUtc(addDays(day, 1), 0, timezone)

    const taken = await payload.find({
      collection: 'posts',
      where: {
        and: [
          { domain: { equals: domainId } },
          { status: { in: ['scheduled', 'published'] } },
          {
            or: [
              { scheduledAt: { greater_than_equal: dayStart.toISOString(), less_than: dayEnd.toISOString() } },
              {
                and: [
                  { scheduledAt: { exists: false } },
                  { publishedAt: { greater_than_equal: dayStart.toISOString(), less_than: dayEnd.toISOString() } },
                ],
              },
            ],
          },
        ],
      },
      pagination: false,
      depth: 0,
    })
    const occupied = taken.docs.map((post) => new Date((post.scheduledAt ?? post.publishedAt) as string).getTime())

    let free = computeDailySlots({ date: day, timezone, ...schedule, random: Math.random }).map((slot) =>
      slot.getTime(),
    )
    // Each occupied time claims the nearest slot it could have come from, or, failing that,
    // the nearest remaining slot, so the day's total stays at postsPerDay.
    const unmatched: number[] = []
    for (const time of occupied) {
      const index = nearestIndex(free, time)
      if (index !== -1 && Math.abs(free[index] - time) <= tolerance) free.splice(index, 1)
      else unmatched.push(time)
    }
    for (const time of unmatched) {
      const index = nearestIndex(free, time)
      if (index !== -1) free.splice(index, 1)
    }
    free = free.filter((slot) => slot > now.getTime())

    for (const slot of free) {
      const post = ready.shift()
      if (!post) {
        report.emptySlots++
        continue
      }
      const scheduledAt = new Date(slot).toISOString()
      await payload.update({ collection: 'posts', id: post.id, data: { status: 'scheduled', scheduledAt } })
      report.filled.push({ postId: post.id, scheduledAt })
    }
  }

  return report
}

function nearestIndex(slots: number[], time: number): number {
  let best = -1
  for (let index = 0; index < slots.length; index++) {
    if (best === -1 || Math.abs(slots[index] - time) < Math.abs(slots[best] - time)) best = index
  }
  return best
}
