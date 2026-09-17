import { revalidateTag } from 'next/cache'

import { cacheTags } from './tags'

/**
 * Revalidation for content changes, built on the tag contract in `tags.ts`.
 *
 * Every call uses `{ expire: 0 }`, not `'max'`: the slug → id lookups are cached under
 * `postList(domainId)`, so with stale-while-revalidate the first request after publishing
 * would still be served the cached "no such slug" and 404. Expiring means the very next
 * request renders fresh. Traffic per URL is low, so the extra blocking render is cheap.
 *
 * No `server-only` import: collection hooks call these, and collection configs are loaded by
 * the Payload CLI and seed script as well. Outside a Next.js request (CLI, seed) there is no
 * cache to revalidate, `revalidateTag` throws, and the call is skipped — the dispatcher or the
 * next deploy covers it.
 */

type IdOrDoc = number | { id: number } | null | undefined

type Revalidatable = {
  id: number
  domain?: IdOrDoc
  slug?: string | null
}

const idOf = (value: IdOrDoc) => (typeof value === 'object' && value !== null ? value.id : (value ?? undefined))

function expire(tags: Iterable<string>): void {
  try {
    for (const tag of tags) revalidateTag(tag, { expire: 0 })
  } catch (error) {
    // Not inside a Next.js request: nothing is cached here. Anything else is a real failure.
    if (!(error instanceof Error && error.message.includes('static generation store missing'))) throw error
  }
}

function domainTags(domainId: number | undefined): string[] {
  return domainId === undefined
    ? []
    : [cacheTags.postList(domainId), cacheTags.sitemap(domainId), cacheTags.redirects(domainId)]
}

function revalidateDocument(documentTag: string, doc: Revalidatable, previous?: Revalidatable | null): void {
  const tags = new Set([documentTag, ...domainTags(idOf(doc.domain))])
  // A move to another domain also changes the old domain's lists and sitemap. A slug change
  // is covered by the domain tags, which hold the slug → id lookups and redirects.
  if (previous) for (const tag of domainTags(idOf(previous.domain))) tags.add(tag)
  expire(tags)
}

export function revalidatePostChange(post: Revalidatable, previous?: Revalidatable | null): void {
  revalidateDocument(cacheTags.post(post.id), post, previous)
}

export function revalidatePageChange(page: Revalidatable, previous?: Revalidatable | null): void {
  revalidateDocument(cacheTags.page(page.id), page, previous)
}

export function revalidateDomainChange(
  domain: { id: number; hostname: string },
  previous?: { hostname: string } | null,
): void {
  const tags = new Set([cacheTags.domain(domain.hostname), ...domainTags(domain.id)])
  if (previous && previous.hostname !== domain.hostname) tags.add(cacheTags.domain(previous.hostname))
  expire(tags)
}

export function revalidateRedirectsChange(...domainIds: (number | undefined)[]): void {
  expire(new Set(domainIds.filter((id) => id !== undefined).map((id) => cacheTags.redirects(id))))
}
