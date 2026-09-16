import 'server-only'

import type { Payload } from 'payload'

import { getPayloadClient } from './payload'

/**
 * Payload client for anything a visitor can see.
 *
 * The Local API skips access control by default (`overrideAccess: true`), so a plain
 * `payload.find({ collection: 'posts' })` in a page would return drafts and scheduled posts.
 * This client forces access control back on and runs every query as an anonymous visitor,
 * so `posts` read access narrows results to `status: 'published'`.
 *
 * The flags are applied last, so callers cannot override them.
 *
 * Public pages use this. Trusted server work that must see unpublished content — the generation
 * pipeline, the publish dispatcher, draft preview — uses `getPayloadClient()` directly.
 */
export async function getPublicPayload(): Promise<Pick<Payload, 'count' | 'find' | 'findByID'>> {
  const payload = await getPayloadClient()

  const asVisitor = <T extends object>(args: T) => ({ ...args, overrideAccess: false, user: null })

  return {
    find: ((args: Parameters<Payload['find']>[0]) => payload.find(asVisitor(args))) as Payload['find'],
    findByID: ((args: Parameters<Payload['findByID']>[0]) =>
      payload.findByID(asVisitor(args))) as Payload['findByID'],
    count: ((args: Parameters<Payload['count']>[0]) => payload.count(asVisitor(args))) as Payload['count'],
  }
}
