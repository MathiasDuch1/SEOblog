import { getDomainByHostname } from '@/lib/domains'

/**
 * IndexNow key file. `src/proxy.ts` rewrites `/{key}.txt` here. A domain serves only its own
 * key; any other key, or an unknown host, is a 404.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ host: string; key: string }> }) {
  const { host, key } = await params
  const domain = await getDomainByHostname(host)
  if (!domain?.indexNowKey || domain.indexNowKey !== key) {
    return new Response('Not Found', { status: 404 })
  }
  return new Response(domain.indexNowKey, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
