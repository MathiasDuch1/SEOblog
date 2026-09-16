import { Suspense } from 'react'

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { JsonLd } from '@/components/JsonLd'

import { Pagination } from '@/components/Pagination'
import { PostCard } from '@/components/PostCard'
import { getDomainByHostname } from '@/lib/domains'
import { getDictionary } from '@/lib/i18n'
import type { Dictionary } from '@/lib/i18n'
import { getPublishedPosts } from '@/lib/posts'
import { buildMetadata } from '@/lib/seo'
import { frontPageJsonLd } from '@/lib/structured-data'
import type { Domain } from '@/payload-types'

function ListSkeleton() {
  return (
    <div className="grid gap-12 sm:grid-cols-2" role="status" aria-live="polite">
      {[0, 1].map((index) => (
        <div key={index}>
          <div className="aspect-[1200/630] w-full animate-pulse rounded-lg bg-black/10" />
          <div className="mt-4 h-6 w-3/4 animate-pulse rounded bg-black/10" />
          <div className="mt-2 h-4 w-full animate-pulse rounded bg-black/10" />
        </div>
      ))}
    </div>
  )
}

async function PostList({
  domain,
  dictionary,
  page,
}: {
  domain: Domain
  dictionary: Dictionary
  page: number
}) {
  const { docs, totalPages, page: currentPage } = await getPublishedPosts(domain.id, page)

  if (docs.length === 0) {
    return <p className="text-foreground/70">{dictionary.notFound.body}</p>
  }

  return (
    <>
      <div className="grid gap-12 sm:grid-cols-2">
        {docs.map((post, index) => (
          <PostCard
            key={post.id}
            post={post}
            locale={domain.locale}
            dictionary={dictionary}
            priority={index === 0}
          />
        ))}
      </div>
      <Pagination page={currentPage} totalPages={totalPages} dictionary={dictionary} />
    </>
  )
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ host: string }>
}): Promise<Metadata> {
  const { host } = await params
  const domain = await getDomainByHostname(host)
  if (!domain) return {}

  return buildMetadata({
    domain,
    doc: { title: domain.name, meta: { title: domain.name } },
    path: '',
  })
}

/**
 * The domain is resolved before anything streams, so an unknown hostname still produces a
 * real 404 status. Only the post list is wrapped in `<Suspense>` — see the note in
 * `layout.tsx` about why there is no `loading.tsx`.
 */
export default async function FrontPage({
  params,
  searchParams,
}: {
  params: Promise<{ host: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const { host } = await params
  const domain = await getDomainByHostname(host)
  if (!domain) notFound()

  const dictionary = getDictionary(domain.locale)
  const requestedPage = Number((await searchParams).page ?? '1')
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-12">
      <JsonLd data={frontPageJsonLd(domain)} />
      <h1 className="text-3xl font-semibold tracking-tight text-primary">{domain.name}</h1>
      <div className="mt-10">
        <Suspense fallback={<ListSkeleton />}>
          <PostList domain={domain} dictionary={dictionary} page={page} />
        </Suspense>
      </div>
    </main>
  )
}
