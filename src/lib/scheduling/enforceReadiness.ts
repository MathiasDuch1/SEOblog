import { ValidationError } from 'payload'
import type { CollectionBeforeChangeHook } from 'payload'

import type { Post } from '@/payload-types'

import { getReadiness } from '../generation/readiness'

/**
 * Posts `beforeChange` hook: a post can only be `scheduled` or `published` while
 * `getReadiness` reports it ready. This runs on every save, so an editor also can't empty a
 * required field on a post that is already scheduled or live.
 *
 * No `server-only` import: collection configs are loaded by the Payload CLI too.
 */
export const enforceReadiness: CollectionBeforeChangeHook<Post> = ({ collection, data, originalDoc, req }) => {
  const status = data.status ?? originalDoc?.status
  if (status !== 'scheduled' && status !== 'published') return data

  const merged = { ...originalDoc, ...data } as Post
  const errors: { message: string; path: string }[] = getReadiness(merged).missing.map((path) => ({
    path,
    message: `${path} is required before a post can be ${status}`,
  }))

  if (status === 'scheduled' && !merged.scheduledAt) {
    errors.push({ path: 'scheduledAt', message: 'scheduledAt is required before a post can be scheduled' })
  }

  if (errors.length > 0) {
    throw new ValidationError({ collection: collection.slug, errors, req })
  }

  if (status === 'published' && !merged.publishedAt) {
    data.publishedAt = new Date().toISOString()
  }

  return data
}
