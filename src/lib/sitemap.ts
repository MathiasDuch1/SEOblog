import 'server-only'

import { unstable_cache } from 'next/cache'

import type { Domain } from '@/payload-types'

import { cacheTags } from './cache/tags'
import { getPublicPayload } from './public-payload'
import { postUrl, siteOrigin } from './urls'

/**
 * Sitemaps stay under the protocol's 50,000-URL limit by splitting into chunks once a
 * domain has more URLs than this. Configurable so the split can be exercised locally.
 */
export const SITEMAP_CHUNK_SIZE = Number(process.env.SITEMAP_CHUNK_SIZE ?? '45000')

export type SitemapEntry = { loc: string; lastmod: string }

/** Every published post and page on the domain. Anonymous access control hides the rest. */
export function getSitemapEntries(domain: Domain) {
  return unstable_cache(
    async (): Promise<SitemapEntry[]> => {
      const payload = await getPublicPayload()
      const [posts, pages] = await Promise.all([
        payload.find({
          collection: 'posts',
          where: { domain: { equals: domain.id } },
          sort: '-publishedAt',
          pagination: false,
          limit: 0,
          depth: 0,
        }),
        payload.find({
          collection: 'pages',
          where: { domain: { equals: domain.id } },
          sort: 'slug',
          pagination: false,
          limit: 0,
          depth: 0,
        }),
      ])

      return [
        { loc: siteOrigin(domain), lastmod: new Date().toISOString() },
        ...posts.docs.map((post) => ({
          loc: postUrl(domain, post.slug),
          lastmod: post.updatedAt,
        })),
        ...pages.docs.map((page) => ({
          loc: postUrl(domain, page.slug),
          lastmod: page.updatedAt,
        })),
      ]
    },
    ['sitemap-entries', String(domain.id)],
    { tags: [cacheTags.sitemap(domain.id)] },
  )()
}

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function urlSetXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map(
      (entry) =>
        `  <url><loc>${escapeXml(entry.loc)}</loc><lastmod>${escapeXml(entry.lastmod)}</lastmod></url>`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`
}

export function sitemapIndexXml(domain: Domain, chunkCount: number): string {
  const sitemaps = Array.from({ length: chunkCount }, (_, index) => {
    const loc = `${siteOrigin(domain)}/sitemaps/${index + 1}.xml`
    return `  <sitemap><loc>${escapeXml(loc)}</loc></sitemap>`
  }).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemaps}\n</sitemapindex>`
}

export const xmlResponse = (body: string) =>
  new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } })
