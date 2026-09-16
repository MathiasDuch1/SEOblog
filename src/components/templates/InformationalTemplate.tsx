import { RichText } from '@payloadcms/richtext-lexical/react'

import type { Dictionary } from '@/lib/i18n'
import type { Domain, Post } from '@/payload-types'

import { buildConverters } from './richTextConverters'
import { FeaturedImage, Intro, PostHeader, Summary } from './shared'

/**
 * Spec §2 template B. `RichText` renders as a Server Component, so no client boundary is needed.
 * Like the listicle template it takes props only, so preview can reuse it.
 */
export function InformationalTemplate({
  post,
  domain,
  dictionary,
}: {
  post: Post
  domain: Domain
  dictionary: Dictionary
}) {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12">
      <PostHeader post={post} locale={domain.locale} dictionary={dictionary} />
      <FeaturedImage post={post} />
      <Intro post={post} />

      {post.body ? (
        <div className="prose prose-zinc mt-10 max-w-none prose-a:text-primary">
          <RichText data={post.body} converters={buildConverters(domain.hostname)} disableContainer />
        </div>
      ) : null}

      <Summary post={post} dictionary={dictionary} />
    </article>
  )
}
