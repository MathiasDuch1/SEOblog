/**
 * Keyword research end to end for one domain: DataForSEO research in the domain's location and
 * language → Claude clustering → cannibalization checks → save as `unused` clusters.
 *
 *   npm run research -- --domain 13 --seeds "tarotkort" --limit 20
 *   npm run research -- --domain 13 --seeds "tarotkort,krystaller" --limit 50 --endpoints related_keywords
 *
 * --force skips reuse of an identical run from the last 30 days; --dry-run clusters without saving;
 * --allow-conflicts saves clusters even when they conflict with existing ones.
 * Then generate a saved cluster with `npm run generate -- --clusters <id>`.
 */
import { parseArgs } from 'util'

import { KEYWORD_ENDPOINTS, type KeywordEndpoint } from '../lib/dataforseo/client'
import { clusterKeywords } from '../lib/keywords/cluster'
import { runResearch } from '../lib/keywords/research'
import { saveClusters } from '../lib/keywords/saveClusters'

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    domain: { type: 'string' },
    seeds: { type: 'string' },
    limit: { type: 'string', default: '20' },
    endpoints: { type: 'string' },
    force: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    'allow-conflicts': { type: 'boolean', default: false },
  },
})

try {
  const domainId = Number(values.domain)
  const seedKeywords = (values.seeds ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!domainId || seedKeywords.length === 0) {
    throw new Error('Pass --domain <id> and --seeds "<seed>[,<seed>…]"')
  }
  const endpoints = values.endpoints?.split(',').map((e) => e.trim()) as KeywordEndpoint[] | undefined
  const unknown = endpoints?.filter((e) => !(KEYWORD_ENDPOINTS as readonly string[]).includes(e)) ?? []
  if (unknown.length > 0) throw new Error(`Unknown endpoints: ${unknown.join(', ')}`)

  const research = await runResearch({
    domainId,
    seedKeywords,
    limitPerEndpoint: Number(values.limit),
    endpoints,
    force: values.force,
  })
  console.log(
    `\nResearch run ${research.runId}: ${research.rows.length} unique keywords, cost $${research.costUsd}${research.reused ? ' (reused stored run — no new cost)' : ''}`,
  )
  for (const row of research.rows.slice(0, 15)) {
    console.log(`  ${row.keyword}  vol=${row.searchVolume ?? '–'} kd=${row.keywordDifficulty ?? '–'} ${row.intent ?? ''}`)
  }
  if (research.rows.length > 15) console.log(`  … and ${research.rows.length - 15} more`)

  const clustering = await clusterKeywords(research.runId)
  console.log(
    `\nClustering: ${clustering.clusters.length} clusters from ${clustering.inputKeywords} collapsed keywords (${clustering.usage.inputTokens} in / ${clustering.usage.outputTokens} out tokens)`,
  )
  for (const cluster of clustering.clusters) {
    console.log(`  [${cluster.suggestedTemplate}] ${cluster.clusterName} — primary "${cluster.primaryKeyword}"`)
    console.log(`      ${cluster.keywords.map((k) => k.keyword).join(', ')}`)
    console.log(`      ${cluster.rationale}`)
  }
  for (const issue of clustering.issues) console.log(`  fixed: ${issue}`)

  if (values['dry-run']) {
    console.log('\nDry run: nothing saved')
  } else {
    const allowConflict = values['allow-conflicts']
    const result = await saveClusters({
      runId: research.runId,
      clusters: clustering.clusters.map((cluster) => ({ ...cluster, allowConflict })),
    })
    console.log(`\nSaved ${result.saved.length} cluster(s):`)
    for (const s of result.saved) console.log(`  #${s.clusterId} ${s.clusterName}${s.conflictsAllowed ? ' (conflict allowed)' : ''}`)
    if (result.refused.length > 0) {
      console.log(`Refused ${result.refused.length}:`)
      for (const r of result.refused) console.log(`  ${r.clusterName}: ${r.reasons.join('; ')}`)
    }
    if (result.saved[0]) console.log(`\nGenerate one: npm run generate -- --clusters ${result.saved[0].clusterId}`)
  }
} catch (error) {
  console.error(`Error: ${(error as Error).message}`)
  process.exit(1)
}

process.exit(0)
