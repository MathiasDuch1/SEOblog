import { getDomainByHostname } from '@/lib/domains'
import { SITEMAP_CHUNK_SIZE, getSitemapEntries, urlSetXml, xmlResponse } from '@/lib/sitemap'

/** One chunk of a split sitemap, requested as `/sitemaps/{n}.xml`. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ host: string; chunk: string }> },
) {
  const { host, chunk } = await params
  const domain = await getDomainByHostname(host)
  if (!domain) return new Response('Not Found', { status: 404 })

  const index = Number(chunk.replace(/\.xml$/, ''))
  if (!Number.isInteger(index) || index < 1) return new Response('Not Found', { status: 404 })

  const entries = await getSitemapEntries(domain)
  const slice = entries.slice((index - 1) * SITEMAP_CHUNK_SIZE, index * SITEMAP_CHUNK_SIZE)
  if (slice.length === 0) return new Response('Not Found', { status: 404 })

  return xmlResponse(urlSetXml(slice))
}
