import { postUrl, siteOrigin } from './urls'

import type { Domain, Media, Page, Post } from '@/payload-types'

function imageUrl(value: unknown): string | undefined {
  return typeof value === 'object' && value !== null && 'url' in value
    ? ((value as Media).url ?? undefined)
    : undefined
}

/**
 * `Article` for every post, plus an `ItemList` of the products on a listicle.
 *
 * Deliberately no `Product` schema: we do not hold verified prices, availability, or
 * ratings for these items, and inventing them is a structured-data policy violation.
 */
export function postJsonLd(post: Post, domain: Domain): object[] {
  const url = postUrl(domain, post.slug)
  const article = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.meta?.description || post.intro || undefined,
    image: imageUrl(post.featuredImage),
    inLanguage: domain.locale,
    datePublished: post.publishedAt ?? undefined,
    dateModified: post.updatedAt,
    mainEntityOfPage: url,
    url,
    publisher: { '@type': 'Organization', name: domain.name, url: siteOrigin(domain) },
  }

  const products = post.products ?? []
  if (post.template !== 'listicle' || products.length === 0) return [article]

  return [
    article,
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: post.title,
      inLanguage: domain.locale,
      itemListElement: products.map((product, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: product.title,
        url: product.affiliateUrl,
      })),
    },
  ]
}

export function pageJsonLd(page: Page, domain: Domain): object[] {
  const url = postUrl(domain, page.slug)
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: page.title,
      description: page.meta?.description || undefined,
      inLanguage: domain.locale,
      url,
      publisher: { '@type': 'Organization', name: domain.name, url: siteOrigin(domain) },
    },
  ]
}

export function frontPageJsonLd(domain: Domain): object[] {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: domain.name,
      inLanguage: domain.locale,
      url: siteOrigin(domain),
    },
  ]
}
