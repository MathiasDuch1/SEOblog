import 'server-only'

import { mockProductSource } from './mock'
import type { ProductSource } from './types'
import type { Domain } from '@/payload-types'

export type { Product, ProductSource } from './types'

/** Picks the product source configured on a domain (`domain.affiliate.source`). */
export function getProductSource(domain: Domain): ProductSource {
  const source = domain.affiliate?.source
  switch (source) {
    case 'mock':
      return mockProductSource
    default:
      // Real networks are added here once one is chosen (see the decision table in
      // docs/build-guide/00-overview.md).
      throw new Error(`Domain ${domain.hostname} uses unknown affiliate source "${source ?? ''}"`)
  }
}
