import { headers } from 'next/headers'
import Link from 'next/link'

import { getDomainByHostname } from '@/lib/domains'
import { getDictionary } from '@/lib/i18n'

/**
 * Branded 404 in the domain's language. `not-found.tsx` receives no params, so the domain
 * is resolved from the Host header; the surrounding layout has already applied its colors.
 */
export default async function NotFound() {
  const host = (await headers()).get('host') ?? ''
  const domain = await getDomainByHostname(host)
  const dictionary = getDictionary(domain?.locale ?? 'en-US')

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-20 text-center">
      <p className="text-sm font-medium text-primary">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{dictionary.notFound.title}</h1>
      <p className="mt-4 text-foreground/70">{dictionary.notFound.body}</p>
      <Link href="/" className="mt-8 inline-block font-medium text-primary">
        {dictionary.notFound.backHome}
      </Link>
    </main>
  )
}
