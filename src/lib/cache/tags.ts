/**
 * The cache tag contract. Every cached read in the frontend tags its entry with one of
 * these builders, and phase 04's publish dispatcher revalidates the same tags — so this
 * file is the single place that decides what "the same data" means.
 *
 * Mechanism: `unstable_cache` from `next/cache`, not `'use cache'` + `cacheComponents`.
 * `cacheComponents` is an app-wide flag, and the Payload admin under `(payload)/` reads
 * cookies and headers without declaring itself dynamic, so enabling it breaks `/admin` at
 * build time. `unstable_cache` is still supported in Next 16 and needs no global flag.
 * If Payload gains Cache Components support, this file and its callers are what change.
 *
 * Revalidation always uses the two-argument form — `revalidateTag(tag, profile)` — because
 * the single-argument form is deprecated in Next 16. Use `'max'` when serving stale content
 * during a background refresh is fine, and `{ expire: 0 }` when the next request must already
 * see the new data (publishing, slug changes).
 */

export const cacheTags = {
  /** One domain's config, keyed by hostname (no port). */
  domain: (hostname: string) => `domain:${hostname}`,
  /** A single post document. */
  post: (postId: number | string) => `post:${postId}`,
  /** A single legal/static page document. */
  page: (pageId: number | string) => `page:${pageId}`,
  /** Any listing of a domain's posts — front page, pagination, related lists. */
  postList: (domainId: number | string) => `post-list:${domainId}`,
  /** One domain's sitemap, including its chunks. */
  sitemap: (domainId: number | string) => `sitemap:${domainId}`,
  /** One domain's slug redirects (phase 04). */
  redirects: (domainId: number | string) => `redirects:${domainId}`,
} as const

export type CacheTag = ReturnType<(typeof cacheTags)[keyof typeof cacheTags]>
