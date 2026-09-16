import Image from 'next/image'

import type { Dictionary } from '@/lib/i18n'
import { formatDate } from '@/lib/i18n'
import type { Media, Post } from '@/payload-types'

/** Hero image. Renders nothing when a post has none — hero generation is deferred (phase 03). */
export function FeaturedImage({ post }: { post: Post }) {
  const image = typeof post.featuredImage === 'object' ? (post.featuredImage as Media) : null
  if (!image?.url) return null

  return (
    <Image
      src={image.url}
      alt={image.alt ?? ''}
      width={image.width ?? 1200}
      height={image.height ?? 630}
      sizes="(max-width: 768px) 100vw, 768px"
      priority
      className="mt-6 aspect-[1200/630] w-full rounded-lg object-cover"
    />
  )
}

export function PostHeader({
  post,
  locale,
  dictionary,
}: {
  post: Post
  locale: string
  dictionary: Dictionary
}) {
  return (
    <header>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{post.title}</h1>
      {post.publishedAt ? (
        <p className="mt-3 text-sm text-foreground/60">
          {dictionary.post.publishedOn}{' '}
          <time dateTime={post.publishedAt}>{formatDate(post.publishedAt, locale)}</time>
        </p>
      ) : null}
    </header>
  )
}

export function Intro({ post }: { post: Post }) {
  if (!post.intro) return null
  return <p className="mt-8 text-lg leading-relaxed text-foreground/85">{post.intro}</p>
}

export function Summary({ post, dictionary }: { post: Post; dictionary: Dictionary }) {
  if (!post.summary) return null
  return (
    <section className="mt-12 rounded-lg border border-black/10 bg-black/[0.02] p-6">
      <h2 className="text-lg font-semibold">{dictionary.post.summaryHeading}</h2>
      <p className="mt-2 text-foreground/85">{post.summary}</p>
    </section>
  )
}

/** The affiliate disclosure, shown near the top of any page carrying affiliate links. */
export function AffiliateDisclosure({ dictionary }: { dictionary: Dictionary }) {
  return (
    <p className="mt-6 rounded border border-accent/40 bg-accent/5 px-4 py-3 text-sm text-foreground/75">
      {dictionary.footer.disclosure}
    </p>
  )
}
