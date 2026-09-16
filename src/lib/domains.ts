import 'server-only'

import { unstable_cache } from 'next/cache'

import type { Domain } from '@/payload-types'

import { cacheTags } from './cache/tags'
import { getPublicPayload } from './public-payload'

/** `Alpha.localhost:3000` → `alpha.localhost`. Hostnames are stored lowercase and portless. */
export function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().split(':')[0]
}

/**
 * The domain serving this request, or `null` if the hostname belongs to no domain.
 *
 * `www` → apex redirects are handled at the DNS/hosting layer in phase 07, not here.
 */
export async function getDomainByHostname(hostname: string): Promise<Domain | null> {
  const normalized = normalizeHostname(hostname)
  if (!normalized) return null

  return unstable_cache(
    async () => {
      const payload = await getPublicPayload()
      const result = await payload.find({
        collection: 'domains',
        where: { hostname: { equals: normalized } },
        limit: 1,
        depth: 1,
      })
      return result.docs[0] ?? null
    },
    ['domain-by-hostname', normalized],
    { tags: [cacheTags.domain(normalized)] },
  )()
}
