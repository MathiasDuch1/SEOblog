/**
 * Submits keyword clusters to Claude's Message Batches API.
 *
 *   npm run generate -- --clusters 12,13,14      one batch for these clusters (same domain)
 *   npm run generate -- --niche spirituality     one batch per domain in the niche, from its unused clusters
 *   npm run generate -- --failed-from 7          resubmit the errored clusters of batch doc 7
 *
 * Add --auto-schedule to schedule the imported posts once they are ready (phase 06).
 */
import { parseArgs } from 'util'

import { erroredClusterIds } from '../lib/generation/importBatch'
import { submitBatch, unusedClustersByDomainInNiche, type SubmittedBatch } from '../lib/generation/submitBatch'

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    clusters: { type: 'string' },
    niche: { type: 'string' },
    'failed-from': { type: 'string' },
    'auto-schedule': { type: 'boolean', default: false },
  },
})

const autoSchedule = values['auto-schedule'] ?? false
const report = (label: string, batches: SubmittedBatch[]) => {
  for (const b of batches) {
    console.log(`${label}: batch ${b.anthropicBatchId} (doc ${b.batchDocId}) with ${b.requestCount} request(s)`)
  }
}

try {
  if (values.clusters) {
    const clusterIds = values.clusters.split(',').map((id) => Number(id.trim()))
    report('Submitted', await submitBatch({ clusterIds, autoSchedule }))
  } else if (values.niche) {
    const byDomain = await unusedClustersByDomainInNiche(values.niche)
    if (byDomain.size === 0) console.log(`No unused clusters on any domain in niche "${values.niche}"`)
    for (const [domain, clusterIds] of byDomain) {
      report(domain.hostname, await submitBatch({ clusterIds, autoSchedule }))
    }
  } else if (values['failed-from']) {
    const clusterIds = await erroredClusterIds(Number(values['failed-from']))
    if (clusterIds.length === 0) {
      console.log('No errored clusters to resubmit')
    } else {
      report('Resubmitted', await submitBatch({ clusterIds, autoSchedule }))
    }
  } else {
    console.error('Pass --clusters <ids>, --niche <slug>, or --failed-from <batchDocId>')
    process.exit(1)
  }
} catch (error) {
  console.error(`Error: ${(error as Error).message}`)
  process.exit(1)
}

process.exit(0)
