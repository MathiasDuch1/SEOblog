import Image from 'next/image'

import type { Dictionary } from '@/lib/i18n'
import type { Domain, Post } from '@/payload-types'

import { AffiliateDisclosure, FeaturedImage, Intro, PostHeader, Summary } from './shared'

/**
 * Spec §2 template A. Takes the post and its domain as props and never fetches, so phase
 * 06's draft preview can render exactly what the public route renders.
 */
export function ListicleTemplate({
  post,
  domain,
  dictionary,
}: {
  post: Post
  domain: Domain
  dictionary: Dictionary
}) {
  const products = post.products ?? []

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12">
      <PostHeader post={post} locale={domain.locale} dictionary={dictionary} />
      <AffiliateDisclosure dictionary={dictionary} />
      <FeaturedImage post={post} />
      <Intro post={post} />

      {products.length > 0 ? (
        <section className="mt-12">
          <h2 className="sr-only">{dictionary.post.productsHeading}</h2>
          <ol className="space-y-12">
            {products.map((product, index) => (
              <li key={product.id ?? index} className="border-t border-black/10 pt-8">
                <h3 className="text-xl font-semibold">
                  <span className="text-primary">{index + 1}.</span> {product.title}
                </h3>
                {product.imageUrl ? (
                  <Image
                    src={product.imageUrl}
                    alt={product.title}
                    width={800}
                    height={800}
                    sizes="(max-width: 640px) 100vw, 320px"
                    className="mt-4 h-auto w-full max-w-xs rounded-lg object-cover"
                  />
                ) : null}
                {product.description ? (
                  <p className="mt-4 text-foreground/85">{product.description}</p>
                ) : null}
                <a
                  href={product.affiliateUrl}
                  rel="sponsored nofollow noopener"
                  target="_blank"
                  className="mt-5 inline-block rounded-md bg-primary px-5 py-2.5 font-medium text-white"
                >
                  {dictionary.post.buyNow}
                </a>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <Summary post={post} dictionary={dictionary} />
    </article>
  )
}
