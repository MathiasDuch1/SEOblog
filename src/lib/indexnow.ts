import 'server-only'

import type { Domain } from '@/payload-types'

import { siteOrigin } from './urls'

const ENDPOINT = 'https://api.indexnow.org/indexnow'
/** IndexNow accepts at most 10,000 URLs per request. */
const MAX_URLS = 10_000

export type IndexNowPayload = { host: string; key: string; keyLocation: string; urlList: string[] }

export type IndexNowResult =
  | { dryRun: true; host: string; urlCount: number }
  | { dryRun: false; host: string; urlCount: number; statuses: number[] }

/** Only production with `INDEXNOW_ENABLED=true` submits; everything else logs the payload. */
export const isIndexNowLive = () => process.env.INDEXNOW_ENABLED === 'true' && process.env.SITE_ENV === 'production'

/**
 * Notifies IndexNow (Bing, Yandex, and other participating engines) about new or changed URLs
 * on one domain. Every URL must belong to that domain; the key file at `keyLocation` proves
 * ownership (see `src/app/(frontend)/[host]/indexnow/[key]/route.ts`).
 */
export async function submitUrls(domain: Pick<Domain, 'hostname' | 'indexNowKey'>, urls: string[]): Promise<IndexNowResult> {
  if (!domain.indexNowKey) throw new Error(`Domain ${domain.hostname} has no IndexNow key`)

  const payloads: IndexNowPayload[] = []
  for (let start = 0; start < urls.length; start += MAX_URLS) {
    payloads.push({
      host: domain.hostname,
      key: domain.indexNowKey,
      keyLocation: `${siteOrigin(domain)}/${domain.indexNowKey}.txt`,
      urlList: urls.slice(start, start + MAX_URLS),
    })
  }

  if (!isIndexNowLive()) {
    for (const body of payloads) console.info(`[indexnow] dry run: ${JSON.stringify(body)}`)
    return { dryRun: true, host: domain.hostname, urlCount: urls.length }
  }

  const statuses: number[] = []
  for (const body of payloads) {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    statuses.push(response.status)
  }
  return { dryRun: false, host: domain.hostname, urlCount: urls.length, statuses }
}
