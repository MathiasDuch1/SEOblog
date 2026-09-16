/**
 * The only place absolute public URLs are built — canonical, sitemap, IndexNow, SEO plugin.
 * URLs never carry a locale segment: each domain publishes in exactly one language.
 */
type DomainLike = { hostname: string }

export function siteOrigin(domain: DomainLike): string {
  const scheme = process.env.PUBLIC_URL_SCHEME || 'https'
  const port = process.env.PUBLIC_URL_PORT
  return `${scheme}://${domain.hostname}${port ? `:${port}` : ''}`
}

export function postUrl(domain: DomainLike, slug: string): string {
  return `${siteOrigin(domain)}/${slug}`
}
