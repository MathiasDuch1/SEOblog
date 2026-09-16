import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { JsonLd } from '@/components/JsonLd'

import { InformationalTemplate } from '@/components/templates/InformationalTemplate'
import { ListicleTemplate } from '@/components/templates/ListicleTemplate'
import { StaticPage } from '@/components/templates/StaticPage'
import { getDomainByHostname } from '@/lib/domains'
import { getDictionary } from '@/lib/i18n'
import { getPageBySlug } from '@/lib/pages'
import { getPostBySlug } from '@/lib/posts'
import { buildMetadata } from '@/lib/seo'
import { pageJsonLd, postJsonLd } from '@/lib/structured-data'

/**
 * One public URL per document: `https://{hostname}/{slug}`, with no locale segment.
 * A slug resolves to a post first, then to a legal/static page, then 404s.
 *
 * Everything is resolved before rendering starts, so a missing slug returns a real 404
 * status rather than a streamed 200 (see the note in `[host]/layout.tsx`).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ host: string; slug: string }>
}): Promise<Metadata> {
  const { host, slug } = await params
  const domain = await getDomainByHostname(host)
  if (!domain) return {}

  const doc = (await getPostBySlug(domain.id, slug)) ?? (await getPageBySlug(domain.id, slug))
  if (!doc) return {}

  return buildMetadata({ domain, doc, path: `/${slug}` })
}

export default async function ContentPage({
  params,
}: {
  params: Promise<{ host: string; slug: string }>
}) {
  const { host, slug } = await params
  const domain = await getDomainByHostname(host)
  if (!domain) notFound()

  const dictionary = getDictionary(domain.locale)
  const post = await getPostBySlug(domain.id, slug)

  if (!post) {
    const page = await getPageBySlug(domain.id, slug)
    if (!page) notFound()
    return (
      <>
        <JsonLd data={pageJsonLd(page, domain)} />
        <StaticPage page={page} domain={domain} />
      </>
    )
  }

  return (
    <>
      <JsonLd data={postJsonLd(post, domain)} />
      {post.template === 'listicle' ? (
        <ListicleTemplate post={post} domain={domain} dictionary={dictionary} />
      ) : (
        <InformationalTemplate post={post} domain={domain} dictionary={dictionary} />
      )}
    </>
  )
}
