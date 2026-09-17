/**
 * Schedules one domain's ready drafts into its free, jittered publish slots.
 *
 *   npm run schedule -- --domain 13 --start 2026-10-01 --days 30
 *   npm run schedule -- --domain 13 --days 7 --posts 101,102     only these drafts
 *
 * `--start` is a day in the domain's timezone and defaults to today there. Safe to re-run:
 * slots already taken by scheduled or published posts are left alone.
 */
import { parseArgs } from 'util'

import { scheduleDrafts } from '../lib/scheduling/scheduleDrafts'

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    domain: { type: 'string' },
    start: { type: 'string' },
    days: { type: 'string', default: '30' },
    posts: { type: 'string' },
  },
})

try {
  const domainId = Number(values.domain)
  const days = Number(values.days)
  if (!Number.isInteger(domainId) || domainId <= 0) throw new Error('--domain <id> is required')
  if (!Number.isInteger(days) || days <= 0) throw new Error('--days must be a positive whole number')
  if (values.start && !/^\d{4}-\d{2}-\d{2}$/.test(values.start)) throw new Error('--start must be YYYY-MM-DD')

  const report = await scheduleDrafts({
    domainId,
    startDate: values.start,
    days,
    postIds: values.posts?.split(',').map((id) => Number(id.trim())),
  })

  for (const { postId, scheduledAt } of report.filled) console.log(`scheduled post ${postId} at ${scheduledAt}`)
  for (const { postId, title, missing } of report.skipped) {
    console.log(`skipped post ${postId} "${title}": missing ${missing.join(', ')}`)
  }
  console.log(
    `Domain ${domainId}: ${report.filled.length} scheduled, ${report.emptySlots} slot(s) left empty, ${report.skipped.length} draft(s) not ready`,
  )
} catch (error) {
  console.error(`Error: ${(error as Error).message}`)
  process.exit(1)
}

process.exit(0)
