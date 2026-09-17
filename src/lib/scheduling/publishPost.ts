import 'server-only'

import { sql, type PostgresAdapter } from '@payloadcms/db-postgres'

import { revalidatePostChange } from '@/lib/cache/revalidate'
import { getReadiness } from '@/lib/generation/readiness'
import { getPayloadClient } from '@/lib/payload'
import { postUrl } from '@/lib/urls'
import type { Domain } from '@/payload-types'

export type PublishResult =
  | { status: 'published'; postId: number; url: string; domain: Domain }
  | { status: 'skipped'; postId: number }
  | { status: 'failed'; postId: number; error: string }

const idOf = (value: number | { id: number }) => (typeof value === 'object' ? value.id : value)

/**
 * Publishes one scheduled post exactly once. Used by the publish dispatcher and by phase 06's
 * "Publish now".
 *
 * The status flip is a single conditional `UPDATE … WHERE status = 'scheduled'` in Postgres.
 * Payload's `update({ where })` is not used for this: it finds matching documents first and
 * then updates them by id, so two concurrent dispatcher runs could both find — and both
 * publish — the same post. Only the run whose UPDATE changed the row continues; any other
 * gets `skipped`. The raw update skips collection hooks, so readiness is re-checked and the
 * cache revalidated here.
 *
 * Any error marks the post `failed` with the message in `publishError`.
 */
export async function publishPost(postId: number, now = new Date()): Promise<PublishResult> {
  const payload = await getPayloadClient()

  try {
    const post = await payload.findByID({ collection: 'posts', id: postId, depth: 0 })
    if (post.status !== 'scheduled') return { status: 'skipped', postId }

    const { ready, missing } = getReadiness(post)
    if (!ready) throw new Error(`Post is not ready to publish; missing ${missing.join(', ')}`)

    const db = payload.db as unknown as PostgresAdapter
    const timestamp = now.toISOString()
    const claimed = await db.drizzle.execute(sql`
      UPDATE "posts"
      SET "status" = 'published', "published_at" = ${timestamp}, "updated_at" = ${timestamp}, "publish_error" = NULL
      WHERE "id" = ${postId} AND "status" = 'scheduled'
      RETURNING "id"`)
    if (claimed.rows.length === 0) return { status: 'skipped', postId }

    const domain = await payload.findByID({ collection: 'domains', id: idOf(post.domain), depth: 0 })
    revalidatePostChange(post)
    return { status: 'published', postId, url: postUrl(domain, post.slug), domain }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    payload.logger.error({ err: error, postId }, 'Publishing failed')
    try {
      await payload.update({ collection: 'posts', id: postId, data: { status: 'failed', publishError: message } })
    } catch (markError) {
      payload.logger.error({ err: markError, postId }, 'Could not mark post as failed')
    }
    return { status: 'failed', postId, error: message }
  }
}
