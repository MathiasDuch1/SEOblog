import Image from 'next/image'
import Link from 'next/link'

import type { Dictionary } from '@/lib/i18n'
import { formatDate } from '@/lib/i18n'
import type { PostListItem } from '@/lib/posts'
import type { Media } from '@/payload-types'

function excerpt(text: string | null | undefined, max = 160): string {
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

export function PostCard({
  post,
  locale,
  dictionary,
  priority = false,
}: {
  post: PostListItem
  locale: string
  dictionary: Dictionary
  priority?: boolean
}) {
  const image = typeof post.featuredImage === 'object' ? (post.featuredImage as Media) : null
  const heading = post.meta?.title || post.title || post.slug

  return (
    <article className="group">
      <Link href={`/${post.slug}`} className="block">
        {image?.url ? (
          <Image
            src={image.url}
            alt={image.alt ?? ''}
            width={image.width ?? 1200}
            height={image.height ?? 630}
            sizes="(max-width: 768px) 100vw, 640px"
            priority={priority}
            className="aspect-[1200/630] w-full rounded-lg object-cover"
          />
        ) : null}
        <h2 className="mt-4 text-xl font-semibold group-hover:text-primary">{heading}</h2>
      </Link>
      {post.publishedAt ? (
        <p className="mt-1 text-sm text-foreground/60">
          {dictionary.post.publishedOn}{' '}
          <time dateTime={post.publishedAt}>{formatDate(post.publishedAt, locale)}</time>
        </p>
      ) : null}
      <p className="mt-2 text-foreground/80">{excerpt(post.intro)}</p>
      <Link href={`/${post.slug}`} className="mt-2 inline-block text-sm font-medium text-primary">
        {dictionary.post.readMore}
      </Link>
    </article>
  )
}
