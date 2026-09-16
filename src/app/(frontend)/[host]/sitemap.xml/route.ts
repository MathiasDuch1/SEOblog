import { getDomainByHostname } from '@/lib/domains'
import {
  SITEMAP_CHUNK_SIZE,
  getSitemapEntries,
  sitemapIndexXml,
  urlSetXml,
  xmlResponse,
} from '@/lib/sitemap'

/**
 * One sitemap per domain. A single `<urlset>` while the domain fits in one chunk, and a
 * `<sitemapindex>` pointing at `/sitemaps/{n}.xml` once it does not — so the file never
 * approaches the protocol's 50,000-URL limit as content accumulates.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ host: string }> }) {
  const { host } = await params
  const domain = await getDomainByHostname(host)
  if (!domain) return new Response('Not Found', { status: 404 })

  const entries = await getSitemapEntries(domain)
  if (entries.length <= SITEMAP_CHUNK_SIZE) return xmlResponse(urlSetXml(entries))

  return xmlResponse(sitemapIndexXml(domain, Math.ceil(entries.length / SITEMAP_CHUNK_SIZE)))
}
