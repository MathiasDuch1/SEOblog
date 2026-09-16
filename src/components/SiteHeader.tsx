import Image from 'next/image'
import Link from 'next/link'

import type { Dictionary } from '@/lib/i18n'
import type { Domain, Media } from '@/payload-types'

/**
 * Header for every domain. There is no language switcher — a domain publishes in exactly
 * one language. The mobile menu is a `<details>` element, so the header needs no JavaScript.
 */
export function SiteHeader({ domain, dictionary }: { domain: Domain; dictionary: Dictionary }) {
  const logo = typeof domain.branding?.logo === 'object' ? (domain.branding.logo as Media) : null

  return (
    <header className="border-b border-black/10">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold text-primary">
          {logo?.url ? (
            <Image src={logo.url} alt={logo.alt ?? domain.name} width={32} height={32} className="h-8 w-8" />
          ) : null}
          <span>{domain.name}</span>
        </Link>

        <nav aria-label={dictionary.nav.menu} className="hidden sm:block">
          <Link href="/" className="text-sm font-medium hover:text-primary">
            {dictionary.nav.home}
          </Link>
        </nav>

        <details className="relative sm:hidden">
          <summary className="cursor-pointer list-none rounded border border-black/15 px-3 py-1.5 text-sm font-medium">
            {dictionary.nav.menu}
          </summary>
          <nav
            aria-label={dictionary.nav.menu}
            className="absolute right-0 z-10 mt-2 min-w-40 rounded border border-black/10 bg-background p-2 shadow-lg"
          >
            <Link href="/" className="block rounded px-2 py-1.5 text-sm hover:text-primary">
              {dictionary.nav.home}
            </Link>
          </nav>
        </details>
      </div>
    </header>
  )
}
