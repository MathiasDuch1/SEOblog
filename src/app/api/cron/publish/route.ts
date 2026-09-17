import { isAuthorizedCronRequest } from '@/lib/cron'
import { submitUrls, type IndexNowResult } from '@/lib/indexnow'
import { getPayloadClient } from '@/lib/payload'
import { publishPost } from '@/lib/scheduling/publishPost'
import { recordSchedulerRun } from '@/lib/scheduling/schedulerStatus'
import type { Domain } from '@/payload-types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// 50 posts at a few queries each finish in seconds; the headroom covers IndexNow calls.
export const maxDuration = 120

/** Posts published per run. A backlog drains over consecutive runs. */
const BATCH_SIZE = 50

/**
 * Cron entry point for publishing: publishes every due scheduled post across all domains,
 * oldest first, then tells IndexNow about each domain's new URLs. Reachable only on the admin
 * host (see src/proxy.ts). Safe to run concurrently — `publishPost` publishes each post once.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const payload = await getPayloadClient()
  const due = await payload.find({
    collection: 'posts',
    where: { and: [{ status: { equals: 'scheduled' } }, { scheduledAt: { less_than_equal: now.toISOString() } }] },
    sort: 'scheduledAt',
    limit: BATCH_SIZE,
    depth: 0,
  })

  const published: number[] = []
  const skipped: number[] = []
  const failed: { postId: number; error: string }[] = []
  const urlsByDomain = new Map<number, { domain: Domain; urls: string[] }>()

  for (const post of due.docs) {
    const result = await publishPost(post.id, now)
    if (result.status === 'published') {
      published.push(result.postId)
      const entry = urlsByDomain.get(result.domain.id) ?? { domain: result.domain, urls: [] }
      entry.urls.push(result.url)
      urlsByDomain.set(result.domain.id, entry)
    } else if (result.status === 'skipped') {
      skipped.push(result.postId)
    } else {
      failed.push({ postId: result.postId, error: result.error })
    }
  }

  // IndexNow is best-effort: a failed submission is reported, never undoes a publish.
  const indexNow: Record<string, IndexNowResult | { error: string }> = {}
  for (const { domain, urls } of urlsByDomain.values()) {
    try {
      indexNow[domain.hostname] = await submitUrls(domain, urls)
    } catch (error) {
      payload.logger.error({ err: error, domain: domain.hostname }, 'IndexNow submission failed')
      indexNow[domain.hostname] = { error: (error as Error).message }
    }
  }

  const result = { published, skipped, failed, indexNow }
  await recordSchedulerRun('publish', result)
  return Response.json(result)
}
