import type { Post } from '@/payload-types'

export type Readiness = {
  ready: boolean
  /** Field paths that are missing or empty, e.g. `summary` or `products.2.affiliateUrl`. */
  missing: string[]
}

type ReadinessInput = Pick<Post, 'template' | 'slug' | 'intro' | 'summary' | 'meta' | 'products' | 'body'>

const isBlank = (value: unknown) => typeof value !== 'string' || value.trim() === ''

type LexicalNode = { text?: unknown; children?: LexicalNode[] }

function hasText(node: LexicalNode | undefined): boolean {
  if (!node) return false
  if (typeof node.text === 'string' && node.text.trim() !== '') return true
  return (node.children ?? []).some(hasText)
}

/**
 * Whether a post has everything it needs to be scheduled or published. `featuredImage` is
 * deliberately not required while hero images are deferred (see the decision table in
 * docs/build-guide/00-overview.md).
 */
export function getReadiness(post: ReadinessInput): Readiness {
  const missing: string[] = []

  if (isBlank(post.slug)) missing.push('slug')
  if (isBlank(post.intro)) missing.push('intro')
  if (isBlank(post.summary)) missing.push('summary')
  if (isBlank(post.meta?.title)) missing.push('meta.title')
  if (isBlank(post.meta?.description)) missing.push('meta.description')

  if (post.template === 'listicle') {
    const products = post.products ?? []
    if (products.length === 0) missing.push('products')
    products.forEach((product, index) => {
      for (const field of ['title', 'affiliateUrl', 'imageUrl'] as const) {
        if (isBlank(product[field])) missing.push(`products.${index}.${field}`)
      }
    })
  } else if (!hasText(post.body?.root as LexicalNode | undefined)) {
    missing.push('body')
  }

  return { ready: missing.length === 0, missing }
}
