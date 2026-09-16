import 'server-only'

import { unstable_cache } from 'next/cache'

import type { Page } from '@/payload-types'

import { cacheTags } from './cache/tags'
import { getPublicPayload } from './public-payload'

/** Slug → id for one domain's pages; tagged with the domain's list like the post map is. */
function getPageIdBySlug(domainId: number, slug: string) {
  return unstable_cache(
    async () => {
      const payload = await getPublicPayload()
      const result = await payload.find({
        collection: 'pages',
        where: { and: [{ domain: { equals: domainId } }, { slug: { equals: slug } }] },
        limit: 1,
        depth: 0,
      })
      return (result.docs[0]?.id as number | undefined) ?? null
    },
    ['page-id-by-slug', String(domainId), slug],
    { tags: [cacheTags.postList(domainId)] },
  )()
}

function getPageById(pageId: number) {
  return unstable_cache(
    async () => {
      const payload = await getPublicPayload()
      try {
        return await payload.findByID({ collection: 'pages', id: pageId, depth: 1 })
      } catch {
        return null
      }
    },
    ['page-by-id', String(pageId)],
    { tags: [cacheTags.page(pageId)] },
  )()
}

/** A published legal/static page on this domain, or `null`. */
export async function getPageBySlug(domainId: number, slug: string): Promise<Page | null> {
  const pageId = await getPageIdBySlug(domainId, slug)
  if (!pageId) return null
  return getPageById(pageId)
}

/** The domain's published pages, for the footer. */
export function getFooterPages(domainId: number) {
  return unstable_cache(
    async () => {
      const payload = await getPublicPayload()
      const result = await payload.find({
        collection: 'pages',
        where: { domain: { equals: domainId } },
        sort: 'type',
        limit: 20,
        depth: 0,
      })
      return result.docs.map((page) => ({
        slug: page.slug,
        title: page.title,
        type: page.type,
      }))
    },
    ['footer-pages', String(domainId)],
    { tags: [cacheTags.postList(domainId)] },
  )()
}
