import 'server-only'

import { unstable_cache } from 'next/cache'

import { cacheTags } from '../cache/tags'
import { getPublicPayload } from '../public-payload'

/**
 * Where `/{slug}` on this domain permanently redirects to, or `null`. Only custom-URL
 * redirects are followed; slug-change redirects are always stored that way.
 */
export function getRedirectTarget(domainId: number, slug: string): Promise<string | null> {
  return unstable_cache(
    async () => {
      const payload = await getPublicPayload()
      const result = await payload.find({
        collection: 'redirects',
        where: { and: [{ domain: { equals: domainId } }, { from: { equals: `/${slug}` } }] },
        limit: 1,
        depth: 0,
      })
      const redirect = result.docs[0]
      return redirect?.to?.type === 'custom' && redirect.to.url ? redirect.to.url : null
    },
    ['redirect-target', String(domainId), slug],
    { tags: [cacheTags.redirects(domainId)] },
  )()
}
