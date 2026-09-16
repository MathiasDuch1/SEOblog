import { getDomainByHostname } from '@/lib/domains'
import { siteOrigin } from '@/lib/urls'

/** Only production invites crawlers; staging and development disallow everything. */
export async function GET(_request: Request, { params }: { params: Promise<{ host: string }> }) {
  const { host } = await params
  const domain = await getDomainByHostname(host)
  if (!domain) return new Response('Not Found', { status: 404 })

  const body =
    process.env.SITE_ENV === 'production'
      ? `User-agent: *\nAllow: /\n\nSitemap: ${siteOrigin(domain)}/sitemap.xml\n`
      : `User-agent: *\nDisallow: /\n`

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
