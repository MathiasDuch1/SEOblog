import 'server-only'

import { createHash } from 'crypto'

import {
  fetchKeywords,
  KEYWORD_ENDPOINTS,
  type KeywordEndpoint,
  type KeywordRequest,
  type KeywordRow,
} from '@/lib/dataforseo/client'
import { getPayloadClient } from '@/lib/payload'
import type { KeywordResearchRun } from '@/payload-types'

import { normalizeKeyword } from './normalize'

const REUSE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
const MAX_IDEAS_SEEDS = 200

export type ResearchInput = {
  domainId: number
  /** Seed topics in the domain's language. */
  seedKeywords: string[]
  /** Keywords requested per DataForSEO call. */
  limitPerEndpoint: number
  endpoints?: KeywordEndpoint[]
  /** Call DataForSEO even if an identical complete run from the last 30 days exists. */
  force?: boolean
}

export type ResearchResult = {
  runId: number
  /** True when a stored run was returned and DataForSEO wasn't called. */
  reused: boolean
  costUsd: number
  rows: KeywordRow[]
}

/**
 * Merges rows from several calls into one row per normalized keyword. When a keyword appears
 * more than once, the row with the most metrics filled wins.
 */
export function dedupeRows(rows: KeywordRow[]): KeywordRow[] {
  const filled = (row: KeywordRow) =>
    [row.searchVolume, row.cpc, row.competition, row.keywordDifficulty, row.intent, row.coreKeyword].filter(
      (value) => value !== null,
    ).length
  const byKey = new Map<string, KeywordRow>()
  for (const row of rows) {
    const key = normalizeKeyword(row.keyword)
    const existing = byKey.get(key)
    if (!existing || filled(row) > filled(existing)) byKey.set(key, { ...row, keyword: key })
  }
  return [...byKey.values()].sort((a, b) => (b.searchVolume ?? -1) - (a.searchVolume ?? -1))
}

/** The DataForSEO calls one run makes: one per seed for single-seed endpoints, chunks of 200 for keyword_ideas. */
function plannedRequests(
  seeds: string[],
  endpoints: KeywordEndpoint[],
  target: { locationCode: number; languageCode: string; limit: number },
): KeywordRequest[] {
  return endpoints.flatMap((endpoint): KeywordRequest[] => {
    if (endpoint === 'keyword_ideas') {
      const chunks: string[][] = []
      for (let i = 0; i < seeds.length; i += MAX_IDEAS_SEEDS) chunks.push(seeds.slice(i, i + MAX_IDEAS_SEEDS))
      return chunks.map((chunk) => ({ endpoint, seeds: chunk, ...target }))
    }
    return seeds.map((seed) => ({ endpoint, seeds: [seed], ...target }))
  })
}

/**
 * Researches seed topics for one domain, in its DataForSEO location and language. Keyword data
 * is per location, so the same topic is researched separately for each country domain.
 *
 * Reuses a `complete` run with identical inputs from the last 30 days unless `force` is set.
 */
export async function runResearch({
  domainId,
  seedKeywords,
  limitPerEndpoint,
  endpoints = [...KEYWORD_ENDPOINTS],
  force = false,
}: ResearchInput): Promise<ResearchResult> {
  const payload = await getPayloadClient()
  const domain = await payload.findByID({ collection: 'domains', id: domainId, depth: 0 })
  const { locationCode, languageCode } = domain.dataforseo

  const seeds = [...new Set(seedKeywords.map(normalizeKeyword).filter(Boolean))].sort()
  const uniqueEndpoints = [...new Set(endpoints)].sort()
  if (seeds.length === 0) throw new Error('At least one seed keyword is required')
  if (uniqueEndpoints.length === 0) throw new Error('At least one endpoint is required')

  const requestKey = createHash('sha256')
    .update(JSON.stringify({ locationCode, languageCode, seeds, endpoints: uniqueEndpoints, limitPerEndpoint }))
    .digest('hex')

  if (!force) {
    const { docs } = await payload.find({
      collection: 'keyword-research-runs',
      where: {
        and: [
          { requestKey: { equals: requestKey } },
          { domain: { equals: domainId } },
          { status: { equals: 'complete' } },
          { createdAt: { greater_than: new Date(Date.now() - REUSE_WINDOW_MS).toISOString() } },
        ],
      },
      sort: '-createdAt',
      limit: 1,
      depth: 0,
    })
    if (docs[0]) {
      payload.logger.info(`Research: reusing run ${docs[0].id} for ${domain.hostname} (no DataForSEO call)`)
      return { runId: docs[0].id, reused: true, costUsd: docs[0].costUsd ?? 0, rows: (docs[0].rows ?? []) as KeywordRow[] }
    }
  }

  const run = await payload.create({
    collection: 'keyword-research-runs',
    data: {
      label: `${domain.hostname}: ${seeds.join(', ')}`,
      domain: domainId,
      locationCode,
      languageCode,
      seedKeywords: seeds.map((keyword) => ({ keyword })),
      endpoints: uniqueEndpoints,
      limitPerEndpoint,
      requestKey,
      status: 'running',
    },
  })

  const requests = plannedRequests(seeds, uniqueEndpoints, { locationCode, languageCode, limit: limitPerEndpoint })
  const settled = await Promise.allSettled(requests.map((request) => fetchKeywords(request)))

  // Calls that succeeded were billed even if another failed, so their cost is always recorded.
  const succeeded = settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []))
  const costUsd = Number(succeeded.reduce((sum, r) => sum + r.costUsd, 0).toFixed(6))
  const failures = settled.flatMap((s) => (s.status === 'rejected' ? [(s.reason as Error).message] : []))

  if (failures.length > 0) {
    await payload.update({
      collection: 'keyword-research-runs',
      id: run.id,
      data: { status: 'failed', costUsd, error: failures.join('\n') },
    })
    throw new Error(`Research run ${run.id} failed:\n- ${failures.join('\n- ')}`)
  }

  const rows = dedupeRows(succeeded.flatMap((r) => r.rows))
  const updated: KeywordResearchRun = await payload.update({
    collection: 'keyword-research-runs',
    id: run.id,
    data: { status: 'complete', costUsd, rows, rowCount: rows.length },
  })
  payload.logger.info(
    `Research: run ${run.id} for ${domain.hostname} made ${requests.length} call(s), ${rows.length} unique keywords, $${costUsd}`,
  )
  return { runId: updated.id, reused: false, costUsd, rows }
}
