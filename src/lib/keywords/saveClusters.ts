import 'server-only'

import type { KeywordRow } from '@/lib/dataforseo/client'
import { getPayloadClient } from '@/lib/payload'

import type { ProposedCluster } from './clusterRules'
import { detectConflicts, type ConflictReason } from './conflictRules'
import { loadConflictContext } from './dedupe'
import { normalizeKeyword } from './normalize'

/** A proposed cluster as reviewed by an editor. Keyword metrics are ignored and re-read from the run. */
export type ClusterToSave = Omit<ProposedCluster, 'keywords' | 'coreKeyword'> & {
  keywords: { keyword: string }[]
  /** Ignored: the core keyword is re-read from the primary keyword's row in the run. */
  coreKeyword?: string | null
  /** Save even if it conflicts with an existing cluster or post on the domain. */
  allowConflict?: boolean
}

export type SaveClustersResult = {
  saved: { index: number; clusterId: number; clusterName: string; conflictsAllowed: number }[]
  refused: { index: number; clusterName: string; reasons: string[]; conflicts: ConflictReason[] }[]
}

/**
 * Saves reviewed clusters from a research run as `unused` DataForSEO clusters on the run's
 * domain. Metrics always come from the stored run, never from the caller. Each cluster is
 * checked against the domain's existing clusters and posts — including clusters saved earlier
 * in the same call — and refused on conflict unless `allowConflict` is set.
 */
export async function saveClusters({
  runId,
  clusters,
  targetDomainId,
}: {
  runId: number
  clusters: ClusterToSave[]
  /** Defaults to the run's domain; keyword data is per country, so no other domain is accepted. */
  targetDomainId?: number
}): Promise<SaveClustersResult> {
  const payload = await getPayloadClient()
  const run = await payload.findByID({ collection: 'keyword-research-runs', id: runId, depth: 0 })
  if (run.status !== 'complete') throw new Error(`Research run ${runId} is ${run.status}, not complete`)

  const runDomainId = typeof run.domain === 'object' ? run.domain.id : run.domain
  if (targetDomainId !== undefined && targetDomainId !== runDomainId) {
    throw new Error(
      `Research run ${runId} belongs to domain ${runDomainId}; its keyword data can't be saved for domain ${targetDomainId}`,
    )
  }

  const rowsByKeyword = new Map(((run.rows ?? []) as KeywordRow[]).map((row) => [normalizeKeyword(row.keyword), row]))
  const context = await loadConflictContext(runDomainId)
  const result: SaveClustersResult = { saved: [], refused: [] }

  for (const [index, cluster] of clusters.entries()) {
    const keywords = [...new Set([cluster.primaryKeyword, ...cluster.keywords.map((k) => k.keyword)].map(normalizeKeyword))]
    const unknown = keywords.filter((keyword) => !rowsByKeyword.has(keyword))
    if (unknown.length > 0 || keywords.length === 0) {
      result.refused.push({
        index,
        clusterName: cluster.clusterName,
        reasons: [`Keywords not in research run ${runId}: ${unknown.join(', ') || '(none given)'}`],
        conflicts: [],
      })
      continue
    }

    const rows = keywords.map((keyword) => rowsByKeyword.get(keyword)!)
    const primary = rows[0]
    const candidate = {
      clusterName: cluster.clusterName,
      primaryKeyword: primary.keyword,
      coreKeyword: primary.coreKeyword || primary.keyword,
      keywords: rows,
    }

    const [conflict] = detectConflicts([candidate], context.existing, context.posts, context.language)
    if (conflict && !cluster.allowConflict) {
      result.refused.push({
        index,
        clusterName: cluster.clusterName,
        reasons: conflict.reasons.map((reason) => reason.detail),
        conflicts: conflict.reasons,
      })
      continue
    }

    const doc = await payload.create({
      collection: 'keyword-clusters',
      data: {
        source: 'dataforseo',
        status: 'unused',
        clusterName: cluster.clusterName,
        primaryKeyword: candidate.primaryKeyword,
        coreKeyword: normalizeKeyword(candidate.coreKeyword),
        keywords: rows.map((row) => ({
          keyword: row.keyword,
          searchVolume: row.searchVolume,
          keywordDifficulty: row.keywordDifficulty,
          cpc: row.cpc,
          intent: row.intent,
        })),
        rationale: cluster.rationale,
        suggestedTemplate: cluster.suggestedTemplate,
        targetTemplate: cluster.suggestedTemplate,
        targetDomain: runDomainId,
        researchRun: runId,
      },
    })

    context.existing.push({
      id: doc.id,
      status: doc.status,
      clusterName: doc.clusterName,
      primaryKeyword: candidate.primaryKeyword,
      coreKeyword: doc.coreKeyword,
      keywords: rows,
    })
    result.saved.push({
      index,
      clusterId: doc.id,
      clusterName: doc.clusterName,
      conflictsAllowed: conflict?.reasons.length ?? 0,
    })
  }

  payload.logger.info(
    `Saved ${result.saved.length} cluster(s) from run ${runId}; refused ${result.refused.length}`,
  )
  return result
}
