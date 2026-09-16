import type { CSSProperties, ReactNode } from 'react'

import { Geist, Geist_Mono } from 'next/font/google'

import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'
import { getDomainByHostname } from '@/lib/domains'
import { getDictionary } from '@/lib/i18n'
import { getFooterPages } from '@/lib/pages'

import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

/**
 * Root layout for every public domain. The hostname arrives as a path segment because
 * `src/proxy.ts` rewrites `/{path}` to `/{hostname}{path}`.
 *
 * An unknown hostname renders a neutral, unbranded shell — the pages beneath return 404,
 * so no domain's content or branding leaks onto a hostname we do not serve.
 *
 * There is deliberately no `loading.tsx` at this segment or below: a Suspense boundary
 * above a page starts the response stream, and once headers are sent `notFound()` can no
 * longer set a 404 status (Next 16 docs, loading.js § Status Codes). Pages resolve their
 * document first and stream slower subtrees through their own `<Suspense>` instead.
 */
export default async function HostLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ host: string }>
}) {
  const { host } = await params
  const domain = await getDomainByHostname(host)

  if (!domain) {
    return (
      <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
        <body className="flex min-h-full flex-col">{children}</body>
      </html>
    )
  }

  const dictionary = getDictionary(domain.locale)
  const footerPages = await getFooterPages(domain.id)
  const branding = {
    '--brand-primary': domain.branding?.primaryColor ?? undefined,
    '--brand-accent': domain.branding?.accentColor ?? undefined,
  } as CSSProperties

  return (
    <html
      lang={domain.locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans" style={branding}>
        <SiteHeader domain={domain} dictionary={dictionary} />
        <div className="flex-1">{children}</div>
        <SiteFooter domain={domain} dictionary={dictionary} pages={footerPages} />
      </body>
    </html>
  )
}
