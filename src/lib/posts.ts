import 'server-only'

import { unstable_cache } from 'next/cache'

import type { Post } from '@/payload-types'

import { cacheTags } from './cache/tags'
import { getPublicPayload } from './public-payload'

/**
 * Posts per page on the front page. Small on purpose: it keeps the first screen light and
 * makes pagination reachable with the seeded content.
 */
export const POSTS_PER_PAGE = 4

export type PostListItem = Pick<
  Post,
  'id' | 'slug' | 'title' | 'intro' | 'publishedAt' | 'featuredImage' | 'template' | 'meta'
>

/** One page of a domain's published posts, newest first. */
export function getPublishedPosts(domainId: number, page: number) {
  return unstable_cache(
    async () => {
      const payload = await getPublicPayload()
      const result = await payload.find({
        collection: 'posts',
        where: { domain: { equals: domainId } },
        sort: '-publishedAt',
        limit: POSTS_PER_PAGE,
        page,
        depth: 1,
      })
      return {
        docs: result.docs as PostListItem[],
        page: result.page ?? 1,
        totalPages: result.totalPages,
        totalDocs: result.totalDocs,
      }
    },
    ['published-posts', String(domainId), String(page)],
    { tags: [cacheTags.postList(domainId)] },
  )()
}

/**
 * Slug → id for one domain. Split from the document read so each cache entry can carry the
 * tag the contract gives it: the map belongs to the domain's list, the document to itself.
 */
function getPostIdBySlug(domainId: number, slug: string) {
  return unstable_cache(
    async () => {
      const payload = await getPublicPayload()
      const result = await payload.find({
        collection: 'posts',
        where: { and: [{ domain: { equals: domainId } }, { slug: { equals: slug } }] },
        limit: 1,
        depth: 0,
      })
      return (result.docs[0]?.id as number | undefined) ?? null
    },
    ['post-id-by-slug', String(domainId), slug],
    { tags: [cacheTags.postList(domainId)] },
  )()
}

function getPostById(postId: number) {
  return unstable_cache(
    async () => {
      const payload = await getPublicPayload()
      try {
        return await payload.findByID({ collection: 'posts', id: postId, depth: 1 })
      } catch {
        return null
      }
    },
    ['post-by-id', String(postId)],
    { tags: [cacheTags.post(postId)] },
  )()
}

/** A published post on this domain, or `null`. Drafts and scheduled posts are never returned. */
export async function getPostBySlug(domainId: number, slug: string): Promise<Post | null> {
  const postId = await getPostIdBySlug(domainId, slug)
  if (!postId) return null
  return getPostById(postId)
}
