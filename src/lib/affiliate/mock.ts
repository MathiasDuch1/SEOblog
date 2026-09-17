import { createHash } from 'crypto'

import type { FindProductsInput, Product, ProductSource } from './types'

/**
 * Deterministic fake products for local development and tests: the same keywords always
 * return the same products. URLs point at the domain's configured marketplace with its
 * partner tag, so per-country routing is testable without real feed access. Prices are
 * omitted — they are not displayed until an affiliate network's terms allow it.
 */
export const mockProductSource: ProductSource = {
  async findProducts({ keywords, domain, limit }: FindProductsInput): Promise<Product[]> {
    const marketplace = domain.affiliate?.marketplace
    if (!marketplace) throw new Error(`Domain ${domain.hostname} has no affiliate marketplace configured`)
    const tag = domain.affiliate?.partnerTag

    const primary = keywords[0] ?? 'product'
    return Array.from({ length: limit }, (_, index) => {
      const hash = createHash('sha256').update(`${marketplace}|${keywords.join('|')}|${index}`).digest('hex')
      const asin = `B0${hash.slice(0, 8).toUpperCase()}`
      const url = new URL(`https://www.${marketplace}/dp/${asin}`)
      if (tag) url.searchParams.set('tag', tag)
      return {
        id: `p${index + 1}`,
        title: `${primary} — mock product ${index + 1} (${asin})`,
        imageUrl: `https://picsum.photos/seed/${hash.slice(0, 12)}/800/800`,
        affiliateUrl: url.toString(),
      }
    })
  },
}
