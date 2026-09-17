import type { Domain } from '@/payload-types'

/** A product from a domain's affiliate marketplace, with the partner tag already applied. */
export type Product = {
  id: string
  title: string
  imageUrl: string
  affiliateUrl: string
  price?: number
  currency?: string
}

export type FindProductsInput = {
  keywords: string[]
  domain: Domain
  limit: number
}

/**
 * Finds products for keywords in **one domain's** country marketplace. Product images always
 * come from the source — they are never generated.
 */
export interface ProductSource {
  findProducts(input: FindProductsInput): Promise<Product[]>
}
