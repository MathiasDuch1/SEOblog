import { RichText } from '@payloadcms/richtext-lexical/react'

import type { Domain, Page } from '@/payload-types'

import { buildConverters } from './richTextConverters'

/** Legal and static pages: prose only, no hero image and no affiliate blocks. */
export function StaticPage({ page, domain }: { page: Page; domain: Domain }) {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">{page.title}</h1>
      {page.body ? (
        <div className="prose prose-zinc mt-8 max-w-none prose-a:text-primary">
          <RichText data={page.body} converters={buildConverters(domain.hostname)} disableContainer />
        </div>
      ) : null}
    </article>
  )
}
