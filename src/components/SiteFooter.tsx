import Link from 'next/link'

import type { Dictionary, PageType } from '@/lib/i18n'
import type { Domain } from '@/payload-types'

export type FooterLink = { slug: string; title: string; type: PageType }

/**
 * Footer for every domain: the affiliate disclosure in the domain's language, that domain's
 * published legal pages, and the year. Legal pages are passed in — the footer never fetches.
 */
export function SiteFooter({
  domain,
  dictionary,
  pages,
}: {
  domain: Domain
  dictionary: Dictionary
  pages: FooterLink[]
}) {
  return (
    <footer className="mt-16 border-t border-black/10 bg-black/[0.02]">
      <div className="mx-auto w-full max-w-5xl px-4 py-10 text-sm">
        <p className="max-w-2xl text-foreground/70">{dictionary.footer.disclosure}</p>

        {pages.length > 0 ? (
          <nav aria-label={dictionary.nav.menu} className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
            {pages.map((page) => (
              <Link key={page.slug} href={`/${page.slug}`} className="hover:text-primary">
                {page.title}
              </Link>
            ))}
          </nav>
        ) : null}

        <p className="mt-6 text-foreground/60">
          © {new Date().getFullYear()} {domain.name}. {dictionary.footer.rights}
        </p>
      </div>
    </footer>
  )
}
