import type { Metadata } from 'next'

import { ogLocaleOf } from './locales'
import { siteOrigin } from './urls'

import type { Domain, Media } from '@/payload-types'

type SeoDoc = {
  title?: string | null
  meta?: {
    title?: string | null
    description?: string | null
    image?: number | Media | null
  } | null
}

function metaImageUrl(doc: SeoDoc): string | null {
  const image = doc.meta?.image
  return typeof image === 'object' && image?.url ? image.url : null
}

/**
 * Page metadata from the Payload SEO plugin's stored `meta` fields. Titles and descriptions
 * are never hand-built in JSX, and absolute URLs only ever come from `src/lib/urls.ts`.
 *
 * There are no `hreflang` alternates: each article exists on exactly one domain, in one
 * language, so there is no alternate version to point at.
 */
export function buildMetadata({
  domain,
  doc,
  path,
}: {
  domain: Domain
  doc: SeoDoc
  /** Path with a leading slash, or '' for the front page. */
  path: string
}): Metadata {
  const canonical = `${siteOrigin(domain)}${path}`
  const title = doc.meta?.title || doc.title || domain.name
  const description = doc.meta?.description || undefined
  const image = metaImageUrl(doc)

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: domain.name,
      locale: ogLocaleOf(domain.locale),
      type: path === '' ? 'website' : 'article',
      ...(image ? { images: [{ url: image }] } : {}),
    },
  }
}
